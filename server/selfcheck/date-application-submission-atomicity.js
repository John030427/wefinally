'use strict'

const assert = require('assert')
const { normalizeApplication, STATUS, nextStatus } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const {
  commitDateApplicationSubmission,
  projectDateSubmission
} = require('../../miniprogram/cloudfunctions/api/lib/dateApplicationSubmission')

function memoryStore(seed = {}) {
  const rows = {
    date_coordination: [],
    date_coordination_application: [],
    date_submission_outbox: [],
    agent_notification_job: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    coordination_notification: [],
    user_notification_cursor: []
  }
  Object.keys(seed).forEach((key) => {
    rows[key] = (seed[key] || []).slice()
  })
  let id = 1
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const store = {
    rows,
    first: async (name, query) => rows[name].find((row) => matches(row, query)) || null,
    list: async (name, query) => rows[name].filter((row) => matches(row, query)),
    byId: async (name, value) => rows[name].find((row) => Number(row.id) === Number(value)) || null,
    addWithId: async (name, data) => {
      const row = Object.assign({ _id: `${name}_${id}`, id: id++ }, data)
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    now: () => new Date('2026-09-04T08:00:00.000Z'),
    async transaction(work) {
      const snapshot = JSON.parse(JSON.stringify(rows))
      const nextId = id
      try {
        return await work({
          first: store.first,
          list: store.list,
          byId: store.byId,
          addWithId: store.addWithId,
          updateByDoc: store.updateByDoc,
          byDocId: async (name, docId) => rows[name].find((row) => row._id === docId) || null
        })
      } catch (err) {
        Object.keys(rows).forEach((key) => { rows[key] = snapshot[key] || [] })
        id = nextId
        throw err
      }
    }
  }
  return store
}

function sampleApplication() {
  return normalizeApplication({
    availability: [{ date: '2026-09-10', periods: ['night'] }],
    areas: ['南山区'],
    activities: ['电影'],
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h',
    start_time: '20:00',
    activity_venue: '万象天地影城'
  }, new Date('2026-09-04T08:00:00.000Z'))
}

async function main() {
  const coordination = {
    _id: 'coord_1',
    id: 101,
    user_a_id: 1,
    user_b_id: 2,
    status: STATUS.COLLECTING_INITIATOR,
    coordination_version: 1,
    business_state: 'created'
  }
  const application = sampleApplication()
  const input = {
    coordination_id: 101,
    actor_user_id: 1,
    expected_version: 1,
    request_id: 'req-atomic-1',
    application,
    application_source: 'initiator_invitation',
    invitation_primary_proposal: {
      date: '2026-09-10',
      period: 'night',
      area: '南山区',
      activity: '电影',
      start_time: '20:00',
      activity_venue: '万象天地影城'
    }
  }

  // 1) Fail before commit: nothing written
  const beforeFail = memoryStore({ date_coordination: [Object.assign({}, coordination)] })
  beforeFail.transaction = async () => { throw new Error('simulated pre-commit failure') }
  await assert.rejects(
    () => commitDateApplicationSubmission(input, beforeFail),
    /simulated pre-commit failure/
  )
  assert.strictEqual(beforeFail.rows.date_coordination_application.length, 0)
  assert.strictEqual(beforeFail.rows.date_submission_outbox.length, 0)
  assert.strictEqual(beforeFail.rows.date_coordination[0].status, STATUS.COLLECTING_INITIATOR)

  // 2) Commit succeeds; projection fails → saved true + pending outbox, no partial invite state loss
  const projectFail = memoryStore({ date_coordination: [Object.assign({}, coordination)] })
  const committed = await commitDateApplicationSubmission(input, projectFail)
  assert.strictEqual(committed.coordination.status, nextStatus(STATUS.COLLECTING_INITIATOR, 'initiator_submitted'))
  assert.strictEqual(projectFail.rows.date_coordination_application.length, 1)
  assert.strictEqual(projectFail.rows.date_submission_outbox.length, 1)
  assert.strictEqual(projectFail.rows.date_submission_outbox[0].status, 'pending')

  projectFail.publishCoordinationEvent = async () => { throw new Error('simulated projection failure') }
  projectFail.writeInboxNotification = async () => { throw new Error('should not matter') }
  const projected = await projectDateSubmission(committed.outbox.id, projectFail)
  assert.strictEqual(projected.projected, false)
  assert.strictEqual(projectFail.rows.date_submission_outbox[0].status, 'pending')
  assert.strictEqual(projectFail.rows.date_coordination_application.length, 1)

  // 3) Same request_id retry is idempotent
  const retry = await commitDateApplicationSubmission(input, projectFail)
  assert.strictEqual(retry.idempotent, true)
  assert.strictEqual(projectFail.rows.date_coordination_application.length, 1)
  assert.strictEqual(projectFail.rows.date_submission_outbox.length, 1)
  assert.strictEqual(String(retry.coordination.status), String(committed.coordination.status))

  // Result contract for handler consumers
  assert.strictEqual(committed.saved, true)
  assert.ok(['pending', 'projected'].includes(String(committed.notification_status || 'pending')))

  console.log('PASS date application submission is atomic and retryable')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
