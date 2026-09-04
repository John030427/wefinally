'use strict'

const crypto = require('crypto')
const { isInternalQaAccount, isSyntheticFixture } = require('./testIdentityPolicy')

const DEFAULT_QA_COHORT = 'qa-real-device-registration-v1'
const QA_PAIR_RESET_CONFIRM_TEXT = '彻底清空本对测试数据'
const PRESERVED_COLLECTIONS = Object.freeze([
  'user',
  'user_match_setting',
  'user_identity_tag',
  'user_evidence_chunk',
  'user_order',
  'partner_referral_attribution',
  'partner_commission_ledger',
  'partner_binding',
  'member_application',
  'ai_chat_log'
])

function qaError(code, message, httpCode = 409) {
  const error = new Error(message)
  error.code = code
  error.errorCode = code
  error.httpCode = httpCode
  return error
}

function assertConfirmText(value) {
  if (String(value || '') !== QA_PAIR_RESET_CONFIRM_TEXT) {
    throw qaError('QA_PAIR_RESET_CONFIRM_REQUIRED', `请输入“${QA_PAIR_RESET_CONFIRM_TEXT}”`, 400)
  }
}

function realQaUser(user) {
  if (!user || !(Number(user.id) > 0) || isSyntheticFixture(user)) return false
  return isInternalQaAccount(user)
    || user.qa_test_run_enabled === true
    || Number(user.qa_test_run_enabled || 0) === 1
}

function syntheticCoordinationMarker(coordination) {
  return Boolean(String(
    coordination.synthetic_partner_mode
      || coordination.synthetic_partner_journey
      || coordination.synthetic_partner_user_id
      || coordination.fixture_journey
      || coordination.fixture_mode
      || ''
  ).trim())
}

function syntheticTestCoordination(coordination) {
  return Boolean(coordination)
    && Number(coordination.is_test_data || 0) === 1
    && syntheticCoordinationMarker(coordination)
}

function canResetCoordination(actor, coordination, participants = []) {
  if (!realQaUser(actor) || !coordination) return false
  if (![Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(actor.id))) return false
  if (syntheticCoordinationMarker(coordination)) return syntheticTestCoordination(coordination)
  const expectedIds = [Number(coordination.user_a_id), Number(coordination.user_b_id)]
  const users = expectedIds.map((id) => (participants || []).find((user) => Number(user && user.id) === id)).filter(Boolean)
  if (users.length !== 2 || users.some((user) => !realQaUser(user))) return false
  const cohorts = users.map((user) => String(user.qa_match_cohort || '').trim())
  return Boolean(cohorts[0] && cohorts[0] === cohorts[1] && cohorts[0] === String(actor.qa_match_cohort || cohorts[0]).trim())
}

function resolveQaPair(actor, candidates) {
  const cohort = String(actor && actor.qa_match_cohort || DEFAULT_QA_COHORT)
  const users = (Array.isArray(candidates) ? candidates : [])
    .filter(realQaUser)
    .filter((user) => String(user.qa_match_cohort || DEFAULT_QA_COHORT) === cohort)
    .filter((user, index, rows) => rows.findIndex((item) => Number(item.id) === Number(user.id)) === index)
    .sort((left, right) => Number(left.id) - Number(right.id))
  if (users.length !== 2) {
    throw qaError('QA_PAIR_RESET_AMBIGUOUS', '当前测试组必须恰好两名真实 QA 账号', 409)
  }
  if (!users.some((user) => Number(user.id) === Number(actor && actor.id))) {
    throw qaError('QA_PAIR_RESET_FORBIDDEN', '当前账号不属于该双机测试组', 403)
  }
  const userIds = users.map((user) => Number(user.id))
  const pairKey = userIds.join(':')
  const pairHash = crypto.createHash('sha256').update(`${cohort}:${pairKey}`).digest('hex').slice(0, 24)
  return { users, userIds, pairKey, pairHash, cohort }
}

function preservedCollections() {
  return PRESERVED_COLLECTIONS.slice()
}

module.exports = {
  DEFAULT_QA_COHORT,
  QA_PAIR_RESET_CONFIRM_TEXT,
  assertConfirmText,
  qaError,
  isRealQaUser: realQaUser,
  isSyntheticTestCoordination: syntheticTestCoordination,
  canResetCoordination,
  resolveQaPair,
  preservedCollections
}
