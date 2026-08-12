const assert = require('assert')
const {
  FIXTURE_BATCH_KEY,
  REALISTIC_MATCH_PROFILES,
  REALISTIC_MATCH_PAIRS,
  buildOwnedRealismProfiles
} = require('./fixtures/match-realism-profiles')
const { rankCandidates } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')

assert.strictEqual(FIXTURE_BATCH_KEY, 'wf_match_realism_20260812_v1')
assert.strictEqual(REALISTIC_MATCH_PROFILES.length, 20)
assert.strictEqual(REALISTIC_MATCH_PAIRS.length, 10)
assert.strictEqual(new Set(REALISTIC_MATCH_PROFILES.map((row) => row.fixture_key)).size, 20)
assert.strictEqual(REALISTIC_MATCH_PROFILES.filter((row) => row.gender === 1).length, 10)
assert.strictEqual(REALISTIC_MATCH_PROFILES.filter((row) => row.gender === 2).length, 10)

for (const row of REALISTIC_MATCH_PROFILES) {
  assert.strictEqual(row.is_test_fixture, 1)
  assert.strictEqual(row.is_match_effect_fixture, 1)
  assert.strictEqual(row.fixture_scope, 'matching_only')
  assert.strictEqual(row.allow_date_coordination, 0)
  assert.strictEqual(row.allow_meet_safety, 0)
  assert.strictEqual(row.member_status, 'approved')
  assert(row.appearance_description !== undefined)
  assert(row.appearance_want !== undefined)
  assert(row.setting && row.setting.target_view_text !== undefined)
  assert(row.setting && row.setting.other_requirements !== undefined)
}

assert(REALISTIC_MATCH_PROFILES.some((row) => row.setting.other_requirements.includes('汕头人')))
assert(REALISTIC_MATCH_PAIRS.some((row) => row.expected_tier === 'one_way_high'))
assert(REALISTIC_MATCH_PAIRS.some((row) => row.expected_tier === 'supplement_conflict'))
assert(REALISTIC_MATCH_PAIRS.some((row) => row.expected_tier === 'missing_data'))

const owned = buildOwnedRealismProfiles(88, {
  startUserId: 910000,
  referenceYear: 2026,
  expiresAt: '2026-08-20T00:00:00.000Z'
})
assert.strictEqual(owned[0].fixture_owner_user_id, 88)
assert.strictEqual(owned[0].id, 910000)
assert.strictEqual(owned[0].birth_year, 1995)
assert.strictEqual(owned[0].setting.user_id, 910000)
assert.throws(() => buildOwnedRealismProfiles(0), /user_id 无效/)

const byKey = Object.fromEntries(owned.map((row) => [row.fixture_key, row]))
function rankedPair(expectedTier) {
  const pair = REALISTIC_MATCH_PAIRS.find((row) => row.expected_tier === expectedTier)
  const a = byKey[pair.a]
  const b = byKey[pair.b]
  const settings = { [String(a.id)]: a.setting, [String(b.id)]: b.setting }
  return rankCandidates(a, [b], settings)[0] || null
}

assert.strictEqual(rankedPair('high_fit').quality.pass, true)
assert.strictEqual(rankedPair('hard_reject'), null)
assert.strictEqual(rankedPair('missing_data').quality.pass, false)

console.log('PASS 20 realistic matching-only profiles cover gender, tiers and Shantou requirements')
