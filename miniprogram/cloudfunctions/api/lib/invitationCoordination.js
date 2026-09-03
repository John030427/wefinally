/**
 * First-date invitation product model.
 * Facts live here (cards, versions, evidence). LLM only explains them.
 *
 * Preference = flexible multi-value range.
 * Primary Invitation Proposal = single explicit suggested arrangement.
 * Shared proposals use neutral payment (never self_pays / partner_pays).
 */

const { STATUS, PERIODS } = require('./dateCoordinationPolicy')
const { attachPublicError } = require('./businessError')
const { reconcileDerivedFields } = require('./dateApplicationDerivedFields')
const {
  PLAN_CONTRACT_VERSION,
  normalizeMeetingPlanFields,
  planReadiness,
  formatPlanTime
} = require('./meetingPlanPolicy')

const STALE_INVITATION_MESSAGE = '对方刚刚更新了约会安排，请查看最新方案后再确认。'
const WAITING_PARTNER_MESSAGE = '当前正在等待对方回应。'
const DECLINED_PUBLIC_MESSAGE = '对方暂未接受本次约会邀请。'
const EXPIRED_PUBLIC_MESSAGE = '本次约会邀请暂未得到回应，协调已结束。'
const COORDINATING_WAITING_B_MESSAGE = '对方已接受约会邀请，目前正在补充自己的安排。'
const INITIATOR_INVITE_SENT_MESSAGE = '约会邀请已发送。当前正在等待对方回应。'
const INVALID_INVITATION_VERSION_MESSAGE = '请提交邀请版本后再确认'
const PRIMARY_PROPOSAL_REQUIRED_MESSAGE = '请明确本次建议安排后再发送邀请'
const PRIMARY_PROPOSAL_INCOMPLETE_MESSAGE = '当前建议安排不完整，请先和 AI 协调其他安排，或等待发起方更新方案'

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
const PERSONAL_PAYMENT_LABELS = Object.freeze({
  aa: 'AA',
  partner_pays: '希望对方请客',
  self_pays: '我愿意请客',
  flexible: '灵活'
})
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const EVIDENCE_FIELDS = Object.freeze([
  'availability',
  'areas',
  'activities',
  'budget',
  'payment_preference',
  'duration',
  'start_time',
  'activity_venue',
  'meet_point'
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
  error.refresh_invitation = true
  return attachPublicError(error, 'STALE_INVITATION_VERSION')
}

function missingInvitationVersionError() {
  const error = new Error(INVALID_INVITATION_VERSION_MESSAGE)
  return attachPublicError(error, 'INVALID_INVITATION_VERSION')
}

function primaryProposalRequiredError(message) {
  const error = new Error(message || PRIMARY_PROPOSAL_REQUIRED_MESSAGE)
  return attachPublicError(error, 'PRIMARY_PROPOSAL_REQUIRED')
}

function primaryProposalIncompleteError(message) {
  const error = new Error(message || PRIMARY_PROPOSAL_INCOMPLETE_MESSAGE)
  return attachPublicError(error, 'PRIMARY_PROPOSAL_INCOMPLETE')
}

function publicInvitationProposal(application = {}) {
  const meetingPlan = normalizeMeetingPlanFields(application)
  const proposal = {
    availability: Array.isArray(application.availability) ? application.availability : [],
    areas: Array.isArray(application.areas) ? application.areas.slice() : [],
    activities: Array.isArray(application.activities) ? application.activities.slice() : [],
    budget: String(application.budget || ''),
    payment_preference: String(application.payment_preference || ''),
    duration: String(application.duration || '')
  }
  if (Number(application.contract_version || 0) >= PLAN_CONTRACT_VERSION
    || meetingPlan.start_time || meetingPlan.activity_venue || meetingPlan.meet_point) {
    Object.assign(proposal, {
      contract_version: PLAN_CONTRACT_VERSION,
      start_time: meetingPlan.start_time,
      activity_venue: meetingPlan.activity_venue,
      area_hint: String(application.area_hint || ''),
      activity_detail: String(application.activity_detail || ''),
      venue_resolution: application.venue_resolution && typeof application.venue_resolution === 'object'
        ? application.venue_resolution
        : undefined,
      meet_point: meetingPlan.meet_point
    })
  }
  return proposal
}

function weekdayLabel(dateStr) {
  const date = new Date(`${String(dateStr || '').slice(0, 10)}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return String(dateStr || '')
  return WEEKDAYS[date.getUTCDay()]
}

/** Shared card formatter: 8月22日（周六）下午 */
function formatDatePeriod(dateStr, period) {
  const raw = String(dateStr || '').slice(0, 10)
  const date = new Date(`${raw}T12:00:00.000Z`)
  if (!raw || Number.isNaN(date.getTime())) {
    const periodLabel = PERIOD_LABELS[period] || period || ''
    return [raw, periodLabel].filter(Boolean).join('') || '待确认'
  }
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const weekday = WEEKDAYS[date.getUTCDay()]
  const periodLabel = PERIOD_LABELS[period] || period || ''
  return `${month}月${day}日（${weekday}）${periodLabel}`
}

function formatAvailabilityRange(availability) {
  return (Array.isArray(availability) ? availability : []).map((item) => {
    const periods = (item.periods || []).map((period) => PERIOD_LABELS[period] || period).join('、')
    const raw = String(item.date || '').slice(0, 10)
    const date = new Date(`${raw}T12:00:00.000Z`)
    if (Number.isNaN(date.getTime())) return `${raw}${periods}`
    return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日（${WEEKDAYS[date.getUTCDay()]}）${periods}`
  }).filter(Boolean).join('，')
}

