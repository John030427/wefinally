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
import type { DecisionModel } from '../model.js'
import { sanitizeGraphText } from '../sanitize.js'

export type CoordinationProposal = {
  dateWindow: string
  region: string
  venueType: string
  durationMinutes?: number
  budgetBand?: 'low' | 'medium' | 'high'
}

export type CoordinationConflictField = 'dateWindows' | 'regions' | 'venueTypes' | 'duration' | 'budget'

export type CoordinationOverlap = {
  hasOverlap: boolean
  missingFields: Array<'dateWindows' | 'regions' | 'venueTypes'>
  conflictFields: CoordinationConflictField[]
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
  if (missingFields.length > 0) return { hasOverlap: false, missingFields, conflictFields: [], proposal: null }

  const dateWindows = commonValues(a.dateWindows, b.dateWindows)
  const regions = commonValues(a.regions, b.regions)
  const venueTypes = commonValues(a.venueTypes, b.venueTypes)
  const durationCompatible = a.durationMinutes === undefined || b.durationMinutes === undefined || a.durationMinutes === b.durationMinutes
  const budgetCompatible = a.budgetBand === undefined || b.budgetBand === undefined || a.budgetBand === b.budgetBand
  const conflictFields: CoordinationConflictField[] = []
  if (dateWindows.length === 0) conflictFields.push('dateWindows')
  if (regions.length === 0) conflictFields.push('regions')
  if (venueTypes.length === 0) conflictFields.push('venueTypes')
  if (!durationCompatible) conflictFields.push('duration')
  if (!budgetCompatible) conflictFields.push('budget')
  if (conflictFields.length > 0) {
    return { hasOverlap: false, missingFields: [], conflictFields, proposal: null }
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
  return { hasOverlap: true, missingFields: [], conflictFields: [], proposal }
}

const CONFLICT_ASK: Record<CoordinationConflictField, string> = {
  dateWindows: '目前双方还没有找到共同时间。你之前选择的是：',
  regions: '时间已经对齐，但区域还没有交集。你之前填写的是：',
  venueTypes: '区域已经对齐，但活动类型还没有交集。你之前选择的是：',
  duration: '时间、区域和活动都已对齐，但时长还需要协调。是否可以放宽时长要求？',
  budget: '其他条件都已对齐，但预算还需要协调。是否可以放宽预算范围？'
}

function proactiveAsk(state: DateCoordinationState, focus: CoordinationConflictField): string {
  const own = state.party === 'A' ? state.partyAState : state.partyBState
  if (focus === 'dateWindows') {
    const windows = (own.dateWindows || []).slice(0, 3).join('；') || '你还没有填写可约时间'
    return CONFLICT_ASK.dateWindows + windows + '。如果方便，你是否还有其他可以接受的时间？'
  }
  if (focus === 'regions') {
    const regions = (own.regions || []).slice(0, 3).join('；') || '你还没有填写区域'
    return CONFLICT_ASK.regions + regions + '。是否可以接受其他区域？'
  }
  if (focus === 'venueTypes') {
    const venues = (own.venueTypes || []).slice(0, 3).join('；') || '你还没有选择活动类型'
    return CONFLICT_ASK.venueTypes + venues + '。是否可以换一种活动？'
  }
  return CONFLICT_ASK[focus]
}

const FOCUS_PHASE: Record<CoordinationConflictField, string> = {
  dateWindows: 'ask_time',
  regions: 'ask_area',
  venueTypes: 'ask_activity',
  duration: 'ask_duration',
  budget: 'ask_budget'
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

function mapIntentToPhase(intent: string): string | null {
  const text = String(intent || '').toLowerCase()
  if (/^ask_(time|area|activity|budget|duration|partner|more)$/.test(text)) return text
  if (text === 'wait_partner') return 'wait_partner'
  if (text === 'propose') return 'propose'
  if (text === 'manual_handoff') return 'manual_handoff'
  if (text === 'done' || text === 'ready_to_submit') return 'ready_to_submit'
  return null
}

export type DateCoordinationGraphDependencies = {
  checkpointer: BaseCheckpointSaver
  model?: DecisionModel
}

export function buildDateCoordinationGraph(dependencies: DateCoordinationGraphDependencies) {
  const graph = new StateGraph(DateCoordinationAnnotation)
    .addNode('coordinator', async (state) => {
      if (!dependencies.model) return { phase: 'compute_overlap', replyDraft: '' }
      try {
        const overlap = computeSafeOverlap(state.partyAState, state.partyBState)
        const decision = await dependencies.model.decide({
          mode: 'date_coordination',
          phase: sanitizeGraphText(state.phase || 'start', 80),
          userText: sanitizeGraphText(state.userText, 2000),
          safeSummary: sanitizeGraphText(state.safeSummary, 800),
          context: {
            coordinationId: state.coordinationId,
            coordinationVersion: state.coordinationVersion,
            party: state.party,
            partyAState: state.partyAState,
            partyBState: state.partyBState,
            overlap: {
              has_overlap: overlap.hasOverlap,
              missing_fields: overlap.missingFields,
              conflict_fields: overlap.conflictFields || [],
              proposal: overlap.proposal
            }
          }
        })
        const phase = mapIntentToPhase(decision.intent) || 'compute_overlap'
        return {
          phase,
          replyDraft: sanitizeGraphText(decision.replyDraft, 1200),
          riskLevel: decision.riskLevel
        }
      } catch {
        return { phase: 'compute_overlap', replyDraft: '' }
      }
    })
    .addNode('computeOverlap', (state) => {
      const overlap = computeSafeOverlap(state.partyAState, state.partyBState)
      if (overlap.missingFields.length > 0) {
        return {
          phase: 'missing_data',
          proposal: null,
          pendingAction: null,
          replyDraft: ('还需要补充：' + overlap.missingFields.join('、') + '。' + (state.replyDraft || '')).trim()
        }
      }
      if (!overlap.hasOverlap || !overlap.proposal) {
        const focus = (overlap.conflictFields && overlap.conflictFields[0]) || 'dateWindows'
        const ask = proactiveAsk(state, focus)
        return {
          phase: FOCUS_PHASE[focus] || 'ask_time',
          proposal: null,
          pendingAction: null,
          replyDraft: state.replyDraft ? ask + '\n' + state.replyDraft : ask
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
    .addEdge(START, 'coordinator')
    .addEdge('coordinator', 'computeOverlap')
    .addConditionalEdges('computeOverlap', (state) => state.phase === 'ready_to_submit' ? 'submit' : END)
    .addEdge('submit', END)

  return graph.compile({ checkpointer: dependencies.checkpointer })
}