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
  assert.strictEqual(row.fixture_access_mode, 'public_test_pool')
  assert.strictEqual(row.profile_origin, 'synthetic_fixture')
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

const publicViewer = {
  id: 1784818962143965,
  gender: 1,
  birth_year: 2000,
  height_range: '190cm以上',
  education: '博士',
  circle_id: 6,
  city: '深圳',
  marry_status: '未婚',
  baby_plan: '5年后',
  appearance_description: '日常穿搭简洁，肌肉男。帅',
  appearance_want: '对方普普通通'
}
const publicViewerSetting = {
  user_id: publicViewer.id,
  age_min: 20,
  age_max: 25,
  height_min: 160,
  height_max: 170,
  min_education: '大专',
  like_circle_ids: '',
  like_marry_status: '不限',
  like_baby_plan: '3-5年内',
  self_view_text: '三观无敌爆炸好，很善良，乐于助人，可以付出一切',
  target_view_text: '普普通通，善解人意，对我好，不做作，不矫情'
}
const publicSettings = Object.fromEntries(owned.map((row) => [String(row.id), row.setting]))
publicSettings[String(publicViewer.id)] = publicViewerSetting
const publicRanked = rankCandidates(publicViewer, owned, publicSettings)
assert(publicRanked.some((item) => item.quality && item.quality.pass), '公开测试池应至少有一个画像与 WF-000020 双向通过')

console.log('PASS 20 realistic matching-only profiles cover gender, tiers and Shantou requirements')
