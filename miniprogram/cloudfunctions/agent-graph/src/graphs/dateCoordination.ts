import {
  Annotation,
  END,
  START,
  StateGraph,
  type BaseCheckpointSaver
} from '@langchain/langgraph'
import {
  CoordinationCanonicalPlanSchema,
  CoordinationCanonicalStateSchema,
  CoordinationChangeSetSchema,
  CoordinationCommandSchema,
  CoordinationContextRefSchema,
  CoordinationPreferenceSchema,
  PendingActionSchema,
  PendingPreviewSchema,
  type CoordinationCanonicalPlan,
  type CoordinationCanonicalState,
  type CoordinationCommand,
  type CoordinationContextRef,
  type CoordinationPreference,
  type PendingAction,
  type PendingPreview,
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

export type CoordinationConflictField = 'dateWindows' | 'regions' | 'venueTypes' | 'duration' | 'budget' | 'payment'

export type CoordinationOverlap = {
  hasOverlap: boolean
  missingFields: Array<'dateWindows' | 'regions' | 'venueTypes' | 'partner'>
  conflictFields: CoordinationConflictField[]
  proposal: CoordinationProposal | null
  waitingPartner?: boolean
}

export type CanonicalOverlapSnapshot = {
  source?: 'backend' | 'graph_legacy' | undefined
  hasOverlap?: boolean | undefined
  missingDimensions?: string[] | undefined
  conflictDimensions?: string[] | undefined
  proposal?: Record<string, unknown> | null | undefined
}

export type ConfirmationSnapshot = {
  myConfirmed: boolean
  partnerConfirmed: boolean
  proposalStatus: string
  source?: 'database' | 'graph_legacy' | undefined
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
  pendingTool: PendingAction | null | undefined
  pendingPreview: PendingPreview | null | undefined
  lastResult: SafeToolResult | undefined
  resumeToolResult: SafeToolResult | undefined
  confirmationA: boolean
  confirmationB: boolean
  confirmationVersionA: number | undefined
  confirmationVersionB: number | undefined
  proposal: Record<string, unknown> | null
  coordinationId: number
  coordinationVersion: number
  baseVersion: number | undefined
  party: 'A' | 'B'
  partyAState: CoordinationPreference
  partyBState: CoordinationPreference
  ownPreference: CoordinationPreference | undefined
  canonicalOverlap: CanonicalOverlapSnapshot | undefined
  sharedState: Record<string, unknown> | undefined
  partnerProgress: 'waiting' | 'submitted' | 'accepted' | 'confirmed' | undefined
  confirmationSnapshot: ConfirmationSnapshot | undefined
  canonicalState: CoordinationCanonicalState | undefined
  candidatePlan: CoordinationCanonicalPlan | null | undefined
  candidateChanges: Record<string, unknown> | undefined
  contextRef: CoordinationContextRef | undefined
  coordinationCommand: CoordinationCommand | null | undefined
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
  pendingTool: Annotation<PendingAction | null | undefined>,
  pendingPreview: Annotation<PendingPreview | null | undefined>,
  lastResult: Annotation<SafeToolResult | undefined>,
  resumeToolResult: Annotation<SafeToolResult | undefined>,
  confirmationA: Annotation<boolean>,
  confirmationB: Annotation<boolean>,
  confirmationVersionA: Annotation<number | undefined>,
  confirmationVersionB: Annotation<number | undefined>,
  proposal: Annotation<Record<string, unknown> | null>,
  coordinationId: Annotation<number>,
  coordinationVersion: Annotation<number>,
  baseVersion: Annotation<number | undefined>,
  party: Annotation<'A' | 'B'>,
  partyAState: Annotation<CoordinationPreference>,
  partyBState: Annotation<CoordinationPreference>,
  ownPreference: Annotation<CoordinationPreference | undefined>,
  canonicalOverlap: Annotation<CanonicalOverlapSnapshot | undefined>,
  sharedState: Annotation<Record<string, unknown> | undefined>,
  partnerProgress: Annotation<DateCoordinationState['partnerProgress']>,
  confirmationSnapshot: Annotation<ConfirmationSnapshot | undefined>,
  canonicalState: Annotation<CoordinationCanonicalState | undefined>,
  candidatePlan: Annotation<CoordinationCanonicalPlan | null | undefined>,
  candidateChanges: Annotation<Record<string, unknown> | undefined>,
  contextRef: Annotation<CoordinationContextRef | undefined>,
  coordinationCommand: Annotation<CoordinationCommand | null | undefined>,
  errorCode: Annotation<string | undefined>
})

