const STATUS = Object.freeze({
  COLLECTING_INITIATOR: 'collecting_initiator',
  INVITING_PARTNER: 'inviting_partner',
  COLLECTING_PREFERENCES: 'collecting_preferences',
  COMPUTING_OVERLAP: 'computing_overlap',
  PROPOSING: 'proposing',
  WAITING_CONFIRMATIONS: 'waiting_confirmations',
  ARRANGED: 'arranged',
  INVITATION_DECLINED: 'invitation_declined',
  NO_OVERLAP: 'no_overlap',
  REPLANNING: 'replanning',
  MANUAL_HANDOFF: 'manual_handoff',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  CLOSED: 'closed'
})

const PERIODS = ['morning', 'afternoon', 'evening', 'night']
const ACTIVITIES = ['咖啡', '吃饭', '奶茶', '散步', '看展', '电影', '桌游']
const BUDGETS = ['under-50', '50-100', '100-200', 'over-200', 'flexible']
const PAYMENT_PREFERENCES = ['aa', 'partner_pays', 'self_pays', 'flexible']
const DURATIONS = ['about-1h', '1-2h', '2-3h', 'flexible']
const {
  PLAN_CONTRACT_VERSION,
  normalizeMeetingPlanFields,
  venueResolution,
  activityVenueConflict,
  normalizeFlexibleLocation,
  locationAgreement
} = require('./meetingPlanPolicy')
const { attachPublicError } = require('./businessError')

function uniqueStrings(values, limit) {
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value || '').trim()
    if (normalized && !result.includes(normalized)) result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

function dateOnly(value) {
  return new Date(`${String(value || '').slice(0, 10)}T00:00:00.000Z`)
}

function normalizeAvailability(values, now) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 5) {
    throw new Error('请选择1-5个未来14天内的可约日期')
  }
  const today = dateOnly(new Date(now).toISOString().slice(0, 10))
  const min = new Date(today.getTime() + 86400000)
  const max = new Date(today.getTime() + 14 * 86400000)
  const seen = new Set()
  return values.map((item) => {
    const date = String(item && item.date || '').slice(0, 10)
    const parsed = dateOnly(date)
    if (!date || Number.isNaN(parsed.getTime()) || parsed < min || parsed > max || seen.has(date)) {
      throw new Error('可约日期必须唯一且在未来14天内')
    }
    seen.add(date)
    const periods = uniqueStrings(item.periods, PERIODS.length).filter((period) => PERIODS.includes(period))
    if (!periods.length) throw new Error('每个日期至少选择一个可约时间段')
    return { date, periods }
  }).sort((a, b) => a.date.localeCompare(b.date))
}

function enumValue(value, allowed, label) {
  const normalized = String(value || '').trim()
  if (!allowed.includes(normalized)) throw new Error(`请选择有效的${label}`)
  return normalized
}

