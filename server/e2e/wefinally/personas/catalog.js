'use strict'

const PSYCH_STABLE = {
  marriage_pace: '\u7a33\u5b9a\u63a8\u8fdb',
  conflict_style: '\u53ca\u65f6\u6c9f\u901a',
  security_space: '\u4eb2\u5bc6\u4e5f\u72ec\u7acb',
  family_boundary: '\u8fb9\u754c\u6e05\u6670',
  money_view: '\u5171\u540c\u89c4\u5212',
  career_family: '\u52a8\u6001\u5e73\u8861'
}

const PSYCH_DRIFT = {
  marriage_pace: '\u5148\u78e8\u5408\u518d\u5b9a',
  conflict_style: '\u51b7\u9759\u540e\u6c9f\u901a',
  security_space: '\u9ad8\u966a\u4f34\u611f',
  family_boundary: '\u5c0f\u5bb6\u5ead\u4f18\u5148',
  money_view: '\u7a33\u5065\u50a8\u84c4',
  career_family: '\u5bb6\u5ead\u4f18\u5148'
}

const VIEW_STABLE = '\u91cd\u89c6\u771f\u8bda\u8d23\u4efb\u7a33\u5b9a\u6c9f\u901a\u5171\u540c\u89c4\u5212\u751f\u6d3b\u5bb6\u5ead\u8fb9\u754c\u6e05\u6670'

function baseSetting(userId, overrides = {}) {
  return Object.assign({
    user_id: userId,
    age_min: 26,
    age_max: 38,
    height_min: null,
    height_max: null,
    min_education: '\u672c\u79d1',
    like_circle_ids: '1',
    like_marry_status: '',
    like_baby_plan: '3-5\u5e74\u5185',
    like_income: '',
    like_house_car: '',
    self_view_text: VIEW_STABLE,
    target_view_text: VIEW_STABLE,
    other_requirements: '',
    psych_profile_json: JSON.stringify(PSYCH_STABLE)
  }, overrides)
}

function baseUser(label, runId, overrides = {}) {
  const year = 2026
  const gender = overrides.gender || 1
  const birthYear = overrides.birth_year || (gender === 1 ? year - 32 : year - 29)
  return Object.assign({
    label,
    gender,
    birth_year: birthYear,
    height_range: gender === 1 ? '175-180cm' : '160-165cm',
    education: '\u672c\u79d1',
    circle_id: 1,
    city: '\u6df1\u5733',
    province_code: '440000',
    province_name: '\u5e7f\u4e1c\u7701',
    city_code: '440300',
    city_name: '\u6df1\u5733',
    baby_plan: '3-5\u5e74\u5185',
    house_car: '\u6709\u623f',
    income_range: '20-30\u4e07',
    marry_status: '\u672a\u5a5a',
    appearance_description: '\u5e72\u51c0\u6e05\u723d\uff0c\u559c\u6b22\u8fd0\u52a8',
    appearance_want: '\u5e72\u51c0\u6e05\u723d',
    member_status: 'approved',
    is_vip: 1,
    vip_expire_time: '2099-01-01T00:00:00.000Z',
    free_member: 1,
    status: 1,
    profile_origin: 'synthetic_fixture',
    is_test_fixture: 1,
    formal_match_hidden: 1,
    fixture_run_id: runId,
    e2e_run_id: runId,
    fixture_expires_at: '2099-01-01T00:00:00.000Z',
    allow_date_coordination: 1
  }, overrides)
}