function commonValues(left: string[], right: string[]): string[] {
  const allowed = new Set(right)
  return left.filter((value, index) => allowed.has(value) && left.indexOf(value) === index)
}

export function computeSafeOverlap(rawA: CoordinationPreference, rawB: CoordinationPreference): CoordinationOverlap {
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
  if (conflictFields.length > 0) return { hasOverlap: false, missingFields: [], conflictFields, proposal: null }

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
    const waitingPartner = rawMissing.includes('partner') || rawMissing.includes('own_preference')
      || state.partnerProgress === 'waiting' || state.partnerProgress === 'accepted'
    const mappedMissing = rawMissing.map(mapBackendDimension).filter((item): item is 'dateWindows' | 'regions' | 'venueTypes' | 'partner' => (
      item === 'dateWindows' || item === 'regions' || item === 'venueTypes' || item === 'partner'
    ))
    const conflictSource = Array.isArray(canonical.conflictDimensions) && canonical.conflictDimensions.length
      ? canonical.conflictDimensions
      : rawMissing.filter((item) => item !== 'partner' && item !== 'own_preference')
    const conflictFields = conflictSource.map(mapBackendDimension).filter((item): item is CoordinationConflictField => (
      Boolean(item && item !== 'partner' && item !== 'own_preference')
    ))
    const proposal = canonical.proposal && typeof canonical.proposal === 'object' ? canonical.proposal as CoordinationProposal : null
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

export function applyPreferenceChange(state: DateCoordinationState, party: 'A' | 'B', rawPreference: CoordinationPreference): DateCoordinationState {
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
    pendingTool: null,
    pendingPreview: null,
    errorCode: undefined
  }
}

export function applyConfirmation(state: DateCoordinationState, party: 'A' | 'B', version: number): DateCoordinationState {
  if (version !== state.coordinationVersion) return { ...state, errorCode: 'stale_coordination_version' }
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

const VERSION_BOUND_COMMANDS = new Set([
  'PROPOSE_CHANGE', 'PROPOSE_CHANGE_AND_ASK_PARTNER', 'CONFIRM_PREVIEW', 'CANCEL_PREVIEW',
  'CONFIRM_CURRENT_PLAN', 'REJECT_CURRENT_PLAN', 'ACCEPT_INVITATION', 'DECLINE_INVITATION', 'CANCEL_COORDINATION'
])

function action(type: string, args: Record<string, unknown>, requiresConfirmation = false): PendingAction {
  return PendingActionSchema.parse({ type, arguments: args, requiresConfirmation })
}

function clearToolState() {
  return { pendingAction: null, pendingTool: null }
}

const PREVIEW_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  date: '日期',
  period: '时段',
  start_time: '开始时间',
  activity: '活动',
  activity_detail: '活动细节',
  venue: '场地',
  area: '区域',
  budget: '预算',
  payment: '费用方式',
  duration: '时长'
})

const PREVIEW_VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  period: { morning: '上午', afternoon: '下午', evening: '晚上', night: '夜间' },
  payment: { aa: 'AA', self_pays: '各付各的', partner_pays: '对方请客', flexible: '双方灵活' },
  duration: { 'about-1h': '约1小时', '1-2h': '1-2小时', '2-3h': '2-3小时', flexible: '时长灵活' }
})

