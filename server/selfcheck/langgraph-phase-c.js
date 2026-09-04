const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
const { AGENT_TYPES } = require('../../miniprogram/cloudfunctions/api/agent/types')

const ROOT = path.resolve(__dirname, '../..')

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
}

function makeDeps() {
  const rows = {
    user: [{ id: 1, member_status: 'approved', is_vip: 1, status: 1 }],
    agent_session: [],
    agent_message: [],
    agent_run: [],
    agent_tool_call: [],
    agent_human_ticket: [],
    knowledge_article: [],
    date_coordination: [{
      id: 700,
      user_a_id: 1,
      user_b_id: 2,
      status: 'collecting_preferences',
      business_state: 'collecting',
      coordination_version: 3
    }],
    date_coordination_application: [{
      id: 701,
      coordination_id: 700,
      user_id: 1,
      coordination_version: 3,
      application: {
        availability: [{ date: '2026-09-12', periods: ['evening'] }],
        areas: ['南山'],
        activities: ['电影'],
        budget: '100-200',
        payment_preference: 'aa',
        duration: '1-2h'
      }
    }],
    date_application_patch: [],
    date_coordination_event: [],
    date_coordination_proposal: [],
    date_coordination_confirmation: [],
    agent_notification_job: []
  }
  let nextId = 900
  let generateDecisionCalls = 0
  const deps = {
    rows,
    env: { LANGGRAPH_ENABLED: 'false', LANGGRAPH_ACTOR_SECRET: 'phase-c-secret' },
    now: () => new Date('2026-09-04T12:00:00.000Z'),
    currentUser: async () => rows.user[0],
    first: async (name, query) => (rows[name] || []).find((row) => Object.keys(query || {}).every((key) => row[key] === query[key])) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => Object.keys(query || {}).every((key) => row[key] === query[key])),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({ id: ++nextId }, data)
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    claimPendingPatch: async (patch) => {
      const current = rows.date_application_patch.find((row) => Number(row.id) === Number(patch.id))
      if (!current || current.status !== 'pending_confirmation') return false
      current.status = 'applying'
      return true
    },
    generateDecision: async () => {
      generateDecisionCalls += 1
      throw new Error('date coordinator must not call legacy generateDecision')
    },
    invokeGraphFunction: async () => {
      throw new Error('graph offline')
    }
  }
  return { deps, rows, getGenerateDecisionCalls: () => generateDecisionCalls }
}

async function main() {
  const handlerSource = read('miniprogram/cloudfunctions/api/handlers/agent.js')
  const policySource = read('miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy.js')
  const dateStart = handlerSource.indexOf("if (session.agent_type === AGENT_TYPES.DATE_COORDINATOR) {")
  const dateEnd = handlerSource.indexOf("const tool = session.agent_type === AGENT_TYPES.PLATFORM_SERVICE", dateStart)
  assert.ok(dateStart >= 0 && dateEnd > dateStart)
  const dateBranch = handlerSource.slice(dateStart, dateEnd)
  assert.doesNotMatch(handlerSource, /pendingActionIntent/)
  assert.doesNotMatch(handlerSource, /partnerInquiryLike/)
  assert.doesNotMatch(dateBranch, /generateDecision/)
  assert.doesNotMatch(policySource, /classifyChangeIntent/)
  assert.doesNotMatch(policySource, /createPatchFromDecision/)

  const disabled = makeDeps()
  const disabledHandlers = createAgentHandlers(disabled.deps)
  const disabledSession = await disabledHandlers.createSession({
    agent_type: AGENT_TYPES.DATE_COORDINATOR,
    coordination_id: 700
  }, { user_id: 1 })
  const disabledReply = await disabledHandlers.send({
    session_id: disabledSession.id,
    message: '不想看电影了，帮我改成咖啡'
  }, { user_id: 1 })
  assert.strictEqual(disabledReply.provider, 'fallback')
  assert.strictEqual(disabledReply.graph_fallback, 'graph_disabled')
  assert.strictEqual(disabledReply.patch_preview, undefined)
  assert.strictEqual(disabled.rows.date_application_patch.length, 0)
  assert.strictEqual(disabled.getGenerateDecisionCalls(), 0)

  const unavailable = makeDeps()
  unavailable.deps.env.LANGGRAPH_ENABLED = 'true'
  const unavailableHandlers = createAgentHandlers(unavailable.deps)
  const unavailableSession = await unavailableHandlers.createSession({
    agent_type: AGENT_TYPES.DATE_COORDINATOR,
    coordination_id: 700
  }, { user_id: 1 })
  const unavailableReply = await unavailableHandlers.send({
    session_id: unavailableSession.id,
    message: '问对方想不想吃酸菜鱼'
  }, { user_id: 1 })
  assert.strictEqual(unavailableReply.provider, 'fallback')
  assert.strictEqual(unavailableReply.graph_fallback, 'graph_unavailable')
  assert.strictEqual(unavailable.rows.date_coordination_event.length, 0)
  assert.strictEqual(unavailable.getGenerateDecisionCalls(), 0)

  const pending = makeDeps()
  pending.rows.date_application_patch.push({
    id: 702,
    coordination_id: 700,
    session_id: 0,
    user_id: 1,
    base_version: 3,
    operation: 'modify',
    status: 'pending_confirmation',
    preview: { before: { activities: ['电影'] }, after: { activities: ['咖啡'] }, changed_fields: ['activities'] }
  })
  const pendingHandlers = createAgentHandlers(pending.deps)
  const pendingSession = await pendingHandlers.createSession({
    agent_type: AGENT_TYPES.DATE_COORDINATOR,
    coordination_id: 700
  }, { user_id: 1 })
  const pendingReply = await pendingHandlers.send({
    session_id: pendingSession.id,
    message: '确认发送吧'
  }, { user_id: 1 })
  assert.strictEqual(pendingReply.provider, 'fallback')
  assert.strictEqual(pendingReply.graph_fallback, 'graph_disabled')
  assert.strictEqual(pending.rows.date_application_patch[0].status, 'pending_confirmation')
  assert.strictEqual(pending.rows.date_coordination[0].coordination_version, 3)
  assert.strictEqual(pending.rows.agent_notification_job.length, 0)

  console.log('PASS langgraph Phase C fallback and second-decision-center contract')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
