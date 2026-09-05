'use strict'

const assert = require('assert')

const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
const { createDateApplicationPatchHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { processCoordinationProjectionOutbox } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationProjectionWorker')
const { canBootstrapCollection } = require('../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy')

function app(activity = '吃饭') {
  return {
    availability: [{ date: '2026-09-12', periods: ['evening'] }],
    areas: ['福田'],
    activities: [activity],
    budget: '100-200',
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

function makeDedupeHarness() {
  const rows = {
    user: [{ id: 1, free_member: 1 }],
    agent_session: [{ _id: 'agent_session_1', id: 1, user_id: 1, agent_type: 'love_advisor', status: 'active', summary: '' }],
    agent_message: [],
    agent_message_dedupe: [],
    knowledge_article: [{ id: 1, title: '帮助', content: '帮助内容' }]
  }
  let nextId = 10
  let nowMs = Date.parse('2026-09-05T00:00:00.000Z')
  let collectionExists = false
  let bootstrapCalls = 0
  let crash = true
  let transactionQueue = Promise.resolve()
  let decisionCalls = 0

  const deps = {
    currentUser: async () => rows.user[0],
    first: async (name, query) => (rows[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query)),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id) || row._id === String(id)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({ _id: `${prefix || name}_${++nextId}`, id: nextId }, data)
      if (!rows[name]) rows[name] = []
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => Object.assign(row, data),
    ensureCollection: async (name) => {
      assert.strictEqual(name, 'agent_message_dedupe')
      bootstrapCalls += 1
      collectionExists = true
    },
    transaction: async (work) => {
      const previous = transactionQueue
      let release
      transactionQueue = new Promise((resolve) => { release = resolve })
      await previous
      try {
        if (!collectionExists) throw new Error('collection agent_message_dedupes does not exist')
        const adapter = {
          now: () => new Date(nowMs),
          byDocId: async (name, id) => (rows[name] || []).find((row) => row._id === String(id)) || null,
          setByDocId: async (name, id, data) => {
            if (!rows[name]) rows[name] = []
            const existing = rows[name].find((row) => row._id === String(id))
            if (existing) return Object.assign(existing, data, { _id: String(id) })
            const created = Object.assign({ _id: String(id) }, data)
            rows[name].push(created)
            return created
          },
          list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query))
        }
        return await work(adapter)
      } finally {
        release()
      }
    },
    env: { LANGGRAPH_ENABLED: 'false' },
    generateDecision: async () => {
      decisionCalls += 1
      if (crash) throw new Error('simulated_worker_exit')
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { replyDraft: '已恢复处理', provider: 'fallback', riskLevel: 'safe', suggestedActions: [] }
    },
    now: () => new Date(nowMs)
  }

  return {
    rows,
    deps,
    setCrash(value) { crash = value },
    advance(ms) { nowMs += ms },
    bootstrapCalls: () => bootstrapCalls,
    decisionCalls: () => decisionCalls
  }
}

function makeProjectionHarness() {
  const rows = {
    user: [{ id: 1 }, { id: 2 }],
    date_coordination: [{
      _id: 'date_coordination_70',
      id: 70,
      user_a_id: 1,
      user_b_id: 2,
      status: 'waiting_confirmations',
      business_state: 'proposal_generated',
      coordination_version: 1,
      recoordination_count: 0,
      final_proposal_id: 0
    }],
    date_coordination_application: [
      { _id: 'application_1', id: 1, coordination_id: 70, user_id: 1, coordination_version: 1, application: app() },
      { _id: 'application_2', id: 2, coordination_id: 70, user_id: 2, coordination_version: 1, application: app() }
    ],
    date_coordination_proposal: [{
      _id: 'proposal_9',
      id: 9,
      coordination_id: 70,
      coordination_version: 1,
      status: 'active',
      date: '2026-09-12',
      period: 'evening',
      area: '福田',
      activity: '吃饭',
      budget: '100-200',
      payment_preference: 'aa',
      duration: '1-2h'
    }],
    date_coordination_confirmation: [],
    date_application_patch: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    agent_notification_job: [],
    coordination_projection_outbox: []
  }
  let nextId = 100
  let failPublish = true
  let publishedEventCount = 0
  let notificationCount = 0
  const now = () => new Date('2026-09-05T00:00:00.000Z')
  const deps = {
    rows,
    now,
    first: async (name, query) => (rows[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query)),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id) || row._id === String(id)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({ _id: `${prefix || name}_${++nextId}`, id: nextId }, data)
      if (!rows[name]) rows[name] = []
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => Object.assign(row, data),
    claimPendingPatch: async (patch) => {
      if (patch.status !== 'pending_confirmation') return false
      patch.status = 'applying'
      return true
    },
    publishCoordinationEvent: async ({ coordination, event }) => {
      if (failPublish) throw new Error('forced_projection_failure')
      publishedEventCount += 1
      const eventRow = { id: 700 + publishedEventCount, coordination_id: coordination.id, event_type: event.event_type, actor_user_id: event.actor_user_id }
      rows.date_coordination_event.push(eventRow)
      return { event: eventRow, messages: [{ user_id: 2, session_id: 200 }] }
    },
    writeInboxNotification: async () => {
      notificationCount += 1
      return { queued: true }
    },
    commitConfirmation: async (coordination, proposal, input) => {
      const existing = rows.date_coordination_confirmation.find((row) => row.user_id === input.user_id && row.coordination_version === 1)
      const confirmation = existing || await deps.addWithId('date_coordination_confirmation', {
        coordination_id: coordination.id,
        user_id: input.user_id,
        proposal_id: proposal.id,
        coordination_version: 1,
        decision: 'confirm',
        status: 'active'
      }, 'date_confirmation')
      return { coordination: Object.assign(coordination, { status: 'waiting_confirmations' }), confirmation, arranged: false, idempotent: false }
    }
  }
  return {
    rows,
    deps,
    failPublish(value) { failPublish = value },
    counts: () => ({ publishedEventCount, notificationCount })
  }
}

