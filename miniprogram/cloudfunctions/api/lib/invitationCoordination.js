/**
 * First-date invitation product model.
 * Facts live here (cards, versions, evidence). LLM only explains them.
 */

const { STATUS, computeOverlap, PERIODS } = require('./dateCoordinationPolicy')

const STALE_INVITATION_MESSAGE = '对方刚刚更新了约会安排，请查看最新方案后再确认。'
const WAITING_PARTNER_MESSAGE = '当前正在等待对方回应。'
const DECLINED_PUBLIC_MESSAGE = '对方暂未接受本次约会邀请。'
const EXPIRED_PUBLIC_MESSAGE = '本次约会邀请暂未得到回应，协调已结束。'
const COORDINATING_WAITING_B_MESSAGE = '对方已接受约会邀请，目前正在补充自己的安排。'
const INITIATOR_INVITE_SENT_MESSAGE = '约会邀请已发送。当前正在等待对方回应。'

const PERIOD_LABELS = Object.freeze({
  morning: '上午',
  afternoon: '下午',
  evening: '傍晚',
  night: '晚上'
})
const BUDGET_LABELS = Object.freeze({
  'under-50': '50元以内',
  '50-100': '50–100元',
  '100-200': '100–200元',
  'over-200': '200元以上',
  flexible: '灵活'
})
const DURATION_LABELS = Object.freeze({
  'about-1h': '约1小时',
  '1-2h': '1–2小时',
  '2-3h': '2–3小时',
  flexible: '灵活'
})
const PAYMENT_LABELS = Object.freeze({
  aa: 'AA',
  partner_pays: '对方请客',
  self_pays: '我请客',
  flexible: '灵活',
  one_pays: '一方请客'
})
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const EVIDENCE_FIELDS = Object.freeze([
  'availability',
  'areas',
  'activities',
  'budget',
  'payment_preference',
  'duration'
])
const CANONICAL_JOURNEYS = Object.freeze([
  'accept_direct',
  'coordinate',
  'decline',
  'no_response',
  'accept_no_prefs',
  'legacy_queue'
])

function staleInvitationError() {
  const error = new Error(STALE_INVITATION_MESSAGE)
  error.code = 'STALE_INVITATION_VERSION'
  error.refresh_invitation = true
  return error
}

function publicInvitationProposal(application = {}) {
  return {
    availability: Array.isArray(application.availability) ? application.availability : [],
    areas: Array.isArray(application.areas) ? application.areas.slice() : [],
    activities: Array.isArray(application.activities) ? application.activities.slice() : [],
    budget: String(application.budget || ''),
    payment_preference: String(application.payment_preference || ''),
    duration: String(application.duration || '')
  }
}

