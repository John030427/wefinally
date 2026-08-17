function text(value, limit) {
  return String(value || '').trim().slice(0, limit)
}

function unwrapStructuredReport(value, side) {
  if (Array.isArray(value)) return value.length ? unwrapStructuredReport(value[0], side) : null
  if (!value || typeof value !== 'object') return value
  if (value.summary) return value
  if (value.report && typeof value.report === 'object') return value.report
  if (value[side] && typeof value[side] === 'object') return value[side]
  if (value.data && typeof value.data === 'object') return value.data
  return value
}

function resolveEvidenceKey(value, allowedEvidenceKeys) {
  const raw = text(value, 80)
  if (!raw) return ''
  const candidates = [
    raw,
    raw.replace(/[.:/-]+/g, '_'),
    raw.replace(/^evidence[.:/_-]+/i, ''),
    `score_${raw.replace(/^score[.:/_-]+/i, '').replace(/[.:/-]+/g, '_')}`
  ]
  return candidates.find((key) => allowedEvidenceKeys.has(key)) || ''
}

function plainTextReport(value) {
  const summary = text(value, 1000).replace(/```(?:json)?/gi, '').trim()
  if (!summary) throw new Error('report schema invalid: plain_text')
  return {
    summary,
    confidence: 'low',
    strengths: [],
    differences: [],
    hard_condition_checks: [],
    communication_suggestions: [],
    first_date_suggestions: [],
    data_limitations: ['模型本次未返回完整结构化内容，本报告仅保留已生成的概述，建议结合线下沟通判断。']
  }
}

function normalizeStructuredReport(report, allowedEvidenceKeys, options = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('report schema invalid')
  const requiredArrays = ['strengths', 'differences', 'hard_condition_checks', 'communication_suggestions', 'first_date_suggestions', 'data_limitations']
  let summary = text(report.summary, 1200)
  if (!summary) throw new Error('report schema invalid: summary')
  if (!['high', 'medium', 'low'].includes(report.confidence)) throw new Error('report schema invalid: confidence')
  requiredArrays.forEach((key) => {
    if (!Array.isArray(report[key])) throw new Error(`report schema invalid: ${key}`)
  })

  const hasPsychEvidence = Boolean(options.hasPsychEvidence)
  if (!hasPsychEvidence) {
    summary = summary
      .replace(/心理高度一致/g, '关系偏好资料不足，暂不作心理层面判断')
      .replace(/高度契合/g, '仍需当面确认')
      .replace(/高度一致/g, '尚需更多资料确认')
  }

  const evidenceItems = (items, includeSeverity) => items.slice(0, 12).map((item) => {
    const evidenceKey = item && resolveEvidenceKey(item.evidence_key, allowedEvidenceKeys)
    if (!evidenceKey) return null
    const normalized = {
      evidence_key: evidenceKey,
      title: text(item.title, 120),
      detail: text(item.detail, 600)
    }
    if (includeSeverity) normalized.severity = ['low', 'medium', 'high'].includes(item.severity) ? item.severity : 'low'
    return normalized
  }).filter(Boolean).slice(0, 6)

  const limitations = report.data_limitations.slice(0, 6).map((item) => text(item, 500)).filter(Boolean)
  if (!hasPsychEvidence && !limitations.some((item) => /心理|关系偏好|资料不足/.test(item))) {
    limitations.unshift('缺少可比较的关系偏好/心理测评资料，报告未对心理契合作肯定判断。')
  }

  return {
    schema_version: 'match_report_v2',
    summary,
    confidence: hasPsychEvidence ? report.confidence : (report.confidence === 'high' ? 'medium' : report.confidence),
    strengths: evidenceItems(report.strengths, false),
    differences: evidenceItems(report.differences, true),
    hard_condition_checks: report.hard_condition_checks.slice(0, 6).map((item) => ({
      key: text(item && item.key, 80),
      passed: Boolean(item && item.passed),
      explanation: text(item && item.explanation, 500)
    })),
    communication_suggestions: report.communication_suggestions.slice(0, 6).map((item) => text(item, 500)).filter(Boolean),
    first_date_suggestions: report.first_date_suggestions.slice(0, 6).map((item) => text(item, 500)).filter(Boolean),
    data_limitations: limitations.slice(0, 6)
  }
}

module.exports = { normalizeStructuredReport, plainTextReport, unwrapStructuredReport }
