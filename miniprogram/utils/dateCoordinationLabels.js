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
  partner_pays: '希望对方请客',
  self_pays: '我愿意请客',
  flexible: '灵活',
  one_pays: '一方请客'
})

const COORDINATION_STATUS_COPY = Object.freeze({
  collecting_initiator: '填写第一次约会建议',
  inviting_partner: '等待对方回应',
  collecting_preferences: '双方协调中',
  computing_overlap: '待处理',
  proposing: '协调中',
  waiting_confirmations: '等待双方确认',
  no_overlap: '还需要继续协调',
  replanning: '请和AI协调员沟通',
  arranged: '双方已确认',
  invitation_declined: '对方暂未接受',
  manual_handoff: '已转人工',
  expired: '邀请已结束',
  cancelled: '已取消',
  closed: '本轮协调已关闭'
})

const COORDINATION_RESULT_BODY = Object.freeze({
  arranged: '双方已确认最终方案。',
  expired: '本次约会邀请暂未得到回应，协调已结束。',
  closed: '本轮协调已关闭。',
  cancelled: '本轮协调已取消。',
  invitation_declined: '对方暂未接受本次约会邀请。',
  manual_handoff: '自动协调已转人工协助。'
})

const COORDINATION_RESULT_TITLE = Object.freeze({
  arranged: '最终安排',
  expired: '邀请已结束',
  closed: '本轮协调已关闭',
  cancelled: '已取消',
  invitation_declined: '邀请结果',
  manual_handoff: '已转人工'
})

function periodLabel(value) {
  const key = String(value || '')
  return PERIOD_LABELS[key] || key
}

function budgetLabel(value) {
  const key = String(value || '')
  return BUDGET_LABELS[key] || key
}

function durationLabel(value) {
  const key = String(value || '')
  return DURATION_LABELS[key] || key
}

function paymentLabel(value) {
  const key = String(value || '')
  return PAYMENT_LABELS[key] || key
}

function formatAvailability(value) {
  if (!Array.isArray(value) || !value.length) return '未设置'
  return value.map((item) => {
    const date = String(item && item.date || '').trim()
    const periods = Array.isArray(item && item.periods)
      ? item.periods.map(periodLabel).filter(Boolean).join('、')
      : periodLabel(item && item.period)
    return [date, periods].filter(Boolean).join(' ')
  }).filter(Boolean).join('；') || '未设置'
}

function formatPatchValue(field, value) {
  if (value === undefined || value === null || value === '') return '未设置'
  if (field === 'availability') return formatAvailability(value)
  if (field === 'budget') return budgetLabel(value)
  if (field === 'duration') return durationLabel(value)
  if (field === 'payment_preference' || field === 'payment') return paymentLabel(value)
  if (Array.isArray(value)) {
    if (field === 'areas' || field === 'activities') {
      return value.map((item) => String(item || '').trim()).filter(Boolean).join('、') || '未设置'
    }
    return value.map((item) => formatPatchValue('', item)).filter((item) => item && item !== '未设置').join('、') || '未设置'
  }
  if (value && typeof value === 'object') {
    if (value.date) return formatAvailability([value])
    return Object.keys(value).map((key) => formatPatchValue(key, value[key])).filter((item) => item && item !== '未设置').join('、') || '未设置'
  }
  if (PERIOD_LABELS[String(value)]) return periodLabel(value)
  return String(value)
}

function coordinationStatusCopy(status) {
  return COORDINATION_STATUS_COPY[String(status || '')] || '协调中'
}

function coordinationResultTitle(status) {
  return COORDINATION_RESULT_TITLE[String(status || '')] || '邀请结果'
}

function coordinationResultBody(status) {
  return COORDINATION_RESULT_BODY[String(status || '')] || COORDINATION_RESULT_BODY.invitation_declined
}

module.exports = {
  PERIOD_LABELS,
  BUDGET_LABELS,
  DURATION_LABELS,
  PAYMENT_LABELS,
  COORDINATION_STATUS_COPY,
  COORDINATION_RESULT_BODY,
  COORDINATION_RESULT_TITLE,
  periodLabel,
  budgetLabel,
  durationLabel,
  paymentLabel,
  formatAvailability,
  formatPatchValue,
  coordinationStatusCopy,
  coordinationResultTitle,
  coordinationResultBody
}
