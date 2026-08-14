const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const {
  isMatchOnlyFixture,
  canUseFixtureForMatch,
  assertOfflineDatingAllowed
} = require('../../miniprogram/cloudfunctions/api/lib/testFixturePolicy')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')

const now = new Date('2026-08-12T08:00:00.000Z')
const owner = { id: 10, account_mode: 'internal_qa', profile_origin: 'real_user', member_status: 'approved', is_vip: 1, vip_expire_time: '2026-09-01T00:00:00.000Z' }
const fixture = {
  id: 20,
  profile_origin: 'synthetic_fixture',
  is_test_fixture: 1,
  is_match_effect_fixture: 1,
  fixture_owner_user_id: 10,
  fixture_expires_at: '2026-08-13T08:00:00.000Z',
  allow_date_coordination: false,
  member_status: 'approved',
  is_vip: 1,
  vip_expire_time: '2026-09-01T00:00:00.000Z'
}

assert.strictEqual(isMatchOnlyFixture(fixture), true)
assert.strictEqual(canUseFixtureForMatch(owner, fixture, now), true)
assert.throws(() => assertOfflineDatingAllowed(fixture), /测试画像仅用于匹配效果验证/)

const detailPage = read('miniprogram/pages/match-detail/match-detail.wxml')
assert(detailPage.includes('发起测试约会申请'))
assert(detailPage.includes('测试画像 / 模拟流程'))
assert(detailPage.includes('申请约会'))

async function main() {
  const jobs = []
  const deps = {
    currentUser: async () => owner,
    byId: async (name, id) => {
      if (name === 'user' && Number(id) === 20) return fixture
      if (name === 'user' && Number(id) === 10) return owner
      if (name === 'user_match_log' && Number(id) === 99) return { id: 99, user_id: 10, match_user_id: 20 }
      return null
    },
    first: async (name, query) => name === 'user_match_log' && Number(query.user_id) === 10
      ? { id: 99, user_id: 10, match_user_id: 20 }
      : null,
    list: async () => [],
    addWithId: async (name) => {
      assert.notStrictEqual(name, 'date_coordination')
      throw new Error(`unexpected add ${name}`)
    },
    acquireFixtureResponseJob: async (jobData) => {
      const existing = jobs.find((row) => row.interaction_id === jobData.interaction_id)
      if (existing) return { job: existing, created: false }
      const job = Object.assign({ id: jobs.length + 1, _id: `job_${jobs.length + 1}` }, jobData)
      jobs.push(job)
      return { job, created: true }
    },
    now: () => now
  }
  const handlers = createDateCoordinationHandlers(deps)
  const draft = await handlers.create({ match_log_id: 99, match_user_id: 20 }, {})
  assert.strictEqual(draft.test_simulation, true)
  assert.strictEqual(draft.await_application, true)
  assert.strictEqual(jobs.length, 0)

  const submitted = await handlers.submitFixtureApplication({
    match_log_id: 99,
    match_user_id: 20,
    application: {
      availability: [{ date: '2026-08-14', periods: ['evening'] }],
      areas: ['南区'],
      activities: ['咖啡'],
      budget: '50-100',
      payment_preference: 'aa',
      duration: '1-2h'
    }
  }, {})
  assert.strictEqual(submitted.test_simulation, true)
  assert.ok(submitted.fixture_response_job)
  assert.strictEqual(jobs.length, 1)
  assert.ok(!submitted.arranged)

  const replay = await handlers.submitFixtureApplication({
    match_log_id: 99,
    match_user_id: 20,
    application: {
      availability: [{ date: '2026-08-15', periods: ['evening'] }],
      areas: ['南区'],
      activities: ['咖啡'],
      budget: '50-100',
      payment_preference: 'aa',
      duration: '1-2h'
    }
  }, {})
  assert.strictEqual(replay.fixture_response_job.id, submitted.fixture_response_job.id)
  assert.strictEqual(jobs.length, 1)

  await assert.rejects(
    () => createDateCoordinationHandlers(Object.assign({}, deps, {
      currentUser: async () => ({ id: 11, profile_origin: 'real_user', account_mode: 'production', member_status: 'approved', is_vip: 1, vip_expire_time: '2026-09-01' })
    })).create({ match_log_id: 99, match_user_id: 20 }, {}),
    /测试画像仅用于匹配效果验证|仅可从自己的匹配记录/
  )

  console.log('PASS match-only fixtures support isolated simulated dating without real side effects')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