function previewValue(field: string, value: unknown): string {
  if (value === undefined || value === null || String(value).trim() === '') return '未设置'
  const mapped = PREVIEW_VALUE_LABELS[field]?.[String(value)]
  return mapped || String(value)
}

function activityValue(plan: CoordinationCanonicalPlan): string {
  return [plan.activity, plan.activity_detail]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('·') || '未设置'
}

function buildPreviewReply(state: DateCoordinationState): string {
  const current = state.canonicalState?.current_plan || {}
  const candidate = state.candidatePlan || current
  const changes = state.candidateChanges || {}
  const changedFields = Object.keys(changes)
  const descriptions: string[] = []
  const activityChanged = changedFields.includes('activity') || changedFields.includes('activity_detail')
  if (activityChanged) {
    descriptions.push(`活动从“${activityValue(current)}”改为“${activityValue(candidate)}”`)
  }
  for (const field of changedFields) {
    if (field === 'activity' || field === 'activity_detail') continue
    const label = PREVIEW_FIELD_LABELS[field] || field
    descriptions.push(`${label}从“${previewValue(field, current[field as keyof CoordinationCanonicalPlan])}”改为“${previewValue(field, candidate[field as keyof CoordinationCanonicalPlan])}”`)
  }
  const changeText = descriptions.length ? `你想把${descriptions.join('，')}。` : '你想调整当前约会安排。'
  const preserveFields = ['venue', 'area', 'budget', 'payment', 'duration']
    .filter((field) => !changedFields.includes(field) && state.coordinationCommand?.preserve.includes(field as CoordinationCommand['preserve'][number]))
  const preserveLabels = preserveFields.map((field) => PREVIEW_FIELD_LABELS[field] || field)
  const preserveText = preserveLabels.length
    ? `${preserveLabels.join('、')}保持当前安排。`
    : '其他未调整的安排保持不变。'
  const partnerText = state.coordinationCommand?.partner_request
    ? '，并询问对方是否接受这次调整'
    : ''
  return `${changeText}\n${preserveText}\n确认后我会更新约会方案${partnerText}。`
}

function buildConfirmationReply(result: SafeToolResult, pendingType: string): string {
  if (!['confirm_date_application_patch', 'confirm_date_application'].includes(pendingType)) {
    return '请求已交由后端校验处理，请以当前协调状态为准。'
  }
  const data = result.data || {}
  const applied = data.applied === true
  if (!applied) return '这次调整还没有生效，请重新确认。'
  const projectionPending = data.projection_pending === true || data.event_status === 'pending' || data.notification_status === 'pending'
  if (projectionPending) return '已确认这次调整，正在向对方同步。'
  if (data.partnerNotified === true || data.partner_notified === true || data.event_status === 'projected') {
    return '已确认这次调整，并已同步给对方。'
  }
  if (data.skipped === true || data.notification_status === 'skipped') {
    return '已确认这次调整，当前未发送额外通知，请以最新协调状态为准。'
  }
  return '已确认这次调整，请以最新协调状态为准。'
}

function loadCanonicalState(state: DateCoordinationState): Partial<DateCoordinationState> {
  if (!state.canonicalState) return {}
  const canonical = CoordinationCanonicalStateSchema.parse(state.canonicalState)
  const isToolResume = Boolean(state.resumeToolResult)
  const requestContextRef = state.contextRef
    ? CoordinationContextRefSchema.parse(state.contextRef)
    : undefined
  const databasePendingPreview = state.pendingPreview
    ? PendingPreviewSchema.parse(state.pendingPreview)
    : null
  return {
    coordinationId: canonical.coordination_id,
    coordinationVersion: canonical.coordination_version,
    baseVersion: canonical.coordination_version,
    party: canonical.party,
    canonicalState: canonical,
    canonicalOverlap: canonical.canonical_overlap,
    sharedState: canonical.shared_state,
    ownPreference: canonical.own_preference,
    partnerProgress: canonical.partner_progress,
    confirmationSnapshot: canonical.confirmation_snapshot,
    proposal: canonical.current_plan,
    ...(isToolResume ? {} : {
      candidatePlan: null,
      candidateChanges: {},
      contextRef: requestContextRef,
      coordinationCommand: null,
      pendingPreview: databasePendingPreview,
      ...clearToolState(),
      errorCode: undefined
    })
  }
}

