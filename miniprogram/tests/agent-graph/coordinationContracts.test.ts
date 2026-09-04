import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COORDINATION_PLAN_FIELD_CLASSIFICATION,
  CoordinationCommandSchema,
  CoordinationContextRefSchema,
  CoordinationErrorCodeSchema,
  CoordinationErrorPayloadSchema,
  CoordinationEventSchema,
  CoordinationEventTypeSchema,
  COORDINATION_FIELD_RUNTIME_ADAPTER,
  COORDINATION_EVENT_TYPE_MIGRATION_INVENTORY,
  COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER,
  toCanonicalCoordinationEventType,
  toCanonicalCoordinationField,
  toRuntimeCoordinationEventType,
  toRuntimeCoordinationField,
  getCoordinationFieldClass
} from '../../cloudfunctions/agent-graph/src/contracts.js'

const contextRef = {
  type: 'patch_preview' as const,
  coordination_id: 716,
  coordination_version: 6,
  patch_id: 456
}
const proposalContext = {
  type: 'proposal' as const,
  coordination_id: 716,
  coordination_version: 6,
  proposal_id: 654
}
const invitationContext = {
  type: 'invitation' as const,
  coordination_id: 716,
  coordination_version: 1,
  invitation_version: 1
}
const partnerInquiryContext = {
  type: 'partner_inquiry' as const,
  coordination_id: 716,
  coordination_version: 6,
  inquiry_id: 321
}
const meetingStatusContext = {
  type: 'meeting_status' as const,
  coordination_id: 716,
  coordination_version: 6,
  event_id: 987
}
const meetingStatusCurrentContext = {
  type: 'meeting_status' as const,
  coordination_id: 716,
  coordination_version: 6
}

test('accepts the complete structured command matrix', () => {
  const commands = [
    { type: 'QUERY_STATUS' },
    {
      type: 'PROPOSE_CHANGE',
      target_version: 6,
      changes: { activity: '吃饭', activity_detail: '酸菜鱼' },
      preserve: ['date', 'start_time', 'area', 'payment', 'duration'],
      context_ref: contextRef,
      confidence: 0.96
    },
    {
      type: 'ASK_PARTNER',
      target_version: 6,
      partner_request: { type: 'ASK_ACCEPTANCE', topic: '周六晚上吃酸菜鱼' },
      context_ref: partnerInquiryContext
    },
    {
      type: 'PROPOSE_CHANGE_AND_ASK_PARTNER',
      target_version: 6,
      changes: { date: '2026-09-06', period: 'night', start_time: '20:00', activity: '吃饭' },
      partner_request: { type: 'ASK_ACCEPTANCE', topic: '周六晚上吃酸菜鱼' },
      preserve: ['area', 'budget', 'payment', 'duration'],
      context_ref: contextRef,
      confidence: 0.96
    },
    { type: 'CONFIRM_PREVIEW', target_version: 6, context_ref: contextRef },
    { type: 'CANCEL_PREVIEW', target_version: 6, context_ref: contextRef },
    { type: 'CONFIRM_CURRENT_PLAN', target_version: 6, context_ref: proposalContext },
    { type: 'REJECT_CURRENT_PLAN', target_version: 6, context_ref: proposalContext },
    { type: 'ACCEPT_INVITATION', target_version: 1, context_ref: invitationContext },
    { type: 'DECLINE_INVITATION', target_version: 1, context_ref: invitationContext },
    {
      type: 'ARRIVAL_STATUS',
      relay: { type: 'ARRIVAL_STATUS', text: '我到了' },
      context_ref: meetingStatusCurrentContext
    },
    {
      type: 'ARRIVAL_HINT',
      relay: { type: 'ARRIVAL_HINT', text: '今天穿白T黑裤' },
      context_ref: meetingStatusCurrentContext
    },
    {
      type: 'ASK_PARTNER_ARRIVAL',
      partner_request: { type: 'ASK_ARRIVAL', topic: '询问对方是否到达' },
      context_ref: meetingStatusCurrentContext
    },
    {
      type: 'DELAY_NOTICE',
      relay: { type: 'DELAY_NOTICE', text: '我可能晚10分钟' },
      context_ref: meetingStatusCurrentContext
    },
    {
      type: 'RELAY_MESSAGE',
      relay: { type: 'SAFE_NOTE', text: '我在商场北门' },
      context_ref: meetingStatusCurrentContext
    },
    { type: 'CANCEL_COORDINATION', target_version: 6, context_ref: contextRef },
    { type: 'CLARIFY', needs_clarification: true, clarification: '你想调整时间还是活动？' }
  ]

  for (const command of commands) {
    const result = CoordinationCommandSchema.safeParse(command)
    assert.equal(result.success, true, JSON.stringify(result.error?.issues || command))
  }
})