function textValue(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeApplication(input = {}, now = new Date()) {
  const areas = uniqueStrings(input.areas, 6)
  if (!areas.length) throw new Error('请选择至少一个可接受区域')
  const activities = uniqueStrings(input.activities, 4)
  if (!activities.length) throw new Error('请选择至少一项活动偏好')
  if (activities.length > 3) throw new Error('活动偏好最多选择3项')
  if (activities.some((item) => !ACTIVITIES.includes(item))) throw new Error('活动偏好包含无效选项')
  const meetingPlan = normalizeMeetingPlanFields(input)
  const normalized = {
    availability: normalizeAvailability(input.availability, now),
    areas,
    activities,
    budget: enumValue(input.budget, BUDGETS, '预算范围'),
    payment_preference: enumValue(input.payment_preference, PAYMENT_PREFERENCES, '费用方式'),
    duration: enumValue(input.duration, DURATIONS, '约会时长'),
    transport_constraints: textValue(input.transport_constraints, 100),
    other_requirements: textValue(input.other_requirements, 100),
    share_message: textValue(input.share_message, 100),
    // Keep a user-provided dish/activity detail even while the application is
    // still on the preference (non-final) contract. Do not add an empty field
    // to legacy records so their normalized shape remains backwards compatible.
  }
  const activityDetail = textValue(input.activity_detail, 40)
  if (activityDetail) normalized.activity_detail = activityDetail
  const usesMeetingPlan = Number(input.contract_version || 0) >= PLAN_CONTRACT_VERSION
    || meetingPlan.start_time || meetingPlan.activity_venue || meetingPlan.meet_point || meetingPlan.arrival_hint
  if (usesMeetingPlan) {
    if (!meetingPlan.start_time && meetingPlan.activity_venue) {
      throw new Error('请再选择一个具体开始时间，例如晚上8点')
    }
    if (meetingPlan.start_time && !meetingPlan.activity_venue) throw new Error('请补充具体活动场地')
    if (!meetingPlan.start_time || !meetingPlan.activity_venue) throw new Error('请补充具体时间和活动场地')
    if (normalized.availability.length !== 1
      || normalized.availability[0].periods.length !== 1
      || normalized.areas.length !== 1
      || normalized.activities.length !== 1) {
      throw new Error('包含具体时间和场地的方案只能选择一个日期、时间段、区域和活动')
    }
    if (normalized.availability[0].periods[0] !== meetingPlan.period) {
      throw new Error('具体时间与所选时间段不一致')
    }
    const resolution = normalizeFlexibleLocation(normalized.activities[0], meetingPlan.activity_venue, {
      activity_detail: input.activity_detail,
      venue_choice_mode: input.venue_choice_mode
    })
    if (resolution.status === 'location_required' || !resolution.activity_venue) {
      const error = new Error(resolution.clarification || '想在哪里见面？商场、商圈或具体店名都可以')
      throw attachPublicError(error, 'LOCATION_REQUIRED')
    }
    Object.assign(normalized, {
      contract_version: PLAN_CONTRACT_VERSION,
      start_time: meetingPlan.start_time,
      activity_venue: resolution.activity_venue,
      area_hint: resolution.area_hint,
      activity_detail: resolution.activity_detail || textValue(input.activity_detail, 40),
      location_precision: resolution.location_precision,
      venue_choice_mode: resolution.venue_choice_mode || 'named_location',
      ...locationAgreement({ ...input, activities: normalized.activities, activity_venue: resolution.activity_venue }),
      venue_resolution: venueResolution(normalized.activities[0], resolution.activity_venue),
      meet_point: meetingPlan.meet_point,
      arrival_hint: meetingPlan.arrival_hint
    })
  }
  return normalized
}

function intersect(a, b) {
  return a.filter((item) => b.includes(item))
}

function budgetRange(value) {
  const ranges = {
    'under-50': [0, 50],
    '50-100': [50, 100],
    '100-200': [100, 200],
    'over-200': [200, Infinity],
    flexible: [0, Infinity]
  }
  return ranges[value] || [0, 0]
}

function budgetOverlap(a, b) {
  const left = budgetRange(a)
  const right = budgetRange(b)
  const min = Math.max(left[0], right[0])
  const max = Math.min(left[1], right[1])
  if (max < min) return ''
  if (min === max) return String(min)
  if (min === 0 && max === Infinity) return 'flexible'
  if (min === 0) return `under-${max}`
  if (max === Infinity) return `over-${min}`
  return `${min}-${max}`
}

function compatiblePreference(a, b) {
  if (a === b) return a
  if (a === 'flexible') return b
  if (b === 'flexible') return a
  if ((a === 'partner_pays' && b === 'self_pays') || (a === 'self_pays' && b === 'partner_pays')) return 'one_pays'
  return ''
}

function timeSlots(application) {
  const slots = []
  for (const item of application.availability) {
    for (const period of item.periods) slots.push(`${item.date}|${period}`)
  }
  return slots
}

function computeOverlap(applicationA, applicationB, options = {}) {
  const version = Number(options.version || 1)
  if (version >= 2 && !(Number(options.user_a_id) > 0 && Number(options.user_b_id) > 0)) {
    throw new Error('computeOverlap requires user ids')
  }
  const times = intersect(timeSlots(applicationA), timeSlots(applicationB))
  const areas = intersect(applicationA.areas, applicationB.areas)
  const activities = intersect(applicationA.activities, applicationB.activities)
  const budget = budgetOverlap(applicationA.budget, applicationB.budget)
  const paymentCompat = compatiblePreference(applicationA.payment_preference, applicationB.payment_preference)
  let sharedPayment = { payment_mode: '', payer_user_id: 0 }
  try {
    const { resolveSharedPayment } = require('./invitationCoordination')
    sharedPayment = resolveSharedPayment(
      applicationA.payment_preference,
      applicationB.payment_preference,
      options.user_a_id,
      options.user_b_id
    )
  } catch (err) {
    sharedPayment = { payment_mode: '', payer_user_id: 0 }
  }
  const paymentOk = Boolean(paymentCompat) && (
    sharedPayment.payment_mode === 'aa'
    || sharedPayment.payment_mode === 'flexible'
    || (sharedPayment.payment_mode === 'single_payer' && Number(sharedPayment.payer_user_id) > 0)
    || paymentCompat === 'one_pays'
  )
  const duration = compatiblePreference(applicationA.duration, applicationB.duration)
  const modernPlan = Math.min(
    Number(applicationA.contract_version || 1),
    Number(applicationB.contract_version || 1)
  ) >= PLAN_CONTRACT_VERSION
  const startTime = String(applicationA.start_time || '') === String(applicationB.start_time || '')
    ? String(applicationA.start_time || '')
    : ''
  const activityVenue = String(applicationA.activity_venue || '') === String(applicationB.activity_venue || '')
    ? String(applicationA.activity_venue || '')
    : ''
  const meetPoint = String(applicationA.meet_point || '') === String(applicationB.meet_point || '')
    ? String(applicationA.meet_point || '')
    : ''
  const missing = []
  if (!times.length) missing.push('time')
  if (!areas.length) missing.push('area')
  if (!activities.length) missing.push('activity')
  if (!budget) missing.push('budget')
  if (!paymentOk) missing.push('payment')
  if (!duration) missing.push('duration')
  if (modernPlan && !startTime) missing.push('exact_time')
  if (modernPlan && !activityVenue) missing.push('activity_venue')
  const modeA = locationAgreement(applicationA).venue_choice_mode
  const modeB = locationAgreement(applicationB).venue_choice_mode
  if (modeA !== modeB) missing.push('activity_venue')
  const compatibleActivities = modernPlan && activityVenue
    ? activities.filter((activity) => modeA === 'meet_first' || !activityVenueConflict(activity, activityVenue))
    : activities
  if (modernPlan && activities.length && !compatibleActivities.length) missing.push('activity_venue')
  if (missing.length) return { proposals: [], missing_dimensions: missing }

  // one_pays without resolved payer ids stays incomplete for shared cards
  if (paymentCompat === 'one_pays' && sharedPayment.payment_mode !== 'single_payer') {
    return { proposals: [], missing_dimensions: ['payment'] }
  }

  const proposals = []
  for (const slot of times) {
    for (const area of areas) {
      for (const activity of compatibleActivities) {
        const [date, period] = slot.split('|')
        const proposal = {
          proposal_key: `v${version}-${date}-${period}-${area}-${activity}`,
          coordination_version: version,
          date,
          period,
          area,
          activity,
          budget,
          payment_mode: sharedPayment.payment_mode,
          payer_user_id: sharedPayment.payer_user_id,
          payment_preference: sharedPayment.payment_mode === 'aa' || sharedPayment.payment_mode === 'flexible'
            ? sharedPayment.payment_mode
            : 'one_pays',
          duration
        }
        if (modernPlan) {
          Object.assign(proposal, {
            contract_version: PLAN_CONTRACT_VERSION,
            start_time: startTime,
            activity_venue: activityVenue,
            ...locationAgreement({
              activity, activity_venue: activityVenue,
              venue_choice_mode: applicationA.venue_choice_mode === applicationB.venue_choice_mode
                ? applicationA.venue_choice_mode : 'named_location'
            }),
            meet_point: meetPoint
          })
        }
        proposals.push(proposal)
        if (proposals.length === 3) return { proposals, missing_dimensions: [] }
      }
    }
  }
  return { proposals, missing_dimensions: [] }
}

function nextStatus(current, event) {
  const transitions = {
    [STATUS.COLLECTING_INITIATOR]: {
      initiator_submitted: STATUS.INVITING_PARTNER,
      expire: STATUS.EXPIRED,
      cancel: STATUS.CANCELLED
    },
    [STATUS.INVITING_PARTNER]: {
      accept_invitation: STATUS.ARRANGED,
      coordinate_invitation: STATUS.COLLECTING_PREFERENCES,
      decline_invitation: STATUS.INVITATION_DECLINED,
      expire: STATUS.EXPIRED,
      cancel: STATUS.CANCELLED
    },
    [STATUS.COLLECTING_PREFERENCES]: {
      applications_complete: STATUS.COMPUTING_OVERLAP,
      expire: STATUS.EXPIRED,
      cancel: STATUS.CANCELLED,
      handoff: STATUS.MANUAL_HANDOFF
    },
    [STATUS.COMPUTING_OVERLAP]: {
      proposals_created: STATUS.WAITING_CONFIRMATIONS,
      no_overlap: STATUS.NO_OVERLAP,
      handoff: STATUS.MANUAL_HANDOFF
    },
    [STATUS.NO_OVERLAP]: {
      recoordinate: STATUS.REPLANNING,
      handoff: STATUS.MANUAL_HANDOFF,
      cancel: STATUS.CANCELLED
    },
    [STATUS.REPLANNING]: {
      applications_complete: STATUS.COMPUTING_OVERLAP,
      handoff: STATUS.MANUAL_HANDOFF,
      cancel: STATUS.CANCELLED
    },
    [STATUS.WAITING_CONFIRMATIONS]: {
      arranged: STATUS.ARRANGED,
      reject_proposal: STATUS.REPLANNING,
      expire: STATUS.EXPIRED,
      handoff: STATUS.MANUAL_HANDOFF
    }
  }
  const next = transitions[current] && transitions[current][event]
  if (!next) throw new Error('当前状态不能执行该协调操作')
  return next
}

function applyConfirmation(coordination, proposal, confirmations, input) {
  if (!coordination || coordination.status !== STATUS.WAITING_CONFIRMATIONS) {
    throw new Error('当前状态不能确认约会方案')
  }
  if (!proposal || proposal.status !== 'active' || Number(proposal.coordination_version) !== Number(coordination.coordination_version)) {
    throw new Error('方案已失效，请刷新后重试')
  }
  const userId = Number(input.user_id || 0)
  if (![Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(userId)) {
    throw new Error('无权确认该约会方案')
  }
  const decision = String(input.decision || '')
  if (!['confirm', 'reject'].includes(decision)) throw new Error('请选择确认或重新协调')
  const nextConfirmations = (confirmations || []).filter((item) => Number(item.user_id) !== userId)
  nextConfirmations.push({
    user_id: userId,
    proposal_id: Number(proposal.id),
    coordination_version: Number(coordination.coordination_version),
    decision
  })
  if (decision === 'reject') {
    return {
      coordination: Object.assign({}, coordination, { status: STATUS.REPLANNING }),
      confirmations: nextConfirmations
    }
  }
  const confirmedUsers = nextConfirmations
    .filter((item) => item.decision === 'confirm' && Number(item.proposal_id) === Number(proposal.id) && Number(item.coordination_version) === Number(coordination.coordination_version))
    .map((item) => Number(item.user_id))
  const arranged = [Number(coordination.user_a_id), Number(coordination.user_b_id)]
    .every((id) => confirmedUsers.includes(id))
  return {
    coordination: arranged
      ? Object.assign({}, coordination, { status: STATUS.ARRANGED, final_proposal_id: Number(proposal.id) })
      : Object.assign({}, coordination),
    confirmations: nextConfirmations
  }
}

module.exports = {
  STATUS,
  PERIODS,
  ACTIVITIES,
  BUDGETS,
  PAYMENT_PREFERENCES,
  DURATIONS,
  normalizeApplication,
  computeOverlap,
  nextStatus,
  applyConfirmation
}