function parseCommand(dependencies: DateCoordinationGraphDependencies, state: DateCoordinationState): Promise<Partial<DateCoordinationState>> {
  if (!dependencies.model) return Promise.resolve({ coordinationCommand: null, errorCode: 'invalid_command' })
  return dependencies.model.decide({
    mode: 'date_coordination',
    phase: 'parse_command',
    userText: sanitizeGraphText(state.userText, 2000),
    safeSummary: sanitizeGraphText(state.safeSummary, 800),
    context: {
      coordinationId: state.coordinationId,
      coordinationVersion: state.coordinationVersion,
      party: state.party,
      currentPlan: state.canonicalState?.current_plan || null,
      canonicalOverlap: state.canonicalOverlap || null,
      sharedState: state.sharedState || {},
      partnerProgress: state.partnerProgress || '',
      confirmationSnapshot: state.confirmationSnapshot || null,
      invitationVersion: state.canonicalState?.invitation_version || null,
      currentProposalId: state.canonicalState?.current_proposal_id || null,
      contextRef: state.contextRef || null,
      pendingPreview: state.pendingPreview || null
    }
  }).then((decision) => {
    const parsed = CoordinationCommandSchema.safeParse(decision.coordinationCommand)
    if (!parsed.success) return { coordinationCommand: null, errorCode: 'invalid_command' }
    return { coordinationCommand: parsed.data, replyDraft: sanitizeGraphText(decision.replyDraft, 1200), riskLevel: decision.riskLevel }
  })
}

function validateContextVersion(state: DateCoordinationState): Partial<DateCoordinationState> {
  const command = state.coordinationCommand
  if (!command) return { errorCode: state.errorCode || 'invalid_command' }
  const requestContext = state.contextRef
  if (requestContext && requestContext.coordination_id !== state.coordinationId) {
    return { errorCode: 'invalid_context_ref' }
  }
  if (requestContext && requestContext.coordination_version !== state.coordinationVersion) {
    return { errorCode: 'stale_context' }
  }
  const context = command.context_ref || requestContext
  if (context && context.coordination_id !== state.coordinationId) return { errorCode: 'invalid_context_ref' }
  const version = context?.coordination_version || command.target_version || state.coordinationVersion
  if (version !== state.coordinationVersion) return { errorCode: 'stale_coordination_version' }
  if (VERSION_BOUND_COMMANDS.has(command.type) && !command.target_version && !context) return { errorCode: 'invalid_command' }
  if ((command.type === 'CONFIRM_PREVIEW' || command.type === 'CANCEL_PREVIEW')
    && (context?.type !== 'patch_preview'
      || !state.pendingPreview
      || context.patch_id !== state.pendingPreview.patchId)) {
    return { errorCode: 'invalid_context_ref' }
  }
  if ((command.type === 'PROPOSE_CHANGE' || command.type === 'PROPOSE_CHANGE_AND_ASK_PARTNER')
    && context?.type === 'proposal'
    && state.canonicalState?.current_proposal_id
    && context.proposal_id !== state.canonicalState.current_proposal_id) {
    return { errorCode: 'stale_context' }
  }
  if ((command.type === 'ACCEPT_INVITATION' || command.type === 'DECLINE_INVITATION')
    && context?.type === 'invitation'
    && context.invitation_version !== state.canonicalState?.invitation_version) {
    return { errorCode: 'stale_coordination_version' }
  }
  if ((command.type === 'CONFIRM_CURRENT_PLAN' || command.type === 'REJECT_CURRENT_PLAN')
    && context?.type === 'proposal'
    && context.proposal_id !== state.canonicalState?.current_proposal_id) {
    return { errorCode: 'stale_context' }
  }
  return { baseVersion: version, contextRef: context }
}