function formatAvailability(availability) {
  return formatAvailabilityRange(availability)
}

function formatList(values) {
  return (Array.isArray(values) ? values : []).filter(Boolean).join(' / ')
}

/**
 * Personal preference (viewer-relative) → neutral shared payment fact.
 */
function personalPaymentToNeutral(preference, selfUserId, partnerUserId) {
  const value = String(preference || '').trim()
  if (value === 'aa') return { payment_mode: 'aa', payer_user_id: 0 }
  if (value === 'flexible') return { payment_mode: 'flexible', payer_user_id: 0 }
  if (value === 'self_pays') {
    return { payment_mode: 'single_payer', payer_user_id: Number(selfUserId) || 0 }
  }
  if (value === 'partner_pays') {
    return { payment_mode: 'single_payer', payer_user_id: Number(partnerUserId) || 0 }
  }
  return { payment_mode: '', payer_user_id: 0 }
}

/**
 * Resolve overlap personal prefs into one neutral shared payment.
 * Compatible pairs: same / flexible / self↔partner (one pays the self_pays side).
 */
function resolveSharedPayment(paymentA, paymentB, userAId, userBId) {
  const a = String(paymentA || '')
  const b = String(paymentB || '')
  if (!a || !b) return { payment_mode: '', payer_user_id: 0 }
  if (a === 'aa' && (b === 'aa' || b === 'flexible')) return { payment_mode: 'aa', payer_user_id: 0 }
  if (b === 'aa' && (a === 'aa' || a === 'flexible')) return { payment_mode: 'aa', payer_user_id: 0 }
  if (a === 'flexible' && b === 'flexible') return { payment_mode: 'flexible', payer_user_id: 0 }
  if (a === 'flexible') return personalPaymentToNeutral(b, userBId, userAId)
  if (b === 'flexible') return personalPaymentToNeutral(a, userAId, userBId)
  if (a === 'self_pays' && b === 'partner_pays') {
    return { payment_mode: 'single_payer', payer_user_id: Number(userAId) }
  }
  if (a === 'partner_pays' && b === 'self_pays') {
    return { payment_mode: 'single_payer', payer_user_id: Number(userBId) }
  }
  if (a === b && (a === 'aa' || a === 'flexible')) return personalPaymentToNeutral(a, userAId, userBId)
  // Both want to pay / both want partner to pay → no shared agreement
  return { payment_mode: '', payer_user_id: 0 }
}

function normalizeNeutralPayment(input = {}, fallback = {}) {
  const mode = String(input.payment_mode || fallback.payment_mode || '').trim()
  const payer = Number(input.payer_user_id != null ? input.payer_user_id : (fallback.payer_user_id || 0)) || 0
  if (mode === 'aa' || mode === 'flexible') return { payment_mode: mode, payer_user_id: 0 }
  if (mode === 'single_payer' && payer > 0) return { payment_mode: 'single_payer', payer_user_id: payer }
  if (mode === 'payer_a' || mode === 'payer_b') {
    return { payment_mode: 'single_payer', payer_user_id: payer }
  }
  // Legacy shared one_pays without payer — incomplete until resolved
  if (String(input.payment_preference || '') === 'aa') return { payment_mode: 'aa', payer_user_id: 0 }
  if (String(input.payment_preference || '') === 'flexible') return { payment_mode: 'flexible', payer_user_id: 0 }
  return { payment_mode: mode || '', payer_user_id: payer }
}

/**
 * Neutral payment display — same text for A and B (no “对方请客”).
 */
function paymentFactText(payment = {}, context = {}) {
  const normalized = normalizeNeutralPayment(payment)
  if (normalized.payment_mode === 'aa') return 'AA'
  if (normalized.payment_mode === 'flexible') return '灵活'
  if (normalized.payment_mode === 'single_payer' && normalized.payer_user_id > 0) {
    const payer = Number(normalized.payer_user_id)
    if (context.user_a_id && payer === Number(context.user_a_id)) return '本次由发起方请客'
    if (context.user_b_id && payer === Number(context.user_b_id)) return '本次由受邀方请客'
    return '本次由一方请客'
  }
  // Never render personal perspective labels on shared cards
  const legacy = String(payment.payment_preference || '')
  if (legacy === 'aa') return 'AA'
  if (legacy === 'flexible') return '灵活'
  if (legacy === 'one_pays') return '本次由一方请客'
  if (legacy === 'partner_pays' || legacy === 'self_pays') return '待确认'
  return normalized.payment_mode || legacy || '待确认'
}

