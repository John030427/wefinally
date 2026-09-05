'use strict'

const assert = require('assert')

const graphRoot = '../../miniprogram/cloudfunctions/agent-graph'
const { MemorySaver } = require(`${graphRoot}/node_modules/@langchain/langgraph`)
const { createAgentGraphMain } = require(`${graphRoot}/dist/src/index.js`)
const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
const { processCoordinationProjectionOutbox } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationProjectionWorker')
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

function matches(row, query) {
  return Object.keys(query || {}).every((key) => row[key] === query[key])
}

async function main() {
  const now = () => new Date('2026-09-05T00:00:00.000Z')
  const rows = {
    user: [{ id: 1 }, { id: 2 }],
    date_coordination: [{
      _id: 'date_coordination_81', id: 81, user_a_id: 1, user_b_id: 2,
      status: STATUS.WAITING_CONFIRMATIONS, business_state: 'proposal_generated',
      coordination_version: 1, recoordination_count: 0, final_proposal_id: 0,
      missing_dimensions: []
    }],
    date_coordination_application: [
      { _id: 'application_811', id: 811, coordination_id: 81, user_id: 1, coordination_version: 1, application: app() },
      { _id: 'application_812', id: 812, coordination_id: 81, user_id: 2, coordination_version: 1, application: app() }
    ],
    date_coordination_proposal: [{
      _id: 'proposal_811', id: 811, coordination_id: 81, coordination_version: 1,
      status: 'active', proposal_key: '2026-09-12|evening|福田区|吃饭',
      date: '2026-09-12', period: 'evening', area: '福田区', activity: '吃饭',
      budget: '50-100', payment_preference: 'aa', duration: '1-2h'
    }],
    date_coordination_confirmation: [],
    date_application_patch: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    agent_message_dedupe: [],
    agent_run: [],
    agent_tool_call: [],
    agent_notification_job: [],
    coordination_notification: [],
    user_notification_cursor: [],
    coordination_projection_outbox: []
  }
  let nextId = 3000
  let failPublish = true
  const deps = {
    now,
    currentUser: async (context) => rows.user[context && context.userIndex === 1 ? 1 : 0],
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
      else {
        const byId = (rows[name] || []).findIndex((item) => Number(item.id) === Number(row.id) || item._id === row._id)
        if (byId >= 0) rows[name][byId] = updated
      }
      return updated
    },
    claimPendingPatch: async (patch) => {
      const current = rows.date_application_patch.find((row) => Number(row.id) === Number(patch.id))
      if (!current || current.status !== 'pending_confirmation') return false
      current.status = 'applying'
      return true
    },
    publishCoordinationEvent: async (input) => {
      if (failPublish) throw new Error('forced_patch_projection_failure')
      return publishCoordinationEvent(input, { first: deps.first, addWithId: deps.addWithId, now })
    },
    writeInboxNotification: async () => null,
    transaction: null,
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'review-patch-secret', LANGGRAPH_TIMEOUT_MS: '5000' }
  }

  const graphMain = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: {
      decide: async (input) => {
        const context = input.context || {}
        const version = Number(context.coordinationVersion || 1)
        const contextRef = context.contextRef || null
        if (input.userText === '改成看展') {
          return {
            intent: 'date_coordination', replyDraft: '我整理一份修改预览。', riskLevel: 'safe', route: 'date_coordination',
            toolRequest: null, suggestedActions: [],
            coordinationCommand: {
              type: 'PROPOSE_CHANGE', target_version: version,
              changes: { activity_detail: '看展' },
              preserve: ['date', 'period', 'start_time', 'venue', 'area', 'budget', 'payment', 'duration'],
              context_ref: contextRef || { type: 'proposal', coordination_id: 81, coordination_version: version, proposal_id: 811 },
              confidence: 1, needs_clarification: false, clarification: ''
            }
          }
        }
        return {
          intent: 'date_coordination', replyDraft: '我会提交这次确认。', riskLevel: 'safe', route: 'date_coordination',
          toolRequest: null, suggestedActions: [],
          coordinationCommand: {
            type: 'CONFIRM_PREVIEW', target_version: version,
            context_ref: contextRef,
            confidence: 1, needs_clarification: false, clarification: ''
          }
        }
      }
    }
  })

  const agent = createAgentHandlers(Object.assign({}, deps, {
    invokeGraphFunction: async (name, payload) => {
      assert.strictEqual(name, 'agent-graph')
      return graphMain(payload)
    }
  }))

  const session = await agent.createSession({ agent_type: 'date_coordinator', coordination_id: 81 }, { userIndex: 0 })
  const previewReply = await agent.send({
    session_id: session.id,
    message: '改成看展',
    client_request_id: 'patch-projection-preview-81'
  }, { userIndex: 0 })
  assert.strictEqual(previewReply.provider, 'langgraph')
  assert.ok(previewReply.pending_preview && previewReply.pending_preview.patchId > 0)
  assert.strictEqual(rows.date_coordination[0].coordination_version, 1)

  const patchId = Number(previewReply.pending_preview.patchId)
  const confirmReply = await agent.send({
    session_id: session.id,
    message: '确认修改',
    context_ref: previewReply.pending_preview.contextRef,
    client_request_id: 'patch-projection-confirm-81'
  }, { userIndex: 0 })
  assert.strictEqual(confirmReply.provider, 'langgraph')
  assert.match(confirmReply.reply, /已确认这次调整，正在向对方同步/)
  assert.strictEqual(confirmReply.projection_pending, true)
  assert.strictEqual(confirmReply.partner_notified, false)
  assert.strictEqual(rows.date_coordination[0].coordination_version, 2)
  assert.strictEqual(rows.date_application_patch.filter((row) => Number(row.id) === patchId && row.status === 'applied').length, 1)
  assert.strictEqual(rows.coordination_projection_outbox.length, 1)
  assert.strictEqual(rows.date_coordination_event.length, 0)
  assert.strictEqual(rows.agent_message.filter((row) => Number(row.user_id) === 2 && row.event_type === 'preference_changed').length, 0)

  failPublish = false
  const retry = await processCoordinationProjectionOutbox({ deps, limit: 10 })
  assert.strictEqual(retry.completed, 1)
  assert.strictEqual(rows.coordination_projection_outbox[0].status, 'completed')
  assert.strictEqual(rows.date_coordination_event.filter((row) => row.event_type === 'preference_changed').length, 1)
  assert.strictEqual(rows.agent_message.filter((row) => Number(row.user_id) === 2 && row.event_type === 'preference_changed').length, 1)
  console.log('PASS - date coordinator patch projection failure-injection E2E')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
