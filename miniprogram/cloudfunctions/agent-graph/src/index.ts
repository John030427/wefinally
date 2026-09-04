import type { BaseCheckpointSaver } from '@langchain/langgraph'
import {
  GraphResultSchema,
  GraphResumeInputSchema,
  GraphRunInputSchema,
  GraphStateSchema,
  PendingActionSchema,
  CoordinationCanonicalStateSchema,
  CoordinationCommandSchema,
  type GraphResult
} from './contracts.js'
import { loadCheckpointState, resumeGraph, runGraph } from './graph.js'
import type { CloudBaseProviderSmokeResult, DecisionInput, DecisionModel, ModelDecision } from './model.js'
import { ModelBoundaryError } from './model.js'
import { sanitizeGraphText } from './sanitize.js'

type MainDependencies = {
  checkpointer: BaseCheckpointSaver
  model: DecisionModel
  providerSmoke?: () => Promise<CloudBaseProviderSmokeResult>
}

type DiagnosticResult = CloudBaseProviderSmokeResult | {
  status: 'decision_smoke'
  ok: boolean
  coordinationCommandSchemaValid: boolean
  rawModelOutput?: string
  decision?: ModelDecision
  graph_fallback_code?: string
  model_error_code?: string
}

type MainResponse = {
  success: boolean
  data?: GraphResult | { status: 'ok'; runtime: 'langgraph' } | DiagnosticResult
  code?: string
  details?: string
}

const MINIMAL_DECISION_DIAGNOSTIC_CONTEXT: Record<string, unknown> = {
  coordinationId: 900001,
  coordinationVersion: 1,
  party: 'A',
  currentPlan: {
    date: '2026-09-06',
    period: 'night',
    start_time: '20:00',
    activity: '奶茶',
    area: '福田区',
    payment: 'flexible',
    duration: 'flexible'
  },
  canonicalOverlap: { source: 'backend', hasOverlap: true },
  sharedState: {},
  partnerProgress: 'waiting',
  confirmationSnapshot: {
    myConfirmed: false,
    partnerConfirmed: false,
    proposalStatus: 'active',
    source: 'database'
  },
  invitationVersion: null,
  currentProposalId: null,
  contextRef: null,
  pendingPreview: null
}

function decisionDiagnosticInput(event: Record<string, unknown>): DecisionInput {
  const suppliedContext = event.context
  const context = suppliedContext && typeof suppliedContext === 'object' && !Array.isArray(suppliedContext)
    ? suppliedContext as Record<string, unknown>
    : MINIMAL_DECISION_DIAGNOSTIC_CONTEXT
  return {
    mode: 'date_coordination',
    phase: 'parse_command',
    userText: sanitizeGraphText(event.userText || '奶茶改成吃饭', 2000),
    safeSummary: '内部运行时诊断',
    context
  }
}

function withoutCloudBaseMetadata(event: unknown): unknown {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return event
  const {
    userInfo: _userInfo,
    tcbContext: _tcbContext,
    ...businessEvent
  } = event as Record<string, unknown>
  return businessEvent
}

function validationDetails(issues: Array<{ code?: string; path?: PropertyKey[]; keys?: string[] }>): string {
  const parts = issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') return (issue.keys || []).map((key) => `unknown:${key}`)
    const path = (issue.path || []).map(String).join('.')
    return path ? [`invalid:${path}`] : ['invalid:root']
  })
  return parts.join(',').replace(/[^A-Za-z0-9_.:,-]/g, '').slice(0, 160)
}

function statusForPhase(phase: string, pendingAction: unknown): GraphResult['status'] {
  if (phase === 'manual_pending') return 'manual_pending'
  if (phase === 'awaiting_confirmation') return 'awaiting_confirmation'
  if (phase === 'awaiting_tool' || pendingAction) return 'awaiting_tool'
  return 'completed'
}

function resultFromState(threadId: string, state: Record<string, unknown>): GraphResult {
  const parsedPendingAction = PendingActionSchema.nullable().safeParse(state.pendingAction)
  let pendingAction = parsedPendingAction.success ? parsedPendingAction.data : null
  const interrupts = state.__interrupt__
  if (!pendingAction && Array.isArray(interrupts)) {
    const value = interrupts[0]?.value
    const request = value && typeof value === 'object' ? (value as Record<string, unknown>).action_request : undefined
    if (request && typeof request === 'object') {
      const action = request as Record<string, unknown>
      const parsedInterruptAction = PendingActionSchema.safeParse({
        type: action.action,
        arguments: action.args,
        requiresConfirmation: false
      })
      pendingAction = parsedInterruptAction.success ? parsedInterruptAction.data : null
    }
  }
  const phase = String(state.phase || (pendingAction ? 'awaiting_tool' : 'completed'))
  return GraphResultSchema.parse({
    status: statusForPhase(phase, pendingAction),
    threadId,
    phase,
    replyDraft: sanitizeGraphText(state.replyDraft, 1200),
    pendingAction,
    ...(state.pendingTool ? { pendingTool: state.pendingTool } : {}),
    ...(state.pendingPreview ? { pendingPreview: state.pendingPreview } : {}),
    ...(state.canonicalState ? { canonicalState: CoordinationCanonicalStateSchema.parse(state.canonicalState) } : {}),
    ...(state.candidatePlan !== undefined ? { candidatePlan: state.candidatePlan } : {}),
    ...(state.candidateChanges ? { candidateChanges: state.candidateChanges } : {}),
    ...(typeof state.baseVersion === 'number' ? { baseVersion: state.baseVersion } : {}),
    ...(state.contextRef ? { contextRef: state.contextRef } : {}),
    ...(state.coordinationCommand ? { coordinationCommand: state.coordinationCommand } : {}),
    ...(typeof state.coordinationVersion === 'number' ? { coordinationVersion: state.coordinationVersion } : {}),
    ...(typeof state.errorCode === 'string' ? { errorCode: state.errorCode } : {})
  })
}