function publicPrimaryProposal(input = {}, context = {}) {
  if (!input || typeof input !== 'object') return null
  const date = String(input.date || '').slice(0, 10)
  const meetingPlan = normalizeMeetingPlanFields(input)
  const period = meetingPlan.period || String(input.period || '').trim()
  const area = String(input.area || '').trim()
  const activity = String(input.activity || '').trim()
  const budget = String(input.budget || '').trim()
  const duration = String(input.duration || '').trim()
  let payment = normalizeNeutralPayment(input)
  if (!payment.payment_mode && input.payment_preference && context.user_a_id) {
    payment = personalPaymentToNeutral(input.payment_preference, context.user_a_id, context.user_b_id)
  }
  const proposal = {
    date,
    period,
    area,
    activity,
    budget,
    duration,
    payment_mode: payment.payment_mode,
    payer_user_id: payment.payer_user_id
  }
  if (Number(input.contract_version || 0) >= PLAN_CONTRACT_VERSION
    || meetingPlan.start_time || meetingPlan.activity_venue || meetingPlan.meet_point) {
    Object.assign(proposal, {
      contract_version: PLAN_CONTRACT_VERSION,
      start_time: meetingPlan.start_time,
      activity_venue: meetingPlan.activity_venue,
      area_hint: String(input.area_hint || ''),
      activity_detail: String(input.activity_detail || ''),
      venue_resolution: input.venue_resolution && typeof input.venue_resolution === 'object'
        ? input.venue_resolution
        : undefined,
      meet_point: meetingPlan.meet_point
    })
  }
  return proposal
}

function isPrimaryProposalComplete(proposal) {
  if (!proposal) return false
  const paymentOk = proposal.payment_mode === 'aa'
    || proposal.payment_mode === 'flexible'
    || (proposal.payment_mode === 'single_payer' && Number(proposal.payer_user_id) > 0)
  const baseComplete = Boolean(
    proposal.date
    && PERIODS.includes(proposal.period)
    && proposal.area
    && proposal.activity
    && proposal.budget
    && proposal.duration
    && paymentOk
  )
  if (!baseComplete) return false
  if (Number(proposal.contract_version || 1) < PLAN_CONTRACT_VERSION) return true
  return planReadiness(proposal).ready
}

function isPrimaryProposalDraftComplete(proposal) {
  if (!proposal) return false
  const paymentOk = proposal.payment_mode === 'aa'
    || proposal.payment_mode === 'flexible'
    || (proposal.payment_mode === 'single_payer' && Number(proposal.payer_user_id) > 0)
  const baseComplete = Boolean(
    proposal.date
    && PERIODS.includes(proposal.period)
    && proposal.area
    && proposal.activity
    && proposal.budget
    && proposal.duration
    && paymentOk
  )
  if (!baseComplete) return false
  if (Number(proposal.contract_version || 1) < PLAN_CONTRACT_VERSION) return true
  return Boolean(proposal.start_time)
}

function preferenceHasSlot(prefs, date, period) {
  return (prefs.availability || []).some((item) => item.date === date && (item.periods || []).includes(period))
}

function primaryFitsPreferenceExceptPayment(primary, prefs) {
  if (!isPrimaryProposalDraftComplete(primary) || !prefs) return false
  if (!preferenceHasSlot(prefs, primary.date, primary.period)) return false
  if (!(prefs.areas || []).includes(primary.area)) return false
  if (!(prefs.activities || []).includes(primary.activity)) return false
  if (String(prefs.budget || '') !== String(primary.budget || '')) return false
  if (String(prefs.duration || '') !== String(primary.duration || '')) return false
  if (Number(primary.contract_version || 1) >= PLAN_CONTRACT_VERSION) {
    if (String(prefs.start_time || '') !== String(primary.start_time || '')) return false
    if (String(prefs.activity_venue || '') !== String(primary.activity_venue || '')) return false
    if (String(prefs.meet_point || '') !== String(primary.meet_point || '')) return false
  }
  return true
}

function primaryFitsPreference(primary, prefs, context = {}) {
  if (!primaryFitsPreferenceExceptPayment(primary, prefs)) return false
  const expected = personalPaymentToNeutral(
    prefs.payment_preference,
    context.user_a_id,
    context.user_b_id
  )
  if (!expected.payment_mode) return false
  if (String(primary.payment_mode || '') !== String(expected.payment_mode || '')) return false
  if (expected.payment_mode === 'single_payer'
    && Number(primary.payer_user_id || 0) !== Number(expected.payer_user_id || 0)) {
    return false
  }
  return true
}

