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

export type CoordinationConflictField =
  | 'dateWindows'
  | 'regions'
  | 'venueTypes'
  | 'exactTime'
  | 'activityVenue'
  | 'meetPoint'
  | 'duration'
  | 'budget'
  | 'payment'

export type CoordinationOverlap = {
  hasOverlap: boolean
  missingFields: Array<'dateWindows' | 'regions' | 'venueTypes' | 'partner'>
  conflictFields: CoordinationConflictField[]
  proposal: CoordinationProposal | null
  waitingPartner?: boolean
}

export type CanonicalOverlapSnapshot = {
  source?: 'backend' | 'graph_legacy'
  hasOverlap?: boolean
  missingDimensions?: string[]
  conflictDimensions?: string[]
  proposal?: Record<string, unknown> | null
}

export type ConfirmationSnapshot = {
  myConfirmed: boolean
  partnerConfirmed: boolean
  proposalStatus: string
  source?: 'database' | 'graph_legacy'
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
  ownPreference: CoordinationPreference | undefined
  canonicalOverlap: CanonicalOverlapSnapshot | undefined
  sharedState: Record<string, unknown> | undefined
  partnerProgress: 'waiting' | 'submitted' | 'accepted' | 'confirmed' | undefined
  confirmationSnapshot: ConfirmationSnapshot | undefined
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
  ownPreference: Annotation<CoordinationPreference | undefined>,
  canonicalOverlap: Annotation<CanonicalOverlapSnapshot | undefined>,
  sharedState: Annotation<Record<string, unknown> | undefined>,
  partnerProgress: Annotation<DateCoordinationState['partnerProgress']>,
  confirmationSnapshot: Annotation<ConfirmationSnapshot | undefined>,
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

function mapBackendDimension(value: string): CoordinationConflictField | 'partner' | 'own_preference' | null {
  const key = String(value || '')
  if (key === 'time' || key === 'dateWindows') return 'dateWindows'
  if (key === 'area' || key === 'regions') return 'regions'
  if (key === 'activity' || key === 'venueTypes') return 'venueTypes'
  if (key === 'exact_time' || key === 'start_time') return 'exactTime'
  if (key === 'activity_venue') return 'activityVenue'
  if (key === 'meet_point') return 'meetPoint'
  if (key === 'duration') return 'duration'
  if (key === 'budget') return 'budget'
  if (key === 'payment' || key === 'payment_preference') return 'payment'
  if (key === 'partner') return 'partner'
  if (key === 'own_preference' || key === 'own') return 'own_preference'
  return null
}

export function resolveOverlap(state: DateCoordinationState): CoordinationOverlap {
  const canonical = state.canonicalOverlap
  if (canonical && canonical.source === 'backend') {
    const rawMissing = Array.isArray(canonical.missingDimensions) ? canonical.missingDimensions : []
    const waitingPartner = rawMissing.includes('partner')
      || rawMissing.includes('own_preference')
      || state.partnerProgress === 'waiting'
      || state.partnerProgress === 'accepted'
    const mappedMissing = rawMissing
      .map(mapBackendDimension)
      .filter((item): item is 'dateWindows' | 'regions' | 'venueTypes' | 'partner' => (
        item === 'dateWindows' || item === 'regions' || item === 'venueTypes' || item === 'partner'
      ))
    const conflictSource = Array.isArray(canonical.conflictDimensions) && canonical.conflictDimensions.length
      ? canonical.conflictDimensions
      : rawMissing.filter((item) => item !== 'partner' && item !== 'own_preference')
    const conflictFields = conflictSource
      .map(mapBackendDimension)
      .filter((item): item is CoordinationConflictField => Boolean(item && item !== 'partner' && item !== 'own_preference'))
    const proposal = canonical.proposal && typeof canonical.proposal === 'object'
      ? canonical.proposal as CoordinationProposal
      : null
    return {
      hasOverlap: canonical.hasOverlap === true && !waitingPartner,
      missingFields: mappedMissing.filter((item) => item !== 'partner') as Array<'dateWindows' | 'regions' | 'venueTypes'>,
      conflictFields,
      proposal: canonical.hasOverlap === true ? proposal : null,
      waitingPartner
    }
  }
  return computeSafeOverlap(state.partyAState, state.partyBState)
}

const CONFLICT_ASK: Record<CoordinationConflictField, string> = {
  dateWindows: '目前双方还没有找到共同时间。你之前选择的是：',
  regions: '时间已经对齐，但区域还没有交集。你之前填写的是：',
  venueTypes: '区域已经对齐，但活动类型还没有交集。你之前选择的是：',
  exactTime: '日期和大致时间段已经对齐，但还需要确认具体几点。你希望几点开始？',
  activityVenue: '活动已经确定，但具体活动场地还需要确认。请提供一个适合该活动的公共场地。',
  meetPoint: '活动场地已经明确，但还需要一个双方容易找到的公共集合点。',
  duration: '时间、区域和活动都已对齐，但时长还需要协调。是否可以放宽时长要求？',
  budget: '其他条件都已对齐，但预算还需要协调。是否可以放宽预算范围？',
  payment: '时间、区域、活动和预算已经对齐，但费用方式还不兼容。是否可以调整付款方式？'
}

function ownPreferenceOf(state: DateCoordinationState): CoordinationPreference {
  if (state.ownPreference !== undefined) return state.ownPreference
  return state.party === 'A' ? state.partyAState : state.partyBState
}

function counterOfferOf(state: DateCoordinationState): Record<string, unknown> | null {
  const value = state.sharedState?.counterOffer
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function counterProposalReply(counterOffer: Record<string, unknown>): string {
  const changes = Array.isArray(counterOffer.changes) ? counterOffer.changes : []
  const changeText = changes
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const value = item as Record<string, unknown>
      const label = sanitizeGraphText(String(value.label || ''), 20)
      const before = sanitizeGraphText(String(value.before_text || ''), 80)
      const after = sanitizeGraphText(String(value.after_text || ''), 80)
      return label && after ? `${label}：${before || '原方案'} → ${after}` : ''
    })
    .filter(Boolean)
    .join('；')
  const unchanged = sanitizeGraphText(String(counterOffer.unchanged_text || ''), 120)
  return [
    '对方提出了一份明确的调整方案。',
    changeText,
    unchanged ? `${unchanged}保持原方案。` : '',
    '请在协调页查看完整方案；接受后只会对齐这些改动，再由系统生成双方确认的最终方案。'
  ].filter(Boolean).join('\n')
}

