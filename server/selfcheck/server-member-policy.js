const assert = require('assert')

const {
  memberStatus,
  canPurchaseVip,
  canUseMatching,
  canSubmitApplication,
  nextMemberStatus
} = require('../src/utils/memberPolicy')

assert.strictEqual(memberStatus({ status: 1 }), 'approved')
assert.strictEqual(memberStatus({ status: 1, member_status: 'pending_review' }), 'pending_review')
assert.strictEqual(canPurchaseVip({ member_status: 'approved' }), true)
assert.strictEqual(canPurchaseVip({ member_status: 'pending_review' }), false)
assert.strictEqual(canUseMatching({ member_status: 'approved' }, true), true)
assert.strictEqual(canUseMatching({ member_status: 'approved' }, false), false)
assert.strictEqual(canSubmitApplication({ member_status: 'need_more_info' }).allowed, true)
assert.strictEqual(canSubmitApplication({
  member_status: 'rejected',
  member_status_updated_at: new Date(Date.now() - 29 * 86400000)
}).allowed, false)
assert.strictEqual(nextMemberStatus('pending_review', 'need_more_info'), 'need_more_info')

console.log('PASS server member policy')
