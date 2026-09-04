import { z } from 'zod'

const ThreadIdSchema = z.string().regex(/^wf_thread_[A-Za-z0-9_-]{10,80}$/)
const ActorRefSchema = z.string().regex(/^usr_[a-f0-9]{16,64}$/)

export const CoordinationPreferenceSchema = z.object({
  dateWindows: z.array(z.string().min(10).max(64)).max(12).default([]),
  regions: z.array(z.string().min(1).max(40)).max(8).default([]),
  venueTypes: z.array(z.string().min(1).max(32)).max(8).default([]),
  durationMinutes: z.number().int().min(30).max(480).optional(),
  budgetBand: z.enum(['low', 'medium', 'high']).optional(),
  notes: z.string().max(200).optional()
}).strict()

export const PendingActionSchema = z.object({
  type: z.string().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()).default({}),
  requiresConfirmation: z.boolean().default(false)
}).strict()

export const SafeToolResultSchema = z.object({
  ok: z.boolean(),
  code: z.string().max(80).optional(),
  data: z.record(z.string(), z.unknown()).optional()
}).strict()

export const CanonicalOverlapSchema = z.object({
  source: z.enum(['backend', 'graph_legacy']).optional(),
  hasOverlap: z.boolean().optional(),
  missingDimensions: z.array(z.string().max(40)).max(12).optional(),
  conflictDimensions: z.array(z.string().max(40)).max(12).optional(),
  commonTime: z.array(z.string().max(64)).max(12).optional(),
  commonArea: z.array(z.string().max(40)).max(8).optional(),
  commonActivity: z.array(z.string().max(32)).max(8).optional(),
  budgetCompatibility: z.string().max(40).optional(),
  paymentCompatibility: z.string().max(40).optional(),
  durationCompatibility: z.string().max(40).optional(),
  proposal: z.record(z.string(), z.unknown()).nullable().optional()
}).strict()

export const SharedCoordinationStateSchema = z.object({
  commonTime: z.array(z.string().max(64)).max(12).optional(),
  commonArea: z.array(z.string().max(40)).max(8).optional(),
  commonActivity: z.array(z.string().max(32)).max(8).optional(),
  budgetCompatibility: z.string().max(40).optional(),
  paymentCompatibility: z.string().max(40).optional(),
  durationCompatibility: z.string().max(40).optional(),
  missingDimensions: z.array(z.string().max(40)).max(12).optional(),
  activeProposalSummary: z.record(z.string(), z.unknown()).nullable().optional(),
  actionRequired: z.string().max(80).optional()
}).strict()

export const ConfirmationSnapshotSchema = z.object({
  myConfirmed: z.boolean(),
  partnerConfirmed: z.boolean(),
  proposalStatus: z.string().min(1).max(40),
  source: z.enum(['database', 'graph_legacy']).optional()
}).strict()

export const GraphRunInputSchema = z.object({
  operation: z.literal('run'),
  threadId: ThreadIdSchema,
  actorRef: ActorRefSchema,
  mode: z.enum(['customer_service', 'date_coordination']),
  userText: z.string().min(1).max(2000),
  safeSummary: z.string().max(800),
  coordinationId: z.number().int().positive().optional(),
  coordinationVersion: z.number().int().positive().optional(),
  party: z.enum(['A', 'B']).optional(),
  partyAState: CoordinationPreferenceSchema.optional(),
  partyBState: CoordinationPreferenceSchema.optional(),
  ownPreference: CoordinationPreferenceSchema.optional(),
  canonicalOverlap: CanonicalOverlapSchema.optional(),
  sharedState: SharedCoordinationStateSchema.optional(),
  partnerProgress: z.enum(['waiting', 'submitted', 'accepted', 'confirmed']).optional(),
  confirmationSnapshot: ConfirmationSnapshotSchema.optional()
}).strict()

