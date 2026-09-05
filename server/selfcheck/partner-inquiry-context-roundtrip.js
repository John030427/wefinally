'use strict'

const assert = require('assert')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')

const rows = {
  user: [{ id: 1 }],
  agent_session: [{
    id: 19,
    user_id: 1,
    agent_type: 'date_coordinator',
    coordination_id: 70,
    status: 'active',
    summary: '',
    last_seen_coordination_version: 1
  }],
  date_coordination: [{
    id: 70,
    user_a_id: 1,
    user_b_id: 2,
    status: 'no_overlap',
    business_state: 'waiting_partner',
    coordination_version: 1,
    invitation_version: 1,
    invitation_proposal: {
      availability: [{ date: '2026-09-12', periods: ['evening'] }],
      areas: ['福田区'],
      activities: ['奶茶'],
      budget: 'flexible',
      payment_preference: 'flexible',
      duration: 'flexible'
    }
  }],
  date_coordination_application: [
    { id: 701, coordination_id: 70, user_id: 1, coordination_version: 1, application: {
      availability: [{ date: '2026-09-12', periods: ['evening'] }],
      areas: ['福田区'],
      activities: ['奶茶'],
      budget: 'flexible',
      payment_preference: 'flexible',
      duration: 'flexible'
    } },
    { id: 702, coordination_id: 70, user_id: 2, coordination_version: 1, application: {
      availability: [{ date: '2026-09-13', periods: ['evening'] }],
      areas: ['福田区'],
      activities: ['奶茶'],
      budget: 'flexible',
      payment_preference: 'flexible',
      duration: 'flexible'
    } }
  ],
  date_coordination_proposal: [],
  date_coordination_confirmation: [],
  date_application_patch: [],
  date_coordination_event: [{
    id: 50,
    coordination_id: 70,
    coordination_version: 1,
    event_type: 'preference_changed',
    actor_user_id: 2,
    safe_summary: {
      stage: 'partner_preference_changed',
      relay_text: '对方更倾向把时间调整到9月13日（周日）傍晚。其他安排保持不变。',
      content: '对方更倾向把时间调整到9月13日（周日）傍晚。其他安排保持不变。'
    }
  }],
  agent_message: [],
  agent_run: [],
  agent_message_dedupe: []
}

const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
let nextId = 900
let graphPayload = null

const agent = createAgentHandlers({
  currentUser: async () => rows.user[0],
  env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'roundtrip-test-secret' },
  now: () => new Date('2026-09-05T00:00:00.000Z'),
  first: async (name, query) => (rows[name] || []).find((row) => matches(row, query)) || null,
  list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query)),
  byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
  addWithId: async (name, data, prefix) => {
    const row = Object.assign({ id: ++nextId }, data)
    if (!rows[name]) rows[name] = []
    rows[name].push(row)
    return row
  },
  updateByDoc: async (name, row, data) => Object.assign(row, data),
  transaction: null,
  claimPendingPatch: async () => false,
  invokeGraphFunction: async (name, payload) => {
    assert.strictEqual(name, 'agent-graph')
    graphPayload = payload
    return {
      result: {
        success: true,
        data: {
          status: 'completed',
          phase: 'parse_command',
          replyDraft: '已读取最新协调事实。',
          coordinationVersion: 1,
          coordinationCommand: null,
          candidatePlan: null,
          pendingPreview: null
        }
      }
    }
  }
})

agent.send({
  session_id: 19,
  message: '周日可以，但不喝奶茶，吃椰子鸡吧',
  client_request_id: 'partner-inquiry-context-roundtrip-1',
  context_ref: {
    type: 'partner_inquiry',
    coordination_id: 70,
    coordination_version: 1,
    event_id: 50
  }
}, {}).then(() => {
  assert.ok(graphPayload, 'date coordinator must invoke the graph')
  assert.match(graphPayload.safeSummary, /9月13日（周日）傍晚/)
  console.log('PASS - partner inquiry context round-trip')
}).catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
