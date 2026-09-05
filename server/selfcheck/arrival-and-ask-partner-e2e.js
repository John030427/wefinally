'use strict'

const assert = require('assert')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')

const users = [
  { id: 101, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'dual-device-v1', member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', openid: 'qa-real-a' },
  { id: 102, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'dual-device-v1', member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', openid: 'qa-real-b' }
]
const coordination = {
  id: 716,
  user_a_id: 101,
  user_b_id: 102,
  status: 'arranged',
  business_state: 'completed',
  coordination_version: 1,
  invitation_version: 1,
  current_proposal_id: 0,
  final_proposal_id: 0
}
const application = {
  availability: [{ date: '2026-09-04', periods: ['evening'] }],
  areas: ['福田区'],
  activities: ['吃饭'],
  budget: '50-100',
  payment_preference: 'aa',
  duration: '1-2h'
}
const rows = {
  user: users,
  date_coordination: [coordination],
  date_coordination_application: [
    { id: 1, coordination_id: 716, user_id: 101, coordination_version: 1, application },
    { id: 2, coordination_id: 716, user_id: 102, coordination_version: 1, application }
  ],
  date_coordination_confirmation: [],
  date_coordination_event: [],
  agent_session: [],
  agent_message: [],
  agent_run: [],
  date_application_patch: [],
  agent_notification_job: []
}
let nextId = 1000
const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
const deps = {
  now: () => new Date('2026-09-04T08:00:00.000Z'),
  env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'selfcheck-secret' },
  currentUser: async (context) => users.find((user) => Number(user.id) === Number(context.user_id)),
  byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
  first: async (name, query) => (rows[name] || []).find((row) => same(row, query)) || null,
  list: async (name, query) => (rows[name] || []).filter((row) => same(row, query)),
  addWithId: async (name, data) => {
    const row = Object.assign({ id: ++nextId }, data)
    ;(rows[name] ||= []).push(row)
    return row
  },
  updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
  claimPendingPatch: async () => false,
  invokeGraphFunction: async (_name, payload) => {
    if (payload.operation === 'resume_tool') {
      const delayed = payload.toolResult && payload.toolResult.data && payload.toolResult.data.eventType === 'delay_notice'
      return { result: { success: true, data: {
        status: 'completed',
        threadId: payload.threadId,
        phase: 'completed',
        replyDraft: delayed ? '已记录你会晚到10分钟，并已同步给对方。' : '已记录你的到场，并已向对方询问到场状态。',
        coordinationVersion: 1,
        coordinationCommand: { type: delayed ? 'DELAY_NOTICE' : 'ARRIVAL_AND_ASK_PARTNER_STATUS' },
        contextRef: null
      } } }
    }
    if (payload.userText === '我晚10分钟') {
      return { result: { success: true, data: {
        status: 'awaiting_tool',
        threadId: payload.threadId,
        phase: 'awaiting_tool',
        replyDraft: '',
        coordinationVersion: 1,
        coordinationCommand: { type: 'DELAY_NOTICE', relay: { type: 'DELAY_NOTICE', text: '我会晚到10分钟' } },
        contextRef: null,
        pendingAction: {
          type: 'publish_coordination_event',
          arguments: {
            coordinationId: 716,
            coordinationVersion: 1,
            eventType: 'DELAY_NOTICE',
            relay: { type: 'DELAY_NOTICE', text: '我会晚到10分钟' }
          },
          requiresConfirmation: false
        }
      } } }
    }
    return { result: { success: true, data: {
      status: 'awaiting_tool',
      threadId: payload.threadId,
      phase: 'awaiting_tool',
      replyDraft: '',
      coordinationVersion: 1,
      coordinationCommand: { type: 'ARRIVAL_AND_ASK_PARTNER_STATUS' },
      contextRef: payload.contextRef || null,
      pendingAction: {
        type: 'record_arrival_and_request_partner_status',
        arguments: {
          coordinationId: 716,
          coordinationVersion: 1,
          contextRef: payload.contextRef,
          partnerRequest: { type: 'ASK_ARRIVAL', topic: '请告知你的到达状态和公共集合点。' }
        },
        requiresConfirmation: false
      }
    } } }
  }
}

;(async () => {
  const handlers = createAgentHandlers(deps)
  const session = await handlers.createSession({ agent_type: 'date_coordinator', coordination_id: 716 }, { user_id: 101 })
  const delayed = await handlers.send({ session_id: session.id, message: '我晚10分钟', client_request_id: 'arranged-delay-716' }, { user_id: 101 })
  assert.equal(delayed.provider, 'langgraph', 'arranged coordination must still reach Graph for live meeting state')
  assert.equal(delayed.coordination_version, 1)
  assert.equal(rows.date_coordination_event[0].event_type, 'delay_notice')
  assert.equal(coordination.coordination_version, 1, 'delay does not bump coordination version')
  assert(rows.agent_message.some((message) => message.user_id === 102 && message.event_type === 'delay_notice'))

  const contextRef = { type: 'meeting_status', coordination_id: 716, coordination_version: 1 }
  const first = await handlers.send({ session_id: session.id, message: '我到了，你在哪', context_ref: contextRef }, { user_id: 101 })
  assert.equal(first.provider, 'langgraph')
  assert.equal(first.coordination_version, 1)
  assert.deepStrictEqual(first.context_ref, contextRef)
  assert.deepStrictEqual(rows.date_coordination_event.map((event) => event.event_type), ['delay_notice', 'arrived', 'arrival_status_requested'])
  assert.equal(rows.date_coordination_event[1].coordination_version, 1)
  assert.equal(rows.date_coordination_event[2].coordination_version, 1)
  assert.equal(coordination.coordination_version, 1, 'live arrival events do not bump coordination version')
  assert.equal(rows.date_coordination_event[1].actor_user_id, 101)
  assert(rows.agent_message.some((message) => message.user_id === 102 && message.event_type === 'arrival_status_requested'))

  const second = await handlers.send({ session_id: session.id, message: '我到了，你在哪', context_ref: contextRef }, { user_id: 101 })
  assert.equal(second.provider, 'langgraph')
  assert.equal(rows.date_coordination_event.filter((event) => event.event_type === 'arrived').length, 1, 'ARRIVED is idempotent across retries')
  assert.equal(rows.date_coordination_event.filter((event) => event.event_type === 'arrival_status_requested').length, 2, 'a new status request remains a new request')

  console.log('PASS Graph -> combo tool -> ARRIVED then ARRIVAL_STATUS_REQUESTED event E2E')
})().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
