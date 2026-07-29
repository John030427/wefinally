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
  businessDateKey
}