function syncPrimaryPaymentFromPreference(primary, prefs, userAId, userBId) {
  if (!primary || !prefs) return null
  const payment = personalPaymentToNeutral(prefs.payment_preference, userAId, userBId)
  return publicPrimaryProposal(Object.assign({}, primary, payment), {
    user_a_id: userAId,
    user_b_id: userBId
  })
}

function isExpiredInvitationRow(row) {
  return String(row && row.status) === 'expired'
}

function invitingPartnerDeadlinePassed(row, timestamp) {
  return String(row && row.status) === 'inviting_partner'
    && Boolean(row && row.invitation_deadline_at)
    && new Date(row.invitation_deadline_at).getTime() <= new Date(timestamp).getTime()
}

async function persistExpiredInvitationRecord(row, updateFn) {
  if (isExpiredInvitationRow(row)) {
    return { expired: true, coordination: row, idempotent: true }
  }
  const updated = await updateFn({
    status: 'expired',
    business_state: 'expired'
  })
  return { expired: true, coordination: updated, idempotent: false }
}

function invalidPrimarySelectionError(message) {
  const error = new Error(message || '本次建议安排必须落在你当前可接受范围内')
  return attachPublicError(error, 'INVALID_PRIMARY_SELECTION')
}

function primaryResolutionRequiredError(message) {
  const error = new Error(message || '请先确认本次建议安排后再修改')
  return attachPublicError(error, 'PRIMARY_RESOLUTION_REQUIRED')
}

function cleanPrimarySelection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out = {}
  if (input.date) out.date = String(input.date).slice(0, 10)
  if (input.period) out.period = String(input.period).trim()
  if (input.area) out.area = String(input.area).trim()
  if (input.activity) out.activity = String(input.activity).trim()
  return Object.keys(out).length ? out : null
}

function flattenAvailabilitySlots(prefs) {
  const slots = []
  for (const item of prefs && prefs.availability || []) {
    const date = String(item && item.date || '').slice(0, 10)
    for (const period of item && item.periods || []) {
      if (date && PERIODS.includes(period)) slots.push({ date, period })
    }
  }
  return slots
}

function buildPrimaryResolutionPrompt(fields) {
  const parts = (fields || []).map((item) => {
    if (item.field === 'area') {
      const options = (item.options || []).map(String)
      if (options.length === 2) return `你这次更希望先建议${options[0]}还是${options[1]}？`
      return `你这次更希望先建议哪个区域：${options.join('、')}？`
    }
    if (item.field === 'activity') {
      const options = (item.options || []).map(String)
      if (options.length === 2) return `你这次更希望先建议${options[0]}还是${options[1]}？`
      return `你这次更希望先建议哪个活动：${options.join('、')}？`
    }
    if (item.field === 'time') {
      const labels = (item.options || []).map((opt) => (
        opt && opt.label || formatDatePeriod(opt && opt.date, opt && opt.period)
      ))
      if (labels.length === 2) return `你这次更希望先建议${labels[0]}还是${labels[1]}？`
      return `你这次更希望先建议哪个时间：${labels.join('、')}？`
    }
    return '请确认本次建议安排'
  }).filter(Boolean)
  if (!parts.length) return '请确认本次建议安排后再继续。'
  return `可以，我已经按你的新条件更新了可接受范围。${parts.join('')}`
}

