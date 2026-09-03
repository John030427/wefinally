const crypto = require('crypto')
const { businessError } = require('./businessError')
const { isInternalQaAccount } = require('./testIdentityPolicy')
const { QA_REAL_DEVICE_MATCH_COHORT } = require('./qaRegistrationReplayPolicy')

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

function assertConfirmText(value) {
  if (String(value || '') !== QA_PAIR_RESET_CONFIRM_TEXT) {
    throw businessError('QA_PAIR_RESET_CONFIRM_REQUIRED', `请输入“${QA_PAIR_RESET_CONFIRM_TEXT}”`)
  }
}

function realQaUser(user) {
  if (!user || !(Number(user.id) > 0)) return false
  if (Number(user.is_test_fixture || 0) === 1 || String(user.profile_origin || '') === 'synthetic_fixture') return false
  return isInternalQaAccount(user)
    || user.qa_test_run_enabled === true
    || Number(user.qa_test_run_enabled || 0) === 1
    || String(user.qa_match_cohort || '') === QA_REAL_DEVICE_MATCH_COHORT
}

function resolveQaPair(actor, candidates) {
  const cohort = String(actor && actor.qa_match_cohort || QA_REAL_DEVICE_MATCH_COHORT)
  const users = (Array.isArray(candidates) ? candidates : [])
    .filter(realQaUser)
    .filter((user) => String(user.qa_match_cohort || '') === cohort)
    .filter((user, index, rows) => rows.findIndex((item) => Number(item.id) === Number(user.id)) === index)
    .sort((a, b) => Number(a.id) - Number(b.id))
  if (users.length !== 2) {
    throw businessError('QA_PAIR_RESET_AMBIGUOUS', '当前测试组必须恰好两名真实 QA 账号')
  }
  if (!users.some((user) => Number(user.id) === Number(actor && actor.id))) {
    throw businessError('QA_PAIR_RESET_FORBIDDEN', '当前账号不属于该双机测试组')
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
  QA_PAIR_RESET_CONFIRM_TEXT,
  assertConfirmText,
  resolveQaPair,
  preservedCollections
}
