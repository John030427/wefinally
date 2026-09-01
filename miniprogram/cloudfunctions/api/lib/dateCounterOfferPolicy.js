const PERIOD_LABELS = Object.freeze({
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
  night: '夜间'
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

function buildTimeCounterOffer(input = {}) {
  const coordination = input.coordination || {}
  const viewerUserId = Number(input.viewerUserId || 0)
  const changedByUserId = Number(coordination.last_changed_by_user_id || 0)
  const missing = Array.isArray(coordination.missing_dimensions) ? coordination.missing_dimensions : []
  if (coordination.status !== 'no_overlap'
    || missing.length !== 1
    || missing[0] !== 'time'
    || !viewerUserId
    || !changedByUserId
    || changedByUserId === viewerUserId) return null

  const changedApplication = changedByUserId === Number(coordination.user_a_id)
    ? input.applicationA
    : (changedByUserId === Number(coordination.user_b_id) ? input.applicationB : null)
  const ownApplication = viewerUserId === Number(coordination.user_a_id)
    ? input.applicationA
    : (viewerUserId === Number(coordination.user_b_id) ? input.applicationB : null)
  if (!changedApplication || !ownApplication) return null

  const ownKeys = new Set(timeSlots(ownApplication).map((slot) => `${slot.date}|${slot.period}`))
  const candidate = timeSlots(changedApplication)
    .find((slot) => !ownKeys.has(`${slot.date}|${slot.period}`))
  if (!candidate) return null

  return {
    kind: 'partner_time_counter_offer',
    coordination_version: Number(coordination.coordination_version || 1),
    dimension: 'time',
    date: candidate.date,
    period: candidate.period,
    time_text: displayTime(candidate),
    title: '对方提出了一个新的候选时间',
    body: '如果这个时间也可以，接受后系统会将它加入你的可约时间并重新计算。'
  }
}

function mergeAcceptedTime(availability, counterOffer) {
  const date = String(counterOffer && counterOffer.date || '').trim()
  const period = String(counterOffer && counterOffer.period || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !PERIOD_LABELS[period]) {
    throw new Error('候选时间无效，请刷新后重试')
  }
  const next = (Array.isArray(availability) ? availability : []).map((item) => ({
    date: String(item && item.date || ''),
    periods: [...new Set(Array.isArray(item && item.periods) ? item.periods.map(String) : [])]
  }))
  const existing = next.find((item) => item.date === date)
  if (existing) {
    if (!existing.periods.includes(period)) existing.periods.push(period)
  } else {
    if (next.length >= 5) throw new Error('你已选满5个日期，请先和 AI 调整时间范围')
    next.push({ date, periods: [period] })
  }
  return next.sort((left, right) => left.date.localeCompare(right.date))
}

module.exports = {
  buildTimeCounterOffer,
  mergeAcceptedTime,
  displayTime
}