function resolvePrimaryAfterPreferenceChange(previous, prefs, context = {}, selection = null) {
  const fields = []
  const next = previous && typeof previous === 'object' ? Object.assign({}, previous) : {}
  const slots = flattenAvailabilitySlots(prefs)
  const areas = Array.isArray(prefs && prefs.areas) ? prefs.areas.slice() : []
  const activities = Array.isArray(prefs && prefs.activities) ? prefs.activities.slice() : []
  const sel = cleanPrimarySelection(selection) || {}

  if (sel.date || sel.period) {
    const date = sel.date || next.date
    const period = sel.period || next.period
    if (!preferenceHasSlot(prefs, date, period)) {
      throw invalidPrimarySelectionError('所选时间不在当前可接受范围内')
    }
    next.date = date
    next.period = period
  } else if (previous && preferenceHasSlot(prefs, previous.date, previous.period)) {
    next.date = previous.date
    next.period = previous.period
  } else if (slots.length === 1) {
    next.date = slots[0].date
    next.period = slots[0].period
  } else {
    fields.push({
      field: 'time',
      options: slots.map((slot) => ({
        date: slot.date,
        period: slot.period,
        label: formatDatePeriod(slot.date, slot.period)
      }))
    })
  }

  if (sel.area) {
    if (!areas.includes(sel.area)) throw invalidPrimarySelectionError('所选区域不在当前可接受范围内')
    next.area = sel.area
  } else if (previous && areas.includes(previous.area)) {
    next.area = previous.area
  } else if (areas.length === 1) {
    next.area = areas[0]
  } else {
    fields.push({ field: 'area', options: areas.slice() })
  }

  if (sel.activity) {
    if (!activities.includes(sel.activity)) throw invalidPrimarySelectionError('所选活动不在当前可接受范围内')
    next.activity = sel.activity
  } else if (previous && activities.includes(previous.activity)) {
    next.activity = previous.activity
  } else if (activities.length === 1) {
    next.activity = activities[0]
  } else {
    fields.push({ field: 'activity', options: activities.slice() })
  }

  next.budget = String(prefs && prefs.budget || '')
  next.duration = String(prefs && prefs.duration || '')
  next.contract_version = Number(prefs && prefs.contract_version || next.contract_version || 1)
  next.start_time = String(prefs && prefs.start_time || '')
  next.activity_venue = String(prefs && prefs.activity_venue || '')
  next.meet_point = String(prefs && prefs.meet_point || '')
  const required = fields.length > 0
  const synced = syncPrimaryPaymentFromPreference(next, prefs, context.user_a_id, context.user_b_id)
  const primary = synced || publicPrimaryProposal(next, context)
  if (!required && Number(primary && primary.contract_version || 1) >= PLAN_CONTRACT_VERSION) {
    const readiness = planReadiness(primary)
    if (!readiness.ready) {
      throw primaryProposalIncompleteError(
        readiness.conflict
          ? readiness.conflict.message
          : '请补充具体时间和活动场地后再确认方案'
      )
    }
  }
  return {
    required,
    fields,
    primary: required ? null : primary,
    prompt: required ? buildPrimaryResolutionPrompt(fields) : '',
    selection: Object.keys(sel).length ? sel : null
  }
}

function invitationAlreadyRespondedError() {
  const error = new Error('对方刚刚回应了邀请，请查看最新协调状态。')
  error.refresh_invitation = true
  return attachPublicError(error, 'INVITATION_ALREADY_RESPONDED')
}

function invitationExpiredError(message) {
  const error = new Error(message || EXPIRED_PUBLIC_MESSAGE)
  return attachPublicError(error, 'INVITATION_EXPIRED')
}

function preferenceNeedsExplicitPrimary(prefs = {}) {
  const availability = Array.isArray(prefs.availability) ? prefs.availability : []
  const periodCount = availability.reduce((sum, item) => sum + (item.periods || []).length, 0)
  if (availability.length !== 1 || periodCount !== 1) return true
  if ((prefs.areas || []).length !== 1) return true
  if ((prefs.activities || []).length !== 1) return true
  return false
}

function derivePrimaryFromSingletonPrefs(prefs, userAId, userBId) {
  if (preferenceNeedsExplicitPrimary(prefs)) return null
  const slot = prefs.availability[0]
  const payment = personalPaymentToNeutral(prefs.payment_preference, userAId, userBId)
  return publicPrimaryProposal({
    date: slot.date,
    period: slot.periods[0],
    area: prefs.areas[0],
    activity: prefs.activities[0],
    budget: prefs.budget,
    duration: prefs.duration,
    contract_version: Number(prefs.contract_version || 1),
    start_time: prefs.start_time,
    activity_venue: prefs.activity_venue,
    meet_point: prefs.meet_point,
    payment_mode: payment.payment_mode,
    payer_user_id: payment.payer_user_id
  }, { user_a_id: userAId, user_b_id: userBId })
}

function resolvePrimaryInvitationProposal(input = {}, prefs, context = {}) {
  const explicit = publicPrimaryProposal(
    input.invitation_primary_proposal || input.primary_proposal || input.primary || null,
    context
  )
  if (explicit && isPrimaryProposalDraftComplete(explicit)) {
    if (prefs && !primaryFitsPreference(explicit, prefs, context)) {
      throw primaryProposalRequiredError('本次建议安排必须落在你的可接受范围内')
    }
    return explicit
  }
  const derived = derivePrimaryFromSingletonPrefs(prefs, context.user_a_id, context.user_b_id)
  if (derived && isPrimaryProposalDraftComplete(derived)) return derived
  throw primaryProposalRequiredError()
}

function invitationPrimaryOf(coordination = {}, initiatorApp = null, context = {}) {
  const stored = coordination.invitation_primary_proposal
  if (stored && typeof stored === 'object') {
    return publicPrimaryProposal(stored, {
      user_a_id: context.user_a_id || coordination.user_a_id,
      user_b_id: context.user_b_id || coordination.user_b_id
    })
  }
  return null
}