export function createAgentGraphMain(dependencies: MainDependencies) {
  return async function main(event: unknown): Promise<MainResponse> {
    const businessEvent = withoutCloudBaseMetadata(event)
    if (businessEvent && typeof businessEvent === 'object' && !Array.isArray(businessEvent)) {
      const object = businessEvent as Record<string, unknown>
      if (object.operation === 'health' && Object.keys(object).length === 1) {
        return { success: true, data: { status: 'ok', runtime: 'langgraph' } }
      }
    }

    if (businessEvent && typeof businessEvent === 'object' && !Array.isArray(businessEvent)) {
      const diagnosticEvent = businessEvent as Record<string, unknown>
      if (diagnosticEvent.operation === 'provider_smoke') {
        if (!dependencies.providerSmoke) return { success: false, code: 'diagnostic_unavailable' }
        return { success: true, data: await dependencies.providerSmoke() }
      }
      if (diagnosticEvent.operation === 'decision_smoke') {
        try {
          const decision = await dependencies.model.decide(decisionDiagnosticInput(diagnosticEvent))
          const commandResult = CoordinationCommandSchema.safeParse(decision.coordinationCommand)
          const result: DiagnosticResult = {
            status: 'decision_smoke',
            ok: commandResult.success,
            coordinationCommandSchemaValid: commandResult.success,
            decision
          }
          if (decision.rawModelOutput) result.rawModelOutput = decision.rawModelOutput
          return { success: true, data: result }
        } catch (error) {
          if (error instanceof ModelBoundaryError) {
            const result: DiagnosticResult = {
              status: 'decision_smoke',
              ok: false,
              coordinationCommandSchemaValid: false,
              graph_fallback_code: error.code
            }
            result.model_error_code = error.modelErrorCode || error.code
            if (error.rawModelOutput) result.rawModelOutput = error.rawModelOutput
            return { success: true, data: result }
          }
          return { success: false, code: 'diagnostic_error' }
        }
      }
    }

    const runInput = GraphRunInputSchema.safeParse(businessEvent)
    try {
      if (runInput.success) {
        const boundedInput = GraphStateSchema.parse({
          ...runInput.data,
          userText: sanitizeGraphText(runInput.data.userText, 2000),
          safeSummary: sanitizeGraphText(runInput.data.safeSummary, 800)
        })
        if (boundedInput.mode === 'date_coordination' && (
          !boundedInput.coordinationId ||
          !boundedInput.coordinationVersion ||
          !boundedInput.party ||
          !boundedInput.partyAState ||
          !boundedInput.partyBState
          || !boundedInput.canonicalState
        )) return { success: false, code: 'invalid_request' }
        const state = await runGraph(boundedInput, dependencies)
        return { success: true, data: resultFromState(boundedInput.threadId, state) }
      }

      const resumeInput = GraphResumeInputSchema.safeParse(businessEvent)
      if (!resumeInput.success) {
        const issues = runInput.error.issues.length ? runInput.error.issues : resumeInput.error.issues
        return { success: false, code: 'invalid_request', details: validationDetails(issues) }
      }
      let checkpointState: Record<string, unknown> | undefined
      try {
        checkpointState = await loadCheckpointState(dependencies.checkpointer, resumeInput.data.threadId)
      } catch {
        return { success: false, code: 'invalid_checkpoint' }
      }
      if (!checkpointState) return { success: false, code: 'thread_not_found' }
      if (checkpointState.actorRef !== resumeInput.data.actorRef) return { success: false, code: 'actor_mismatch' }
      const state = await resumeGraph(resumeInput.data, checkpointState, dependencies)
      return { success: true, data: resultFromState(resumeInput.data.threadId, state) }
    } catch (error) {
      if (error instanceof ModelBoundaryError) {
        const fallback: Record<string, unknown> = {
          status: 'fallback',
          threadId: runInput.success ? runInput.data.threadId : (businessEvent as { threadId: string }).threadId,
          phase: 'fallback',
          replyDraft: 'AI 服务暂时不可用，请稍后重试或联系人工客服。',
          pendingAction: null,
          errorCode: error.code,
          graph_fallback_code: error.code
        }
        fallback.model_error_code = error.modelErrorCode || error.code
        return {
          success: true,
          data: GraphResultSchema.parse(fallback)
        }
      }
      const code = error instanceof Error && [
        'invalid_confirmation',
        'invalid_checkpoint_mode',
        'invalid_thread_id'
      ].includes(error.message) ? error.message : 'graph_error'
      return { success: false, code }
    }
  }
}