function weekdayLabel(dateStr) {
  const date = new Date(`${String(dateStr || '').slice(0, 10)}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return String(dateStr || '')
  return WEEKDAYS[date.getUTCDay()]
}

function formatAvailability(availability) {
  return (Array.isArray(availability) ? availability : []).map((item) => {
    const periods = (item.periods || []).map((period) => PERIOD_LABELS[period] || period).join('、')
    return `${weekdayLabel(item.date)}${periods}`
  }).filter(Boolean).join('，')
}

function formatList(values) {
  return (Array.isArray(values) ? values : []).filter(Boolean).join(' / ')
}

function buildInvitationCard(proposal = {}, version = 1) {
  const snapshot = publicInvitationProposal(proposal)
  return {
    invitation_version: Number(version || proposal.invitation_version || 1),
    time_text: formatAvailability(snapshot.availability) || '待确认',
    area_text: formatList(snapshot.areas) || '待确认',
    activity_text: formatList(snapshot.activities) || '待确认',
    budget_text: BUDGET_LABELS[snapshot.budget] || snapshot.budget || '待确认',
    duration_text: DURATION_LABELS[snapshot.duration] || snapshot.duration || '待确认',
    payment_text: PAYMENT_LABELS[snapshot.payment_preference] || snapshot.payment_preference || '待确认',
    availability: snapshot.availability,
    areas: snapshot.areas,
    activities: snapshot.activities,
    budget: snapshot.budget,
    payment_preference: snapshot.payment_preference,
    duration: snapshot.duration
  }
}

function invitationVersionOf(coordination = {}, initiatorApp = null) {
  if (Number(coordination.invitation_version || 0) > 0) return Number(coordination.invitation_version)
  if (initiatorApp && Number(initiatorApp.preference_version || 0) > 0) {
    return Number(initiatorApp.preference_version)
  }
  return Number(coordination.coordination_version || 1)
}

function invitationProposalOf(coordination = {}, initiatorApp = null) {
  if (coordination.invitation_proposal && typeof coordination.invitation_proposal === 'object') {
    return publicInvitationProposal(coordination.invitation_proposal)
  }
  if (initiatorApp && initiatorApp.application) return publicInvitationProposal(initiatorApp.application)
  return publicInvitationProposal({})
}

function allExplicitEvidence() {
  return EVIDENCE_FIELDS.reduce((out, field) => {
    out[field] = 'explicit'
    return out
  }, {})
}

function evidenceFromChanges(changedFields = []) {
  const changed = new Set(changedFields)
  return EVIDENCE_FIELDS.reduce((out, field) => {
    out[field] = changed.has(field) ? 'explicit' : 'inherited'
    return out
  }, {})
}

function mergeInvitationWithOverrides(invitationProposal, overrides = {}) {
  const base = publicInvitationProposal(invitationProposal)
  const next = Object.assign({}, base)
  for (const field of EVIDENCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(overrides, field) && overrides[field] != null) {
      next[field] = overrides[field]
    }
  }
  return next
}

function explicitFields(evidence = {}) {
  return EVIDENCE_FIELDS.filter((field) => evidence[field] === 'explicit')
}

function inheritedFields(evidence = {}) {
  return EVIDENCE_FIELDS.filter((field) => evidence[field] === 'inherited')
}

function dimensionStatus(agreed, pending) {
  if (pending) return 'pending'
  return agreed ? 'agreed' : 'conflict'
}

function buildSharedCoordinationState(applicationA, applicationB, options = {}) {
  if (!applicationA) {
    return {
      ready: false,
      waiting: 'initiator_preference',
      headline: '等待发起方提出第一次约会建议',
      dimensions: []
    }
  }
  if (!applicationB) {
    return {
      ready: false,
      waiting: options.inviteeIntent === 'coordinate' ? 'invitee_preference' : 'partner_response',
      headline: options.inviteeIntent === 'coordinate'
        ? COORDINATING_WAITING_B_MESSAGE
        : WAITING_PARTNER_MESSAGE,
      dimensions: []
    }
  }
  const overlap = computeOverlap(applicationA, applicationB, { version: options.version || 1 })
  const missing = new Set(overlap.missing_dimensions || [])
  const times = (overlap.proposals || []).map((item) => `${weekdayLabel(item.date)}${PERIOD_LABELS[item.period] || item.period}`)
  const uniqueTimes = [...new Set(times)]
  const first = overlap.proposals && overlap.proposals[0]
  const dimensions = [
    {
      key: 'time',
      label: '时间',
      status: dimensionStatus(!missing.has('time'), false),
      display: missing.has('time') ? '还没有找到双方都接受的时间' : (uniqueTimes[0] || '已一致')
    },
    {
      key: 'activity',
      label: '活动',
      status: dimensionStatus(!missing.has('activity'), false),
      display: missing.has('activity') ? '还需要确认双方都接受的活动' : (first && first.activity) || '已一致'
    },
    {
      key: 'area',
      label: '区域',
      status: dimensionStatus(!missing.has('area'), false),
      display: missing.has('area') ? '还没有找到双方都接受的位置' : (first && first.area) || '已一致'
    },
    {
      key: 'budget',
      label: '预算',
      status: dimensionStatus(!missing.has('budget'), false),
      display: missing.has('budget') ? '仍需要确认预算' : (BUDGET_LABELS[first && first.budget] || (first && first.budget) || '已一致')
    },
    {
      key: 'duration',
      label: '时长',
      status: dimensionStatus(!missing.has('duration'), false),
      display: missing.has('duration') ? '仍需要确认时长' : (DURATION_LABELS[first && first.duration] || (first && first.duration) || '已一致')
    },
    {
      key: 'payment',
      label: '费用方式',
      status: dimensionStatus(!missing.has('payment'), false),
      display: missing.has('payment') ? '仍需要确认费用方式' : (PAYMENT_LABELS[first && first.payment_preference] || (first && first.payment_preference) || '已一致')
    }
  ]
  return {
    ready: true,
    waiting: '',
    headline: missing.size ? '当前协调情况' : '双方条件已经形成完整交集',
    has_full_overlap: missing.size === 0,
    missing_dimensions: overlap.missing_dimensions || [],
    dimensions
  }
}

function buildProposalCard(proposal) {
  if (!proposal) return null
  return {
    id: Number(proposal.id || 0),
    proposal_key: proposal.proposal_key || '',
    coordination_version: Number(proposal.coordination_version || 1),
    source: proposal.source || 'backend',
    date: proposal.date || '',
    period: proposal.period || '',
    area: proposal.area || '',
    activity: proposal.activity || '',
    budget: proposal.budget || '',
    payment_preference: proposal.payment_preference || '',
    duration: proposal.duration || '',
    time_text: proposal.date
      ? `${weekdayLabel(proposal.date)}${PERIOD_LABELS[proposal.period] || proposal.period || ''}`
      : '待确认',
    area_text: proposal.area || '待确认',
    activity_text: proposal.activity || '待确认',
    budget_text: BUDGET_LABELS[proposal.budget] || proposal.budget || '待确认',
    duration_text: DURATION_LABELS[proposal.duration] || proposal.duration || '待确认',
    payment_text: PAYMENT_LABELS[proposal.payment_preference] || proposal.payment_preference || '待确认'
  }
}

function buildDirectAcceptProposal(invitationProposal, version) {
  const snapshot = publicInvitationProposal(invitationProposal)
  const first = snapshot.availability[0] || { date: '', periods: [PERIODS[0]] }
  const period = (first.periods && first.periods[0]) || 'afternoon'
  return {
    proposal_key: `invite-v${version}-${first.date}-${period}-${snapshot.areas[0] || 'area'}-${snapshot.activities[0] || 'activity'}`,
    coordination_version: Number(version),
    date: first.date,
    period,
    area: snapshot.areas[0] || '',
    activity: snapshot.activities[0] || '',
    budget: snapshot.budget,
    payment_preference: snapshot.payment_preference,
    duration: snapshot.duration,
    status: 'active',
    source: 'direct_accept'
  }
}

function coordinatorWelcomeText(coordination = {}, role = '') {
  const status = String(coordination.status || '')
  if (status === STATUS.INVITING_PARTNER && role === 'initiator') {
    return '你的约会邀请已经发送。\n\n等待对方回应期间，你可以继续告诉我希望调整的时间、区域或其他安排。\n\n修改前我会先给出预览，确认后才更新你自己的建议方案。'
  }
  if (status === STATUS.INVITING_PARTNER && role === 'invitee') {
    return '请先查看对方的第一次约会邀请。你可以接受这个安排、和我协调其他安排，或选择这次暂不方便。'
  }
  if (status === STATUS.COLLECTING_PREFERENCES && role === 'invitee' && !coordination.my_application) {
    return '你不需要重新填写全部约会信息。\n\n如果大部分安排都可以，直接告诉我你希望调整的地方就可以。\n\n例如：“时间可以，但我更方便福田。”'
  }
  if ([STATUS.COLLECTING_PREFERENCES, STATUS.COMPUTING_OVERLAP, STATUS.NO_OVERLAP, STATUS.REPLANNING, STATUS.PROPOSING].includes(status)) {
    return '目前我正在根据双方已经确认的信息继续协调。\n\n已经一致的条件我不会再重复询问。你可以随时告诉我需要调整的地方。'
  }
  if (status === STATUS.WAITING_CONFIRMATIONS) {
    return '已经有一份来自系统的候选方案。请在协调页的方案卡片上确认或继续告诉我需要调整的地方。'
  }
  if (status === STATUS.ARRANGED) {
    return '双方已确认最终方案。我可以解释这次安排，但不能再修改。'
  }
  if (status === STATUS.INVITATION_DECLINED) {
    return '本次约会邀请对方暂未接受，协调已经结束。我可以说明结果，但不能再修改安排。'
  }
  if (status === STATUS.EXPIRED) {
    return '本次约会邀请暂未得到回应，协调已结束。我可以说明结果，但不能再修改安排。'
  }
  return '我是你的 AI 约会协调员。你可以告诉我希望调整的时间、区域、活动、预算或其他要求。修改前会先展示预览。'
}

function waitingCopyForInitiator(coordination = {}) {
  const status = String(coordination.status || '')
  const intent = String(coordination.invitee_intent || '')
  if (status === STATUS.INVITING_PARTNER) return INITIATOR_INVITE_SENT_MESSAGE
  if (status === STATUS.COLLECTING_PREFERENCES && intent === 'coordinate') return COORDINATING_WAITING_B_MESSAGE
  if (status === STATUS.INVITATION_DECLINED) return DECLINED_PUBLIC_MESSAGE
  if (status === STATUS.EXPIRED) return EXPIRED_PUBLIC_MESSAGE
  return ''
}

function resolveFixtureJourneyName(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'accept' || value === 'accept_direct' || value === 'b_accept_direct') return 'accept_direct'
  if (value === 'coordinate' || value === 'full_coordination' || value === 'b_coordinate') return 'coordinate'
  if (value === 'reject' || value === 'decline' || value === 'b_decline') return 'decline'
  if (value === 'no_response' || value === 'b_no_response') return 'no_response'
  if (value === 'accept_no_prefs' || value === 'b_accept_no_prefs') return 'accept_no_prefs'
  if (value === 'legacy_queue') return 'legacy_queue'
  return ''
}

function buildCoordinationViewModel(input = {}) {
  const status = String(input.status || '')
  const role = String(input.role || '')
  const hasOwnApplication = Boolean(input.my_application)
  const inviteeIntent = String(input.invitee_intent || '')
  const invitationCard = input.invitation_card || null
  const sharedCard = input.shared_coordination || null
  const proposalCard = input.proposal_card || null
  const confirmedByMe = Boolean(input.confirmed_by_me)
  const canRespond = Boolean(input.can_respond_invitation)
  const canOpenChat = Boolean(input.can_open_coordinator_chat)
  const isInvitee = role === 'invitee'
  const isInitiator = role === 'initiator'
  const terminal = ['arranged', 'invitation_declined', 'expired', 'cancelled', 'closed', 'manual_handoff'].includes(status)
  const inviting = status === STATUS.INVITING_PARTNER
  const coordinating = [
    STATUS.COLLECTING_PREFERENCES,
    STATUS.COMPUTING_OVERLAP,
    STATUS.NO_OVERLAP,
    STATUS.REPLANNING,
    STATUS.PROPOSING
  ].includes(status)
  const proposalReady = status === STATUS.WAITING_CONFIRMATIONS
  let viewState = 'active_coordination'
  if (status === STATUS.COLLECTING_INITIATOR) viewState = 'draft'
  else if (inviting && isInitiator) viewState = 'waiting_partner'
  else if (inviting && isInvitee) viewState = 'received_invitation'
  else if (proposalReady) viewState = 'proposal_ready'
  else if (status === STATUS.ARRANGED) viewState = 'arranged'
  else if (status === STATUS.INVITATION_DECLINED || status === STATUS.EXPIRED || status === STATUS.CANCELLED || status === STATUS.CLOSED) {
    viewState = 'result'
  } else if (coordinating) viewState = 'active_coordination'

  return {
    role,
    status,
    view_state: viewState,
    invitation_card: invitationCard,
    shared_coordination_card: sharedCard,
    proposal_card: proposalCard,
    result_card: viewState === 'result' || status === STATUS.ARRANGED
      ? {
        kind: status,
        title: status === STATUS.ARRANGED
          ? '最终安排'
          : (status === STATUS.EXPIRED ? '邀请已结束' : '邀请结果'),
        body: status === STATUS.ARRANGED
          ? '双方已确认最终方案。'
          : (status === STATUS.EXPIRED ? EXPIRED_PUBLIC_MESSAGE : DECLINED_PUBLIC_MESSAGE)
      }
      : null,
    show_coordinator_cta: Boolean(canOpenChat),
    show_accept_invitation: Boolean(canRespond && inviting && isInvitee),
    show_coordinate_instead: Boolean(canRespond && inviting && isInvitee),
    show_decline: Boolean(canRespond && inviting && isInvitee),
    show_confirm_proposal: Boolean(proposalReady && proposalCard),
    show_application_form: status === STATUS.COLLECTING_INITIATOR && isInitiator && !hasOwnApplication,
    show_optional_full_form: status === STATUS.COLLECTING_PREFERENCES && isInvitee && !hasOwnApplication,
    waiting_copy: waitingCopyForInitiator(input),
    partner_progress_copy: isInitiator && inviteeIntent === 'coordinate' && !input.partner_application_submitted
      ? COORDINATING_WAITING_B_MESSAGE
      : '',
    read_only: terminal,
    confirmed_by_me: confirmedByMe
  }
}

module.exports = {
  STALE_INVITATION_MESSAGE,
  WAITING_PARTNER_MESSAGE,
  DECLINED_PUBLIC_MESSAGE,
  EXPIRED_PUBLIC_MESSAGE,
  COORDINATING_WAITING_B_MESSAGE,
  INITIATOR_INVITE_SENT_MESSAGE,
  PERIOD_LABELS,
  BUDGET_LABELS,
  DURATION_LABELS,
  CANONICAL_JOURNEYS,
  staleInvitationError,
  publicInvitationProposal,
  buildInvitationCard,
  invitationVersionOf,
  invitationProposalOf,
  allExplicitEvidence,
  evidenceFromChanges,
  mergeInvitationWithOverrides,
  explicitFields,
  inheritedFields,
  buildSharedCoordinationState,
  buildProposalCard,
  buildDirectAcceptProposal,
  coordinatorWelcomeText,
  waitingCopyForInitiator,
  resolveFixtureJourneyName,
  buildCoordinationViewModel,
  formatAvailability,
  EVIDENCE_FIELDS
}