const PERSONA_DEFS = {
  A: { role: 'PerfectMutual', gender: 1, scenario: 'match-success' },
  B: { role: 'PerfectMutual', gender: 2, scenario: 'match-success' },
  C: { role: 'AgeGateFail', gender: 1, birth_year: 1997, setting: { age_min: 24, age_max: 30 } },
  D: { role: 'AgeGateFail', gender: 2, birth_year: 1987 },
  E: {
    role: 'OneSided',
    gender: 1,
    setting: {
      self_view_text: '\u975e\u5e38\u91cd\u89c6\u966a\u4f34\u548c\u6bcf\u5929\u9ad8\u9891\u6c9f\u901a\u7a33\u5b9a\u63a8\u8fdb\u5c0f\u5bb6\u5ead\u4f18\u5148',
      target_view_text: '\u5fc5\u987b\u6bcf\u5929\u9ad8\u5f3a\u5ea6\u966a\u4f34\u5171\u540c\u89c4\u5212'
    }
  },
  F: {
    role: 'OneSided',
    gender: 2,
    setting: {
      self_view_text: '\u559c\u6b22\u72ec\u7acb\u7a7a\u95f4\u8fb9\u754c\u6e05\u6670\u4e8b\u4e1a\u4f18\u5148',
      target_view_text: '\u5fc5\u987b\u5c0a\u91cd\u4e2a\u4eba\u7a7a\u95f4\u8fb9\u754c\u6e05\u6670',
      psych_profile_json: JSON.stringify(PSYCH_DRIFT)
    }
  },
  G: { role: 'CoordConflict', gender: 1, fixture_journey: 'coordinate', date_pref: { areas: ['\u5357\u5c71'], activities: ['\u684c\u6e38'], payment_preference: 'aa' } },
  H: { role: 'CoordConflict', gender: 2, fixture_journey: 'coordinate', date_pref: { areas: ['\u798f\u7530'], activities: ['\u5496\u5561'], payment_preference: 'aa' } },
  I: { role: 'DirectAccept', gender: 1, fixture_journey: 'accept_direct' },
  J: { role: 'DirectAccept', gender: 2, fixture_journey: 'accept_direct', date_pref: { areas: ['\u798f\u7530'], activities: ['\u5496\u5561'], availability: [{ date: '2026-08-22', periods: ['afternoon'] }] } },
  K: { role: 'Decline', gender: 1 },
  L: { role: 'Decline', gender: 2, fixture_journey: 'decline' },
  M: { role: 'NoResponse', gender: 1 },
  N: { role: 'NoResponse', gender: 2, fixture_journey: 'no_response' },
  O: { role: 'PrimaryResolution', gender: 1, date_pref: { areas: ['\u5357\u5c71', '\u798f\u7530', '\u7f57\u6e56'] } },
  P: { role: 'PrimaryResolution', gender: 2, fixture_journey: 'coordinate', date_pref: { areas: ['\u798f\u7530', '\u7f57\u6e56'] } },
  Q: { role: 'PrivacyBoundary', gender: 1, private_note: '\u6211\u5bf9\u5bf9\u65b9\u6536\u5165\u6709\u70b9\u62c5\u5fc3\uff0c\u4f46\u4e0d\u8981\u76f4\u63a5\u544a\u8bc9\u4ed6\u3002' },
  R: { role: 'PrivacyBoundary', gender: 2, fixture_journey: 'coordinate', private_note: '\u4e0d\u60f3\u516c\u5f00\u7684\u4ea4\u901a\u4fe1\u606f\u548c\u81ea\u7531\u6587\u672c\u7559\u8a00' },
  S: { role: 'ProfileEvolution', gender: 2, scenario: 'profile-evolution' }
}

function allPersonaLabels() {
  return Object.keys(PERSONA_DEFS)
}

function getPersonaDef(label) {
  return PERSONA_DEFS[label] || null
}

function getPairs() {
  return [
    ['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H'], ['I', 'J'],
    ['K', 'L'], ['M', 'N'], ['O', 'P'], ['Q', 'R']
  ]
}

module.exports = {
  PSYCH_STABLE,
  PSYCH_DRIFT,
  baseSetting,
  baseUser,
  PERSONA_DEFS,
  allPersonaLabels,
  getPersonaDef,
  getPairs
}
