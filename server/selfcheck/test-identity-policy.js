const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  resolveTestIdentity,
  identityBadge,
  isSyntheticFixture,
  isInternalQaAccount,
  canEnterFormalCandidatePool,
  canUseFixtureForMatch,
  assertOfflineDatingAllowed,
  syntheticWriteDefaults,
  planProfileProvenance
} = require('../../miniprogram/cloudfunctions/api/lib/testIdentityPolicy')
const { projectUserIdentity } = require('../../miniprogram/cloudfunctions/api/agent/userIdentity')
const { createUserBackofficeService } = require('../../miniprogram/cloudfunctions/api/agent/userBackofficeService')

const now = new Date('2026-08-14T08:00:00.000Z')
const real = { id: 1, support_code: 'WF-000001', gender: 2, city: '深圳', openid: 'omOfficial' }
const qa = { id: 10, support_code: 'WF-000010', gender: 1, city: '汕头', openid: 'omQa', account_mode: 'internal_qa', profile_origin: 'real_user' }
const legacyQa = { id: 118, openid: 'dev_wefinally_local_openid', gender: 1, city: '深圳' }
const synthetic = {
  id: 20,
  is_test_fixture: 1,
  fixture_owner_user_id: 10,
  fixture_expires_at: '2026-08-15T08:00:00.000Z',
  allow_date_coordination: 0
}
const legacySynthetic = {
  id: 21,
  is_test_fixture: 1,
  ab_test_owner_user_id: 10,
  ab_test_expires_at: '2026-08-15T08:00:00.000Z'
}

assert.deepStrictEqual(resolveTestIdentity(real).kind, 'real_user')
assert.strictEqual(identityBadge(real), '真人用户')
assert.strictEqual(resolveTestIdentity(qa).kind, 'internal_qa')
assert.strictEqual(identityBadge(qa), '内部测试账号')
assert.strictEqual(resolveTestIdentity(qa).profile_origin, 'real_user')
assert.strictEqual(resolveTestIdentity(legacyQa).kind, 'internal_qa')
assert.strictEqual(resolveTestIdentity(synthetic).kind, 'synthetic_fixture')
assert.strictEqual(identityBadge(synthetic), '合成测试画像')
assert.strictEqual(resolveTestIdentity(legacySynthetic).kind, 'synthetic_fixture')
assert.strictEqual(resolveTestIdentity(legacySynthetic).fixture_owner_user_id, 10)
assert.strictEqual(isSyntheticFixture(qa), false)
assert.strictEqual(isInternalQaAccount(synthetic), false)
assert.strictEqual(isInternalQaAccount(qa), true)

assert.strictEqual(canEnterFormalCandidatePool(real), true)
assert.strictEqual(canEnterFormalCandidatePool(qa), true)
assert.strictEqual(canEnterFormalCandidatePool(synthetic), false)
assert.strictEqual(canUseFixtureForMatch(qa, synthetic, now), true)
assert.strictEqual(canUseFixtureForMatch(real, synthetic, now), false)
assert.strictEqual(canUseFixtureForMatch(qa, Object.assign({}, synthetic, { fixture_expires_at: '2026-08-13T08:00:00.000Z' }), now), false)
assert.strictEqual(canUseFixtureForMatch({ id: 11, account_mode: 'internal_qa' }, synthetic, now), false)
assert.throws(() => assertOfflineDatingAllowed(synthetic), /测试画像仅用于匹配效果验证/)
assert.doesNotThrow(() => assertOfflineDatingAllowed(qa))

const projected = projectUserIdentity(synthetic, { includeSensitive: false })
assert.strictEqual(projected.identity_kind, 'synthetic_fixture')
assert.strictEqual(projected.identity_badge, '合成测试画像')
assert.strictEqual(projected.profile_origin, 'synthetic_fixture')
assert.strictEqual(projected.openid, undefined)

const written = syntheticWriteDefaults({
  ownerUserId: 10,
  runId: 'run-1',
  expiresAt: '2026-08-15T08:00:00.000Z'
})
assert.strictEqual(written.profile_origin, 'synthetic_fixture')
assert.strictEqual(written.test_scope, 'matching')
assert.strictEqual(written.allow_date_coordination, false)
assert.strictEqual(written.fixture_owner_user_id, 10)
assert.strictEqual(written.is_test_fixture, 1)

const plan = planProfileProvenance([
  real,
  qa,
  { id: 30, is_test_fixture: 1, ab_test_owner_user_id: 10, name: 'Grace' },
  { id: 31, profile_origin: 'synthetic_fixture', fixture_owner_user_id: 10, is_test_fixture: 1 }
])
assert.strictEqual(plan.find((row) => row.id === 1), undefined)
assert.strictEqual(plan.find((row) => row.id === 31), undefined)
const fixturePlan = plan.find((row) => row.id === 30)
assert.strictEqual(fixturePlan.proposed.profile_origin, 'synthetic_fixture')
assert.strictEqual(fixturePlan.proposed.fixture_owner_user_id, 10)
assert.ok(!JSON.stringify(fixturePlan).includes('姓名'))
assert.ok(!plan.some((row) => /Grace|手机号|openid/i.test(JSON.stringify(row.reason || ''))))

async function main() {
  const tables = {
    user: [real, qa, legacyQa, synthetic],
    user_match_setting: [],
    user_match_log: [],
    user_order: [],
    member_application: [],
    partner: [],
    partner_referral_attribution: [],
    agent_session: [],
    agent_human_ticket: [],
    date_coordination: [],
    agent_notification_job: [],
    partner_user_audit_log: []
  }
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const service = createUserBackofficeService({
    now: () => now,
    list: async (name) => tables[name] || [],
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    addWithId: async (name, data) => { tables[name].push(data); return data },
    ensureUserSupportCode: async (user) => user.support_code || `WF-${String(user.id).padStart(6, '0')}`
  })
  const admin = { role: 'admin', admin_role: 'super_admin', id: 1 }
  const hidden = await service.listUsers(admin, {})
  assert.strictEqual(hidden.list.some((row) => row.identity_kind === 'synthetic_fixture'), false)
  const withTests = await service.listUsers(admin, { include_test: true })
  assert.strictEqual(withTests.list.some((row) => row.identity_kind === 'synthetic_fixture'), true)
  assert.strictEqual(withTests.list.find((row) => row.id === 10).identity_badge, '内部测试账号')
  const onlySynthetic = await service.listUsers(admin, { include_test: true, identity_kind: 'synthetic_fixture' })
  assert.ok(onlySynthetic.list.every((row) => row.identity_kind === 'synthetic_fixture'))

  const html = fs.readFileSync(path.resolve(__dirname, '../public/admin/index.html'), 'utf8')
  const fixtureJs = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/abMatchFixture.js'), 'utf8')
  const matchJs = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/match.js'), 'utf8')
  assert(html.includes('合成测试画像'))
  assert(html.includes('内部测试账号'))
  assert(html.includes('真人用户'))
  assert(html.includes('identity_kind'))
  assert(fixtureJs.includes('syntheticWriteDefaults') || fixtureJs.includes("profile_origin: 'synthetic_fixture'"))
  assert(matchJs.includes('canEnterFormalCandidatePool') || matchJs.includes('canUseFixtureForMatch'))
  console.log('PASS test identity distinguishes QA accounts from synthetic fixtures')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
