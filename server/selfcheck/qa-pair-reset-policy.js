const assert = require('assert')
const {
  QA_PAIR_RESET_CONFIRM_TEXT,
  assertConfirmText,
  resolveQaPair,
  preservedCollections
} = require('../../miniprogram/cloudfunctions/api/lib/qaPairResetPolicy')

const actor = {
  id: 1,
  account_mode: 'internal_qa',
  profile_origin: 'real_user',
  qa_match_cohort: 'qa-real-device-registration-v1'
}
const partner = {
  id: 2,
  qa_test_run_enabled: true,
  profile_origin: 'real_user',
  qa_match_cohort: 'qa-real-device-registration-v1'
}

assert.strictEqual(QA_PAIR_RESET_CONFIRM_TEXT, '彻底清空本对测试数据')
assert.throws(() => assertConfirmText('重新开始本轮测试'), /彻底清空本对测试数据/)
assert.doesNotThrow(() => assertConfirmText(QA_PAIR_RESET_CONFIRM_TEXT))
assert.throws(() => resolveQaPair(actor, [actor]), /恰好两名/)
assert.throws(() => resolveQaPair(actor, [actor, partner, Object.assign({}, partner, { id: 3 })]), /恰好两名/)
assert.deepStrictEqual(resolveQaPair(actor, [partner, actor]).userIds, [1, 2])
assert.strictEqual(resolveQaPair(actor, [partner, actor]).pairKey, '1:2')
assert.strictEqual(resolveQaPair(actor, [partner, actor]).pairHash.length, 24)
assert(preservedCollections().includes('user'))
assert(preservedCollections().includes('user_match_setting'))
assert(preservedCollections().includes('user_evidence_chunk'))
assert(preservedCollections().includes('user_order'))
assert(preservedCollections().includes('partner_referral_attribution'))
assert(preservedCollections().includes('partner_commission_ledger'))

console.log('PASS QA pair reset policy')
