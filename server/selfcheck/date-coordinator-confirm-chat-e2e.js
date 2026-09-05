'use strict'

const assert = require('assert')

const graphRoot = '../../miniprogram/cloudfunctions/agent-graph'
const { MemorySaver } = require(`${graphRoot}/node_modules/@langchain/langgraph`)
const { createAgentGraphMain } = require(`${graphRoot}/dist/src/index.js`)
const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
const { STATUS } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')

function app() {
  return {
    availability: [{ date: '2026-09-12', periods: ['evening'] }],
    areas: ['福田区'],
    activities: ['吃饭'],
    budget: '50-100',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: ''
  }
}

function main() {
  const rows = {
    user: [{ id: 1 }, { id: 2 }],
    date_coordination: [{
      _id: 'date_coordination_80',
      id: 80,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.WAITING_CONFIRMATIONS,
      business_state: 'proposal_generated',
      coordination_version: 1,
      recoordination_count: 0,
      final_proposal_id: 0,
      missing_dimensions: []
    }],
    date_coordination_application: [
      { _id: 'application_801', id: 801, coordination_id: 80, user_id: 1, coordination_version: 1, application: app() },
      { _id: 'application_802', id: 802, coordination_id: 80, user_id: 2, coordination_version: 1, application: app() }
    ],
    date_coordination_proposal: [{
      _id: 'proposal_801',
      id: 801,
      coordination_id: 80,
      coordination_version: 1,
      status: 'active',
      proposal_key: '2026-09-12|evening|福田区|吃饭',
      date: '2026-09-12',
      period: 'evening',
      area: '福田区',
      activity: '吃饭',
      budget: '50-100',
      payment_preference: 'aa',
      duration: '1-2h'
    }],
    date_coordination_confirmation: [],
    date_coordination_event: [],
    agent_session: [
      { _id: 'agent_session_801', id: 801, user_id: 1, agent_type: 'date_coordinator', coordination_id: 80, status: 'active', summary: '' },
      { _id: 'agent_session_802', id: 802, user_id: 2, agent_type: 'date_coordinator', coordination_id: 80, status: 'active', summary: '' }
    ],
    agent_message: [],
    agent_run: [],
    agent_tool_call: [],
    agent_message_dedupe: [],
    coordination_notification: []
  }
  let nextId = 2000
  const now = () => new Date('2026-09-05T00:00:00.000Z')
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    now,
    currentUser: async (context) => rows.user[context && context.userIndex === 0 ? 0 : 1],
    first: async (name, query) => (rows[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query)),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id) || row._id === String(id)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({ _id: `${prefix || name}_${++nextId}`, id: nextId, create_time: now(), update_time: now() }, data)
      if (!rows[name]) rows[name] = []
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => {
      const updated = Object.assign({}, row, data, { update_time: now() })
      const index = (rows[name] || []).indexOf(row)
      if (index >= 0) rows[name][index] = updated
      return updated
    },
    commitConfirmation: async (coordination, proposal, input) => {
      const current = rows.date_coordination.find((row) => Number(row.id) === Number(coordination.id))
      const existing = rows.date_coordination_confirmation.find((row) => Number(row.user_id) === Number(input.user_id) && Number(row.coordination_version) === 1)
      const confirmation = existing || await deps.addWithId('date_coordination_confirmation', {
        coordination_id: 80,
        user_id: Number(input.user_id),
        proposal_id: Number(proposal.id),
        coordination_version: 1,
        decision: 'confirm',
        status: 'active'
      }, 'date_confirmation')
      return { coordination: current, confirmation, arranged: false, idempotent: false }
    },
    publishCoordinationEvent: (input) => publishCoordinationEvent(input, {
      first: deps.first,
      addWithId: deps.addWithId,
      now
    }),
    writeInboxNotification: async () => null,
    transaction: null,
    claimPendingPatch: async () => false,
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'review-confirm-secret', LANGGRAPH_TIMEOUT_MS: '5000' }
  }

  const proposalContext = {
    type: 'proposal',
    coordination_id: 80,
    coordination_version: 1,
    proposal_id: 801
  }
  const graphMain = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: {
      decide: async (input) => ({
        intent: 'date_coordination',
        replyDraft: '我会按当前方案处理确认。',
        riskLevel: 'safe',
        route: 'date_coordination',
        toolRequest: null,
        suggestedActions: [],
        coordinationCommand: {
          type: 'CONFIRM_CURRENT_PLAN',
          target_version: input.context.coordinationVersion,
          changes: {},
          preserve: [],
          context_ref: proposalContext,
          confidence: 1,
          needs_clarification: false,
          clarification: ''
        }
      })
    }
  })
  const agent = createAgentHandlers(Object.assign({}, deps, {
    currentUser: async (context) => rows.user[context && context.userIndex === 0 ? 0 : 1],
    invokeGraphFunction: async (name, payload) => {
      assert.strictEqual(name, 'agent-graph')
      return graphMain(payload)
    }
  }))

  return agent.send({
    session_id: 802,
    message: '可以',
    context_ref: proposalContext,
    client_request_id: 'review-confirm-chat-b-1'
  }, { userIndex: 1 }).then((reply) => {
    assert.strictEqual(reply.provider, 'langgraph')
    assert.match(reply.reply, /已确认这次调整，并已同步给对方/)
    assert.strictEqual(rows.date_coordination_confirmation.some((row) => Number(row.user_id) === 2 && Number(row.proposal_id) === 801), true)
    assert.strictEqual(rows.agent_message.some((row) => Number(row.user_id) === 1 && row.event_type === 'proposal_confirmed'), true)
    console.log('PASS - date coordinator current plan confirm chat E2E')
  }).catch((error) => {
    console.error(error.stack || error.message)
    process.exit(1)
  })
}

main()
