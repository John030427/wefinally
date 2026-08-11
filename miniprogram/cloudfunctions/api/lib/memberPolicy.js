const { referralInput } = require('./partnerReferralPolicy')

const MEMBER_STATUS = Object.freeze({
  PENDING_PROFILE: 'pending_profile',
  PENDING_REVIEW: 'pending_review',
  NEED_MORE_INFO: 'need_more_info',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISABLED: 'disabled'
})

const REAPPLY_COOLDOWN_DAYS = 30

function memberStatus(user) {
  if (user && user.member_status) return user.member_status
  return Number(user && user.status) === 1
    ? MEMBER_STATUS.APPROVED
    : MEMBER_STATUS.PENDING_PROFILE
}

function canPurchaseVip(status) {
  return status === MEMBER_STATUS.APPROVED
}

function canUseMatching({ member_status, vipActive }) {
  return member_status === MEMBER_STATUS.APPROVED && vipActive === true
}

function canSubmitApplication(user, nowMs = Date.now()) {
  const status = memberStatus(user)
  if (status === MEMBER_STATUS.PENDING_PROFILE || status === MEMBER_STATUS.NEED_MORE_INFO) {
    return { allowed: true, remainingDays: 0 }
  }
  if (status !== MEMBER_STATUS.REJECTED) {
    return { allowed: false, remainingDays: 0 }
  }
  const updatedAt = new Date(user.member_status_updated_at || 0).getTime()
  const elapsedDays = Math.floor(Math.max(0, nowMs - updatedAt) / 86400000)
  const remainingDays = Math.max(0, REAPPLY_COOLDOWN_DAYS - elapsedDays)
  return { allowed: remainingDays === 0, remainingDays }
}

function normalizeOccupation({ circleId, description }) {
  const normalizedCircleId = Number(circleId || 0)
  const normalizedDescription = String(description || '').trim().slice(0, 100)
  if (normalizedCircleId === 0 && !normalizedDescription) {
    throw new Error('请选择职业圈层，选择其他时请填写职业描述')
  }
  return {
    circleId: normalizedCircleId,
    description: normalizedCircleId === 0 ? normalizedDescription : ''
  }
}

function missingApplicationFields(user = {}, setting = {}) {
  const missing = []
  const requiredUserFields = [
    ['gender', '性别'],
    ['birth_year', '出生年份'],
    ['height_range', '身高'],
    ['education', '学历'],
    ['city', '工作城市'],
    ['marry_status', '婚姻状况'],
    ['baby_plan', '婚育计划']
  ]
  requiredUserFields.forEach(([key, label]) => {
    if (!user[key]) missing.push(label)
  })
  if (Number(user.circle_id || 0) === 0 && !String(user.occupation_description || '').trim()) {
    missing.push('职业描述')
  }
  const requiredSettingFields = [
    ['age_min', '期待年龄'],
    ['age_max', '期待年龄'],
    ['height_min', '期待身高'],
    ['height_max', '期待身高'],
    ['min_education', '期待学历'],
    ['like_marry_status', '期待婚姻状况'],
    ['like_baby_plan', '期待婚育计划'],
    ['self_view_text', '我的三观自述'],
    ['target_view_text', '期待对方三观']
  ]
  requiredSettingFields.forEach(([key, label]) => {
    if (!setting[key] && !missing.includes(label)) missing.push(label)
  })
  return missing
}

function nextMemberStatus(currentStatus, action) {
  const transitions = {
    [MEMBER_STATUS.PENDING_REVIEW]: {
      approve: MEMBER_STATUS.APPROVED,
      need_more_info: MEMBER_STATUS.NEED_MORE_INFO,
      reject: MEMBER_STATUS.REJECTED
    },
    [MEMBER_STATUS.APPROVED]: {
      disable: MEMBER_STATUS.DISABLED
    },
    [MEMBER_STATUS.DISABLED]: {
      restore: MEMBER_STATUS.APPROVED
    }
  }
  const next = transitions[currentStatus] && transitions[currentStatus][action]
  if (!next) throw new Error('当前状态不能执行该审核操作')
  return next
}

async function resolveInvitation(code, first) {
  const referral = referralInput(code)
  if (!referral.code && !referral.partnerId) throw new Error('邀请制注册需要有效邀请码')
  const partner = referral.partnerId
    ? await first('partner', { id: referral.partnerId, status: 1 })
    : await first('partner', { promote_code: referral.code, status: 1 })
  if (!partner) throw new Error('邀请码无效或已停用')
  return partner
}

function numericRange(value, fallbackMax) {
  const numbers = String(value || '').match(/\d+/g) || []
  const min = Number(numbers[0] || 0) || null
  const max = Number(numbers[1] || 0) || (min && /以上/.test(String(value)) ? fallbackMax : null)
  return { min, max }
}

function normalizeMatchSettingInput(data = {}) {
  const age = numericRange(data.prefer_age, 65)
  const height = numericRange(data.prefer_height, 220)
  return {
    age_min: Number(data.age_min || age.min) || null,
    age_max: Number(data.age_max || age.max) || null,
    height_min: Number(data.height_min || height.min) || null,
    height_max: Number(data.height_max || height.max) || null,
    min_education: data.min_education || data.prefer_education || '',
    self_view_text: data.self_view_text || data.my_values || '',
    target_view_text: data.target_view_text || data.expect_values || '',
    other_requirements: String(data.other_requirements || data.otherRequirements || '').trim().slice(0, 500)
  }
}

module.exports = {
  MEMBER_STATUS,
  REAPPLY_COOLDOWN_DAYS,
  memberStatus,
  canPurchaseVip,
  canUseMatching,
  canSubmitApplication,
  missingApplicationFields,
  nextMemberStatus,
  resolveInvitation,
  normalizeMatchSettingInput,
  normalizeOccupation
}
