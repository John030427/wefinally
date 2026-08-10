import type { BaseCheckpointSaver } from '@langchain/langgraph'
import {
  GraphResultSchema,
  GraphResumeInputSchema,
  GraphRunInputSchema,
  GraphStateSchema,
  PendingActionSchema,
  type GraphResult
} from './contracts.js'
import { loadCheckpointState, resumeGraph, runGraph } from './graph.js'
import type { DecisionModel } from './model.js'
import { ModelBoundaryError } from './model.js'
import { sanitizeGraphText } from './sanitize.js'

type MainDependencies = {
  checkpointer: BaseCheckpointSaver
  model: DecisionModel
}

type MainResponse = {
  success: boolean
  data?: GraphResult | { status: 'ok'; runtime: 'langgraph' }
  code?: string
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
    ...(typeof state.coordinationVersion === 'number' ? { coordinationVersion: state.coordinationVersion } : {}),
    ...(typeof state.errorCode === 'string' ? { errorCode: state.errorCode } : {})
  })
}

export function createAgentGraphMain(dependencies: MainDependencies) {
  return async function main(event: unknown): Promise<MainResponse> {
    if (event && typeof event === 'object' && !Array.isArray(event)) {
      const object = event as Record<string, unknown>
      if (object.operation === 'health' && Object.keys(object).length === 1) {
        return { success: true, data: { status: 'ok', runtime: 'langgraph' } }
      }
    }

    const runInput = GraphRunInputSchema.safeParse(event)
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
        )) return { success: false, code: 'invalid_request' }
        const state = await runGraph(boundedInput, dependencies)
        return { success: true, data: resultFromState(boundedInput.threadId, state) }
      }

      const resumeInput = GraphResumeInputSchema.safeParse(event)
      if (!resumeInput.success) return { success: false, code: 'invalid_request' }
      const checkpointState = await loadCheckpointState(dependencies.checkpointer, resumeInput.data.threadId)
      if (!checkpointState) return { success: false, code: 'thread_not_found' }
      if (checkpointState.actorRef !== resumeInput.data.actorRef) return { success: false, code: 'actor_mismatch' }
      const state = await resumeGraph(resumeInput.data, checkpointState, dependencies)
      return { success: true, data: resultFromState(resumeInput.data.threadId, state) }
    } catch (error) {
      if (error instanceof ModelBoundaryError) {
        return {
          success: true,
          data: GraphResultSchema.parse({
            status: 'fallback',
            threadId: runInput.success ? runInput.data.threadId : (event as { threadId: string }).threadId,
            phase: 'fallback',
            replyDraft: 'AI 服务暂时不可用，请稍后重试或联系人工客服。',
            pendingAction: null,
            errorCode: error.code
          })
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
