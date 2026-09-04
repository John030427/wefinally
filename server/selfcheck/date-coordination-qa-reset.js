'use strict'

const assert = require('assert')
const {
  executeQaCoordinationReset,
  QA_COORDINATION_RESET_CONFIRM_TEXT
} = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')

const actor = {
  id: 1,
  account_mode: 'internal_qa',
  profile_origin: 'real_user',
  qa_match_cohort: 'qa-real-device-registration-v1'
}

function memoryDeps() {
  const coordination = {
    _id: 'coord_1',
    id: 31,
    user_a_id: 1,
    user_b_id: 2,
    is_test_data: 1,
    synthetic_partner_mode: 'auto',
    status: 'waiting_confirmations',
    business_state: 'waiting_confirm',
    processing_status: 'queued',
    processing_token: 'token-1',
    coordination_version: 4,
    confirmation_deadline_at: '2026-09-05T00:00:00.000Z'
  }
  const rows = {
    coordination: [coordination],
    agent_session: [{ _id: 'session_1', id: 41, coordination_id: 31, status: 'active', agent_type: 'date_coordinator' }],
    agent_notification_job: [{ _id: 'notification_1', id: 42, coordination_id: 31, status: 'queued' }],
    date_application_patch: [{ _id: 'patch_1', id: 43, coordination_id: 31, status: 'pending_confirmation' }],
    date_coordination_proposal: [{ _id: 'proposal_1', id: 44, coordination_id: 31, status: 'active' }],
    date_coordination_confirmation: [{ _id: 'confirmation_1', id: 45, coordination_id: 31, status: 'active' }]
  }
  const events = []
  const notifications = []
  const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    rows,
    events,
    notifications,
    now: () => new Date('2026-09-04T00:00:00.000Z'),
    participant: (current, userId) => [current.user_a_id, current.user_b_id].includes(Number(userId)),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => same(row, query)),
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    claimIfStatus: async (_name, row, expectedStatus, patch) => {
      if (String(row.status || '') !== String(expectedStatus || '')) return null
      return Object.assign(row, patch)
    },
    publishCoordinationEvent: async (input) => { events.push(input); return { id: 91 } },
    writeInboxNotification: async (input) => { notifications.push(input); return { id: 92 } }
  }
  return { coordination, rows, deps }
}

async function main() {
  const fixture = memoryDeps()
  const result = await executeQaCoordinationReset({
    actor,
    coordination: fixture.coordination,
    confirmText: QA_COORDINATION_RESET_CONFIRM_TEXT
  }, fixture.deps)
  assert.strictEqual(result.reset, true)
  assert.strictEqual(result.idempotent, false)
  assert.strictEqual(fixture.coordination.status, 'closed')
  assert.strictEqual(fixture.coordination.business_state, 'qa_reset')
  assert.strictEqual(fixture.coordination.processing_status, 'idle')
  assert.strictEqual(fixture.rows.agent_session[0].status, 'closed')
  assert.strictEqual(fixture.rows.agent_notification_job[0].status, 'cancelled')
  assert.strictEqual(fixture.rows.date_application_patch[0].status, 'cancelled')
  assert.strictEqual(fixture.rows.date_coordination_proposal[0].status, 'superseded')
  assert.strictEqual(fixture.rows.date_coordination_confirmation[0].status, 'superseded')
  assert.strictEqual(eventsEventType(fixture.deps.events[0]), 'qa_coordination_reset')
  assert.strictEqual(fixture.deps.notifications.length, 1)

  const repeated = await executeQaCoordinationReset({
    actor,
    coordination: fixture.coordination,
    confirmText: QA_COORDINATION_RESET_CONFIRM_TEXT
  }, fixture.deps)
  assert.strictEqual(repeated.reset, false)
  assert.strictEqual(repeated.idempotent, true)
  assert.strictEqual(fixture.deps.events.length, 1)

  const raced = memoryDeps()
  const concurrent = await Promise.all([
    executeQaCoordinationReset({ actor, coordination: raced.coordination, confirmText: QA_COORDINATION_RESET_CONFIRM_TEXT }, raced.deps),
    executeQaCoordinationReset({ actor, coordination: raced.coordination, confirmText: QA_COORDINATION_RESET_CONFIRM_TEXT }, raced.deps)
  ])
  assert.strictEqual(concurrent.filter((item) => item.reset).length, 1)
  assert.strictEqual(concurrent.filter((item) => item.idempotent).length, 1)
  assert.strictEqual(raced.deps.events.length, 1)

  await assert.rejects(
    () => executeQaCoordinationReset({
      actor: { id: 99, profile_origin: 'real_user', account_mode: 'production' },
      coordination: fixture.coordination,
      confirmText: QA_COORDINATION_RESET_CONFIRM_TEXT
    }, fixture.deps),
    (error) => error && error.errorCode === 'QA_RESET_FORBIDDEN'
  )
  console.log('PASS coordination-level QA reset closes workflow and is idempotent')
}

function eventsEventType(event) {
  return event && event.event && event.event.event_type
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
