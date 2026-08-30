const crypto = require('crypto')
const { isInternalQaAccount } = require('./testIdentityPolicy')

const QA_REGISTRATION_CONFIRM_TEXT = '重新注册测试资料'
const QA_REAL_DEVICE_MATCH_COHORT = 'qa-real-device-registration-v1'

function boolFlag(value) {
  return value === true || value === 1 || value === '1'
}

function canReplayRegistration(user = {}) {
  return boolFlag(user.qa_test_run_enabled) || isInternalQaAccount(user)
}

function cohortKey(user = {}) {
  return String(user.qa_match_cohort || '').trim()
}

function runId(user = {}) {
  return String(user.qa_match_run_id || '').trim()
}

function timestampOf(value) {
  if (value && typeof value.toDate === 'function') return timestampOf(value.toDate())
  if (value && Number.isFinite(Number(value._seconds))) return Number(value._seconds) * 1000
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : NaN
}

function createQaMatchRunId(userId, timestamp = new Date(), nonce = '') {
  const normalizedUserId = Number(userId)
  const at = timestampOf(timestamp)
  if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0 || !Number.isFinite(at)) {
    throw new Error('QA 匹配轮次参数无效')
  }
  const entropy = String(nonce || crypto.randomBytes(12).toString('hex'))
  const digest = crypto.createHash('sha256')
    .update(`${normalizedUserId}:${at}:${entropy}`)
    .digest('hex')
    .slice(0, 16)
  return `qarun_${normalizedUserId}_${at}_${digest}`
}

function qaRunKey(left = {}, right = {}) {
  if (!canReplayRegistration(left) || !canReplayRegistration(right)) return ''
  const cohort = cohortKey(left)
  if (!cohort || cohort !== cohortKey(right)) return ''
  const participants = [left, right]
    .map((user) => ({ id: Number(user.id), runId: runId(user) }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.runId)
    .sort((a, b) => a.id - b.id)
  if (participants.length !== 2 || participants[0].id === participants[1].id) return ''
  return `qarunpair_${crypto.createHash('sha256')
    .update(participants.map((item) => `${item.id}:${item.runId}`).join('|'))
    .digest('hex')
    .slice(0, 24)}`
}

function shouldExcludeHistoricalClaims(claims, left = {}, right = {}) {
  return (claims || []).some((claim) => shouldExcludeHistoricalPair(claim, left, right))
}

function shouldBlockUserForClaim(claim = {}, user = {}) {
  if (!canReplayRegistration(user) || !cohortKey(user) || !runId(user)) return true
  const claimAt = timestampOf(
    claim.created_at || claim.create_time || claim.claimed_at || claim.matched_at || claim.updated_at || claim.update_time
  )
  const runAt = timestampOf(user.qa_match_run_started_at)
  if (![claimAt, runAt].every(Number.isFinite)) return true
  return !(runAt > claimAt)
}

function shouldExcludeHistoricalPair(claim = {}, left = {}, right = {}) {
  if (!claim || !claim.pair_key) return false
  if (!canReplayRegistration(left) || !canReplayRegistration(right)) return true
  const cohort = cohortKey(left)
  if (!cohort || cohort !== cohortKey(right)) return true
  if (!runId(left) || !runId(right) || !qaRunKey(left, right)) return true
  const claimAt = timestampOf(
    claim.created_at || claim.create_time || claim.claimed_at || claim.matched_at || claim.updated_at || claim.update_time
  )
  const leftAt = timestampOf(left.qa_match_run_started_at)
  const rightAt = timestampOf(right.qa_match_run_started_at)
  if (![claimAt, leftAt, rightAt].every(Number.isFinite)) return true
  return !(leftAt > claimAt && rightAt > claimAt)
}

function parseGender(value) {
  if (value === '男' || Number(value) === 1) return 1
  if (value === '女' || Number(value) === 2) return 2
  return 0
}

function buildReplayRequestPatch(data = {}, timestamp = new Date()) {
  if (String(data.confirm_text || '').trim() !== QA_REGISTRATION_CONFIRM_TEXT) {
    throw new Error(`确认文字必须为“${QA_REGISTRATION_CONFIRM_TEXT}”`)
  }
  const requestId = String(data.request_id || '').trim()
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) throw new Error('重录请求编号无效')
  return {
    registration_replay_pending: 1,
    qa_registration_reset_request_id: requestId,
    qa_registration_reset_at: timestamp,
    qa_match_cohort: QA_REAL_DEVICE_MATCH_COHORT,
    match_status: 'idle',
    matched_partner_id: 0,
    matched_at: null
  }
}

function buildReplayCompletionPatch(data = {}, timestamp = new Date()) {
  return {
    gender: parseGender(data.gender),
    birth_year: Number(data.birth_year),
    height_range: data.height_range || '',
    education: data.education || '',
    circle_id: Number(data.primary_circle_id != null ? data.primary_circle_id : data.circle_id) || 0,
    occupation_description: String(data.occupation_description || '').trim(),
    city: data.city || '深圳',
    province_code: data.province_code || '',
    province_name: data.province_name || '',
    city_code: data.city_code || '',
    city_name: data.city_name || data.city || '深圳',
    country_code: data.country_code || 'CN',
    country_name: data.country_name || '中国',
    marry_status: data.marry_status || '未婚',
    baby_plan: data.baby_plan || '',
    income_range: data.income_range || '',
    house_car: data.house_car || '',
    appearance_description: data.appearance_description || '',
    appearance_want: '',
    appearance_tags: '',
    appearance_want_tags: '',
    registration_replay_pending: 0,
    qa_registration_replayed_at: timestamp,
    match_status: 'idle',
    matched_partner_id: 0,
    matched_at: null,
    last_match_setting_time: null
  }
}

function buildResetMatchSettingPatch() {
  return {
    age_min: null,
    age_max: null,
    height_min: null,
    height_max: null,
    min_education: '',
    like_circle_ids: '',
    like_marry_status: '',
    like_baby_plan: '',
    like_income: '',
    like_house_car: '',
    self_view_text: '',
    target_view_text: '',
    other_requirements: '',
    intent_profile_json: null,
    intent_profile_confirmed_at: null,
    psych_profile_json: null,
    ai_match_profile_json: null,
    ai_match_profile_status: '',
    last_edit_time: null
  }
}

module.exports = {
  QA_REGISTRATION_CONFIRM_TEXT,
  QA_REAL_DEVICE_MATCH_COHORT,
  canReplayRegistration,
  createQaMatchRunId,
  qaRunKey,
  shouldBlockUserForClaim,
  shouldExcludeHistoricalClaims,
  shouldExcludeHistoricalPair,
  buildReplayRequestPatch,
  buildReplayCompletionPatch,
  buildResetMatchSettingPatch
}
