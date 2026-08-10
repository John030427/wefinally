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
  return {
    availability: normalizeAvailability(input.availability, now),
    areas,
    activities,
    budget: enumValue(input.budget, BUDGETS, '预算范围'),
    payment_preference: enumValue(input.payment_preference, PAYMENT_PREFERENCES, '费用方式'),
    duration: enumValue(input.duration, DURATIONS, '约会时长'),
    transport_constraints: textValue(input.transport_constraints, 100),
    other_requirements: textValue(input.other_requirements, 100),
    share_message: textValue(input.share_message, 100)
  }
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
  const times = intersect(timeSlots(applicationA), timeSlots(applicationB))
  const areas = intersect(applicationA.areas, applicationB.areas)
  const activities = intersect(applicationA.activities, applicationB.activities)
  const budget = budgetOverlap(applicationA.budget, applicationB.budget)
  const payment = compatiblePreference(applicationA.payment_preference, applicationB.payment_preference)
  const duration = compatiblePreference(applicationA.duration, applicationB.duration)
  const missing = []
  if (!times.length) missing.push('time')
  if (!areas.length) missing.push('area')
  if (!activities.length) missing.push('activity')
  if (!budget) missing.push('budget')
  if (!payment) missing.push('payment')
  if (!duration) missing.push('duration')
  if (missing.length) return { proposals: [], missing_dimensions: missing }

  const proposals = []
  for (const slot of times) {
    for (const area of areas) {
      for (const activity of activities) {
        const [date, period] = slot.split('|')
        proposals.push({
          proposal_key: `v${version}-${date}-${period}-${area}-${activity}`,
          coordination_version: version,
          date,
          period,
          area,
          activity,
          budget,
          payment_preference: payment,
          duration
        })
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
      accept_invitation: STATUS.COLLECTING_PREFERENCES,
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
