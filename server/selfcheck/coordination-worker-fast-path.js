'use strict'

const assert = require('assert')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { processCoordinationTasks } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationWorker')
const { processCoordinationProjectionOutbox } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationProjectionWorker')

const NOW = new Date('2026-09-05T13:00:00.000Z')

function makeWorkerHarness() {
  const coordination = {
    _id: 'coordination_1',
    id: 1,
    user_a_id: 101,
    user_b_id: 202,
    status: 'computing_overlap',
    coordination_version: 1,
    processing_status: 'queued',
    processing_version: 1,
    processing_attempts: 0,
    processing_token: ''
  }
  const applications = [
    { user_id: 101, application: { availability: [{ date: '2026-09-12', periods: ['evening'] }], areas: ['福田'], activities: ['吃饭'], budget: 'flexible', payment_preference: 'flexible', duration: 'flexible' } },
    { user_id: 202, application: { availability: [{ date: '2026-09-12', periods: ['evening'] }], areas: ['福田'], activities: ['吃饭'], budget: 'flexible', payment_preference: 'flexible', duration: 'flexible' } }
  ]
  const rows = { coordination_projection_outbox: [] }
  const deps = {
    now: () => NOW,
    listTasks: async () => coordination.processing_status === 'queued' ? [coordination] : [],
    claimTask: async (task) => {
      if (task.processing_status !== 'queued') return null
      Object.assign(task, { processing_status: 'processing', processing_token: 'lease-1', processing_attempts: 1, processing_started_at: NOW })
      return Object.assign({}, task)
    },
    listApplications: async () => applications,
    completeTask: async (claim) => {
      Object.assign(coordination, { status: 'no_overlap', business_state: 'waiting_partner', processing_status: 'completed', processing_token: '', processing_completed_at: NOW })
      return { applied: true, coordination, proposals: [] }
    },
    failTask: async () => { throw new Error('failTask must not run') },
    publishCoordinationEvent: async () => { throw new Error('projection temporarily unavailable') },
    enqueueProjectionRetry: async (operation, current, payload, error) => {
      const row = { id: 1, coordination_id: current.id, operation, payload, status: 'pending', attempts: 0, last_error_code: error.message }
      rows.coordination_projection_outbox.push(row)
      return row
    }
  }
  return { coordination, rows, deps }
}

async function main() {
  const harness = makeWorkerHarness()
  const result = await processCoordinationTasks({ deps: harness.deps, now: NOW, limit: 10 })
  assert.deepStrictEqual(result, { scanned: 1, claimed: 1, completed: 1, stale: 0, failed: 0 })
  assert.equal(harness.coordination.processing_status, 'completed')
  assert.equal(harness.rows.coordination_projection_outbox.length, 1)
  assert.equal(harness.rows.coordination_projection_outbox[0].operation, 'publish_coordination_event')
  assert.equal(harness.rows.coordination_projection_outbox[0].payload.event_type, 'no_overlap')

  let publishCalls = 0
  const projectionDeps = {
    list: async (name, query) => harness.rows[name].filter((row) => Object.keys(query).every((key) => row[key] === query[key])),
    byId: async () => harness.coordination,
    claim: async (name, row, expected, data) => Object.assign(row, data),
    updateByDoc: async (name, row, data) => Object.assign(row, data),
    publishCoordinationEvent: async () => { publishCalls += 1; return { event: { id: 99 } } },
    now: () => NOW
  }
  const retry = await processCoordinationProjectionOutbox({ deps: projectionDeps, limit: 10 })
  assert.deepStrictEqual(retry, { scanned: 1, completed: 1, failed: 0 })
  assert.equal(publishCalls, 1)
  assert.equal(harness.rows.coordination_projection_outbox[0].status, 'completed')

  const fastCoordination = {
    _id: 'coordination_fast',
    id: 2,
    user_a_id: 101,
    user_b_id: 202,
    status: 'collecting_preferences',
    business_state: 'waiting_invitee_preference',
    coordination_version: 1,
    application_deadline_at: new Date('2026-09-06T00:00:00.000Z'),
    invitation_proposal: { availability: [{ date: '2026-09-12', periods: ['evening'] }], areas: ['福田'], activities: ['吃饭'] }
  }
  const fastRows = {
    date_coordination: [fastCoordination],
    date_coordination_application: [{ id: 1, coordination_id: 2, user_id: 101, coordination_version: 1, application: { availability: [{ date: '2026-09-12', periods: ['evening'] }], areas: ['福田'], activities: ['吃饭'], budget: 'flexible', payment_preference: 'flexible', duration: 'flexible' } }],
    date_coordination_confirmation: [],
    date_coordination_proposal: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    agent_notification_job: [],
    coordination_projection_outbox: []
  }
  let fastId = 10
  let immediateCalls = 0
  let immediateFailure = false
  const fastDeps = {
    rows: fastRows,
    first: async (name, query) => (fastRows[name] || []).find((row) => Object.keys(query || {}).every((key) => row[key] === query[key])) || null,
    list: async (name, query) => (fastRows[name] || []).filter((row) => Object.keys(query || {}).every((key) => row[key] === query[key])),
    byId: async (name, id) => (fastRows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({ _id: `${prefix || name}_${++fastId}`, id: fastId }, data)
      if (!fastRows[name]) fastRows[name] = []
      fastRows[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => Object.assign(row, data),
    publishCoordinationEvent: async () => ({ event: { id: 1 }, messages: [] }),
    writeInboxNotification: async () => ({ queued: true }),
    now: () => NOW,
    processCoordinationTasks: async () => {
      immediateCalls += 1
      if (immediateFailure) throw new Error('simulated_immediate_processing_failure')
      Object.assign(fastCoordination, { status: 'waiting_confirmations', business_state: 'proposal_generated', processing_status: 'completed', processing_version: 1, processing_completed_at: NOW })
      return { scanned: 1, claimed: 1, completed: 1, stale: 0, failed: 0 }
    }
  }
  const fastHandlers = createDateCoordinationHandlers(fastDeps)
  const fastResult = await fastHandlers.saveApplicationForUser({
    coordination_id: 2,
    availability: [{ date: '2026-09-12', periods: ['evening'] }],
    areas: ['福田'],
    activities: ['吃饭'],
    budget: 'flexible',
    payment_preference: 'flexible',
    duration: 'flexible'
  }, { id: 202 })
  assert.equal(immediateCalls, 1)
  assert.equal(fastResult.status, 'waiting_confirmations')
  assert.equal(fastResult.business_state, 'proposal_generated')

  immediateFailure = true
  Object.assign(fastCoordination, { status: 'collecting_preferences', business_state: 'waiting_invitee_preference', processing_status: null, processing_version: 0, processing_completed_at: null })
  fastRows.date_coordination_application = fastRows.date_coordination_application.filter((row) => Number(row.user_id) !== 202)
  const deferredResult = await fastHandlers.saveApplicationForUser({
    coordination_id: 2,
    availability: [{ date: '2026-09-12', periods: ['evening'] }],
    areas: ['福田'],
    activities: ['吃饭'],
    budget: 'flexible',
    payment_preference: 'flexible',
    duration: 'flexible'
  }, { id: 202 })
  assert.equal(deferredResult.status, 'computing_overlap')
  assert.equal(deferredResult.processing_status, 'queued')
  console.log('PASS coordination worker projection failure is retryable and canonical completion is preserved')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