test('combination intent is one change set with explicit preserved fields', () => {
  const result = CoordinationCommandSchema.parse({
    type: 'PROPOSE_CHANGE_AND_ASK_PARTNER',
    target_version: 6,
    changes: { activity: '吃饭', activity_detail: '酸菜鱼' },
    preserve: ['date', 'start_time', 'area', 'budget', 'payment', 'duration'],
    partner_request: { type: 'ASK_ACCEPTANCE', topic: '想不想吃酸菜鱼' },
    context_ref: contextRef,
    confidence: 0.9
  })
  assert.deepEqual(result.changes, { activity: '吃饭', activity_detail: '酸菜鱼' })
  assert.deepEqual(result.preserve, ['date', 'start_time', 'area', 'budget', 'payment', 'duration'])
})

test('context_ref is versioned and rejects unknown or incomplete context', () => {
  assert.equal(CoordinationContextRefSchema.safeParse(contextRef).success, true)
  assert.equal(CoordinationContextRefSchema.safeParse(proposalContext).success, true)
  assert.equal(CoordinationContextRefSchema.safeParse(invitationContext).success, true)
  assert.equal(CoordinationContextRefSchema.safeParse(partnerInquiryContext).success, true)
  assert.equal(CoordinationContextRefSchema.safeParse(meetingStatusCurrentContext).success, true)
  assert.equal(CoordinationContextRefSchema.safeParse(meetingStatusContext).success, true)
  assert.equal(CoordinationContextRefSchema.safeParse({
    ...partnerInquiryContext,
    inquiry_id: undefined,
    event_id: 988
  }).success, true)
  assert.equal(CoordinationContextRefSchema.safeParse({
    type: 'proposal',
    coordination_id: 716
  }).success, false)
  assert.equal(CoordinationContextRefSchema.safeParse({
    type: 'patch_preview',
    coordination_id: 716,
    coordination_version: 6
  }).success, false)
  assert.equal(CoordinationContextRefSchema.safeParse({
    type: 'invitation',
    coordination_id: 716,
    coordination_version: 1,
    invitation_id: 123
  }).success, false)
  assert.equal(CoordinationContextRefSchema.safeParse({
    ...invitationContext,
    invitation_version: 0
  }).success, false)
  assert.equal(CoordinationContextRefSchema.safeParse({
    ...partnerInquiryContext,
    inquiry_id: undefined
  }).success, false)
  assert.equal(CoordinationContextRefSchema.safeParse({
    ...contextRef,
    version: 6
  }).success, false)
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'CONFIRM_PREVIEW',
    target_version: 5,
    context_ref: contextRef
  }).success, false)
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'ACCEPT_INVITATION',
    target_version: 2,
    context_ref: invitationContext
  }).success, false)
})

test('plan mutation commands are always bound to a target version or context_ref', () => {
  for (const type of ['PROPOSE_CHANGE', 'PROPOSE_CHANGE_AND_ASK_PARTNER'] as const) {
    assert.equal(CoordinationCommandSchema.safeParse({
      type,
      changes: { activity: '吃饭' },
      partner_request: type === 'PROPOSE_CHANGE_AND_ASK_PARTNER'
        ? { type: 'ASK_ACCEPTANCE', topic: '一起吃饭吗' }
        : undefined
    }).success, false, type)
  }
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'PROPOSE_CHANGE',
    target_version: 6,
    changes: { activity: '吃饭' }
  }).success, true)
})

test('object commands require a context_ref that uniquely identifies the target', () => {
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'CONFIRM_CURRENT_PLAN',
    target_version: 6
  }).success, false)
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'ACCEPT_INVITATION',
    target_version: 1
  }).success, false)
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'CONFIRM_PREVIEW',
    target_version: 6,
    context_ref: proposalContext
  }).success, false)
})

test('commands reject unknown keys, unsafe plan fields and incomplete clarification', () => {
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'PROPOSE_CHANGE',
    changes: { activity: '吃饭', phone: '13800138000' }
  }).success, false)
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'PROPOSE_CHANGE',
    changes: { activity: '吃饭' },
    unexpected: true
  }).success, false)
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'CLARIFY',
    needs_clarification: true,
    clarification: ''
  }).success, false)
})