function applyPlanIntent(state: DateCoordinationState): Partial<DateCoordinationState> {
  const command = state.coordinationCommand
  if (!command || !['PROPOSE_CHANGE', 'PROPOSE_CHANGE_AND_ASK_PARTNER'].includes(command.type)) {
    return { errorCode: 'invalid_command', ...clearToolState() }
  }
  const changes = CoordinationChangeSetSchema.parse(command.changes)
  const current = state.canonicalState?.current_plan || {}
  const candidatePlan = CoordinationCanonicalPlanSchema.parse({ ...current, ...changes })
  const preview = PendingPreviewSchema.parse({
    baseVersion: state.baseVersion || state.coordinationVersion,
    candidatePlan,
    candidateChanges: changes,
    ...(command.partner_request ? { partnerRequest: command.partner_request } : {}),
    ...(state.contextRef ? { contextRef: state.contextRef } : {})
  })
  const args: Record<string, unknown> = {
    coordinationId: state.coordinationId,
    coordinationVersion: state.baseVersion || state.coordinationVersion,
    contextRef: state.contextRef,
    changes,
    preserve: command.preserve,
    candidatePlan
  }
  if (command.type === 'PROPOSE_CHANGE_AND_ASK_PARTNER') args.partnerRequest = command.partner_request
  const pending = action('create_date_application_patch', args, true)
  return {
    phase: 'awaiting_tool',
    candidatePlan,
    candidateChanges: changes,
    pendingPreview: preview,
    pendingAction: pending,
    pendingTool: pending,
    errorCode: undefined
  }
}

function partnerAction(state: DateCoordinationState): Partial<DateCoordinationState> {
  const command = state.coordinationCommand
  if (!command || (command.type === 'ASK_PARTNER' && !command.partner_request)) return { errorCode: 'invalid_command', ...clearToolState() }
  const pending = action('notify_coordination_partner', {
    coordinationId: state.coordinationId,
    coordinationVersion: state.coordinationVersion,
    contextRef: state.contextRef,
    eventType: command.type === 'ASK_PARTNER' ? 'PARTNER_QUESTION' : 'ARRIVAL_STATUS_REQUESTED',
    partnerRequest: command.partner_request,
    relay: command.relay
  })
  return { phase: 'awaiting_tool', pendingAction: pending, pendingTool: pending, errorCode: undefined }
}

function arrivalAndAskPartnerStatusAction(state: DateCoordinationState): Partial<DateCoordinationState> {
  const command = state.coordinationCommand
  if (!command || command.type !== 'ARRIVAL_AND_ASK_PARTNER_STATUS' || !command.partner_request) {
    return { errorCode: 'invalid_command', ...clearToolState() }
  }
  const pending = action('record_arrival_and_request_partner_status', {
    coordinationId: state.coordinationId,
    coordinationVersion: state.coordinationVersion,
    contextRef: state.contextRef,
    partnerRequest: command.partner_request
  })
  return { phase: 'awaiting_tool', pendingAction: pending, pendingTool: pending, errorCode: undefined }
}

function eventAction(state: DateCoordinationState): Partial<DateCoordinationState> {
  const command = state.coordinationCommand
  if (!command || !command.relay) return { errorCode: 'invalid_command', ...clearToolState() }
  const eventTypes: Record<string, string> = {
    ARRIVAL_STATUS: 'ARRIVED',
    ARRIVAL_HINT: 'ARRIVAL_HINT_UPDATED',
    DELAY_NOTICE: 'DELAY_NOTICE',
    RELAY_MESSAGE: 'PARTNER_RESPONSE'
  }
  const eventType = eventTypes[command.type]
  if (!eventType) return { errorCode: 'invalid_command', ...clearToolState() }
  const tool = command.type === 'RELAY_MESSAGE' ? 'notify_coordination_partner' : 'publish_coordination_event'
  const pending = action(tool, {
    coordinationId: state.coordinationId,
    coordinationVersion: state.coordinationVersion,
    contextRef: state.contextRef,
    eventType,
    relay: command.relay
  })
  return { phase: 'awaiting_tool', pendingAction: pending, pendingTool: pending, errorCode: undefined }
}

