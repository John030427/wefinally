import {
  Annotation,
  END,
  START,
  StateGraph,
  type BaseCheckpointSaver
} from '@langchain/langgraph'
import {
  CoordinationPreferenceSchema,
  type CoordinationPreference,
  type PendingAction,
  type SafeToolResult
} from '../contracts.js'

export type CoordinationProposal = {
  dateWindow: string
  region: string
  venueType: string
  durationMinutes?: number
  budgetBand?: 'low' | 'medium' | 'high'
}

export type CoordinationOverlap = {
  hasOverlap: boolean
  missingFields: Array<'dateWindows' | 'regions' | 'venueTypes'>
  proposal: CoordinationProposal | null
}

export type DateCoordinationState = {
  operation: 'run'
  threadId: string
  actorRef: string
  mode: 'date_coordination'
  userText: string
  safeSummary: string
  phase: string
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  replyDraft: string
  pendingAction: PendingAction | null
  lastResult: SafeToolResult | undefined
  confirmationA: boolean
  confirmationB: boolean
  confirmationVersionA: number | undefined
  confirmationVersionB: number | undefined
  proposal: Record<string, unknown> | null
  coordinationId: number
  coordinationVersion: number
  party: 'A' | 'B'
  partyAState: CoordinationPreference
  partyBState: CoordinationPreference
  errorCode: string | undefined
}

const DateCoordinationAnnotation = Annotation.Root({
  operation: Annotation<DateCoordinationState['operation']>,
  threadId: Annotation<string>,
  actorRef: Annotation<string>,
  mode: Annotation<DateCoordinationState['mode']>,
  userText: Annotation<string>,
  safeSummary: Annotation<string>,
  phase: Annotation<string>,
  riskLevel: Annotation<DateCoordinationState['riskLevel']>,
  replyDraft: Annotation<string>,
  pendingAction: Annotation<PendingAction | null>,
  lastResult: Annotation<SafeToolResult | undefined>,
  confirmationA: Annotation<boolean>,
  confirmationB: Annotation<boolean>,
  confirmationVersionA: Annotation<number | undefined>,
  confirmationVersionB: Annotation<number | undefined>,
  proposal: Annotation<Record<string, unknown> | null>,
  coordinationId: Annotation<number>,
  coordinationVersion: Annotation<number>,
  party: Annotation<'A' | 'B'>,
  partyAState: Annotation<CoordinationPreference>,
  partyBState: Annotation<CoordinationPreference>,
  errorCode: Annotation<string | undefined>
})

function commonValues(left: string[], right: string[]): string[] {
  const allowed = new Set(right)
  return left.filter((value, index) => allowed.has(value) && left.indexOf(value) === index)
}

export function computeSafeOverlap(
  rawA: CoordinationPreference,
  rawB: CoordinationPreference
): CoordinationOverlap {
  const a = CoordinationPreferenceSchema.parse(rawA)
  const b = CoordinationPreferenceSchema.parse(rawB)
  const missingFields: CoordinationOverlap['missingFields'] = []
  if (a.dateWindows.length === 0 || b.dateWindows.length === 0) missingFields.push('dateWindows')
  if (a.regions.length === 0 || b.regions.length === 0) missingFields.push('regions')
  if (a.venueTypes.length === 0 || b.venueTypes.length === 0) missingFields.push('venueTypes')
  if (missingFields.length > 0) return { hasOverlap: false, missingFields, proposal: null }

  const dateWindows = commonValues(a.dateWindows, b.dateWindows)
  const regions = commonValues(a.regions, b.regions)
  const venueTypes = commonValues(a.venueTypes, b.venueTypes)
  const durationCompatible = a.durationMinutes === undefined || b.durationMinutes === undefined || a.durationMinutes === b.durationMinutes
  const budgetCompatible = a.budgetBand === undefined || b.budgetBand === undefined || a.budgetBand === b.budgetBand
  if (dateWindows.length === 0 || regions.length === 0 || venueTypes.length === 0 || !durationCompatible || !budgetCompatible) {
    return { hasOverlap: false, missingFields: [], proposal: null }
  }

  const proposal: CoordinationProposal = {
    dateWindow: dateWindows[0] as string,
    region: regions[0] as string,
    venueType: venueTypes[0] as string
  }
  const durationMinutes = a.durationMinutes ?? b.durationMinutes
  const budgetBand = a.budgetBand ?? b.budgetBand
  if (durationMinutes !== undefined) proposal.durationMinutes = durationMinutes
  if (budgetBand !== undefined) proposal.budgetBand = budgetBand
  return { hasOverlap: true, missingFields: [], proposal }
}

