const assert = require('assert')

const {
  MEMBER_STATUS,
  REAPPLY_COOLDOWN_DAYS,
  canPurchaseVip,
  canUseMatching,
  canSubmitApplication,
  missingApplicationFields,
  nextMemberStatus,
  normalizeMatchSettingInput,
  normalizeOccupation
} = require('../../miniprogram/cloudfunctions/api/lib/memberPolicy')

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000)
}

assert.strictEqual(canPurchaseVip(MEMBER_STATUS.APPROVED), true)
assert.strictEqual(canPurchaseVip(MEMBER_STATUS.PENDING_REVIEW), false)
assert.strictEqual(canUseMatching({ member_status: MEMBER_STATUS.APPROVED, vipActive: true }), true)
assert.strictEqual(canUseMatching({ member_status: MEMBER_STATUS.APPROVED, vipActive: false }), false)
assert.strictEqual(canUseMatching({ member_status: MEMBER_STATUS.PENDING_REVIEW, vipActive: true }), false)

assert.deepStrictEqual(canSubmitApplication({ member_status: MEMBER_STATUS.NEED_MORE_INFO }), { allowed: true, remainingDays: 0 })
assert.deepStrictEqual(canSubmitApplication({
  member_status: MEMBER_STATUS.REJECTED,
  member_status_updated_at: daysAgo(REAPPLY_COOLDOWN_DAYS - 1)
}), { allowed: false, remainingDays: 1 })
assert.deepStrictEqual(canSubmitApplication({
  member_status: MEMBER_STATUS.REJECTED,
  member_status_updated_at: daysAgo(REAPPLY_COOLDOWN_DAYS)
}), { allowed: true, remainingDays: 0 })

assert.deepStrictEqual(normalizeOccupation({ circleId: 7, description: '' }), {
  circleId: 7,
  description: ''
})
assert.throws(
  () => normalizeOccupation({ circleId: 0, description: '' }),
  /请填写职业描述/
)
assert.deepStrictEqual(normalizeOccupation({ circleId: 0, description: '工业设计师' }), {
  circleId: 0,
  description: '工业设计师'
})

const completeUser = {
  gender: 1,
  birth_year: 1992,
  height_range: '170-180cm',
  education: '本科',
  city: '深圳',
  marry_status: '未婚',
  baby_plan: '2-3年内',
  circle_id: 0,
  occupation_description: '工业设计师'
}
const completeSetting = {
  age_min: 26,
  age_max: 35,
  height_min: 155,
  height_max: 175,
  min_education: '本科',
  like_marry_status: '仅看未婚',
  like_baby_plan: '2-3年内',
  self_view_text: '我重视诚实沟通、稳定关系和共同成长，希望认真经营长期关系。',
  target_view_text: '期待对方愿意坦诚沟通，对婚姻负责，并能一起规划未来生活。'
}
assert.deepStrictEqual(missingApplicationFields(completeUser, completeSetting), [])
assert.deepStrictEqual(
  missingApplicationFields({ ...completeUser, occupation_description: '' }, completeSetting),
  ['职业描述']
)
assert.deepStrictEqual(
  missingApplicationFields(completeUser, { ...completeSetting, self_view_text: '' }),
  ['我的三观自述']
)

assert.strictEqual(nextMemberStatus(MEMBER_STATUS.PENDING_REVIEW, 'approve'), MEMBER_STATUS.APPROVED)
assert.strictEqual(nextMemberStatus(MEMBER_STATUS.PENDING_REVIEW, 'need_more_info'), MEMBER_STATUS.NEED_MORE_INFO)
assert.strictEqual(nextMemberStatus(MEMBER_STATUS.PENDING_REVIEW, 'reject'), MEMBER_STATUS.REJECTED)
assert.strictEqual(nextMemberStatus(MEMBER_STATUS.APPROVED, 'disable'), MEMBER_STATUS.DISABLED)
assert.throws(() => nextMemberStatus(MEMBER_STATUS.REJECTED, 'approve'), /当前状态不能执行/)

assert.deepStrictEqual(normalizeMatchSettingInput({
  prefer_age: '25-30岁',
  prefer_height: '170-180cm',
  prefer_education: '本科',
  my_values: '我的三观',
  expect_values: '期待三观'
}), {
  age_min: 25,
  age_max: 30,
  height_min: 170,
  height_max: 180,
  min_education: '本科',
  self_view_text: '我的三观',
  target_view_text: '期待三观'
})

console.log('PASS member review policy')
