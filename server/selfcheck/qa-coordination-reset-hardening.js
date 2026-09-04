'use strict'

const assert = require('assert')
const {
  executeQaCoordinationReset,
  QA_COORDINATION_RESET_CONFIRM_TEXT
} = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetService')
const { processCoordinationProjectionOutbox } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationProjectionWorker')

const users = [
  { id: 1, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'cohort-a' },
  { id: 2, account_mode: 'internal_qa', profile_origin: 'real_user', qa_match_cohort: 'cohort-a' }
]

function fixture({ synthetic = true } = {}) {
  const coordination = {
    _id: 'coord-hardening', id: 716, user_a_id: 1, user_b_id: 2,
    is_test_data: 1, synthetic_partner_mode: synthetic ? 'manual_step' : '',
    status: 'waiting_confirmations', business_state: 'coordinating', coordination_version: 3
  }
  const rows = {
    date_coordination: [coordination],
    user: users,
    coordination_projection_outbox: [],
    agent_notification_job: [],
    date_application_patch: [],
    date_coordination_proposal: [],
    date_coordination_confirmation: [],
    agent_session: []
  }
  const same = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  let eventAttempts = 0
  const deps = {
    now: () => new Date('2026-09-04T00:00:00.000Z'),
    rows,
    list: async (name, query) => (rows[name] || []).filter((row) => same(row, query)),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    claimIfStatus: async (_name, row, expected, patch) => String(row.status) === expected ? Object.assign(row, patch) : null,
    addWithId: async (name, row) => {
      const next = Object.assign({ id: (rows[name] || []).length + 900 }, row)
      ;(rows[name] ||= []).push(next)
      return next
    },
    publishCoordinationEvent: async () => {
      eventAttempts += 1
      if (eventAttempts === 1) throw new Error('projection_down')
      return { event: { id: 901 }, messages: [] }
    },
    writeInboxNotification: async () => ({ queued: true }),
    enqueueProjectionRetry: async (operation, current, payload, error, projectionKind) => {
      const existing = rows.coordination_projection_outbox.find((row) => row.operation === operation)
      if (existing) return existing
      const row = {
        id: 950 + rows.coordination_projection_outbox.length,
        operation,
        coordination_id: Number(current.id),
        coordination_version: Number(current.coordination_version),
        projection_kind: projectionKind,
        payload,
        status: 'pending',
        attempts: 0,
        last_error_code: String(error && error.message || '')
      }
      rows.coordination_projection_outbox.push(row)
      return row
    }
  }
  return { coordination, deps, get eventAttempts() { return eventAttempts } }
}

async function reset(input, state) {
  return executeQaCoordinationReset({
    actor: users[0], coordination: state.coordination,
    confirmText: QA_COORDINATION_RESET_CONFIRM_TEXT
  }, state.deps)
}

;(async () => {
  const synthetic = fixture()
  const first = await reset(null, synthetic)
  assert.equal(first.event_status, 'pending')
  assert.equal(first.projection_pending, true)
  assert.equal(synthetic.deps.rows.coordination_projection_outbox.length, 1)
  const repeated = await reset(null, synthetic)
  assert.equal(repeated.event_status, 'pending')
  assert.equal(repeated.projection_pending, true)
  assert.notEqual(repeated.event_status, 'projected')

  const worker = await processCoordinationProjectionOutbox({ deps: synthetic.deps })
  assert.equal(worker.completed, 1)
  assert.equal(synthetic.deps.rows.coordination_projection_outbox[0].status, 'completed')

  const realPair = fixture({ synthetic: false })
  const realPairResult = await reset(null, realPair)
  assert.equal(realPairResult.reset, true)

  const production = fixture()
  production.coordination.is_test_data = 0
  await assert.rejects(() => reset(null, production), (error) => error && error.errorCode === 'QA_RESET_FORBIDDEN')

  const mixedQaProductionPair = fixture({ synthetic: false })
  mixedQaProductionPair.deps.rows.user[1] = {
    id: 2,
    account_mode: 'production',
    profile_origin: 'real_user',
    qa_match_cohort: 'cohort-a'
  }
  await assert.rejects(() => reset(null, mixedQaProductionPair), (error) => error && error.errorCode === 'QA_RESET_FORBIDDEN')

  console.log('PASS coordination QA reset accepts synthetic/dual-QA only and retries outbox projection')
})().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
