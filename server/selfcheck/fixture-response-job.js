const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  delayHours,
  canScheduleFixtureDecline,
  scheduleFixtureDecline,
  processFixtureResponseJobs
} = require('../../miniprogram/cloudfunctions/api/lib/fixtureResponseService')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { canBootstrapCollection } = require('../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy')

const now = new Date('2026-08-14T08:00:00.000Z')
const qa = { id: 10, profile_origin: 'real_user', account_mode: 'internal_qa', member_status: 'approved', is_vip: 1, vip_expire_time: '2026-09-01' }
const real = { id: 11, profile_origin: 'real_user', account_mode: 'production', member_status: 'approved', is_vip: 1, vip_expire_time: '2026-09-01', gender: 2 }
const fixture = {
  id: 20,
  profile_origin: 'synthetic_fixture',
  is_test_fixture: 1,
  fixture_owner_user_id: 10,
  fixture_run_id: 'run-1',
  fixture_expires_at: '2026-08-16T00:00:00.000Z',
  allow_date_coordination: false,
  member_status: 'approved',
  is_vip: 1,
  vip_expire_time: '2026-09-01'
}
const syntheticActor = Object.assign({}, fixture, { id: 30, fixture_owner_user_id: 30 })

assert.strictEqual(canScheduleFixtureDecline(qa, fixture, now), true)
assert.strictEqual(canScheduleFixtureDecline(qa, real, now), false)
assert.strictEqual(canScheduleFixtureDecline(real, fixture, now), false)
assert.strictEqual(canScheduleFixtureDecline(syntheticActor, fixture, now), false)
assert.strictEqual(canScheduleFixtureDecline(qa, Object.assign({}, fixture, { fixture_owner_user_id: 99 }), now), false)
assert.strictEqual(canScheduleFixtureDecline(qa, Object.assign({}, fixture, { fixture_expires_at: '2026-08-01T00:00:00.000Z' }), now), false)

const firstDelay = delayHours('match:99', 'run-1')
assert.strictEqual(firstDelay, delayHours('match:99', 'run-1'))
assert.ok(firstDelay >= 2 && firstDelay <= 6)
assert.notStrictEqual(firstDelay, delayHours('match:98', 'run-1'))

const root = path.resolve(__dirname, '../..')
const collections = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/lib/collections.js'), 'utf8')
const apiIndex = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/index.js'), 'utf8')
const service = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/lib/fixtureResponseService.js'), 'utf8')
assert(collections.includes("fixture_response_job: 'fixture_response_jobs'"))
assert.strictEqual(canBootstrapCollection('fixture_response_job'), true)
assert(apiIndex.includes('processFixtureResponseJobs'))
assert(service.includes("source_type: 'fixture_simulation'"))
assert(!service.includes('sendSms'))
assert(!service.includes('subscribeMessage'))

