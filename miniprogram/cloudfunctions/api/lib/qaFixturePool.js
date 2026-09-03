const crypto = require('crypto')
const { MEMBER_STATUS } = require('./memberPolicy')
const { syntheticWriteDefaults } = require('./testIdentityPolicy')
const { resolveFixtureJourney } = require('./syntheticPartnerJourney')

const FIXTURE_POOL = [
  { journey: 'accept_direct', label: '测试 · 直接接受', slot: 'A' },
  { journey: 'coordinate', label: '测试 · AI协调', slot: 'B' },
  { journey: 'decline', label: '测试 · 暂不方便', slot: 'C' },
  { journey: 'no_response', label: '测试 · 不回应', slot: 'D' },
  { journey: 'accept_no_prefs', label: '测试 · 接受未填偏好', slot: 'E' },
  { journey: 'manual_step', label: '测试 · 手动推进', slot: 'F', fixture_mode: 'manual_step', underlying_journey: 'coordinate' }
]

function heightPreference(value) {
  const values = String(value || '').match(/\d+/g) || []
  if (!values.length) return { min: null, max: null }
  const first = Number(values[0])
  const second = Number(values[1] || 0)
  if (second) return { min: Math.max(120, first - 5), max: Math.min(220, second + 5) }
  return { min: Math.max(120, first - 5), max: Math.min(220, first + 15) }
}

function normalizeJourneyInput(raw) {
  const journey = String(raw || 'coordinate').trim().toLowerCase()
  if (journey === 'manual_step') return 'manual_step'
  const resolved = resolveFixtureJourney({ fixture_journey: journey })
  return resolved || journey
}

function poolEntryForJourney(journey) {
  const normalized = normalizeJourneyInput(journey)
  return FIXTURE_POOL.find((row) => row.journey === normalized)
    || FIXTURE_POOL.find((row) => row.journey === 'coordinate')
}

function buildFixtureProfile(owner, ownerSetting, slot, journeySpec, now) {
  const candidateGender = Number(owner.gender) === 1 ? 2 : 1
  const targetAge = Number(ownerSetting.age_min || 20) <= 23
    && Number(ownerSetting.age_max || 65) >= 23
    ? 23
    : Math.max(18, Math.min(60, Number(ownerSetting.age_min || 23)))
  const ownerAge = now.getFullYear() - Number(owner.birth_year || now.getFullYear() - 30)
  const ownerHeight = heightPreference(owner.height_range)
  const candidateHeightMin = Number(ownerSetting.height_min || 160)
  const candidateHeightMax = Number(ownerSetting.height_max || candidateHeightMin + 10)
  const candidateHeight = `${candidateHeightMin}-${candidateHeightMax}cm`
  const selfText = String(ownerSetting.target_view_text || '').trim()
  const targetText = String(ownerSetting.self_view_text || '').trim()
  const resolvedJourney = journeySpec.underlying_journey || journeySpec.journey
  const fixtureMode = journeySpec.fixture_mode || 'auto'
  const openid = `qa_fixture_${owner.id}_${slot}_${journeySpec.journey}`
  return {
    user: Object.assign({
      openid,
      gender: candidateGender,
      birth_year: now.getFullYear() - targetAge,
      height_range: candidateHeight,
      education: owner.education || ownerSetting.min_education || '本科',
      circle_id: Number(owner.circle_id || 1),
      circle_name: owner.circle_name || '',
      city: owner.city || '深圳',
      marry_status: ownerSetting.like_marry_status === '不限'
        ? (owner.marry_status || '未婚')
        : (ownerSetting.like_marry_status || owner.marry_status || '未婚'),
      baby_plan: ownerSetting.like_baby_plan === '不限'
        ? (owner.baby_plan || '3-5年内')
        : (ownerSetting.like_baby_plan || owner.baby_plan || '3-5年内'),
      income_range: owner.income_range || '',
      house_car: owner.house_car || '',
      status: 1,
      member_status: MEMBER_STATUS.APPROVED,
      member_status_updated_at: now,
      is_vip: 1,
      vip_expire_time: new Date(now.getTime() + 7 * 86400000),
      vip_source: 'internal_test',
      free_member: 1,
      free_source: 'qa_fixture_pool',
      appearance_description: '干净清爽，日常穿搭简洁自然',
      appearance_want: '希望对方穿搭简洁、喜欢运动',
      appearance_tags: '',
      appearance_want_tags: '',
      fixture_label: journeySpec.label,
      nickname: journeySpec.label,
      ...syntheticWriteDefaults({
        ownerUserId: owner.id,
        runId: `qa_pool_${owner.id}_${slot}`,
        expiresAt: new Date(now.getTime() + 7 * 86400000)
      }),
      fixture_journey: resolvedJourney,
      fixture_mode: fixtureMode,
      qa_fixture_slot: slot,
      qa_fixture_pool: 1,
      allow_date_coordination: 1
    }),
    setting: {
      age_min: Math.max(18, ownerAge - 2),
      age_max: ownerAge + 2,
      height_min: ownerHeight.min,
      height_max: ownerHeight.max,
      min_education: owner.education || '',
      like_circle_ids: String(owner.circle_id || ''),
      like_marry_status: owner.marry_status || '不限',
      like_baby_plan: owner.baby_plan || '',
      like_house_car: '',
      like_income: '',
      self_view_text: selfText,
      target_view_text: targetText,
      psych_profile_json: ownerSetting.psych_profile_json || null,
      last_edit_time: now,
      is_test_fixture: 1
    }
  }
}

async function ensureQaFixturePool(owner, deps) {
  const ownerSetting = await deps.first('user_match_setting', { user_id: owner.id })
    || { age_min: 25, age_max: 40, height_min: 155, height_max: 185 }
  const now = deps.now()
  const existing = (await deps.list('user', { fixture_owner_user_id: Number(owner.id), qa_fixture_pool: 1 }, 20) || [])
  const byJourney = {}
  existing.forEach((row) => {
    const journey = resolveFixtureJourney(row)
    if (journey === 'coordinate' && String(row.fixture_mode || '') === 'manual_step') {
      byJourney.manual_step = row
    } else if (journey) {
      byJourney[journey] = row
    }
  })
  const created = []
  for (const spec of FIXTURE_POOL) {
    const lookupKey = spec.journey
    if (byJourney[lookupKey]) continue
    const profile = buildFixtureProfile(owner, ownerSetting, spec.slot, spec, now)
    const userId = await deps.addWithId('user', profile.user)
    await deps.addWithId('user_match_setting', Object.assign({}, profile.setting, { user_id: userId }))
    created.push(Object.assign({ id: userId }, profile.user))
    byJourney[lookupKey] = created[created.length - 1]
  }
  return { fixtures: Object.values(byJourney), created_count: created.length }
}

function filterCandidatesByJourney(candidates, journey) {
  const normalized = normalizeJourneyInput(journey)
  return (candidates || []).filter((row) => {
    const resolved = resolveFixtureJourney(row)
    if (normalized === 'manual_step') {
      return String(row.fixture_mode || '').toLowerCase() === 'manual_step'
    }
    return resolved === normalized
  })
}

module.exports = {
  FIXTURE_POOL,
  normalizeJourneyInput,
  poolEntryForJourney,
  ensureQaFixturePool,
  filterCandidatesByJourney
}
