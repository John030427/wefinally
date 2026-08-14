const crypto = require('crypto')

const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVOKED: 'revoked'
})

const ACTIVATION_STATUS = Object.freeze({
  UNBOUND: 'unbound',
  BOUND: 'bound',
  UNBOUND_BY_ADMIN: 'unbound_by_admin'
})

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function normalizePhone(value) {
  let digits = String(value || '').trim().replace(/[^0-9]/g, '')
  if (digits.startsWith('0086')) digits = digits.slice(4)
  else if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2)
  if (!/^1[3-9][0-9]{9}$/.test(digits)) throw new Error('手机号格式无效')
  return digits
}

function maskPhone(value) {
  const phone = normalizePhone(value)
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function requireDigestSecret(secret) {
  const value = String(secret || '')
  if (value.length < 32) throw new Error('手机号摘要密钥至少需要32个字符')
  return value
}

function phoneDigest(value, secret) {
  return crypto.createHmac('sha256', requireDigestSecret(secret)).update(normalizePhone(value)).digest('hex')
}

function partnerCodes(sequence) {
  const value = Number(sequence)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('合伙人编号序号无效')
  const serial = String(value).padStart(4, '0')
  return {
    partner_code: `WF-P-${serial}`,
    promote_code: `WFP${serial}`
  }
}

function onboardingState(input = {}) {
  const candidate = input.candidate || null
  const partner = input.partner || null
  const currentUserId = number(input.currentUserId)
  if (candidate && candidate.review_status === REVIEW_STATUS.REVOKED) return 'revoked'
  if (candidate && candidate.review_status === REVIEW_STATUS.REJECTED) return 'rejected'
  if (candidate && candidate.review_status === REVIEW_STATUS.PENDING) return 'pending'
  if (partner && number(partner.status) === 2) return 'suspended'
  if (partner && number(partner.status) === 1 && currentUserId > 0 && number(partner.user_id) === currentUserId) return 'active'
  if (candidate && candidate.review_status === REVIEW_STATUS.APPROVED) return 'needs_verification'
  return 'not_applied'
}

function activationError(message) {
  const error = new Error(message)
  error.code = 403
  return error
}

function assertActivation(input = {}) {
  const candidate = input.candidate || null
  const currentUserId = number(input.currentUserId)
  const allowedActivationStates = new Set([ACTIVATION_STATUS.UNBOUND, ACTIVATION_STATUS.UNBOUND_BY_ADMIN])
  if (!candidate || candidate.review_status !== REVIEW_STATUS.APPROVED || !allowedActivationStates.has(String(candidate.activation_status || ''))) {
    throw activationError('手机号未获资格或验证不一致')
  }
  if (!currentUserId) throw activationError('当前用户身份无效')
  if (phoneDigest(input.verifiedPhone, input.secret) !== String(candidate.phone_digest || '')) {
    throw activationError('手机号未获资格或验证不一致')
  }
  if (input.partner && number(input.partner.user_id) > 0 && number(input.partner.user_id) !== currentUserId) {
    throw activationError('该合伙人资格已绑定其他微信用户')
  }
  if (input.partnerForUser && number(input.partnerForUser.id) !== number(input.partner && input.partner.id)) {
    throw activationError('当前用户已有合伙人身份')
  }
  return {
    candidate_id: number(candidate.id),
    user_id: currentUserId,
    phone_digest: String(candidate.phone_digest || '')
  }
}

function candidateDto(row = {}) {
  return {
    id: number(row.id),
    source: String(row.source || ''),
    phone_masked: String(row.phone_masked || ''),
    applicant_user_id: number(row.applicant_user_id),
    review_status: String(row.review_status || ''),
    activation_status: String(row.activation_status || ''),
    partner_id: number(row.partner_id),
    review_note: String(row.review_note || ''),
    create_time: row.create_time || null,
    update_time: row.update_time || null
  }
}

module.exports = {
  REVIEW_STATUS,
  ACTIVATION_STATUS,
  normalizePhone,
  maskPhone,
  phoneDigest,
  partnerCodes,
  onboardingState,
  assertActivation,
  candidateDto
}