export const GraphResumeInputSchema = z.object({
  operation: z.enum(['resume_tool', 'resume_confirmation']),
  threadId: ThreadIdSchema,
  actorRef: ActorRefSchema,
  toolResult: SafeToolResultSchema.optional(),
  confirmation: z.object({
    type: z.enum(['accept', 'edit', 'ignore', 'respond', 'reject']),
    arguments: z.record(z.string(), z.unknown()).optional(),
    response: z.string().max(500).optional()
  }).strict().optional()
}).strict().superRefine((value, context) => {
  if (value.operation === 'resume_tool' && !value.toolResult) {
    context.addIssue({ code: 'custom', message: 'toolResult is required for resume_tool' })
  }
  if (value.operation === 'resume_confirmation' && !value.confirmation) {
    context.addIssue({ code: 'custom', message: 'confirmation is required for resume_confirmation' })
  }
})

export const GraphStateSchema = GraphRunInputSchema.extend({
  phase: z.string().min(1).max(80).default('start'),
  riskLevel: z.enum(['safe', 'low', 'medium', 'high', 'critical']).default('safe'),
  route: z.enum(['frontline', 'faq', 'complaint', 'safety', 'date_coordination', 'manual_review']).optional(),
  replyDraft: z.string().max(1200).default(''),
  pendingAction: PendingActionSchema.nullable().default(null),
  lastResult: SafeToolResultSchema.optional(),
  confirmationA: z.boolean().default(false),
  confirmationB: z.boolean().default(false),
  confirmationVersionA: z.number().int().positive().optional(),
  confirmationVersionB: z.number().int().positive().optional(),
  proposal: z.record(z.string(), z.unknown()).nullable().default(null),
  errorCode: z.string().max(80).optional()
}).strict()

export const GraphResultSchema = z.object({
  status: z.enum(['completed', 'awaiting_tool', 'awaiting_confirmation', 'manual_pending', 'fallback']),
  threadId: ThreadIdSchema,
  phase: z.string().min(1).max(80),
  replyDraft: z.string().max(1200).default(''),
  pendingAction: PendingActionSchema.nullable().default(null),
  coordinationVersion: z.number().int().positive().optional(),
  errorCode: z.string().max(80).optional()
}).strict()

export type CoordinationPreference = z.infer<typeof CoordinationPreferenceSchema>
export type PendingAction = z.infer<typeof PendingActionSchema>
export type SafeToolResult = z.infer<typeof SafeToolResultSchema>
export type GraphRunInput = z.infer<typeof GraphRunInputSchema>
export type GraphResumeInput = z.infer<typeof GraphResumeInputSchema>
export type GraphState = z.infer<typeof GraphStateSchema>
export type GraphResult = z.infer<typeof GraphResultSchema>

// Phase A coordination contract. This is intentionally additive: the existing
// graph input/result contract remains available until the runtime migration is
// completed in Phase B.

export const CoordinationCommandTypeSchema = z.enum([
  'QUERY_STATUS',
  'PROPOSE_CHANGE',
  'ASK_PARTNER',
  'PROPOSE_CHANGE_AND_ASK_PARTNER',
  'CONFIRM_PREVIEW',
  'CANCEL_PREVIEW',
  'CONFIRM_CURRENT_PLAN',
  'REJECT_CURRENT_PLAN',
  'ACCEPT_INVITATION',
  'DECLINE_INVITATION',
  'ARRIVAL_STATUS',
  'ARRIVAL_HINT',
  'ASK_PARTNER_ARRIVAL',
  'DELAY_NOTICE',
  'RELAY_MESSAGE',
  'CANCEL_COORDINATION',
  'CLARIFY'
])

export type CoordinationCommandType = z.infer<typeof CoordinationCommandTypeSchema>

const CoordinationContextRefBase = {
  coordination_id: z.number().int().positive(),
  coordination_version: z.number().int().positive()
} as const

const CoordinationProposalContextRefSchema = z.object({
  ...CoordinationContextRefBase,
  type: z.literal('proposal'),
  proposal_id: z.number().int().positive()
}).strict()

const CoordinationInvitationContextRefSchema = z.object({
  ...CoordinationContextRefBase,
  type: z.literal('invitation'),
  invitation_version: z.number().int().positive()
}).strict()

