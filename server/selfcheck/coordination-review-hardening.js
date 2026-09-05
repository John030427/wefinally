'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { createDateApplicationPatchHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
const { buildCoordinationEventCard } = require('../../miniprogram/cloudfunctions/api/lib/coordinationProjection')

function now() {
  return new Date('2026-09-05T00:00:00.000Z')
}

function app(activity = '咖啡') {
  return {
    availability: [{ date: '2026-09-12', periods: ['evening'] }],
    areas: ['福田区'],
    activities: [activity],
    budget: '50-100',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: ''
  }
}

function memoryRows() {
  return {
    user: [{ id: 1 }, { id: 2 }],
    date_coordination: [{ _id: 'date_coordination_70', id: 70, user_a_id: 1, user_b_id: 2, status: 'waiting_confirmations', business_state: 'coordinating', coordination_version: 1, recoordination_count: 0 }],
    date_coordination_application: [
      { _id: 'application_1', id: 1, coordination_id: 70, user_id: 1, coordination_version: 1, application: app() }
    ],
    date_coordination_proposal: [{ _id: 'proposal_1', id: 9, coordination_id: 70, coordination_version: 1, status: 'active' }],
    date_coordination_confirmation: [],
    date_application_patch: [],
    agent_session: [{ _id: 'session_1', id: 101, user_id: 1, agent_type: 'date_coordinator', coordination_id: 70, status: 'active' }],
    agent_message: [],
    date_coordination_event: []
  }
}

function basicDeps(rows) {
  let nextId = 100
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return {
    now,
    currentUser: async () => rows.user[0],
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
    transaction: null,
    commitConfirmation: async () => ({ arranged: false, idempotent: false }),
    publishCoordinationEvent: async () => null,
    writeInboxNotification: async () => null,
    claimPendingPatch: async (patch) => {
      const current = rows.date_application_patch.find((row) => Number(row.id) === Number(patch.id))
      if (!current || current.status !== 'pending_confirmation') return false
      current.status = 'applying'
      return true
    }
  }
}

function transactionAdapterFor(rows, addFailure = false) {
  let nextId = 900
  let conflictCount = 1
  let queue = Promise.resolve()
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const transaction = async (work) => {
    const previous = queue
    let release
    queue = new Promise((resolve) => { release = resolve })
    await previous
    try {
      if (conflictCount > 0) {
        conflictCount -= 1
        const error = new Error('TransactionConflict')
        error.code = 'TransactionConflict'
        throw error
      }
      const snapshot = JSON.parse(JSON.stringify(rows))
      const adapter = {
        now,
        byDocId: async (name, id) => (rows[name] || []).find((row) => row._id === String(id)) || null,
        byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id) || row._id === `${name}_${id}`) || null,
        list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query)),
        setByDocId: async (name, id, data) => {
          if (!rows[name]) rows[name] = []
          const current = rows[name].find((row) => row._id === String(id))
          const next = Object.assign({}, current || {}, data, { _id: String(id) })
          if (current) Object.assign(current, next)
          else rows[name].push(next)
          return next
        },
        addWithId: async (name, data, prefix) => {
          if (addFailure) throw new Error('simulated_create_failure')
          const row = Object.assign({ _id: `${prefix || name}_${++nextId}`, id: nextId }, data)
          if (!rows[name]) rows[name] = []
          rows[name].push(row)
          return row
        },
        updateByDoc: async (name, row, data) => {
          const next = Object.assign({}, row, data)
          const index = (rows[name] || []).indexOf(row)
          if (index >= 0) rows[name][index] = next
          return next
        }
      }
      try {
        return await work(adapter)
      } catch (error) {
        for (const key of Object.keys(rows)) {
          rows[key].length = 0
          rows[key].push(...(snapshot[key] || []))
        }
        throw error
      }
    } finally {
      release()
    }
  }
  return { transaction, setConflictCount(value) { conflictCount = value } }
}

