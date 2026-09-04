const {
  PERIOD_LABELS,
  BUDGET_LABELS,
  DURATION_LABELS,
  publicPrimaryProposal,
  isPrimaryProposalComplete,
  personalPaymentToNeutral,
  paymentFactText,
  buildProposalCard
} = require('./invitationCoordination')
const {
  normalizeStartTime,
  periodForStartTime,
  buildDatePlanV3,
  validateDatePlan
} = require('./datePlanContract')

const DIMENSION_FIELDS = Object.freeze({
  time: 'availability',
  area: 'areas',
  activity: 'activities',
  budget: 'budget',
  payment: 'payment_preference',
  duration: 'duration',
  exact_time: 'start_time',
  activity_venue: 'activity_venue'
})
const DIMENSION_LABELS = Object.freeze({
  time: '时间',
  area: '区域',
  activity: '活动',
  budget: '预算',
  payment: '费用方式',
  duration: '时长',
  exact_time: '具体时间',
  activity_venue: '活动场地'
})
const DIMENSION_ORDER = Object.freeze([
  'time', 'area', 'activity', 'budget', 'payment', 'duration', 'exact_time', 'activity_venue'
])
const IMPLIED_DIMENSIONS = Object.freeze({
  exact_time: ['time'],
  activity_venue: ['activity', 'area']
})

function timeSlots(application) {
  const slots = []
  for (const item of Array.isArray(application && application.availability) ? application.availability : []) {
    const date = String(item && item.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    for (const period of Array.isArray(item.periods) ? item.periods : []) {
      const value = String(period || '').trim()
      if (PERIOD_LABELS[value]) slots.push({ date, period: value })
    }
  }
  return slots
}

function displayTime(slot) {
  if (!slot) return ''
  return `${slot.date} ${PERIOD_LABELS[slot.period] || slot.period}`.trim()
}

function exactlyOne(values) {
  const unique = [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))]
  return unique.length === 1 ? unique[0] : ''
}

function paymentOf(application, ownerUserId, coordination) {
  return personalPaymentToNeutral(
    application && application.payment_preference,
    ownerUserId,
    Number(ownerUserId) === Number(coordination.user_a_id) ? coordination.user_b_id : coordination.user_a_id
  )
}

function paymentEquals(left, right) {
  return String(left && left.payment_mode || '') === String(right && right.payment_mode || '')
    && Number(left && left.payer_user_id || 0) === Number(right && right.payer_user_id || 0)
}

function explicitDimensions(applicationRow) {
  const evidence = applicationRow && applicationRow.preference_evidence
  if (!evidence || typeof evidence !== 'object') return []
  return DIMENSION_ORDER.filter((dimension) => evidence[DIMENSION_FIELDS[dimension]] === 'explicit')
}

function changedDimensionsOf(coordination, applicationRow) {
  const stored = Array.isArray(coordination && coordination.last_changed_dimensions)
    ? coordination.last_changed_dimensions.map(String)
    : []
  const known = new Set(DIMENSION_ORDER)
  const values = stored.filter((item) => known.has(item))
  return values.length ? values : explicitDimensions(applicationRow)
}

function candidateForDimension(dimension, application, ownerUserId, coordination) {
  if (dimension === 'time') {
    const slots = timeSlots(application)
    if (slots.length !== 1) return null
    const start = String(application && application.start_time || '').trim()
    return start ? Object.assign({}, slots[0], { start_time: start }) : slots[0]
  }
  if (dimension === 'exact_time') return String(application && application.start_time || '').trim() || null
  if (dimension === 'activity_venue') return String(application && application.activity_venue || '').trim() || null
  if (dimension === 'area') return exactlyOne(application && application.areas)
  if (dimension === 'activity') return exactlyOne(application && application.activities)
  if (dimension === 'budget') return String(application && application.budget || '').trim()
  if (dimension === 'duration') return String(application && application.duration || '').trim()
  if (dimension === 'payment') {
    const value = String(application && application.payment_preference || '').trim()
    if (!value) return null
    return Object.assign({ application_value: value }, paymentOf(application, ownerUserId, coordination))
  }
  return null
}

function differsFromPrimary(dimension, candidate, primary) {
  if (!candidate) return false
  if (dimension === 'time') return candidate.date !== primary.date || candidate.period !== primary.period
  if (dimension === 'exact_time') return String(candidate) !== String(primary.start_time || '')
  if (dimension === 'activity_venue') return String(candidate) !== String(primary.activity_venue || '')
  if (dimension === 'area') return candidate !== primary.area
  if (dimension === 'activity') return candidate !== primary.activity
  if (dimension === 'budget') return candidate !== primary.budget
  if (dimension === 'duration') return candidate !== primary.duration
  if (dimension === 'payment') return !paymentEquals(candidate, primary)
  return false
}

