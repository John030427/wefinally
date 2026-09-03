import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GraphResultSchema,
  GraphRunInputSchema,
  GraphStateSchema
} from '../../cloudfunctions/agent-graph/src/contracts.js'

const validRunInput = {
  operation: 'run',
  threadId: 'wf_thread_1234567890',
  actorRef: 'usr_4f52c3d8a9b071ce',
  mode: 'customer_service',
  userText: '会员页面为什么没有更新？',
  safeSummary: ''
}

test('accepts a bounded opaque graph request', () => {
  const result = GraphRunInputSchema.safeParse(validRunInput)
  assert.equal(result.success, true)
})

test('rejects an OpenID-shaped actor reference', () => {
  const result = GraphRunInputSchema.safeParse({
    ...validRunInput,
    actorRef: 'oAbCdEfGhIjKlMnOpQrStUvWxYz123'
  })
  assert.equal(result.success, false)
})

test('rejects unknown input keys and oversized text', () => {
  const unknownKey = GraphRunInputSchema.safeParse({ ...validRunInput, openid: 'secret' })
  const oversized = GraphRunInputSchema.safeParse({ ...validRunInput, userText: '问'.repeat(2001) })
  assert.equal(unknownKey.success, false)
  assert.equal(oversized.success, false)
})

test('keeps bilateral preference state separated', () => {
  const result = GraphStateSchema.parse({
    ...validRunInput,
    phase: 'collect_b',
    coordinationVersion: 2,
    partyAState: { dateWindows: ['2026-08-16T14:00+08:00'] },
    partyBState: { dateWindows: ['2026-08-17T19:00+08:00'] }
  })
  assert.deepEqual(result.partyAState?.dateWindows, ['2026-08-16T14:00+08:00'])
  assert.deepEqual(result.partyBState?.dateWindows, ['2026-08-17T19:00+08:00'])
})

test('accepts the current structured coordination state sent by api', () => {
  const result = GraphRunInputSchema.safeParse({
    ...validRunInput,
    mode: 'date_coordination',
    coordinationId: 1788274022117526,
    coordinationVersion: 2,
    party: 'A',
    partyAState: { dateWindows: ['2026-09-06:afternoon'], regions: ['南山区'], venueTypes: ['咖啡'] },
    partyBState: { dateWindows: [], regions: [], venueTypes: [] },
    ownPreference: { dateWindows: ['2026-09-06:afternoon'], regions: ['南山区'], venueTypes: ['咖啡'] },
    canonicalOverlap: {
      source: 'backend',
      hasOverlap: false,
      missingDimensions: ['time'],
      conflictDimensions: ['time'],
      commonTime: [],
      commonArea: ['南山区'],
      commonActivity: ['咖啡'],
      proposal: null
    },
    sharedState: {
      invitationCard: {
        time_text: '2026-09-04 下午',
        area_text: '南山区',
        activity_text: '咖啡',
        budget_text: '50元内',
        duration_text: '约1小时',
        invitation_version: 1
      },
      unresolvedDimensions: ['time'],
      coordinationPath: 'structured_counter_proposal',
      proposalBaseAvailable: true,
      counterOffer: {
        kind: 'partner_structured_counter_proposal',
        coordination_version: 2,
        changed_by_user_id: 2,
        changed_dimensions: ['time'],
        changes: [{ dimension: 'time', after_text: '2026-09-06 下午' }],
        unchanged_dimensions: ['area', 'activity', 'budget', 'payment', 'duration'],
        unchanged_text: '区域、活动、预算、费用方式、时长',
        proposal: { date: '2026-09-06', period: 'afternoon' },
        proposal_token: '2|time|2026-09-06|afternoon',
        proposal_card: { time_text: '2026-09-06 下午' },
        time_text: '2026-09-06 下午',
        title: '对方调整了约会方案',
        body: '这次只调整了时间，其他项目保持原方案。',
        action_label: '接受这份调整'
      },
      actionRequired: 'review_counter_proposal'
    },
    partnerProgress: 'submitted',
    confirmationSnapshot: {
      myConfirmed: false,
      partnerConfirmed: false,
      proposalStatus: 'none',
      source: 'database'
    }
  })
  assert.equal(result.success, true)
})

test('rejects unsupported graph result statuses', () => {
  const result = GraphResultSchema.safeParse({
    status: 'executed_without_confirmation',
    threadId: validRunInput.threadId,
    phase: 'submit'
  })
  assert.equal(result.success, false)
})
