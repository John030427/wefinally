const MATCH_VERDICTS = new Set(['accurate', 'partly_accurate', 'not_accurate'])
const MATCH_REASONS = new Set(['preferences', 'values', 'appearance', 'life_stage', 'location', 'other'])
const MET_STATUSES = new Set(['met', 'cancelled', 'no_show', 'not_yet'])
const CONTINUE_INTENTS = new Set(['yes', 'unsure', 'no'])
const AUTHENTICITY_LEVELS = new Set(['consistent', 'minor_gap', 'major_gap', 'not_sure'])
const SAFETY_LEVELS = new Set(['safe', 'uncomfortable', 'unsafe', 'not_applicable'])
const DATE_REASONS = new Set(['conversation', 'values', 'pace', 'appearance', 'authenticity', 'safety', 'location', 'other'])

function bool(value) {
  return value === true || value === 1 || value === '1'
}

function requiredEnum(value, allowed, label) {
  const normalized = String(value || '')
  if (!allowed.has(normalized)) throw new Error(`请选择有效的${label}`)
  return normalized
}

function reasons(value, allowed) {
  const list = Array.isArray(value) ? value : []
  const output = []
  list.forEach((item) => {
    const normalized = String(item || '')
    if (!allowed.has(normalized) || output.includes(normalized)) return
    output.push(normalized)
  })
  return output.slice(0, 5)
}

function safeNote(value) {
  const note = String(value || '').trim()
  if (note.length > 200) throw new Error('反馈备注最多 200 字')
  if (/1[3-9](?:[ -]?\d){9}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|BEGIN [A-Z ]*PRIVATE KEY|(?:api[_ -]?key|secret|openid)\s*[:=]|(?:微信号|wechat|wxid)[：:=\s]+[A-Za-z][-_A-Za-z0-9]{5,}/i.test(note)) {
    throw new Error('反馈备注不得包含联系方式或凭证')
  }
  return note
}

function businessDateKey(value) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const PERIOD_START_HOUR = {
  morning: 9,
  afternoon: 12,
  evening: 18,
  night: 20
}

const PERIOD_MIN_END_HOUR = {
  morning: 12,
  afternoon: 18,
  evening: 23,
  night: 23
}

const DURATION_MAX_HOURS = {
  'about-1h': 1,
  '1-2h': 2,
  '2-3h': 3,
  flexible: 2
}

function shanghaiTimestamp(dateStr, hour, minute = 0) {
  const date = String(dateStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return new Date(`${date}T${hh}:${mm}:00+08:00`).getTime()
}

function meetingEstimatedEndMs(proposal = {}) {
  const date = String(proposal.date || '').slice(0, 10)
  const period = String(proposal.period || 'afternoon').trim().toLowerCase()
  const startHour = PERIOD_START_HOUR[period] || 12
  const minEndHour = PERIOD_MIN_END_HOUR[period] || 18
  const durationKey = String(proposal.duration || '').trim()
  const maxHours = DURATION_MAX_HOURS[durationKey] || 2
  const startMs = shanghaiTimestamp(date, startHour)
  const minEndMs = shanghaiTimestamp(date, minEndHour)
  if (!Number.isFinite(startMs) || !Number.isFinite(minEndMs)) return NaN
  return Math.max(minEndMs, startMs + maxHours * 60 * 60 * 1000)
}

function dateFeedbackWindowState(proposal, now = new Date()) {
  const proposalDate = String(proposal && proposal.date || '').slice(0, 10)
  if (!proposalDate) {
    return { can_submit: false, reason: '约会日期尚未确认', proposal_date: '' }
  }
  const today = businessDateKey(now)
  if (proposalDate > today) {
    return { can_submit: false, reason: `约会后可填写（约会日期：${proposalDate}）`, proposal_date: proposalDate }
  }
  if (proposalDate < today) {
    return { can_submit: true, reason: '', proposal_date: proposalDate }
  }
  const endMs = meetingEstimatedEndMs(proposal)
  if (!Number.isFinite(endMs) || now.getTime() < endMs) {
    return {
      can_submit: false,
      reason: '约会预计结束后再填写反馈',
      proposal_date: proposalDate
    }
  }
  return { can_submit: true, reason: '', proposal_date: proposalDate }
}

function normalizeMatchFeedback(data) {
  const input = data || {}
  return {
    verdict: requiredEnum(input.verdict, MATCH_VERDICTS, '反馈结论'),
    reasons: reasons(input.reasons, MATCH_REASONS),
    note: safeNote(input.note),
    request_human_review: bool(input.request_human_review)
  }
}

function normalizeDateFeedback(data) {
  const input = data || {}
  return {
    met_status: requiredEnum(input.met_status, MET_STATUSES, '见面状态'),
    continue_intent: requiredEnum(input.continue_intent, CONTINUE_INTENTS, '继续意愿'),
    authenticity: requiredEnum(input.authenticity, AUTHENTICITY_LEVELS, '资料一致性'),
    safety: requiredEnum(input.safety, SAFETY_LEVELS, '安全感受'),
    reasons: reasons(input.reasons, DATE_REASONS),
    note: safeNote(input.note),
    avoid_similar: bool(input.avoid_similar),
    request_human_review: bool(input.request_human_review)
  }
}

function matchFeedbackDocId(matchLogId, userId) {
  return `match_feedback_${Number(matchLogId)}_${Number(userId)}`
}

function dateFeedbackDocId(matchLogId, userId) {
  return `date_feedback_${Number(matchLogId)}_${Number(userId)}`
}

module.exports = {
  normalizeMatchFeedback,
  normalizeDateFeedback,
  matchFeedbackDocId,
  dateFeedbackDocId,
  businessDateKey,
  meetingEstimatedEndMs,
  dateFeedbackWindowState
}