function valueText(dimension, value, coordination) {
  if (dimension === 'time') return displayTime(value)
  if (dimension === 'exact_time') return String(value || '')
  if (dimension === 'activity_venue') return String(value || '')
  if (dimension === 'budget') return BUDGET_LABELS[value] || value
  if (dimension === 'duration') return DURATION_LABELS[value] || value
  if (dimension === 'payment') {
    return paymentFactText(value, { user_a_id: coordination.user_a_id, user_b_id: coordination.user_b_id })
  }
  return String(value || '')
}

function primaryValue(dimension, primary) {
  if (dimension === 'time') return { date: primary.date, period: primary.period, start_time: primary.start_time || '' }
  if (dimension === 'exact_time') return primary.start_time || ''
  if (dimension === 'activity_venue') return primary.activity_venue || ''
  if (dimension === 'area') return primary.area
  if (dimension === 'activity') return primary.activity
  if (dimension === 'budget') return primary.budget
  if (dimension === 'duration') return primary.duration
  if (dimension === 'payment') return { payment_mode: primary.payment_mode, payer_user_id: primary.payer_user_id }
  return null
}

function applyCandidateToProposal(proposal, dimension, candidate) {
  if (dimension === 'time') {
    proposal.date = candidate.date
    proposal.period = candidate.period
    if (candidate.start_time) proposal.start_time = candidate.start_time
    else if (!proposal.start_time) proposal.start_time = ''
  } else if (dimension === 'exact_time') proposal.start_time = String(candidate || '')
  else if (dimension === 'activity_venue') proposal.activity_venue = String(candidate || '')
  else if (dimension === 'area') proposal.area = candidate
  else if (dimension === 'activity') proposal.activity = candidate
  else if (dimension === 'budget') proposal.budget = candidate
  else if (dimension === 'duration') proposal.duration = candidate
  else if (dimension === 'payment') {
    proposal.payment_mode = candidate.payment_mode
    proposal.payer_user_id = candidate.payer_user_id
  }
}

function dimensionCoveredByDeclared(dimension, declared) {
  if (declared.includes(dimension)) return true
  const impliedBy = IMPLIED_DIMENSIONS[dimension] || []
  return impliedBy.some((item) => declared.includes(item))
}

function buildStructuredCounterProposal(input = {}) {
  const coordination = input.coordination || {}
  const viewerUserId = Number(input.viewerUserId || 0)
  const changedByUserId = Number(coordination.last_changed_by_user_id || 0)
  const missing = [...new Set((Array.isArray(coordination.missing_dimensions)
    ? coordination.missing_dimensions : []).map(String))]
  if (coordination.status !== 'no_overlap' || !missing.length
    || missing.some((item) => !DIMENSION_ORDER.includes(item))
    || !viewerUserId || !changedByUserId || changedByUserId === viewerUserId) return null

  const changedApplication = changedByUserId === Number(coordination.user_a_id)
    ? input.applicationA
    : (changedByUserId === Number(coordination.user_b_id) ? input.applicationB : null)
  const changedApplicationRow = changedByUserId === Number(coordination.user_a_id)
    ? input.applicationRowA
    : input.applicationRowB
  if (!changedApplication) return null

  const primary = publicPrimaryProposal(input.invitationPrimary || {}, {
    user_a_id: coordination.user_a_id,
    user_b_id: coordination.user_b_id
  })
  if (!isPrimaryProposalComplete(primary)) return null

  const declared = changedDimensionsOf(coordination, changedApplicationRow)
  const relevant = DIMENSION_ORDER.filter((dimension) => {
    if (missing.includes(dimension)) return true
    if (dimension === 'exact_time' && missing.includes('time')) {
      const candidate = candidateForDimension(dimension, changedApplication, changedByUserId, coordination)
      return Boolean(candidate && differsFromPrimary(dimension, candidate, primary))
    }
    return false
  })
  if (declared.length && relevant.some((dimension) => !dimensionCoveredByDeclared(dimension, declared))) return null

  const proposal = Object.assign({}, primary)
  const changes = []
  for (const dimension of relevant) {
    const candidate = candidateForDimension(dimension, changedApplication, changedByUserId, coordination)
    if (!candidate || !differsFromPrimary(dimension, candidate, primary)) return null
    applyCandidateToProposal(proposal, dimension, candidate)
    changes.push({
      dimension,
      field: DIMENSION_FIELDS[dimension],
      label: DIMENSION_LABELS[dimension],
      before_text: valueText(dimension, primaryValue(dimension, primary), coordination),
      after_text: valueText(dimension, candidate, coordination),
      value: candidate,
      application_value: dimension === 'payment' ? candidate.application_value : undefined
    })
  }
  if (!changes.length || !isPrimaryProposalComplete(proposal)) return null

  const proposalCard = buildProposalCard(Object.assign({}, proposal, {
    coordination_version: Number(coordination.coordination_version || 1),
    source: 'structured_counter_proposal'
  }), { user_a_id: coordination.user_a_id, user_b_id: coordination.user_b_id })
  const changedLabels = changes.map((item) => item.label)
  const unchangedDimensions = DIMENSION_ORDER.filter((dimension) => !relevant.includes(dimension))
  const unchangedLabels = unchangedDimensions.map((dimension) => DIMENSION_LABELS[dimension])
  const proposalToken = [
    Number(coordination.coordination_version || 1),
    relevant.join(','), proposal.date, proposal.period, proposal.start_time || '',
    proposal.area, proposal.activity, proposal.activity_venue || '',
    proposal.budget, proposal.duration, proposal.payment_mode, Number(proposal.payer_user_id || 0)
  ].join('|')
  return {
    kind: 'partner_structured_counter_proposal',
    coordination_version: Number(coordination.coordination_version || 1),
    changed_by_user_id: changedByUserId,
    changed_dimensions: relevant,
    changes,
    unchanged_dimensions: unchangedDimensions,
    unchanged_text: unchangedLabels.join('、'),
    proposal,
    proposal_token: proposalToken,
    proposal_card: proposalCard,
    time_text: proposalCard.time_text,
    title: '对方调整了约会方案',
    body: `这次只调整了${changedLabels.join('、')}，${unchangedLabels.join('、')}保持原方案。`,
    action_label: '接受这份调整'
  }
}