function buildInvitationCard(primaryOrPrefs = {}, version = 1, options = {}) {
  const primary = options.primary
    || (primaryOrPrefs && primaryOrPrefs.date && primaryOrPrefs.period
      ? publicPrimaryProposal(primaryOrPrefs, options)
      : null)
  const prefs = options.preference || (
    primaryOrPrefs && Array.isArray(primaryOrPrefs.availability)
      ? publicInvitationProposal(primaryOrPrefs)
      : null
  )
  const complete = isPrimaryProposalComplete(primary)
  const readiness = primary
    ? (Number(primary.contract_version || 1) < PLAN_CONTRACT_VERSION
        ? { ready: true, missing_fields: [], conflict: null }
        : planReadiness(primary))
    : { ready: false, missing_fields: ['start_time', 'activity_venue'], conflict: null }
  const paymentText = complete
    ? paymentFactText(primary, {
      user_a_id: options.user_a_id,
      user_b_id: options.user_b_id
    })
    : '待确认'
  const hasRange = Boolean(prefs) && (
    (prefs.availability || []).reduce((n, item) => n + (item.periods || []).length, 0) > 1
    || (prefs.areas || []).length > 1
    || (prefs.activities || []).length > 1
  )
  return {
    invitation_version: Number(version || 1),
    primary_complete: isPrimaryProposalDraftComplete(primary),
    final_ready: readiness.ready,
    venue_status: readiness.venue_resolution && readiness.venue_resolution.status || (readiness.ready ? 'resolved' : 'needs_specific_venue'),
    venue_guidance: readiness.venue_resolution && readiness.venue_resolution.status === 'needs_specific_venue'
      ? '已记录大致区域或活动类型，还需要确认具体门店'
      : '',
    time_text: primary && primary.date
      ? formatPlanTime(primary.date, primary.period, primary.start_time)
      : (prefs ? formatAvailabilityRange(prefs.availability) : '待确认'),
    area_text: complete ? (primary.area || '待确认') : (formatList(prefs && prefs.areas) || '待确认'),
    activity_text: complete ? (primary.activity || '待确认') : (formatList(prefs && prefs.activities) || '待确认'),
    activity_venue_text: primary && primary.activity_venue || '待确认',
    meet_point_text: primary && primary.meet_point || '到场前再确认',
    arrival_hint_text: '可在确认约会后补充',
    meeting_ready: Boolean(primary && readiness.ready),
    meeting_missing_fields: readiness.missing_fields || [],
    meeting_conflict: readiness.conflict || null,
    budget_text: complete
      ? (BUDGET_LABELS[primary.budget] || primary.budget || '待确认')
      : (BUDGET_LABELS[prefs && prefs.budget] || (prefs && prefs.budget) || '待确认'),
    duration_text: complete
      ? (DURATION_LABELS[primary.duration] || primary.duration || '待确认')
      : (DURATION_LABELS[prefs && prefs.duration] || (prefs && prefs.duration) || '待确认'),
    payment_text: paymentText,
    payment_mode: complete ? primary.payment_mode : '',
    payer_user_id: complete ? Number(primary.payer_user_id || 0) : 0,
    date: complete ? primary.date : '',
    period: complete ? primary.period : '',
    area: complete ? primary.area : '',
    activity: complete ? primary.activity : '',
    contract_version: primary ? Number(primary.contract_version || 1) : Number(prefs && prefs.contract_version || 1),
    start_time: primary && primary.start_time || '',
    activity_venue: primary && primary.activity_venue || '',
    meet_point: primary && primary.meet_point || '',
    budget: complete ? primary.budget : (prefs && prefs.budget) || '',
    duration: complete ? primary.duration : (prefs && prefs.duration) || '',
    range_hint: hasRange ? '对方还有其他可调整范围' : '',
    preference_range: prefs || null,
    availability: prefs ? prefs.availability : [],
    areas: prefs ? prefs.areas : [],
    activities: prefs ? prefs.activities : []
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
  const reconciled = reconcileDerivedFields(base, next, {
    exactTimeSupplied: Object.prototype.hasOwnProperty.call(overrides, 'start_time'),
    venueSupplied: Object.prototype.hasOwnProperty.call(overrides, 'activity_venue')
  })
  reconciled.arrival_hint = Object.prototype.hasOwnProperty.call(overrides, 'arrival_hint')
    ? overrides.arrival_hint
    : ''
  return reconciled
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
  const { computeOverlap } = require('./dateCoordinationPolicy')
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
  const overlap = computeOverlap(applicationA, applicationB, {
    version: options.version || 1,
    user_a_id: options.user_a_id,
    user_b_id: options.user_b_id
  })
  const missing = new Set(overlap.missing_dimensions || [])
  const times = (overlap.proposals || []).map((item) => formatDatePeriod(item.date, item.period))
  const uniqueTimes = [...new Set(times)]
  const first = overlap.proposals && overlap.proposals[0]
  const paymentDisplay = first
    ? paymentFactText(first, { user_a_id: options.user_a_id, user_b_id: options.user_b_id })
    : ''
  const dimensions = [
    {
      key: 'time',
      label: '时间',
      status: dimensionStatus(!missing.has('time'), false),
      display: missing.has('time') ? '待确认' : (uniqueTimes[0] || '已一致')
    },
    {
      key: 'area',
      label: '区域',
      status: dimensionStatus(!missing.has('area'), false),
      display: missing.has('area') ? '待确认' : (first && first.area) || '已一致'
    },
    {
      key: 'activity',
      label: '活动',
      status: dimensionStatus(!missing.has('activity'), false),
      display: missing.has('activity') ? '待确认' : (first && first.activity) || '已一致'
    },
    {
      key: 'budget',
      label: '预算',
      status: dimensionStatus(!missing.has('budget'), false),
      display: missing.has('budget') ? '待确认' : (BUDGET_LABELS[first && first.budget] || (first && first.budget) || '已一致')
    },
    {
      key: 'payment',
      label: '费用方式',
      status: dimensionStatus(!missing.has('payment'), false),
      display: missing.has('payment') ? '待确认' : (paymentDisplay || '已一致')
    },
    {
      key: 'duration',
      label: '时长',
      status: dimensionStatus(!missing.has('duration'), false),
      display: missing.has('duration') ? '待确认' : (DURATION_LABELS[first && first.duration] || (first && first.duration) || '已一致')
    },
    {
      key: 'exact_time',
      label: '具体时间',
      status: dimensionStatus(!missing.has('exact_time'), false),
      display: missing.has('exact_time') ? '待确认' : ((first && first.start_time) || '已一致')
    },
    {
      key: 'activity_venue',
      label: '活动场地',
      status: dimensionStatus(!missing.has('activity_venue'), false),
      display: missing.has('activity_venue') ? '待确认' : ((first && first.activity_venue) || '已一致')
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

function buildProposalCard(proposal, options = {}) {
  if (!proposal) return null
  const payment = normalizeNeutralPayment(proposal)
  const readiness = Number(proposal.contract_version || 1) < PLAN_CONTRACT_VERSION
    ? { ready: true, missing_fields: [], conflict: null }
    : planReadiness(proposal)
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
    duration: proposal.duration || '',
    contract_version: Number(proposal.contract_version || 1),
    start_time: proposal.start_time || '',
    activity_venue: proposal.activity_venue || '',
    meet_point: proposal.meet_point || '',
    payment_mode: payment.payment_mode,
    payer_user_id: payment.payer_user_id,
    // Keep field for older clients; never expose personal perspective labels as truth
    payment_preference: payment.payment_mode === 'aa' || payment.payment_mode === 'flexible'
      ? payment.payment_mode
      : (payment.payment_mode === 'single_payer' ? 'one_pays' : ''),
    time_text: proposal.date
      ? formatPlanTime(proposal.date, proposal.period, proposal.start_time)
      : '待确认',
    area_text: proposal.area || '待确认',
    activity_text: proposal.activity || '待确认',
    activity_venue_text: proposal.activity_venue || '待确认',
    meet_point_text: proposal.meet_point || '到场前再确认',
    arrival_hint_text: '可在确认约会后补充',
    meeting_ready: readiness.ready,
    meeting_missing_fields: readiness.missing_fields,
    meeting_conflict: readiness.conflict,
    budget_text: BUDGET_LABELS[proposal.budget] || proposal.budget || '待确认',
    duration_text: DURATION_LABELS[proposal.duration] || proposal.duration || '待确认',
    payment_text: paymentFactText(Object.assign({}, proposal, payment), {
      user_a_id: options.user_a_id,
      user_b_id: options.user_b_id
    })
  }
}

function buildDirectAcceptProposal(primary, version, options = {}) {
  const proposal = publicPrimaryProposal(primary, options)
  if (!isPrimaryProposalComplete(proposal)) {
    throw primaryProposalIncompleteError()
  }
  const inviteVersion = Number(options.invitation_version || version || 1)
  return {
    proposal_key: `direct:${options.coordination_id || 'x'}:v${inviteVersion}`,
    coordination_version: Number(version),
    invitation_version: inviteVersion,
    date: proposal.date,
    period: proposal.period,
    area: proposal.area,
    activity: proposal.activity,
    budget: proposal.budget,
    duration: proposal.duration,
    contract_version: Number(proposal.contract_version || 1),
    start_time: proposal.start_time || '',
    activity_venue: proposal.activity_venue || '',
    meet_point: proposal.meet_point || '',
    payment_mode: proposal.payment_mode,
    payer_user_id: proposal.payer_user_id,
    payment_preference: proposal.payment_mode === 'aa' || proposal.payment_mode === 'flexible'
      ? proposal.payment_mode
      : 'one_pays',
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
    return '请先查看对方的第一次约会邀请。你可以接受完整方案、只调整部分安排，或选择这次暂不方便。'
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
    return '双方已确认最终方案。关键安排不能直接改写；见面当天可以在这里告诉我“我到了”“对方穿什么”“暂未找到”或“现场情况不符”，我会通过协调会话安全转达。'
  }
  if (status === STATUS.INVITATION_DECLINED) {
    return '本次约会邀请对方暂未接受，协调已经结束。我可以说明结果，但不能再修改安排。'
  }
  if (status === STATUS.EXPIRED) {
    return '本次约会邀请暂未得到回应，协调已结束。我可以说明结果，但不能再修改安排。'
  }
  if (status === STATUS.CLOSED) {
    return '本轮协调已关闭。如需继续请重新发起邀请。'
  }
  if (status === STATUS.CANCELLED) {
    return '本次协调已取消。我可以说明结果，但不能再修改安排。'
  }
  if (status === STATUS.MANUAL_HANDOFF) {
    return '自动协调已转人工客服继续协助。'
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
  if (status === STATUS.CLOSED) return '本轮协调已关闭'
  if (status === STATUS.CANCELLED) return '已取消'
  if (status === STATUS.MANUAL_HANDOFF) return '已转人工'
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
  const primaryComplete = Boolean(invitationCard && invitationCard.primary_complete)
  let viewState = 'active_coordination'
  if (status === STATUS.COLLECTING_INITIATOR) viewState = 'draft'
  else if (inviting && isInitiator) viewState = 'waiting_partner'
  else if (inviting && isInvitee) viewState = 'received_invitation'
  else if (proposalReady) viewState = 'proposal_ready'
  else if (status === STATUS.ARRANGED) viewState = 'arranged'
  else if ([STATUS.INVITATION_DECLINED, STATUS.EXPIRED, STATUS.CANCELLED, STATUS.CLOSED, STATUS.MANUAL_HANDOFF].includes(status)) {
    viewState = 'result'
  } else if (coordinating) viewState = 'active_coordination'

  const resultCard = viewState === 'result' || status === STATUS.ARRANGED
    ? {
      kind: status,
      title: status === STATUS.ARRANGED
        ? '最终安排'
        : (status === STATUS.CLOSED
          ? '本轮协调已关闭'
          : (status === STATUS.CANCELLED
            ? '已取消'
            : (status === STATUS.MANUAL_HANDOFF
              ? '已转人工'
              : (status === STATUS.EXPIRED ? '邀请已结束' : '邀请结果')))),
      body: status === STATUS.ARRANGED
        ? '双方已确认最终方案。'
        : (status === STATUS.CLOSED
          ? '本轮协调已关闭'
          : (status === STATUS.CANCELLED
            ? '已取消'
            : (status === STATUS.MANUAL_HANDOFF
              ? '已转人工'
              : (status === STATUS.EXPIRED ? EXPIRED_PUBLIC_MESSAGE : DECLINED_PUBLIC_MESSAGE))))
    }
    : null

  return {
    role,
    status,
    view_state: viewState,
    invitation_card: invitationCard,
    shared_coordination_card: sharedCard,
    proposal_card: proposalCard,
    result_card: resultCard,
    show_coordinator_cta: Boolean(canOpenChat),
    show_accept_invitation: Boolean(canRespond && inviting && isInvitee && primaryComplete),
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
  INVALID_INVITATION_VERSION_MESSAGE,
  PRIMARY_PROPOSAL_REQUIRED_MESSAGE,
  PRIMARY_PROPOSAL_INCOMPLETE_MESSAGE,
  PERIOD_LABELS,
  BUDGET_LABELS,
  DURATION_LABELS,
  PERSONAL_PAYMENT_LABELS,
  CANONICAL_JOURNEYS,
  staleInvitationError,
  missingInvitationVersionError,
  primaryProposalRequiredError,
  primaryProposalIncompleteError,
  primaryResolutionRequiredError,
  invalidPrimarySelectionError,
  publicInvitationProposal,
  publicPrimaryProposal,
  isPrimaryProposalComplete,
  isPrimaryProposalDraftComplete,
  preferenceNeedsExplicitPrimary,
  derivePrimaryFromSingletonPrefs,
  resolvePrimaryInvitationProposal,
  resolvePrimaryAfterPreferenceChange,
  cleanPrimarySelection,
  primaryFitsPreference,
  primaryFitsPreferenceExceptPayment,
  syncPrimaryPaymentFromPreference,
  isExpiredInvitationRow,
  invitingPartnerDeadlinePassed,
  persistExpiredInvitationRecord,
  invitationAlreadyRespondedError,
  invitationExpiredError,
  personalPaymentToNeutral,
  resolveSharedPayment,
  normalizeNeutralPayment,
  paymentFactText,
  buildInvitationCard,
  invitationVersionOf,
  invitationProposalOf,
  invitationPrimaryOf,
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
  formatAvailabilityRange,
  formatDatePeriod,
  EVIDENCE_FIELDS
}