const CoordinationPatchPreviewContextRefSchema = z.object({
  ...CoordinationContextRefBase,
  type: z.literal('patch_preview'),
  patch_id: z.number().int().positive()
}).strict()

const CoordinationPartnerInquiryContextRefSchema = z.object({
  ...CoordinationContextRefBase,
  type: z.literal('partner_inquiry'),
  inquiry_id: z.number().int().positive().optional(),
  event_id: z.number().int().positive().optional()
}).strict()

const CoordinationMeetingStatusContextRefSchema = z.object({
  ...CoordinationContextRefBase,
  type: z.literal('meeting_status'),
  event_id: z.number().int().positive().optional()
}).strict()

export const CoordinationContextRefSchema = z.discriminatedUnion('type', [
  CoordinationProposalContextRefSchema,
  CoordinationInvitationContextRefSchema,
  CoordinationPatchPreviewContextRefSchema,
  CoordinationPartnerInquiryContextRefSchema,
  CoordinationMeetingStatusContextRefSchema
]).superRefine((value, context) => {
  if (value.type === 'partner_inquiry' && !value.inquiry_id && !value.event_id) {
    context.addIssue({
      code: 'custom',
      path: ['inquiry_id'],
      message: 'partner_inquiry context requires inquiry_id or event_id'
    })
  }
})

export type CoordinationContextRef = z.infer<typeof CoordinationContextRefSchema>

const CoordinationPeriodSchema = z.enum(['morning', 'afternoon', 'evening', 'night'])
const CoordinationBudgetSchema = z.enum(['under-50', '50-100', '100-200', 'over-200', 'flexible'])
const CoordinationPaymentSchema = z.enum(['aa', 'self_pays', 'partner_pays', 'flexible'])
const CoordinationDurationSchema = z.enum(['about-1h', '1-2h', '2-3h', 'flexible'])

export const CoordinationPlanFieldSchema = z.enum([
  'date',
  'period',
  'start_time',
  'activity',
  'activity_detail',
  'venue',
  'area',
  'budget',
  'payment',
  'duration',
  'meet_point',
  'arrival_status',
  'arrival_hint',
  'delay_minutes',
  'public_location',
  'appearance_hint'
])

export type CoordinationPlanField = z.infer<typeof CoordinationPlanFieldSchema>
export type CoordinationPlanFieldClass = 'core' | 'soft' | 'meeting'

export const COORDINATION_PLAN_FIELD_CLASSIFICATION: Readonly<Record<CoordinationPlanField, CoordinationPlanFieldClass>> = Object.freeze({
  date: 'core',
  period: 'core',
  start_time: 'core',
  activity: 'core',
  activity_detail: 'core',
  venue: 'core',
  area: 'soft',
  budget: 'soft',
  payment: 'soft',
  duration: 'soft',
  meet_point: 'meeting',
  arrival_status: 'meeting',
  arrival_hint: 'meeting',
  delay_minutes: 'meeting',
  public_location: 'meeting',
  appearance_hint: 'meeting'
})

export function getCoordinationFieldClass(field: string): CoordinationPlanFieldClass | null {
  return Object.prototype.hasOwnProperty.call(COORDINATION_PLAN_FIELD_CLASSIFICATION, field)
    ? COORDINATION_PLAN_FIELD_CLASSIFICATION[field as CoordinationPlanField]
    : null
}

// This is the only boundary adapter for the two historical plan field names.
// Phase B API and agent-graph code must import this module; handlers may not
// define a second field mapping. Graph contracts stay canonical and runtime
// persistence can translate only at this shared boundary.
export const COORDINATION_FIELD_RUNTIME_ADAPTER = Object.freeze({
  venue: 'activity_venue',
  payment: 'payment_preference'
} as const)

export type CoordinationRuntimePlanField = Exclude<CoordinationPlanField, 'venue' | 'payment'>
  | 'activity_venue'
  | 'payment_preference'