function proactiveAsk(state: DateCoordinationState, focus: CoordinationConflictField): string {
  const own = ownPreferenceOf(state)
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
  if (focus === 'exactTime' || focus === 'activityVenue' || focus === 'meetPoint') return CONFLICT_ASK[focus]
  return CONFLICT_ASK[focus]
}

const FOCUS_PHASE: Record<CoordinationConflictField, string> = {
  dateWindows: 'ask_time',
  regions: 'ask_area',
  venueTypes: 'ask_activity',
  exactTime: 'ask_exact_time',
  activityVenue: 'ask_activity_venue',
  meetPoint: 'ask_meet_point',
  duration: 'ask_duration',
  budget: 'ask_budget',
  payment: 'ask_payment'
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
  if (/^ask_(time|exact_time|area|activity|activity_venue|meet_point|budget|duration|partner|more)$/.test(text)) return text
  if (text === 'clarify_scope') return 'clarify_scope'
  if (text === 'accept_current_invitation') return 'review_invitation'
  if (text === 'modify_specific_dimensions' || text === 'partial_override' || text === 'provide_preference_range') return 'clarify_overrides'
  if (text === 'accept_counter_proposal' || text === 'review_counter_proposal') return 'review_counter_proposal'
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
        const overlap = resolveOverlap(state)
        const decision = await dependencies.model.decide({
          mode: 'date_coordination',
          phase: sanitizeGraphText(state.phase || 'start', 80),
          userText: sanitizeGraphText(state.userText, 2000),
          safeSummary: sanitizeGraphText(state.safeSummary, 800),
          context: {
            coordinationId: state.coordinationId,
            coordinationVersion: state.coordinationVersion,
            party: state.party,
            ownPreference: ownPreferenceOf(state),
            sharedState: state.sharedState || {},
            coordinationPath: String(state.sharedState?.coordinationPath || ''),
            actionRequired: String(state.sharedState?.actionRequired || ''),
            proposalBaseAvailable: state.sharedState?.proposalBaseAvailable === true,
            partnerProgress: state.partnerProgress || '',
            confirmationSnapshot: state.confirmationSnapshot || null,
            overlap: {
              has_overlap: overlap.hasOverlap,
              missing_fields: overlap.missingFields,
              conflict_fields: overlap.conflictFields || [],
              waiting_partner: Boolean(overlap.waitingPartner),
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
      const planIssue = state.sharedState?.planIssue
      if (planIssue && typeof planIssue === 'object' && !Array.isArray(planIssue)) {
        const message = sanitizeGraphText(String((planIssue as Record<string, unknown>).message || ''), 240)
        if (message) {
          return {
            phase: 'clarify_plan',
            proposal: null,
            pendingAction: null,
            replyDraft: message
          }
        }
      }
      if (state.phase === 'clarify_scope' && state.replyDraft) {
        return {
          phase: 'clarify_scope',
          proposal: null,
          pendingAction: null,
          replyDraft: state.replyDraft
        }
      }
      const overlap = resolveOverlap(state)
      const missingDimensions = state.canonicalOverlap?.missingDimensions
      const missingOwn = Array.isArray(missingDimensions) && missingDimensions.includes('own_preference')
      if (missingOwn && state.party === 'B') {
        return {
          phase: 'clarify_overrides',
          proposal: null,
          pendingAction: null,
          replyDraft: ('你不需要重新填写全部约会信息。如果大部分安排都可以，直接告诉我你希望调整的地方就可以。例如：“时间可以，但我更方便福田。”' + (state.replyDraft ? '\n' + state.replyDraft : '')).trim()
        }
      }
      if (overlap.waitingPartner) {
        const waitingPrefs = state.partnerProgress === 'accepted'
        const waitText = waitingPrefs
          ? '对方已接受约会邀请，目前正在补充自己的安排。已经一致的条件我不会再重复询问。'
          : '你的约会邀请已经发送。等待对方回应期间，你可以继续告诉我希望调整的时间、区域或其他安排。'
        return {
          phase: waitingPrefs ? 'wait_invitee_preference' : 'wait_partner',
          proposal: null,
          pendingAction: null,
          replyDraft: (waitText + (state.replyDraft ? '\n' + state.replyDraft : '')).trim()
        }
      }
      const counterOffer = counterOfferOf(state)
      if (counterOffer && counterOffer.kind === 'partner_structured_counter_proposal') {
        return {
          phase: 'review_counter_proposal',
          proposal: null,
          pendingAction: null,
          replyDraft: counterProposalReply(counterOffer)
        }
      }
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
      const snapshot = state.confirmationSnapshot
      if (snapshot && snapshot.source === 'database') {
        if (snapshot.proposalStatus === 'arranged' || (snapshot.myConfirmed && snapshot.partnerConfirmed)) {
          return {
            phase: 'arranged_readonly',
            proposal: overlap.proposal,
            pendingAction: null,
            replyDraft: snapshot.myConfirmed && !snapshot.partnerConfirmed
              ? '你已确认当前方案，正在等待对方确认。'
              : '双方已确认最终方案。本次协调不能再修改。'
          }
        }
        return {
          phase: snapshot.myConfirmed ? 'awaiting_partner_confirmation' : 'awaiting_confirmation',
          proposal: overlap.proposal,
          pendingAction: null,
          replyDraft: snapshot.myConfirmed
            ? '你已确认当前方案，正在等待对方确认。'
            : '已找到双方都可以接受的方案，等待双方确认。'
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