function routeCommand(state: DateCoordinationState): string {
  if (state.errorCode) return 'finishError'
  const type = state.coordinationCommand?.type
  if (type === 'QUERY_STATUS') return 'replyFromCanonicalState'
  if (type === 'PROPOSE_CHANGE' || type === 'PROPOSE_CHANGE_AND_ASK_PARTNER') return 'applyPlanIntent'
  if (type === 'ASK_PARTNER' || type === 'ASK_PARTNER_ARRIVAL') return 'partnerAction'
  if (type === 'ARRIVAL_AND_ASK_PARTNER_STATUS') return 'arrivalAndAskPartnerStatusAction'
  if (['ARRIVAL_STATUS', 'ARRIVAL_HINT', 'DELAY_NOTICE', 'RELAY_MESSAGE'].includes(type || '')) return 'eventAction'
  return 'commandAction'
}

function commandAction(state: DateCoordinationState): Partial<DateCoordinationState> {
  const command = state.coordinationCommand
  if (!command) return { errorCode: 'invalid_command', ...clearToolState() }
  if (command.type === 'CLARIFY') return {
    phase: 'clarify',
    replyDraft: sanitizeGraphText(command.clarification, 300),
    ...clearToolState(),
    errorCode: undefined
  }
  if (command.type === 'CONFIRM_PREVIEW' || command.type === 'CANCEL_PREVIEW') {
    const context = command.context_ref
    if (!context || context.type !== 'patch_preview') return { errorCode: 'invalid_context_ref', ...clearToolState() }
    const pending = action(command.type === 'CONFIRM_PREVIEW' ? 'confirm_date_application_patch' : 'cancel_date_application_patch', {
      coordinationId: state.coordinationId,
      coordinationVersion: state.coordinationVersion,
      patchId: context.patch_id,
      contextRef: context,
      ...(state.pendingPreview?.partnerRequest ? { partnerRequest: state.pendingPreview.partnerRequest } : {})
    })
    return { phase: 'awaiting_tool', pendingAction: pending, pendingTool: pending, errorCode: undefined }
  }
  if (command.type === 'CONFIRM_CURRENT_PLAN' || command.type === 'REJECT_CURRENT_PLAN') {
    const pending = action(command.type === 'CONFIRM_CURRENT_PLAN' ? 'confirm_date_application' : 'reject_date_application', {
      coordinationId: state.coordinationId,
      coordinationVersion: state.coordinationVersion,
      proposalId: command.context_ref?.type === 'proposal' ? command.context_ref.proposal_id : undefined,
      contextRef: state.contextRef
    })
    return { phase: 'awaiting_tool', pendingAction: pending, pendingTool: pending, errorCode: undefined }
  }
  if (command.type === 'ACCEPT_INVITATION' || command.type === 'DECLINE_INVITATION') {
    if (!command.context_ref || command.context_ref.type !== 'invitation') return { errorCode: 'invalid_context_ref', ...clearToolState() }
    const pending = action('respond_date_invitation', {
      coordinationId: state.coordinationId,
      coordinationVersion: state.coordinationVersion,
      invitationVersion: command.context_ref.invitation_version,
      decision: command.type === 'ACCEPT_INVITATION' ? 'accept' : 'decline',
      contextRef: command.context_ref
    })
    return { phase: 'awaiting_tool', pendingAction: pending, pendingTool: pending, errorCode: undefined }
  }
  if (command.type === 'CANCEL_COORDINATION') {
    const pending = action('cancel_coordination', {
      coordinationId: state.coordinationId,
      coordinationVersion: state.coordinationVersion,
      contextRef: state.contextRef
    })
    return { phase: 'awaiting_tool', pendingAction: pending, pendingTool: pending, errorCode: undefined }
  }
  if (command.type === 'ASK_PARTNER_ARRIVAL') return partnerAction(state)
  return { errorCode: 'invalid_command', ...clearToolState() }
}

