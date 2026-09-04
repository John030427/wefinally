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
  getCoordinationFieldClass
} from '../../cloudfunctions/agent-graph/src/contracts.js'

const contextRef = {
  type: 'patch_preview' as const,
  coordination_id: 716,
  coordination_version: 6,
  patch_id: 456
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
      context_ref: { ...contextRef, type: 'partner_inquiry' }
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
    { type: 'CONFIRM_CURRENT_PLAN', target_version: 6, context_ref: { ...contextRef, type: 'proposal' } },
    { type: 'REJECT_CURRENT_PLAN', target_version: 6, context_ref: { ...contextRef, type: 'proposal' } },
    { type: 'ACCEPT_INVITATION', target_version: 1, context_ref: { ...contextRef, type: 'invitation', coordination_version: 1 } },
    { type: 'DECLINE_INVITATION', target_version: 1, context_ref: { ...contextRef, type: 'invitation', coordination_version: 1 } },
    {
      type: 'ARRIVAL_STATUS',
      relay: { type: 'ARRIVAL_STATUS', text: '我到了' },
      context_ref: { ...contextRef, type: 'meeting_status' }
    },
    {
      type: 'ARRIVAL_HINT',
      relay: { type: 'ARRIVAL_HINT', text: '今天穿白T黑裤' },
      context_ref: { ...contextRef, type: 'meeting_status' }
    },
    {
      type: 'ASK_PARTNER_ARRIVAL',
      partner_request: { type: 'ASK_ARRIVAL', topic: '询问对方是否到达' },
      context_ref: { ...contextRef, type: 'meeting_status' }
    },
    {
      type: 'DELAY_NOTICE',
      relay: { type: 'DELAY_NOTICE', text: '我可能晚10分钟' },
      context_ref: { ...contextRef, type: 'meeting_status' }
    },
    {
      type: 'RELAY_MESSAGE',
      relay: { type: 'SAFE_NOTE', text: '我在商场北门' },
      context_ref: { ...contextRef, type: 'meeting_status' }
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
  assert.equal(CoordinationContextRefSchema.safeParse({
    type: 'proposal',
    coordination_id: 716
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