export function applyPreferenceChange(
  state: DateCoordinationState,
  party: 'A' | 'B',
  rawPreference: CoordinationPreference
): DateCoordinationState {
  const preference = CoordinationPreferenceSchema.parse(rawPreference)
  const current = party === 'A' ? state.partyAState : state.partyBState
  if (JSON.stringify(current) === JSON.stringify(preference)) return state
  return {
    ...state,
    coordinationVersion: state.coordinationVersion + 1,
    partyAState: party === 'A' ? preference : state.partyAState,
    partyBState: party === 'B' ? preference : state.partyBState,
    phase: 'compute_overlap',
    proposal: null,
    confirmationA: false,
    confirmationB: false,
    confirmationVersionA: undefined,
    confirmationVersionB: undefined,
    pendingAction: null,
    errorCode: undefined
  }
}

export function applyConfirmation(
  state: DateCoordinationState,
  party: 'A' | 'B',
  version: number
): DateCoordinationState {
  if (version !== state.coordinationVersion) {
    return { ...state, errorCode: 'stale_coordination_version' }
  }
  if (party === 'A' && state.confirmationA && state.confirmationVersionA === version) return state
  if (party === 'B' && state.confirmationB && state.confirmationVersionB === version) return state
  return {
    ...state,
    confirmationA: party === 'A' ? true : state.confirmationA,
    confirmationB: party === 'B' ? true : state.confirmationB,
    confirmationVersionA: party === 'A' ? version : state.confirmationVersionA,
    confirmationVersionB: party === 'B' ? version : state.confirmationVersionB,
    errorCode: undefined
  }
}

export function buildDateCoordinationGraph(dependencies: { checkpointer: BaseCheckpointSaver }) {
  const graph = new StateGraph(DateCoordinationAnnotation)
    .addNode('computeOverlap', (state) => {
      const overlap = computeSafeOverlap(state.partyAState, state.partyBState)
      if (overlap.missingFields.length > 0) {
        return {
          phase: 'missing_data',
          proposal: null,
          pendingAction: null,
          replyDraft: `还需要补充：${overlap.missingFields.join('、')}。`
        }
      }
      if (!overlap.hasOverlap || !overlap.proposal) {
        return {
          phase: 'restart',
          proposal: null,
          pendingAction: null,
          replyDraft: '目前还没有双方都可接受的方案，请调整时间、区域或场所类型。'
        }
      }
      const confirmationsCurrent =
        state.confirmationA && state.confirmationB &&
        state.confirmationVersionA === state.coordinationVersion &&
        state.confirmationVersionB === state.coordinationVersion
      return {
        phase: confirmationsCurrent ? 'ready_to_submit' : 'awaiting_confirmation',
        proposal: overlap.proposal,
        pendingAction: null,
        replyDraft: confirmationsCurrent ? '双方已确认当前方案。' : '已找到双方都可以接受的方案，等待双方确认。'
      }
    })
    .addNode('submit', (state) => ({
      phase: 'awaiting_tool',
      pendingAction: {
        type: 'create_date_application_preview',
        arguments: {
          coordinationId: state.coordinationId,
          coordinationVersion: state.coordinationVersion,
          proposal: state.proposal
        },
        requiresConfirmation: false
      } satisfies PendingAction
    }))
    .addEdge(START, 'computeOverlap')
    .addConditionalEdges('computeOverlap', (state) => state.phase === 'ready_to_submit' ? 'submit' : END)
    .addEdge('submit', END)

  return graph.compile({ checkpointer: dependencies.checkpointer })
}