export function toCanonicalCoordinationField(field: string): CoordinationPlanField | null {
  if (field === 'activity_venue') return 'venue'
  if (field === 'payment_preference') return 'payment'
  return CoordinationPlanFieldSchema.safeParse(field).success ? field as CoordinationPlanField : null
}

export function toRuntimeCoordinationField(field: CoordinationPlanField): CoordinationRuntimePlanField {
  if (field === 'venue') return COORDINATION_FIELD_RUNTIME_ADAPTER.venue
  if (field === 'payment') return COORDINATION_FIELD_RUNTIME_ADAPTER.payment
  return field
}

export const CoordinationChangeSetSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: CoordinationPeriodSchema.optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  activity: z.string().min(1).max(40).optional(),
  activity_detail: z.string().max(120).optional(),
  venue: z.string().max(160).optional(),
  area: z.string().min(1).max(40).optional(),
  budget: CoordinationBudgetSchema.optional(),
  payment: CoordinationPaymentSchema.optional(),
  duration: CoordinationDurationSchema.optional(),
  meet_point: z.string().max(120).optional(),
  arrival_status: z.enum(['not_arrived', 'arrived', 'found_partner']).optional(),
  arrival_hint: z.string().max(120).optional(),
  delay_minutes: z.number().int().min(0).max(180).optional(),
  public_location: z.string().max(120).optional(),
  appearance_hint: z.string().max(120).optional()
}).strict()

export type CoordinationChangeSet = z.infer<typeof CoordinationChangeSetSchema>

export const CoordinationPartnerRequestSchema = z.object({
  type: z.enum(['ASK_ACCEPTANCE', 'ASK_PREFERENCE', 'ASK_STATUS', 'ASK_ARRIVAL', 'RELAY']),
  topic: z.string().min(1).max(160)
}).strict()

export const CoordinationRelayMessageSchema = z.object({
  type: z.enum(['ARRIVAL_STATUS', 'ARRIVAL_HINT', 'DELAY_NOTICE', 'SAFE_NOTE', 'PARTNER_QUESTION', 'PLAN_CHANGE']),
  text: z.string().min(1).max(240)
}).strict()

const CHANGE_COMMANDS = new Set<CoordinationCommandType>([
  'PROPOSE_CHANGE',
  'PROPOSE_CHANGE_AND_ASK_PARTNER'
])
const VERSION_BOUND_COMMANDS = new Set<CoordinationCommandType>([
  'PROPOSE_CHANGE',
  'PROPOSE_CHANGE_AND_ASK_PARTNER',
  'CONFIRM_PREVIEW',
  'CANCEL_PREVIEW',
  'CONFIRM_CURRENT_PLAN',
  'REJECT_CURRENT_PLAN',
  'ACCEPT_INVITATION',
  'DECLINE_INVITATION',
  'CANCEL_COORDINATION'
])

export const CoordinationCommandSchema = z.object({
  type: CoordinationCommandTypeSchema,
  target_version: z.number().int().positive().optional(),
  changes: CoordinationChangeSetSchema.default({}),
  preserve: z.array(CoordinationPlanFieldSchema).max(16).default([]),
  partner_request: CoordinationPartnerRequestSchema.optional(),
  relay: CoordinationRelayMessageSchema.optional(),
  confidence: z.number().min(0).max(1).default(0),
  needs_clarification: z.boolean().default(false),
  clarification: z.string().max(300).default(''),
  context_ref: CoordinationContextRefSchema.optional()
}).strict().superRefine((value, context) => {
  if (CHANGE_COMMANDS.has(value.type) && Object.keys(value.changes).length === 0) {
    context.addIssue({ code: 'custom', path: ['changes'], message: 'change command requires at least one change' })
  }
  if ((value.type === 'ASK_PARTNER' || value.type === 'PROPOSE_CHANGE_AND_ASK_PARTNER' || value.type === 'ASK_PARTNER_ARRIVAL')
    && !value.partner_request) {
    context.addIssue({ code: 'custom', path: ['partner_request'], message: 'partner request is required' })
  }
  if (['ARRIVAL_STATUS', 'ARRIVAL_HINT', 'DELAY_NOTICE', 'RELAY_MESSAGE'].includes(value.type) && !value.relay) {
    context.addIssue({ code: 'custom', path: ['relay'], message: 'relay message is required' })
  }
  if (value.type === 'CLARIFY' && !value.needs_clarification) {
    context.addIssue({ code: 'custom', path: ['needs_clarification'], message: 'clarify command must request clarification' })
  }
  if (value.needs_clarification && !value.clarification.trim()) {
    context.addIssue({ code: 'custom', path: ['clarification'], message: 'clarification question is required' })
  }
  if (VERSION_BOUND_COMMANDS.has(value.type) && !value.target_version && !value.context_ref) {
    context.addIssue({ code: 'custom', path: ['target_version'], message: 'version-bound command requires a target version or context_ref' })
  }
  if (value.target_version && value.context_ref
    && value.target_version !== value.context_ref.coordination_version) {
    context.addIssue({ code: 'custom', path: ['target_version'], message: 'target_version must match context_ref version' })
  }
})

