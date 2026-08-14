const assert = require('assert')
const {
  normalizePhone,
  maskPhone,
  phoneDigest,
  partnerCodes,
  onboardingState,
  assertActivation,
  candidateDto
} = require('../../miniprogram/cloudfunctions/api/lib/partnerOnboardingPolicy')

const secret = 'partner-phone-lookup-secret-for-selfcheck-2026'

assert.strictEqual(normalizePhone('+86 138-0000-1234'), '13800001234')
assert.strictEqual(normalizePhone('8613900005678'), '13900005678')
assert.throws(() => normalizePhone('Grace'), /手机号格式无效/)
assert.throws(() => normalizePhone('12800001234'), /手机号格式无效/)
assert.strictEqual(maskPhone('13800001234'), '138****1234')
assert.strictEqual(phoneDigest('13800001234', secret), phoneDigest('+86 138 0000 1234', secret))
assert.notStrictEqual(phoneDigest('13800001234', secret), phoneDigest('13900005678', secret))
assert.throws(() => phoneDigest('13800001234', 'short'), /手机号摘要密钥/)

assert.deepStrictEqual(partnerCodes(1), { partner_code: 'WF-P-0001', promote_code: 'WFP0001' })
assert.deepStrictEqual(partnerCodes(10000), { partner_code: 'WF-P-10000', promote_code: 'WFP10000' })
assert.throws(() => partnerCodes(0), /合伙人编号序号/)

const approved = {
  id: 10,
  source: 'roster',
  phone_digest: phoneDigest('13800001234', secret),
  phone_masked: '138****1234',
  review_status: 'approved',
  activation_status: 'unbound'
}

assert.strictEqual(onboardingState({}), 'not_applied')
assert.strictEqual(onboardingState({ candidate: { review_status: 'pending' } }), 'pending')
assert.strictEqual(onboardingState({ candidate: { review_status: 'rejected' } }), 'rejected')
assert.strictEqual(onboardingState({ candidate: approved }), 'needs_verification')
assert.strictEqual(onboardingState({ candidate: approved, partner: { status: 1, user_id: 7 }, currentUserId: 7 }), 'active')
assert.strictEqual(onboardingState({ candidate: approved, partner: { status: 2, user_id: 7 }, currentUserId: 7 }), 'suspended')
assert.strictEqual(onboardingState({ candidate: { ...approved, review_status: 'revoked' } }), 'revoked')

assert.deepStrictEqual(assertActivation({
  candidate: approved,
  verifiedPhone: '13800001234',
  currentUserId: 7,
  secret
}), { candidate_id: 10, user_id: 7, phone_digest: approved.phone_digest })
assert.throws(() => assertActivation({ candidate: approved, verifiedPhone: '13900005678', currentUserId: 7, secret }), /未获资格或验证不一致/)
assert.throws(() => assertActivation({ candidate: { ...approved, review_status: 'pending' }, verifiedPhone: '13800001234', currentUserId: 7, secret }), /未获资格或验证不一致/)
assert.throws(() => assertActivation({ candidate: approved, partner: { user_id: 8 }, verifiedPhone: '13800001234', currentUserId: 7, secret }), /已绑定其他微信用户/)
assert.throws(() => assertActivation({ candidate: approved, partnerForUser: { id: 99 }, verifiedPhone: '13800001234', currentUserId: 7, secret }), /当前用户已有合伙人身份/)

assert.deepStrictEqual(candidateDto({
  ...approved,
  phone: 'must-not-leak',
  review_note: '老板名单',
  applicant_user_id: 7
}), {
  id: 10,
  source: 'roster',
  phone_masked: '138****1234',
  applicant_user_id: 7,
  review_status: 'approved',
  activation_status: 'unbound',
  partner_id: 0,
  review_note: '老板名单',
  create_time: null,
  update_time: null
})

console.log('PASS partner passwordless onboarding policy')