function memory(seed = {}) {
  const tables = Object.assign({
    fixture_response_job: [],
    date_coordination_event: [],
    date_coordination: [],
    user: [qa, fixture, real],
    user_match_log: [{ id: 99, user_id: 10, match_user_id: 20 }]
  }, seed)
  let seq = 1
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  return {
    tables,
    currentUser: async () => qa,
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (tables[name] || []).filter((row) => !query || matches(row, query)),
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      if (name === 'fixture_response_job' && tables.fixture_response_job.some((row) => row.interaction_id === data.interaction_id)) {
        return tables.fixture_response_job.find((row) => row.interaction_id === data.interaction_id)
      }
      const row = { _id: `${name}_${seq}`, id: seq++, ...data }
      tables[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    claimIfStatus: async (name, doc, expected, data) => {
      if (!doc || doc.status !== expected) return null
      return Object.assign(doc, data)
    },
    now: () => now
  }
}

async function main() {
  const deps = memory()
  const job = await scheduleFixtureDecline({ actor: qa, target: fixture, interaction_id: 'match:99' }, deps)
  const replay = await scheduleFixtureDecline({ actor: qa, target: fixture, interaction_id: 'match:99' }, deps)
  assert.strictEqual(job.id, replay.id)
  assert.strictEqual(deps.tables.fixture_response_job.length, 1)
  assert.strictEqual(job.scheduled_at.getTime(), replay.scheduled_at.getTime())
  assert.ok(new Date(job.scheduled_at) - now >= 2 * 3600 * 1000)
  assert.ok(new Date(job.scheduled_at) - now <= 6 * 3600 * 1000)

  await assert.rejects(
    () => scheduleFixtureDecline({ actor: real, target: fixture, interaction_id: 'match:100' }, deps),
    /不能为该对象创建测试拒绝任务/
  )

  const later = new Date(job.scheduled_at)
  const processed = await processFixtureResponseJobs(deps, { now: later })
  assert.strictEqual(processed.delivered, 1)
  assert.strictEqual(processed.failed, 0)
  assert.strictEqual(deps.tables.date_coordination_event[0].source_type, 'fixture_simulation')
  assert.strictEqual(deps.tables.date_coordination_event[0].notify_sms, false)
  assert.strictEqual(deps.tables.date_coordination_event[0].create_human_ticket, false)
  assert.strictEqual(deps.tables.fixture_response_job[0].status, 'delivered')

  const replayProcess = await processFixtureResponseJobs(deps, { now: later })
  assert.strictEqual(replayProcess.delivered, 0)
  assert.strictEqual(deps.tables.date_coordination_event.length, 1)

  const failDeps = memory()
  await scheduleFixtureDecline({ actor: qa, target: fixture, interaction_id: 'match:fail' }, failDeps)
  failDeps.addWithId = async (name) => {
    if (name === 'date_coordination_event') throw new Error('event write failed')
    throw new Error('unexpected write')
  }
  failDeps.tables.fixture_response_job[0].scheduled_at = now
  const failed = await processFixtureResponseJobs(failDeps, { now })
  assert.strictEqual(failed.failed, 1)
  assert.strictEqual(failDeps.tables.fixture_response_job[0].status, 'failed')
  assert.strictEqual(failDeps.tables.date_coordination.length, 0)

  const concurrent = memory()
  await scheduleFixtureDecline({ actor: qa, target: fixture, interaction_id: 'match:cas' }, concurrent)
  concurrent.tables.fixture_response_job[0].scheduled_at = now
  const [one, two] = await Promise.all([
    processFixtureResponseJobs(concurrent, { now }),
    processFixtureResponseJobs(concurrent, { now })
  ])
  assert.strictEqual(one.delivered + two.delivered, 1)
  assert.strictEqual(concurrent.tables.date_coordination_event.length, 1)

  const realPair = createDateCoordinationHandlers({
    currentUser: async () => qa,
    byId: async (name, id) => name === 'user' && Number(id) === 11 ? real : (name === 'user_match_log' ? { id: 7, user_id: 10, match_user_id: 11 } : null),
    first: async (name) => name === 'date_coordination' ? null : (name === 'user_match_log' ? { id: 7, user_id: 10, match_user_id: 11 } : null),
    list: async () => [],
    addWithId: async (name, data) => {
      assert.notStrictEqual(name, 'fixture_response_job')
      return { id: 1, ...data }
    },
    updateByDoc: async (name, doc, data) => Object.assign({}, doc, data),
    now: () => now
  })
  const created = await realPair.create({ match_log_id: 7, match_user_id: 11 }, {})
  assert.ok(created)
  assert.strictEqual(created.test_simulation, undefined)

  const fixtureHandlers = createDateCoordinationHandlers(deps)
  const simulated = await fixtureHandlers.create({ match_log_id: 99, match_user_id: 20 }, {})
  assert.strictEqual(simulated.test_simulation, true)
  assert.strictEqual(simulated.fixture_response_job.response_type, 'polite_decline')
  assert.strictEqual(deps.tables.date_coordination.length, 0)
  console.log('PASS synthetic fixture declines are delayed, idempotent and never notify for real')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