export type CoordinationCommand = z.infer<typeof CoordinationCommandSchema>

export const CoordinationEventTypeSchema = z.enum([
  'INVITATION_CREATED',
  'INVITATION_ACCEPTED',
  'INVITATION_DECLINED',
  'INVITATION_EXPIRED',
  'APPLICATION_SUBMITTED',
  'PREFERENCES_UPDATED',
  'COORDINATION_QUEUED',
  'PLAN_CHANGE_PROPOSED',
  'PLAN_CHANGE_COMMITTED',
  'PROPOSAL_GENERATED',
  'PARTNER_QUESTION',
  'PARTNER_RESPONSE',
  'ARRIVED',
  'ARRIVAL_HINT_UPDATED',
  'ARRIVAL_STATUS_REQUESTED',
  'DELAY_NOTICE',
  'PROPOSAL_CONFIRMED',
  'PROPOSAL_REJECTED',
  'COORDINATION_CANCELLED',
  'ARRANGED',
  'NO_OVERLAP',
  'OVERLAP_FOUND',
  'RECOORDINATION_STARTED',
  'MANUAL_HANDOFF',
  'COORDINATION_UPDATED',
  'PROCESSING_FAILED',
  'QA_COORDINATION_RESET',
  'COORDINATION_CLOSED',
  'COORDINATION_EXPIRED',
  'PARTICIPANT_MET_CONFIRMED',
  'PARTICIPANT_NOT_FOUND',
  'PARTICIPANT_MISMATCH',
  'MEETING_ARRIVED',
  'MEETING_NOT_FOUND',
  'MEETING_MISMATCH',
  'POLITE_DECLINE',
  'SHARE_TRIGGER',
  'PROPOSAL_READY'
])

export type CoordinationEventType = z.infer<typeof CoordinationEventTypeSchema>

