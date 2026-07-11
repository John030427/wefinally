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
  return Number(user && user.status) === 1 ? MEMBER_STATUS.APPROVED : MEMBER_STATUS.PENDING_PROFILE
}

function canPurchaseVip(user) {
  return memberStatus(user) === MEMBER_STATUS.APPROVED
}

function canUseMatching(user, vipActive) {
  return canPurchaseVip(user) && vipActive === true
}

function canSubmitApplication(user, nowMs = Date.now()) {
  const status = memberStatus(user)
  if ([MEMBER_STATUS.PENDING_PROFILE, MEMBER_STATUS.NEED_MORE_INFO].includes(status)) {
    return { allowed: true, remainingDays: 0 }
  }
  if (status !== MEMBER_STATUS.REJECTED) return { allowed: false, remainingDays: 0 }
  const updatedAt = new Date(user.member_status_updated_at || 0).getTime()
  const elapsedDays = Math.floor(Math.max(0, nowMs - updatedAt) / 86400000)
  const remainingDays = Math.max(0, REAPPLY_COOLDOWN_DAYS - elapsedDays)
  return { allowed: remainingDays === 0, remainingDays }
}

function nextMemberStatus(currentStatus, action) {
  const transitions = {
    pending_review: { approve: 'approved', need_more_info: 'need_more_info', reject: 'rejected' },
    approved: { disable: 'disabled' },
    disabled: { restore: 'approved' }
  }
  const next = transitions[currentStatus] && transitions[currentStatus][action]
  if (!next) throw new Error('当前状态不能执行该审核操作')
  return next
}

module.exports = {
  MEMBER_STATUS,
  REAPPLY_COOLDOWN_DAYS,
  memberStatus,
  canPurchaseVip,
  canUseMatching,
  canSubmitApplication,
  nextMemberStatus
}
