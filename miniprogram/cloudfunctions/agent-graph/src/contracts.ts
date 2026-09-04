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

export const CoordinationContextRefSchema = z.object({
  type: z.enum(['proposal', 'invitation', 'patch_preview', 'partner_inquiry', 'meeting_status']),
  coordination_id: z.number().int().positive(),
  coordination_version: z.number().int().positive(),
  proposal_id: z.number().int().positive().optional(),
  patch_id: z.number().int().positive().optional(),
  event_id: z.number().int().positive().optional()
}).strict()

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
  'PLAN_CHANGE_PROPOSED',
  'PLAN_CHANGE_COMMITTED',
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
  'RECOORDINATION_STARTED',
  'MANUAL_HANDOFF'
])

export type CoordinationEventType = z.infer<typeof CoordinationEventTypeSchema>

const SafeProjectionScalarSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.null()
])
const SENSITIVE_PROJECTION_KEY = /phone|mobile|openid|open_id|secret|api.?key|private.?key|original|raw|exact.?address|share.?message|other.?requirements|transport.?constraints/i
const SENSITIVE_PROJECTION_VALUE = /(?:\b1[3-9]\d{9}\b|\bo[A-Za-z0-9_-]{20,}\b|\b(?:sk|api)[-_][A-Za-z0-9_-]{8,}\b)/i

function containsSensitiveProjection(value: unknown): boolean {
  if (typeof value === 'string') return SENSITIVE_PROJECTION_VALUE.test(value)
  if (Array.isArray(value)) return value.some(containsSensitiveProjection)
  return false
}

export const CoordinationSafePayloadSchema = z.record(
  z.string().min(1).max(40),
  z.union([SafeProjectionScalarSchema, z.array(SafeProjectionScalarSchema).max(20)])
).superRefine((payload, context) => {
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_PROJECTION_KEY.test(key) || containsSensitiveProjection(value)) {
      context.addIssue({ code: 'custom', path: [key], message: 'unsafe projection field' })
    }
  }
})

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