// Lowercase runtime values are compatibility aliases only. New code must emit
// CoordinationEventType values and cross this adapter at the persistence edge.
export const COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER: Readonly<Record<CoordinationEventType, string>> = Object.freeze({
  INVITATION_CREATED: 'invitation_created',
  INVITATION_ACCEPTED: 'invitation_accepted',
  INVITATION_DECLINED: 'invitation_declined',
  INVITATION_EXPIRED: 'invitation_expired',
  APPLICATION_SUBMITTED: 'application_submitted',
  PREFERENCES_UPDATED: 'preference_changed',
  COORDINATION_QUEUED: 'processing_queued',
  PLAN_CHANGE_PROPOSED: 'plan_change_proposed',
  PLAN_CHANGE_COMMITTED: 'plan_change_committed',
  PROPOSAL_GENERATED: 'proposal_generated',
  PARTNER_QUESTION: 'partner_question',
  PARTNER_RESPONSE: 'partner_response',
  ARRIVED: 'arrived',
  ARRIVAL_HINT_UPDATED: 'arrival_hint_updated',
  ARRIVAL_STATUS_REQUESTED: 'arrival_status_requested',
  DELAY_NOTICE: 'delay_notice',
  PROPOSAL_CONFIRMED: 'proposal_confirmed',
  PROPOSAL_REJECTED: 'proposal_rejected',
  COORDINATION_CANCELLED: 'coordination_cancelled',
  ARRANGED: 'arranged',
  NO_OVERLAP: 'no_overlap',
  OVERLAP_FOUND: 'overlap_found',
  RECOORDINATION_STARTED: 'recoordination_started',
  MANUAL_HANDOFF: 'manual_handoff',
  COORDINATION_UPDATED: 'coordination_updated',
  PROCESSING_FAILED: 'processing_failed',
  QA_COORDINATION_RESET: 'qa_coordination_reset',
  COORDINATION_CLOSED: 'coordination_closed',
  COORDINATION_EXPIRED: 'coordination_expired',
  PARTICIPANT_MET_CONFIRMED: 'participant_met_confirmed',
  PARTICIPANT_NOT_FOUND: 'participant_not_found',
  PARTICIPANT_MISMATCH: 'participant_mismatch',
  MEETING_ARRIVED: 'meeting_arrived',
  MEETING_NOT_FOUND: 'meeting_not_found',
  MEETING_MISMATCH: 'meeting_mismatch',
  POLITE_DECLINE: 'polite_decline',
  SHARE_TRIGGER: 'share_trigger',
  PROPOSAL_READY: 'proposal_ready'
})

export const COORDINATION_EVENT_TYPE_LEGACY_ALIASES: Readonly<Record<string, CoordinationEventType>> = Object.freeze({
  application_sent: 'APPLICATION_SUBMITTED',
  preference_updated: 'PREFERENCES_UPDATED',
  partner_preference_changed: 'PREFERENCES_UPDATED',
  partner_inquiry: 'PARTNER_QUESTION',
  counter_offer_ready: 'PLAN_CHANGE_PROPOSED',
  participant_arrived: 'ARRIVED',
  coordination_arranged: 'ARRANGED',
  application_received: 'APPLICATION_SUBMITTED',
  coordination_expiring: 'COORDINATION_EXPIRED',
  new_overlap_found: 'OVERLAP_FOUND',
  updated: 'COORDINATION_UPDATED'
})

const DYNAMIC_COORDINATION_EVENT_TYPE_ALIASES = Object.freeze([
  { prefix: 'meeting_arrived:', type: 'MEETING_ARRIVED' as CoordinationEventType },
  { prefix: 'meeting_not_found:', type: 'MEETING_NOT_FOUND' as CoordinationEventType },
  { prefix: 'meeting_mismatch:', type: 'MEETING_MISMATCH' as CoordinationEventType }
])

// Migration inventory for the current release branch's coordination event_type
// values. Preferred runtime names come from the canonical adapter; legacy names
// below are compatibility aliases until Phase B migration.
export const COORDINATION_EVENT_TYPE_MIGRATION_INVENTORY: ReadonlyArray<readonly [string, CoordinationEventType]> = Object.freeze([
  ...Object.entries(COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER)
    .map(([type, runtimeValue]) => [runtimeValue, type as CoordinationEventType] as const),
  ...Object.entries(COORDINATION_EVENT_TYPE_LEGACY_ALIASES)
    .map(([runtimeValue, type]) => [runtimeValue, type] as const),
  ['meeting_arrived:<digest>', 'MEETING_ARRIVED'] as const,
  ['meeting_not_found:<digest>', 'MEETING_NOT_FOUND'] as const,
  ['meeting_mismatch:<digest>', 'MEETING_MISMATCH'] as const
])

export function toCanonicalCoordinationEventType(value: string): CoordinationEventType | null {
  const canonical = CoordinationEventTypeSchema.safeParse(value)
  if (canonical.success) return canonical.data
  const runtimeEntry = Object.entries(COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER)
    .find(([, runtimeValue]) => runtimeValue === value)
  if (runtimeEntry) return runtimeEntry[0] as CoordinationEventType
  if (COORDINATION_EVENT_TYPE_LEGACY_ALIASES[value]) return COORDINATION_EVENT_TYPE_LEGACY_ALIASES[value]
  const dynamicEntry = DYNAMIC_COORDINATION_EVENT_TYPE_ALIASES
    .find(({ prefix }) => value.startsWith(prefix))
  return dynamicEntry ? dynamicEntry.type : null
}