function applyAcceptedCounterProposal(application, counterProposal) {
  if (!application || typeof application !== 'object') throw new Error('请先完成自己的约会偏好')
  if (!counterProposal || counterProposal.kind !== 'partner_structured_counter_proposal') {
    throw new Error('调整方案无效，请刷新后重试')
  }
  const next = Object.assign({}, application, {
    availability: (application.availability || []).map((item) => ({
      date: String(item && item.date || ''),
      periods: [...new Set(Array.isArray(item && item.periods) ? item.periods.map(String) : [])]
    })),
    areas: [...(application.areas || [])],
    activities: [...(application.activities || [])]
  })
  for (const change of counterProposal.changes || []) {
    if (change.dimension === 'time') {
      const slot = change.value || {}
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(slot.date || '')) || !PERIOD_LABELS[slot.period]) {
        throw new Error('候选时间无效，请刷新后重试')
      }
      next.availability = [{ date: slot.date, periods: [slot.period] }]
      const start = normalizeStartTime(slot.start_time || '')
      next.start_time = start
      if (start) {
        const inferred = periodForStartTime(start)
        if (inferred && inferred !== slot.period) {
          next.availability = [{ date: slot.date, periods: [inferred] }]
        }
      }
    } else if (change.dimension === 'exact_time') {
      const start = normalizeStartTime(change.value || '')
      next.start_time = start
      if (start && Array.isArray(next.availability) && next.availability[0]) {
        const inferred = periodForStartTime(start)
        if (inferred) next.availability = [{ date: next.availability[0].date, periods: [inferred] }]
      }
    } else if (change.dimension === 'activity_venue') next.activity_venue = String(change.value || '')
    else if (change.dimension === 'area') next.areas = [String(change.value)]
    else if (change.dimension === 'activity') next.activities = [String(change.value)]
    else if (change.dimension === 'budget') next.budget = String(change.value)
    else if (change.dimension === 'duration') next.duration = String(change.value)
    else if (change.dimension === 'payment') next.payment_preference = String(change.application_value || '')
  }
  const planView = buildDatePlanV3({
    date: next.availability && next.availability[0] && next.availability[0].date,
    period: next.availability && next.availability[0] && next.availability[0].periods && next.availability[0].periods[0],
    start_time: next.start_time,
    area: next.areas && next.areas[0],
    activity: next.activities && next.activities[0],
    activity_venue: next.activity_venue,
    meet_point: next.meet_point,
    budget: next.budget,
    payment: next.payment_preference,
    duration: next.duration
  })
  const gate = validateDatePlan(planView, 'draft')
  if (!gate.valid && gate.conflicts.length) {
    throw new Error(gate.clarification || '调整后的活动场地与活动不一致，请修改后再接受')
  }
  return next
}

module.exports = {
  DIMENSION_FIELDS,
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  IMPLIED_DIMENSIONS,
  buildStructuredCounterProposal,
  applyAcceptedCounterProposal,
  buildTimeCounterOffer: buildStructuredCounterProposal,
  mergeAcceptedTime(availability, counterOffer) {
    return applyAcceptedCounterProposal({ availability }, counterOffer).availability
  },
  displayTime
}