test('event contract covers canonical events and rejects legacy or sensitive projections', () => {
  const canonicalEvents = [
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
    'ARRANGED'
  ]
  for (const eventType of canonicalEvents) {
    assert.equal(CoordinationEventTypeSchema.safeParse(eventType).success, true, eventType)
    const result = CoordinationEventSchema.safeParse({
      coordination_id: 716,
      coordination_version: 7,
      event_type: eventType,
      actor_user_id: 1,
      safe_payload: { changed_dimensions: ['activity'], status: 'pending' },
      idempotency_key: `coordination:716:v7:${eventType}:1`
    })
    assert.equal(result.success, true, JSON.stringify(result.error?.issues || eventType))
  }
  assert.equal(CoordinationEventTypeSchema.safeParse('proposal_generated').success, false)
  assert.equal(CoordinationEventSchema.safeParse({
    coordination_id: 716,
    coordination_version: 7,
    event_type: 'ARRIVED',
    actor_user_id: 1,
    safe_payload: { phone: '13800138000' },
    idempotency_key: 'coordination:716:v7:ARRIVED:1'
  }).success, false)
  assert.equal(CoordinationEventSchema.safeParse({
    coordination_id: 716,
    coordination_version: 7,
    event_type: 'ARRIVED',
    actor_user_id: 1,
    safe_payload: { original_message: '对方原话' },
    idempotency_key: 'coordination:716:v7:ARRIVED:1'
  }).success, false)
  assert.equal(CoordinationEventSchema.safeParse({
    coordination_id: 716,
    coordination_version: 7,
    event_type: 'PLAN_CHANGE_COMMITTED',
    actor_user_id: 1,
    safe_payload: { venue: '商场' },
    idempotency_key: 'coordination:716:v7:PLAN_CHANGE_COMMITTED:1'
  }).success, false)
  assert.equal(CoordinationEventSchema.safeParse({
    coordination_id: 716,
    coordination_version: 7,
    event_type: 'PLAN_CHANGE_COMMITTED',
    actor_user_id: 1,
    safe_payload: {
      proposal_id: 654,
      patch_id: 456,
      changed_dimensions: ['venue', 'payment']
    },
    idempotency_key: 'coordination:716:v7:PLAN_CHANGE_COMMITTED:2'
  }).success, true)
})

test('canonical plan fields have one venue/payment runtime adapter', () => {
  assert.deepEqual(COORDINATION_FIELD_RUNTIME_ADAPTER, {
    venue: 'activity_venue',
    payment: 'payment_preference'
  })
  assert.equal(toCanonicalCoordinationField('venue'), 'venue')
  assert.equal(toCanonicalCoordinationField('activity_venue'), 'venue')
  assert.equal(toCanonicalCoordinationField('payment_preference'), 'payment')
  assert.equal(toCanonicalCoordinationField('unknown_field'), null)
  assert.equal(toRuntimeCoordinationField('venue'), 'activity_venue')
  assert.equal(toRuntimeCoordinationField('payment'), 'payment_preference')
  assert.equal(toRuntimeCoordinationField('activity'), 'activity')
  assert.equal(CoordinationCommandSchema.safeParse({
    type: 'PROPOSE_CHANGE',
    target_version: 6,
    changes: { activity_venue: '商场' }
  }).success, false)
})

test('runtime event_type values normalize through one canonical event vocabulary', () => {
  assert.equal(toCanonicalCoordinationEventType('PROPOSAL_GENERATED'), 'PROPOSAL_GENERATED')
  assert.equal(toCanonicalCoordinationEventType('proposal_generated'), 'PROPOSAL_GENERATED')
  assert.equal(toCanonicalCoordinationEventType('application_sent'), 'APPLICATION_SUBMITTED')
  assert.equal(toCanonicalCoordinationEventType('coordination_arranged'), 'ARRANGED')
  assert.equal(toCanonicalCoordinationEventType('not_a_coordination_event'), null)
  assert.equal(toRuntimeCoordinationEventType('PROPOSAL_GENERATED'), 'proposal_generated')
  assert.equal(toRuntimeCoordinationEventType('PREFERENCES_UPDATED'), 'preference_changed')
  assert.equal(CoordinationEventSchema.safeParse({
    coordination_id: 716,
    coordination_version: 7,
    event_type: 'proposal_generated',
    actor_user_id: 1,
    safe_payload: {},
    idempotency_key: 'coordination:716:v7:proposal_generated:1'
  }).success, false)
  assert.equal(COORDINATION_EVENT_TYPE_RUNTIME_ADAPTER.PROCESSING_FAILED, 'processing_failed')
})