export function toRuntimeCoordinationEventType(value: CoordinationEventType): string {
  return COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER[value]
}

const SENSITIVE_PROJECTION_VALUE = /(?:\b1[3-9]\d{9}\b|\bo[A-Za-z0-9_-]{20,}\b|\b(?:sk|api)[-_][A-Za-z0-9_-]{8,}\b)/i

function containsSensitiveProjection(value: unknown): boolean {
  if (typeof value === 'string') return SENSITIVE_PROJECTION_VALUE.test(value)
  if (Array.isArray(value)) return value.some(containsSensitiveProjection)
  return false
}

const SafeProjectionTextSchema = z.string().max(120).superRefine((value, context) => {
  if (containsSensitiveProjection(value)) {
    context.addIssue({ code: 'custom', message: 'unsafe projection value' })
  }
})

// Events carry only fact references and changed dimensions. UI plan values must
// always be read from canonical coordination state, never copied into events.
export const CoordinationEventSafePayloadSchema = z.object({
  proposal_id: z.number().int().positive().optional(),
  patch_id: z.number().int().positive().optional(),
  inquiry_id: z.number().int().positive().optional(),
  source_event_id: z.number().int().positive().optional(),
  changed_dimensions: z.array(CoordinationPlanFieldSchema).max(16).optional(),
  status: SafeProjectionTextSchema.optional(),
  action: SafeProjectionTextSchema.optional(),
  round_number: z.number().int().min(1).max(20).optional()
}).strict()

// Compatibility export for Phase A consumers; it is the same canonical schema.
export const CoordinationSafePayloadSchema = CoordinationEventSafePayloadSchema

export const CoordinationEventSchema = z.object({
  coordination_id: z.number().int().positive(),
  coordination_version: z.number().int().positive(),
  event_type: CoordinationEventTypeSchema,
  actor_user_id: z.number().int().positive(),
  safe_payload: CoordinationSafePayloadSchema,
  idempotency_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/)
}).strict()

export type CoordinationEvent = z.infer<typeof CoordinationEventSchema>

export const CoordinationErrorCodeSchema = z.enum([
  'DATE_COORDINATION_NOT_FOUND',
  'DATE_COORDINATION_FORBIDDEN',
  'DATE_COORDINATION_STATE_INVALID',
  'DATE_COORDINATION_TERMINAL',
  'DATE_APPLICATION_INVALID',
  'DATE_APPLICATION_ALREADY_SUBMITTED',
  'STALE_COORDINATION_VERSION',
  'STALE_CONTEXT',
  'PROPOSAL_NOT_FOUND',
  'PROPOSAL_EXPIRED',
  'PROPOSAL_ALREADY_RESOLVED',
  'INVALID_COMMAND',
  'INVALID_CONTEXT_REF',
  'IDEMPOTENCY_CONFLICT',
  'PROJECTION_PENDING',
  'ARRIVAL_STATUS_INVALID',
  'QA_RESET_FORBIDDEN',
  'GRAPH_DISABLED',
  'GRAPH_TIMEOUT',
  'GRAPH_UNAVAILABLE',
  'INVALID_CHECKPOINT',
  'DUPLICATE_RESUME',
  'TOOL_NOT_ALLOWED',
  'OWNERSHIP_MISMATCH'
])

export type CoordinationErrorCode = z.infer<typeof CoordinationErrorCodeSchema>

export const CoordinationErrorPayloadSchema = z.object({
  httpCode: z.number().int().min(400).max(599),
  errorCode: CoordinationErrorCodeSchema,
  message: z.string().min(1).max(300),
  retryable: z.boolean().default(false)
}).strict()

export type CoordinationErrorPayload = z.infer<typeof CoordinationErrorPayloadSchema>
