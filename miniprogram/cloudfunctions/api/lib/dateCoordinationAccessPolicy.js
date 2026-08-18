/**
 * Single deterministic access policy for date coordination.
 * UI hiding buttons is not a substitute for these checks.
 */

const { STATUS } = require('./dateCoordinationPolicy')

const ACTIVE_COORDINATION_STATUSES = Object.freeze([
  STATUS.COLLECTING_INITIATOR,
  STATUS.INVITING_PARTNER,
  STATUS.COLLECTING_PREFERENCES,
  STATUS.COMPUTING_OVERLAP,
  STATUS.PROPOSING,
  STATUS.NO_OVERLAP,
  STATUS.REPLANNING,
  STATUS.WAITING_CONFIRMATIONS
])

const TERMINAL_COORDINATION_STATUSES = Object.freeze([
  STATUS.ARRANGED,
  STATUS.INVITATION_DECLINED,
  STATUS.EXPIRED,
  STATUS.CANCELLED,
  STATUS.CLOSED,
  STATUS.MANUAL_HANDOFF
])

const WRITE_BLOCKED_STATUSES = Object.freeze([
  ...TERMINAL_COORDINATION_STATUSES
])

function statusOf(coordination) {
  return String((coordination && coordination.status) || '')
}

function isInitiator(coordination, user) {
  return Number(coordination && coordination.user_a_id) === Number(user && user.id)
}

function isInvitee(coordination, user) {
  return Number(coordination && coordination.user_b_id) === Number(user && user.id)
}

function isParticipant(coordination, user) {
  return isInitiator(coordination, user) || isInvitee(coordination, user)
}

function isTerminalCoordination(status) {
  return TERMINAL_COORDINATION_STATUSES.includes(String(status || ''))
}

function isActiveCoordination(status) {
  return ACTIVE_COORDINATION_STATUSES.includes(String(status || ''))
}

function canRespondInvitation(coordination, user) {
  if (!coordination || !isInvitee(coordination, user)) return false
  return statusOf(coordination) === STATUS.INVITING_PARTNER
}

function canModifyApplication(coordination, user, options = {}) {
  if (!coordination || !isParticipant(coordination, user)) return false
  const status = statusOf(coordination)
  if (WRITE_BLOCKED_STATUSES.includes(status)) return false
  if (status === STATUS.COLLECTING_INITIATOR) return isInitiator(coordination, user)
  if (status === STATUS.INVITING_PARTNER) {
    return isInitiator(coordination, user) && options.hasOwnApplication !== false
  }
  if ([
    STATUS.COLLECTING_PREFERENCES,
    STATUS.COMPUTING_OVERLAP,
    STATUS.NO_OVERLAP,
    STATUS.REPLANNING,
    STATUS.WAITING_CONFIRMATIONS,
    STATUS.PROPOSING
  ].includes(status)) return true
  return false
}

function canOpenCoordinatorChat(coordination, user, options = {}) {
  if (!coordination || !isParticipant(coordination, user)) return false
  const status = statusOf(coordination)
  if (status === STATUS.INVITATION_DECLINED) return false
  if (status === STATUS.INVITING_PARTNER) {
    return isInitiator(coordination, user) && Boolean(options.hasOwnApplication)
  }
  if (status === STATUS.COLLECTING_INITIATOR) return isInitiator(coordination, user)
  if (isActiveCoordination(status)) return true
  // Arranged / manual_handoff: history may be opened read-only.
  if ([STATUS.ARRANGED, STATUS.MANUAL_HANDOFF].includes(status)) return true
  return false
}

function canWriteCoordinatorAction(coordination, user, options = {}) {
  if (!canOpenCoordinatorChat(coordination, user, options)) return false
  return canModifyApplication(coordination, user, options)
}

function canRecoordinate(coordination, user) {
  if (!coordination || !isParticipant(coordination, user)) return false
  const status = statusOf(coordination)
  if (WRITE_BLOCKED_STATUSES.includes(status)) return false
  return [STATUS.NO_OVERLAP, STATUS.REPLANNING].includes(status)
}

function terminalWriteError(status) {
  if (status === STATUS.INVITATION_DECLINED) {
    return '对方暂未接受本次约会邀请。本次协调已结束，不能继续修改。'
  }
  if (status === STATUS.ARRANGED) {
    return '双方已确认最终方案，不能再修改本次协调。'
  }
  return '当前约会协调已经结束，不能修改'
}

function inviteeCoordinatorBlockedError() {
  return '请先接受或拒绝本次约会邀请，再进入 AI 约会协调。'
}

module.exports = {
  ACTIVE_COORDINATION_STATUSES,
  TERMINAL_COORDINATION_STATUSES,
  WRITE_BLOCKED_STATUSES,
  isInitiator,
  isInvitee,
  isParticipant,
  isTerminalCoordination,
  isActiveCoordination,
  canRespondInvitation,
  canModifyApplication,
  canOpenCoordinatorChat,
  canWriteCoordinatorAction,
  canRecoordinate,
  terminalWriteError,
  inviteeCoordinatorBlockedError
}
