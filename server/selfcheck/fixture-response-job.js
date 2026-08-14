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
const reportWorker = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/report-worker/index.js'), 'utf8')
assert(collections.includes("fixture_response_job: 'fixture_response_jobs'"))
assert.strictEqual(canBootstrapCollection('fixture_response_job'), true)
assert(apiIndex.includes('processFixtureResponseJobs'))
assert(apiIndex.includes('assertInternalWorkerSecret(payload.worker_secret)'))
assert(reportWorker.includes('MATCH_WORKER_SECRET'))
assert(reportWorker.includes('worker_secret: workerSecret'))
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
  const deps = {
    tables,
    currentUser: async () => qa,
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (tables[name] || []).filter((row) => !query || matches(row, query)),
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      const row = { _id: `${name}_${seq}`, id: seq++, ...data }
      tables[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    now: () => now
  }
  deps.acquireJob = async (data) => {
    const existing = tables.fixture_response_job.find((row) => row.interaction_id === data.interaction_id)
    if (existing) return { created: false, job: existing }
    const job = { _id: `fixture_response_job_${seq}`, id: seq++, ...data }
    tables.fixture_response_job.push(job)
    return { created: true, job }
  }
  deps.acquireFixtureResponseJob = deps.acquireJob
  deps.listDue = async (timestamp, limit) => tables.fixture_response_job
    .filter((row) => (row.status === 'scheduled' && new Date(row.scheduled_at) <= timestamp)
      || (row.status === 'processing' && new Date(row.lease_expires_at) <= timestamp))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, limit)
  deps.claimJob = async (job, timestamp) => {
    const expired = job.status === 'processing' && new Date(job.lease_expires_at) <= timestamp
    if (job.status !== 'scheduled' && !expired) return null
    return Object.assign(job, {
      status: 'processing', lease_token: `lease-${job.id}`, lease_expires_at: new Date(timestamp.getTime() + 300000)
    })
  }
  deps.completeJob = async (job, event, timestamp) => {
    if (job.status === 'delivered') return job
    if (job.status !== 'processing' || job.lease_token !== `lease-${job.id}`) throw new Error('lost lease')
    await deps.addWithId('date_coordination_event', event)
    return Object.assign(job, { status: 'delivered', delivered_at: timestamp, lease_token: '', lease_expires_at: null })
  }
  deps.retryJob = async (job, error, timestamp) => Object.assign(job, {
    status: 'scheduled', scheduled_at: new Date(timestamp.getTime() + 300000), attempts: Number(job.attempts || 0) + 1,
    error_class: String(error && error.message || 'failed'), lease_token: '', lease_expires_at: null
  })
  return deps
}

async function main() {
  const deps = memory()
  const [job, replay] = await Promise.all([
    scheduleFixtureDecline({ actor: qa, target: fixture, interaction_id: 'match:99' }, deps),
    scheduleFixtureDecline({ actor: qa, target: fixture, interaction_id: 'match:99' }, deps)
  ])
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
  failDeps.completeJob = async () => { throw new Error('event write failed') }
  failDeps.tables.fixture_response_job[0].scheduled_at = now
  const failed = await processFixtureResponseJobs(failDeps, { now })
  assert.strictEqual(failed.failed, 1)
  assert.strictEqual(failDeps.tables.fixture_response_job[0].status, 'scheduled')
  assert.strictEqual(failDeps.tables.fixture_response_job[0].attempts, 1)
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

  const starvation = memory()
  for (let i = 0; i < 25; i += 1) {
    starvation.tables.fixture_response_job.push({ id: 100 + i, status: 'scheduled', scheduled_at: new Date(now.getTime() + 3600000) })
  }
  starvation.tables.fixture_response_job.push({ id: 999, status: 'scheduled', scheduled_at: now })
  const dueRows = await starvation.listDue(now, 20)
  assert.strictEqual(dueRows.length, 1)
  assert.strictEqual(dueRows[0].id, 999)

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
  deps.tables.fixture_response_job[0].status = 'delivered'
  const visible = await fixtureHandlers.fixtureResponse({ id: deps.tables.fixture_response_job[0].id }, {})
  assert.strictEqual(visible.fixture_response_job.status, 'delivered')
  assert.ok(visible.response_message.includes('不太方便见面'))
  const datePage = fs.readFileSync(path.join(root, 'miniprogram/pages/date-coordination/date-coordination.js'), 'utf8')
  const dateView = fs.readFileSync(path.join(root, 'miniprogram/pages/date-coordination/date-coordination.wxml'), 'utf8')
  assert(datePage.includes('refreshFixtureSimulation'))
  assert(dateView.includes('对方回复'))
  console.log('PASS synthetic fixture declines are delayed, idempotent and never notify for real')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
