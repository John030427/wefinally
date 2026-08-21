'use strict'

/** Centralized human-readable status / next-action copy for backoffice UIs. */

const MEMBER_STATUS = {
  pending_profile: { label: '待完善资料', next: '等待用户完善资料后提交审核' },
  pending_review: { label: '待审核', next: '请审核该会员申请' },
  need_more_info: { label: '待补充资料', next: '等待用户按意见补充资料' },
  approved: { label: '已通过', next: '无需操作' },
  rejected: { label: '未通过', next: '如需复议请联系管理员' },
  disabled: { label: '已停用', next: '如需恢复请联系管理员' }
}

const USER_STATUS = {
  0: { label: '待审核', next: '请完成会员审核' },
  1: { label: '正常', next: '无需操作' },
  2: { label: '已停用', next: '确认是否需要恢复' },
  3: { label: '已结婚报备', next: '按报备流程处理' }
}

const COORDINATION_STATUS = {
  collecting_preferences: { label: '收集双方偏好', next: '等待双方填写安排' },
  collecting_initiator: { label: '等待发起方提交', next: '等待发起方完成申请' },
  inviting_partner: { label: '等待对方回应', next: '无需操作，系统将通知对方' },
  computing_overlap: { label: '正在协调', next: '等待系统生成可确认方案' },
  pending_primary_selection: { label: '等待用户选择建议安排', next: '可提醒用户选择时间/地点' },
  pending_confirmation: { label: '等待用户确认修改', next: '可提醒用户确认或暂不修改' },
  awaiting_a: { label: '等待 A 确认', next: '可提醒 A 确认方案' },
  awaiting_b: { label: '等待 B 确认', next: '可提醒 B 确认方案' },
  arranged: { label: '双方已确认', next: '跟进见面安排' },
  invitation_declined: { label: '邀请已婉拒', next: '可结束或重新发起' },
  expired: { label: '已过期', next: '如需继续请重新发起协调' },
  failed: { label: '协调异常', next: '建议人工接管' },
  manual_handoff: { label: '已转人工', next: '由人工客服继续处理' }
}

const MATCH_LIFECYCLE = {
  profile_ready: { label: '资料已完成', next: '等待系统匹配' },
  waiting_match: { label: '等待系统匹配', next: '无需操作' },
  no_match: { label: '本轮暂无合适匹配', next: '等待下一轮匹配' },
  matched: { label: '已匹配', next: '等待双方意向' },
  coordinating: { label: '约会协调中', next: '查看协调进度' },
  awaiting_a: { label: '等待 A 确认', next: '可提醒 A' },
  awaiting_b: { label: '等待 B 确认', next: '可提醒 B' },
  both_confirmed: { label: '双方已确认', next: '跟进线下见面' },
  error: { label: '匹配系统异常', next: '请查看异常队列' }
}

const PRIORITY = {
  P0: { label: '紧急', tone: 'danger' },
  P1: { label: '尽快处理', tone: 'warn' },
  P2: { label: '普通', tone: 'info' }
}

const ERROR_COPY = {
  TOKEN_EXPIRED: '登录已过期，请重新登录',
  STALE_COORDINATION_VERSION: '约会方案刚刚更新，请刷新后继续',
  STALE_INVITATION_VERSION: '邀请状态刚刚变化，请刷新后继续',
  NETWORK_ERROR: '网络连接失败，请稍后重试',
  UNAUTHORIZED: '无权访问该功能',
  FORBIDDEN: '当前角色无权执行此操作'
}

function memberStatusCopy(code) {
  return MEMBER_STATUS[code] || { label: String(code || '未知'), next: '请查看详情' }
}

function coordinationStatusCopy(code) {
  return COORDINATION_STATUS[code] || { label: String(code || '未知状态'), next: '请查看详情或人工跟进' }
}

function matchLifecycleCopy(code) {
  return MATCH_LIFECYCLE[code] || { label: String(code || '未知'), next: '请查看详情' }
}

function humanError(code, fallback) {
  if (!code) return fallback || '操作失败，请稍后重试'
  return ERROR_COPY[code] || ERROR_COPY[String(code).toUpperCase()] || fallback || String(code)
}

function priorityLabel(code) {
  return PRIORITY[code] || PRIORITY.P2
}

module.exports = {
  MEMBER_STATUS,
  USER_STATUS,
  COORDINATION_STATUS,
  MATCH_LIFECYCLE,
  PRIORITY,
  ERROR_COPY,
  memberStatusCopy,
  coordinationStatusCopy,
  matchLifecycleCopy,
  humanError,
  priorityLabel
}
