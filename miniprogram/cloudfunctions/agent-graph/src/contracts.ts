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
  partyBState: CoordinationPreferenceSchema.optional()
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
