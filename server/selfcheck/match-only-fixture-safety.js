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
const owner = { id: 10 }
const fixture = {
  id: 20,
  is_test_fixture: 1,
  is_match_effect_fixture: 1,
  fixture_owner_user_id: 10,
  ab_test_expires_at: '2026-08-13T08:00:00.000Z',
  allow_date_coordination: 0
}

assert.strictEqual(isMatchOnlyFixture(fixture), true)
assert.strictEqual(canUseFixtureForMatch(owner, fixture, now), true)
assert.strictEqual(canUseFixtureForMatch({ id: 11 }, fixture, now), false)
assert.strictEqual(canUseFixtureForMatch(owner, Object.assign({}, fixture, {
  ab_test_expires_at: '2026-08-11T08:00:00.000Z'
}), now), false)
assert.throws(() => assertOfflineDatingAllowed(fixture), /测试画像仅用于匹配效果验证/)
assert.doesNotThrow(() => assertOfflineDatingAllowed({ id: 21, is_test_fixture: 0 }))

const match = read('miniprogram/cloudfunctions/api/handlers/match.js')
const dateCoordination = read('miniprogram/cloudfunctions/api/handlers/dateCoordination.js')
const meet = read('miniprogram/cloudfunctions/api/handlers/meet.js')
const detailPage = read('miniprogram/pages/match-detail/match-detail.wxml')
const detailScript = read('miniprogram/pages/match-detail/match-detail.js')

assert(match.includes('canUseFixtureForMatch(user, item'))
assert(match.includes('match_only_fixture: isMatchOnlyFixture(partner)'))
assert(dateCoordination.includes('assertOfflineDatingAllowed(partner)'))
assert(meet.includes('assertOfflineDatingAllowed(partner)'))
assert(detailScript.includes('matchOnlyFixture: detail.match_only_fixture === true'))
assert(detailPage.includes('detail.matchOnlyFixture'))
assert(detailPage.includes('测试画像仅用于匹配效果验证，不能发起约会或线下见面'))

async function main() {
  const users = [
    { id: 10, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-09-01T00:00:00.000Z' },
    Object.assign({}, fixture, { member_status: 'approved', is_vip: 1, vip_expire_time: '2026-09-01T00:00:00.000Z' })
  ]
  const deps = {
    currentUser: async () => users[0],
    byId: async (name, id) => {
      if (name === 'user') return users.find((row) => Number(row.id) === Number(id)) || null
      if (name === 'user_match_log' && Number(id) === 99) return { id: 99, user_id: 10, match_user_id: 20 }
      return null
    },
    first: async (name, query) => name === 'user_match_log' && Number(query.user_id) === 10 && Number(query.match_user_id) === 20
      ? { id: 99, user_id: 10, match_user_id: 20 }
      : null,
    list: async () => [],
    addWithId: async () => { throw new Error('测试画像不得创建约会记录') },
    updateByDoc: async () => { throw new Error('不应更新约会记录') },
    now: () => now
  }
  await assert.rejects(
    () => createDateCoordinationHandlers(deps).create({ match_log_id: 99, match_user_id: 20 }, {}),
    /测试画像仅用于匹配效果验证/
  )
  console.log('PASS match-only fixtures are owner-scoped and blocked from offline dating')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