function activeActionablePatchCount(messages) {
  return (messages || []).filter((message) => message.patch_preview
    && ['pending_confirmation', 'pending_primary_selection'].includes(String(message.patch_preview.status || ''))
    && message.context_ref
    && message.context_ref.type === 'patch_preview').length
}

async function main() {
  const rows = memoryRows()
  const deps = basicDeps(rows)
  rows.agent_message.push({
    _id: 'message_1',
    id: 1,
    session_id: 101,
    user_id: 1,
    role: 'assistant',
    content: '旧预览',
    context_ref: { type: 'patch_preview', coordination_id: 70, coordination_version: 1, patch_id: 501 },
    patch_preview: { id: 501, status: 'pending_confirmation', base_version: 1, preview: { changed_fields: [] } },
    coordination_event_id: 77
  })
  rows.date_application_patch.push({
    _id: 'patch_501',
    id: 501,
    coordination_id: 70,
    session_id: 101,
    user_id: 1,
    base_version: 1,
    status: 'superseded',
    preview: { changed_fields: [] }
  })
  rows.date_coordination_event.push({
    _id: 'date_event_77',
    id: 77,
    coordination_id: 70,
    coordination_version: 1,
    event_type: 'preference_changed',
    actor_user_id: 1,
    patch_id: 501,
    safe_payload: { patch_id: 501, changed_dimensions: ['activity'] }
  })
  const historyAgent = createAgentHandlers(Object.assign({}, deps, {
    env: { LANGGRAPH_ENABLED: 'false' }
  }))
  const history = await historyAgent.messages({ id: 101 }, {})
  assert.strictEqual(history.messages[0].patch_preview.status, 'superseded')
  assert.strictEqual(history.messages[0].context_ref, null)
  assert.strictEqual(history.messages[0].event_card.context_ref, null)

  const firstTurn = await historyAgent.send({
    session_id: 101,
    message: '查询当前协调状态',
    client_request_id: 'stable-chat-turn-1'
  }, {})
  const repeatedTurn = await historyAgent.send({
    session_id: 101,
    message: '查询当前协调状态',
    client_request_id: 'stable-chat-turn-1'
  }, {})
  assert.deepStrictEqual(repeatedTurn, firstTurn)
  assert.strictEqual(rows.agent_message.filter((row) => row.client_request_id === 'stable-chat-turn-1').length, 1)

  const coordinationDeps = Object.assign({}, deps, {
    commitConfirmation: async (coordination, proposal) => ({
      coordination: Object.assign({}, coordination, { status: 'waiting_confirmations' }),
      confirmation: { id: 12, proposal_id: proposal.id },
      arranged: false,
      idempotent: false
    }),
    publishCoordinationEvent: async () => null,
    writeInboxNotification: async () => null
  })
  const coordinationHandlers = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
    .createDateCoordinationHandlers(coordinationDeps)
  const confirmed = await coordinationHandlers.confirmProposalForUser({
    coordination_id: 70,
    coordination_version: 1,
    proposal_id: 9,
    decision: 'confirm'
  }, rows.user[0])
  assert.strictEqual(confirmed.applied, true)

  const patches = createDateApplicationPatchHandlers(deps)
  const preview = await patches.createPreviewForUser({
    coordination_id: 70,
    session_id: 101,
    changes: { activities: ['吃饭'] },
    source_message_id: 1
  }, rows.user[0])
  assert.strictEqual(preview.status, 'pending_confirmation')
  rows.agent_message.push({
    _id: 'message_2',
    id: 2,
    session_id: 101,
    user_id: 1,
    role: 'assistant',
    content: '预览 A',
    context_ref: { type: 'patch_preview', coordination_id: 70, coordination_version: 1, patch_id: preview.id },
    patch_preview: preview
  })
  const replacement = await patches.createPreviewForUser({
    coordination_id: 70,
    session_id: 101,
    changes: { activities: ['看展'] },
    source_message_id: 2
  }, rows.user[0])
  rows.agent_message.push({
    _id: 'message_3',
    id: 3,
    session_id: 101,
    user_id: 1,
    role: 'assistant',
    content: '预览 B',
    context_ref: { type: 'patch_preview', coordination_id: 70, coordination_version: 1, patch_id: replacement.id },
    patch_preview: replacement
  })
  const reloaded = await historyAgent.messages({ id: 101 }, {})
  const reloadedA = reloaded.messages.find((message) => message.id === 2)
  const reloadedB = reloaded.messages.find((message) => message.id === 3)
  assert.strictEqual(reloadedA.patch_preview.status, 'superseded')
  assert.strictEqual(reloadedA.context_ref, null)
  assert.strictEqual(reloadedB.patch_preview.status, 'pending_confirmation')
  assert.strictEqual(reloadedB.context_ref.type, 'patch_preview')
  assert.strictEqual(activeActionablePatchCount(reloaded.messages), 1)

  const atomicRows = memoryRows()
  atomicRows.date_coordination[0].id = 71
  atomicRows.date_coordination[0]._id = 'date_coordination_71'
  atomicRows.date_coordination_application[0].coordination_id = 71
  const atomicDeps = basicDeps(atomicRows)
  const atomicTransaction = transactionAdapterFor(atomicRows)
  const atomicPatches = createDateApplicationPatchHandlers(Object.assign({}, atomicDeps, {
    transaction: atomicTransaction.transaction
  }))
  const atomicResults = await Promise.all([
    atomicPatches.createPreviewForUser({ coordination_id: 71, session_id: 1, changes: { activities: ['吃饭'] } }, atomicRows.user[0]),
    atomicPatches.createPreviewForUser({ coordination_id: 71, session_id: 1, changes: { activities: ['看展'] } }, atomicRows.user[0])
  ])
  assert.strictEqual(atomicResults.length, 2)
  assert.strictEqual(atomicRows.date_application_patch.filter((row) => row.status === 'pending_confirmation').length, 1)
  assert.strictEqual(atomicRows.date_application_patch.filter((row) => row.status === 'superseded').length, 1)

  const rollbackRows = memoryRows()
  rollbackRows.date_application_patch.push({ _id: 'old_patch', id: 601, coordination_id: 70, user_id: 1, status: 'pending_confirmation' })
  const rollbackTransaction = transactionAdapterFor(rollbackRows, true)
  rollbackTransaction.setConflictCount(0)
  const rollbackPatches = createDateApplicationPatchHandlers(Object.assign({}, basicDeps(rollbackRows), {
    transaction: rollbackTransaction.transaction
  }))
  await assert.rejects(() => rollbackPatches.createPreviewForUser({ coordination_id: 70, changes: { activities: ['看展'] } }, rollbackRows.user[0]), /simulated_create_failure/)
  assert.strictEqual(rollbackRows.date_application_patch.find((row) => row.id === 601).status, 'pending_confirmation')

  const partnerCard = buildCoordinationEventCard({
    viewer_user_id: 2,
    event: {
      id: 77,
      coordination_id: 70,
      coordination_version: 1,
      event_type: 'preference_changed',
      actor_user_id: 1,
      patch_id: preview.id
    }
  })
  assert.notStrictEqual(partnerCard.context_ref && partnerCard.context_ref.type, 'patch_preview')
  assert.strictEqual(partnerCard.context_ref.type, 'partner_inquiry')

  const chatPath = path.join(__dirname, '../../miniprogram/pages/chat/chat.js')
  const chat = fs.readFileSync(chatPath, 'utf8')
  assert.match(chat, /client_request_id/)
  assert.match(chat, /onShow\(\)/)
  assert.match(chat, /onHide\(\)/)

  console.log('PASS - coordination review hardening contract tests')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