function applyToolResult(state: DateCoordinationState): Partial<DateCoordinationState> {
  const result = state.resumeToolResult || state.lastResult
  if (!result) return { errorCode: 'invalid_tool_result', ...clearToolState() }
  if (!result.ok) return {
    phase: 'error',
    lastResult: result,
    resumeToolResult: undefined,
    replyDraft: '这次协调请求尚未完成，请稍后重试。',
    ...clearToolState(),
    errorCode: result.code || 'tool_failed'
  }
  const pendingType = state.pendingTool?.type || state.pendingAction?.type
  const data = result.data || {}
  if (pendingType === 'create_date_application_patch' && state.candidatePlan) {
    const patchId = Number(data.patchId || data.previewId || 0)
    const previewContext = patchId > 0
      ? {
        type: 'patch_preview' as const,
        coordination_id: state.coordinationId,
        coordination_version: state.baseVersion || state.coordinationVersion,
        patch_id: patchId
      }
      : state.contextRef
    const pendingPreview = PendingPreviewSchema.parse({
      baseVersion: state.baseVersion || state.coordinationVersion,
      candidatePlan: state.candidatePlan,
      candidateChanges: state.candidateChanges || {},
      ...(state.coordinationCommand?.partner_request
        ? { partnerRequest: state.coordinationCommand.partner_request }
        : {}),
      ...(patchId > 0 ? { patchId } : {}),
      ...(previewContext ? { contextRef: previewContext } : {})
    })
    return {
      phase: 'awaiting_confirmation',
      lastResult: result,
      resumeToolResult: undefined,
      pendingPreview,
      contextRef: previewContext,
      ...clearToolState(),
      replyDraft: buildPreviewReply(state),
      errorCode: undefined
    }
  }
  const clearsActionableContext = [
    'confirm_date_application_patch',
    'cancel_date_application_patch',
    'confirm_date_application',
    'reject_date_application',
    'respond_date_invitation',
    'cancel_coordination'
  ].includes(String(pendingType || ''))
  const replyDraft = buildConfirmationReply(result, String(pendingType || ''))
  return {
    phase: 'completed',
    lastResult: result,
    resumeToolResult: undefined,
    ...clearToolState(),
    ...(clearsActionableContext ? { contextRef: undefined } : {}),
    replyDraft,
    errorCode: undefined
  }
}

export type DateCoordinationGraphDependencies = {
  checkpointer: BaseCheckpointSaver
  model?: DecisionModel
}

