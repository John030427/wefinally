const { MEMBER_STATUS, memberStatus, missingApplicationFields } = require('./memberPolicy')
const { isVipActive } = require('./format')
const { canEnterFormalCandidatePool } = require('./testIdentityPolicy')
const {
  QA_REAL_DEVICE_MATCH_COHORT,
  createQaMatchRunId
} = require('./qaRegistrationReplayPolicy')

function readiness(user = {}, setting = {}, timestamp = new Date()) {
  if (!canEnterFormalCandidatePool(user)) {
    return { ready: false, code: 'not_real_device_account', missing: [], message: '当前账号不能进入双真机匹配池' }
  }
  if (memberStatus(user) !== MEMBER_STATUS.APPROVED) {
    return { ready: false, code: 'member_not_approved', missing: [], message: '请先完成会员审核' }
  }
  if (!isVipActive(user, timestamp)) {
    return { ready: false, code: 'vip_inactive', missing: [], message: '请先开通有效 VIP' }
  }
  const missing = missingApplicationFields(user, setting)
  if (missing.length) {
    return {
      ready: false,
      code: 'profile_incomplete',
      missing,
      message: `请先补齐：${missing.join('、')}`
    }
  }
  return { ready: true, code: 'ready', missing: [], message: '资料已完整' }
}

function enrollmentPatch(user = {}, timestamp = new Date(), options = {}) {
  const cohort = String(user.qa_match_cohort || '').trim()
  if (cohort && cohort !== QA_REAL_DEVICE_MATCH_COHORT) {
    const error = new Error('当前账号属于其他测试批次，不能自动切换')
    error.code = 409
    throw error
  }
  if (cohort === QA_REAL_DEVICE_MATCH_COHORT
    && String(user.qa_match_run_id || '').trim()
    && options.forceNewRound !== true) return null
  return {
    qa_test_run_enabled: true,
    qa_match_cohort: QA_REAL_DEVICE_MATCH_COHORT,
    qa_match_run_id: createQaMatchRunId(user.id, timestamp),
    qa_match_run_started_at: timestamp,
    match_status: 'idle',
    matched_partner_id: 0,
    matched_at: null
  }
}

function isReadyPartner(viewer = {}, candidate = {}, setting = {}, timestamp = new Date()) {
  if (Number(viewer.id) === Number(candidate.id)) return false
  if (String(viewer.qa_match_cohort || '') !== QA_REAL_DEVICE_MATCH_COHORT) return false
  if (String(candidate.qa_match_cohort || '') !== QA_REAL_DEVICE_MATCH_COHORT) return false
  if (!String(candidate.qa_match_run_id || '').trim()) return false
  if (String(candidate.match_status || '') === 'matched') return false
  return readiness(candidate, setting, timestamp).ready
}

module.exports = {
  readiness,
  enrollmentPatch,
  isReadyPartner
}