async function testDedupeBootstrapAndRecovery() {
  assert.strictEqual(canBootstrapCollection('agent_message_dedupe'), true)
  const harness = makeDedupeHarness()
  const handlers = createAgentHandlers(harness.deps)
  await assert.rejects(() => handlers.send({
    session_id: 1,
    message: '第一次请求',
    client_request_id: 'recoverable-request-1'
  }, {}), /simulated_worker_exit/)
  assert.strictEqual(harness.bootstrapCalls() >= 1, true)
  const claim = harness.rows.agent_message_dedupe[0]
  assert.strictEqual(claim.status, 'processing')
  assert.ok(claim.lease_expires_at)
  harness.advance(120000)
  harness.setCrash(false)
  const recovered = await handlers.send({
    session_id: 1,
    message: '第一次请求',
    client_request_id: 'recoverable-request-1'
  }, {})
  assert.strictEqual(recovered.reply, '已恢复处理')
  assert.strictEqual(harness.rows.agent_message.filter((row) => row.role === 'user').length, 1)
  assert.strictEqual(harness.rows.agent_message.filter((row) => row.role === 'user')[0].id, claim.user_message_id)
  assert.strictEqual(harness.rows.agent_message_dedupe[0].status, 'completed')
  const completedDuplicate = await handlers.send({
    session_id: 1,
    message: '第一次请求',
    client_request_id: 'recoverable-request-1'
  }, {})
  assert.deepStrictEqual(completedDuplicate, recovered)
  assert.strictEqual(harness.rows.agent_message.filter((row) => row.role === 'user').length, 1)

  const callsBeforeDuplicate = harness.decisionCalls()
  const duplicateResults = await Promise.all([
    handlers.send({ session_id: 1, message: '并发请求', client_request_id: 'concurrent-request-1' }, {}),
    handlers.send({ session_id: 1, message: '并发请求', client_request_id: 'concurrent-request-1' }, {})
  ])
  assert.strictEqual(duplicateResults.some((result) => result.deduplicated === true && result.pending === true), true)
  assert.strictEqual(duplicateResults.some((result) => result.reply === '已恢复处理'), true)
  assert.strictEqual(harness.rows.agent_message.filter((row) => row.client_request_id === 'concurrent-request-1').length, 1)
  assert.strictEqual(harness.decisionCalls(), callsBeforeDuplicate + 1)
}

async function testPatchProjectionFailureRecovery() {
  const harness = makeProjectionHarness()
  const patches = createDateApplicationPatchHandlers(harness.deps)
  const preview = await patches.createPreviewForUser({
    coordination_id: 70,
    changes: { activities: ['看展'] }
  }, harness.rows.user[0])
  const result = await patches.confirmForUser({ coordination_id: 70, patch_id: preview.id }, harness.rows.user[0])
  assert.strictEqual(result.applied, true)
  assert.strictEqual(result.partner_notified, false)
  assert.strictEqual(result.projection_pending, true)
  assert.strictEqual(harness.rows.date_coordination[0].coordination_version, 2)
  assert.strictEqual(harness.rows.date_application_patch.find((row) => row.id === preview.id).status, 'applied')
  assert.strictEqual(harness.rows.coordination_projection_outbox.length, 1)
  harness.failPublish(false)
  const retry = await processCoordinationProjectionOutbox({ deps: harness.deps, limit: 10 })
  assert.strictEqual(retry.completed, 1)
  assert.strictEqual(harness.counts().publishedEventCount, 1)
}

async function testProposalProjectionFailureRecovery() {
  const harness = makeProjectionHarness()
  const handlers = createDateCoordinationHandlers(harness.deps)
  const result = await handlers.confirmProposalForUser({
    coordination_id: 70,
    coordination_version: 1,
    proposal_id: 9,
    decision: 'confirm'
  }, harness.rows.user[1])
  assert.strictEqual(result.applied, true)
  assert.strictEqual(result.partner_notified, false)
  assert.strictEqual(result.projection_pending, true)
  assert.strictEqual(harness.rows.date_coordination_confirmation.length, 1)
  assert.strictEqual(harness.rows.coordination_projection_outbox.length, 1)
  harness.failPublish(false)
  const retry = await processCoordinationProjectionOutbox({ deps: harness.deps, limit: 10 })
  assert.strictEqual(retry.completed, 1)
  assert.strictEqual(harness.counts().publishedEventCount, 1)
}

async function main() {
  await testDedupeBootstrapAndRecovery()
  await testPatchProjectionFailureRecovery()
  await testProposalProjectionFailureRecovery()
  console.log('PASS final coordination blockers: dedupe bootstrap/reclaim and canonical projection recovery')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