export function buildDateCoordinationGraph(dependencies: DateCoordinationGraphDependencies) {
  const graph = new StateGraph(DateCoordinationAnnotation)
    .addNode('loadCanonicalState', (state) => loadCanonicalState(state))
    .addNode('parseCommand', (state) => parseCommand(dependencies, state))
    .addNode('validateContextVersion', (state) => validateContextVersion(state))
    .addNode('replyFromCanonicalState', (state) => ({
      phase: 'query_status',
      ...clearToolState(),
      replyDraft: `当前协调状态：${state.canonicalState?.status || 'unknown'}。`,
      errorCode: undefined
    }))
    .addNode('applyPlanIntent', (state) => applyPlanIntent(state))
    .addNode('partnerAction', (state) => partnerAction(state))
    .addNode('arrivalAndAskPartnerStatusAction', (state) => arrivalAndAskPartnerStatusAction(state))
    .addNode('eventAction', (state) => eventAction(state))
    .addNode('commandAction', (state) => commandAction(state))
    .addNode('finishError', (state) => ({ phase: 'error', replyDraft: '', ...clearToolState() }))
    .addNode('applyToolResult', (state) => applyToolResult(state))
    // Compatibility branch for pre-Phase-B callers without an API canonical
    // projection. It has no model semantic classification.
    .addNode('legacyCoordinator', () => ({ phase: 'compute_overlap', replyDraft: '' }))
    .addNode('computeOverlap', (state) => {
      const overlap = resolveOverlap(state)
      const missingDimensions = state.canonicalOverlap?.missingDimensions
      if (Array.isArray(missingDimensions) && missingDimensions.includes('own_preference') && state.party === 'B') {
        return { phase: 'clarify_overrides', proposal: null, pendingAction: null, replyDraft: '你不需要重新填写全部约会信息。如果大部分安排都可以，直接告诉我希望调整的地方。' }
      }
      if (overlap.waitingPartner) return {
        phase: state.partnerProgress === 'accepted' ? 'wait_invitee_preference' : 'wait_partner', proposal: null, pendingAction: null,
        replyDraft: state.partnerProgress === 'accepted' ? '对方已接受约会邀请，目前正在补充自己的安排。已经一致的条件我不会再重复询问。' : '你的约会邀请已经发送，正在等待对方回应。'
      }
      if (overlap.missingFields.length > 0) return { phase: 'missing_data', proposal: null, pendingAction: null, replyDraft: '还需要补充：' + overlap.missingFields.join('、') + '。' }
      if (!overlap.hasOverlap || !overlap.proposal) {
        const focus = overlap.conflictFields[0]
        const message = focus === 'dateWindows'
          ? '目前双方还没有找到共同时间。如果方便，请补充或调整可接受时间。'
          : '目前还没有形成双方共同方案，请补充或调整可接受条件。'
        return { phase: focus === 'dateWindows' ? 'ask_time' : 'awaiting_confirmation', proposal: null, pendingAction: null, replyDraft: message }
      }
      const snapshot = state.confirmationSnapshot
      if (snapshot?.proposalStatus === 'arranged' || (snapshot?.myConfirmed && snapshot.partnerConfirmed)) return { phase: 'arranged_readonly', proposal: overlap.proposal, pendingAction: null, replyDraft: '双方已确认最终方案。' }
      const confirmationsCurrent = state.confirmationA && state.confirmationB
        && state.confirmationVersionA === state.coordinationVersion
        && state.confirmationVersionB === state.coordinationVersion
      if (confirmationsCurrent) return {
        phase: 'ready_to_submit',
        proposal: overlap.proposal,
        pendingAction: null,
        replyDraft: '双方已确认当前方案。'
      }
      return { phase: 'awaiting_confirmation', proposal: overlap.proposal, pendingAction: null, replyDraft: snapshot?.myConfirmed ? '你已确认当前方案，正在等待对方确认。' : '已找到双方都可以接受的方案，等待双方确认。' }
    })
    .addNode('submit', (state) => ({ phase: 'awaiting_tool', pendingAction: action('create_date_application_preview', { coordinationId: state.coordinationId, coordinationVersion: state.coordinationVersion, proposal: state.proposal }) }))
    .addEdge(START, 'loadCanonicalState')
    .addConditionalEdges('loadCanonicalState', (state) => state.resumeToolResult ? 'applyToolResult' : (state.canonicalState ? 'parseCommand' : 'legacyCoordinator'))
    .addEdge('parseCommand', 'validateContextVersion')
    .addConditionalEdges('validateContextVersion', routeCommand)
    .addEdge('replyFromCanonicalState', END)
    .addEdge('applyPlanIntent', END)
    .addEdge('partnerAction', END)
    .addEdge('arrivalAndAskPartnerStatusAction', END)
    .addEdge('eventAction', END)
    .addEdge('commandAction', END)
    .addEdge('finishError', END)
    .addEdge('applyToolResult', END)
    .addEdge('legacyCoordinator', 'computeOverlap')
    .addConditionalEdges('computeOverlap', (state) => state.phase === 'ready_to_submit' ? 'submit' : END)
    .addEdge('submit', END)

  return graph.compile({ checkpointer: dependencies.checkpointer })
}
