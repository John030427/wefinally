const assert = require('assert')

const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { processCoordinationProjectionOutbox } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationProjectionWorker')

function memoryDeps() {
  const rows = {
    date_coordination: [{
      _id: 'coordination_1',
      id: 1,
      user_a_id: 1,
      user_b_id: 2,
      status: 'collecting_initiator',
      business_state: 'created',
      coordination_version: 1,
      application_deadline_at: new Date('2026-09-10T00:00:00.000Z')
    }],
    date_coordination_application: [],
    date_coordination_confirmation: [],
    date_coordination_proposal: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    agent_notification_job: [],
    coordination_projection_outbox: []
  }
  let sequence = 0
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return {
    rows,
    first: async (name, query) => (rows[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query)),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({ _id: `${prefix || name}_${++sequence}`, id: sequence }, data)
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    now: () => new Date('2026-09-04T08:00:00.000Z'),
    publishCoordinationEvent: async () => { throw new Error('projection temporarily unavailable') },
    writeInboxNotification: async () => { throw new Error('notification temporarily unavailable') }
  }
}

function application() {
  return {
    availability: [{ date: '2026-09-06', periods: ['evening'] }],
    areas: ['福田'],
    activities: ['吃饭'],
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: ''
  }
}

async function main() {
  const deps = memoryDeps()
  const handlers = createDateCoordinationHandlers(deps)
  const input = Object.assign({ coordination_id: 1 }, application())

  const first = await handlers.saveApplicationForUser(input, { id: 1 })
  assert.strictEqual(first.status, 'inviting_partner')
  assert.strictEqual(deps.rows.date_coordination_application.length, 1)
  assert.strictEqual(deps.rows.date_coordination[0].status, 'inviting_partner')
  assert.strictEqual(deps.rows.coordination_projection_outbox.length, 2)
  assert(deps.rows.coordination_projection_outbox.every((row) => row.status === 'pending'))

  const duplicate = await handlers.saveApplicationForUser(input, { id: 1 })
  assert.strictEqual(duplicate.status, 'inviting_partner')
  assert.strictEqual(deps.rows.date_coordination_application.length, 1)
  await assert.rejects(
    () => handlers.saveApplicationForUser(Object.assign({}, input, { activities: ['咖啡'] }), { id: 1 }),
    (error) => error.code === 'DATE_COORDINATION_STATE_INVALID' && error.errorCode === 'DATE_COORDINATION_STATE_INVALID'
  )
  await assert.rejects(
    () => handlers.saveApplicationForUser(Object.assign({}, input, { activities: ['不存在的活动'] }), { id: 1 }),
    (error) => error.code === 'DATE_APPLICATION_INVALID' && error.errorCode === 'DATE_APPLICATION_INVALID'
  )

  deps.publishCoordinationEvent = async () => ({ event: { id: 99 }, messages: [] })
  deps.writeInboxNotification = async () => ({ queued: true })
  const retry = await processCoordinationProjectionOutbox({ deps, limit: 10 })
  assert.deepStrictEqual(retry, { scanned: 2, completed: 2, failed: 0 })
  assert(deps.rows.coordination_projection_outbox.every((row) => row.status === 'completed'))

  console.log('PASS coordination core submission survives projection failure and is idempotent')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