test('release event_type migration inventory has no unmapped runtime values', () => {
  const releaseRuntimeEventTypes = [
    'updated',
    'partner_inquiry',
    'share_trigger',
    'preference_changed',
    'partner_preference_changed',
    'preference_updated',
    'application_sent',
    'application_submitted',
    'application_received',
    'invitation_created',
    'invitation_accepted',
    'invitation_declined',
    'invitation_expired',
    'processing_queued',
    'processing_failed',
    'proposal_generated',
    'proposal_ready',
    'PROPOSAL_READY',
    'counter_offer_ready',
    'no_overlap',
    'new_overlap_found',
    'proposal_confirmed',
    'proposal_rejected',
    'arranged',
    'coordination_arranged',
    'recoordination_started',
    'manual_handoff',
    'qa_coordination_reset',
    'coordination_closed',
    'coordination_expired',
    'coordination_updated',
    'arrival_hint_updated',
    'participant_arrived',
    'participant_met_confirmed',
    'participant_not_found',
    'participant_mismatch',
    'meeting_arrived:abc123',
    'meeting_not_found',
    'meeting_mismatch',
    'polite_decline'
  ]
  for (const runtimeEventType of releaseRuntimeEventTypes) {
    assert.notEqual(toCanonicalCoordinationEventType(runtimeEventType), null, runtimeEventType)
  }
  for (const [runtimeEventType, canonicalEventType] of COORDINATION_EVENT_TYPE_MIGRATION_INVENTORY) {
    const concreteRuntimeEventType = runtimeEventType.replace('<digest>', 'abc123')
    assert.equal(toCanonicalCoordinationEventType(concreteRuntimeEventType), canonicalEventType, runtimeEventType)
  }
  assert.equal(toCanonicalCoordinationEventType('qa_coordination_reset'), 'QA_COORDINATION_RESET')
  assert.equal(toCanonicalCoordinationEventType('coordination_closed'), 'COORDINATION_CLOSED')
  assert.equal(toCanonicalCoordinationEventType('coordination_expired'), 'COORDINATION_EXPIRED')
  assert.equal(toCanonicalCoordinationEventType('partner_preference_changed'), 'PREFERENCES_UPDATED')
  assert.equal(toCanonicalCoordinationEventType('meeting_arrived:abc123'), 'MEETING_ARRIVED')
  assert.ok(COORDINATION_EVENT_TYPE_MIGRATION_INVENTORY.some(([runtimeValue, type]) => (
    runtimeValue === 'qa_coordination_reset' && type === 'QA_COORDINATION_RESET'
  )))
})

test('plan field classification separates core, soft preference and live meeting state', () => {
  assert.equal(COORDINATION_PLAN_FIELD_CLASSIFICATION.date, 'core')
  assert.equal(COORDINATION_PLAN_FIELD_CLASSIFICATION.activity, 'core')
  assert.equal(COORDINATION_PLAN_FIELD_CLASSIFICATION.payment, 'soft')
  assert.equal(COORDINATION_PLAN_FIELD_CLASSIFICATION.duration, 'soft')
  assert.equal(COORDINATION_PLAN_FIELD_CLASSIFICATION.arrival_status, 'meeting')
  assert.equal(getCoordinationFieldClass('date'), 'core')
  assert.equal(getCoordinationFieldClass('payment'), 'soft')
  assert.equal(getCoordinationFieldClass('arrival_hint'), 'meeting')
  assert.equal(getCoordinationFieldClass('unknown_field'), null)
})

test('error contract preserves business errorCode independently from HTTP status', () => {
  assert.equal(CoordinationErrorCodeSchema.safeParse('STALE_CONTEXT').success, true)
  assert.equal(CoordinationErrorCodeSchema.safeParse('SERVER_ERROR').success, false)
  const payload = CoordinationErrorPayloadSchema.parse({
    httpCode: 409,
    errorCode: 'STALE_COORDINATION_VERSION',
    message: '当前方案已更新，请刷新后重试',
    retryable: true
  })
  assert.equal(payload.httpCode, 409)
  assert.equal(payload.errorCode, 'STALE_COORDINATION_VERSION')
  assert.equal(CoordinationErrorPayloadSchema.safeParse({
    httpCode: 400,
    code: 'STALE_CONTEXT',
    errorCode: 'STALE_CONTEXT',
    message: 'invalid'
  }).success, false)
})
