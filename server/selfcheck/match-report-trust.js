const assert = require('assert')
const { normalizeStructuredReport } = require('../../miniprogram/cloudfunctions/api/lib/reportSchema')

const allowed = new Set(['score_baby', 'score_view'])
const report = normalizeStructuredReport({
  summary: '双方心理高度一致，整体高度契合，建议尽快推进。',
  confidence: 'high',
  strengths: [{ evidence_key: 'score_baby', title: '婚育', detail: '节奏接近' }],
  differences: [],
  hard_condition_checks: [],
  communication_suggestions: ['先聊城市安排'],
  first_date_suggestions: ['咖啡'],
  data_limitations: []
}, allowed, { hasPsychEvidence: false })

assert.strictEqual(report.schema_version, 'match_report_v2')
assert.ok(!report.summary.includes('心理高度一致'))
assert.ok(!report.summary.includes('高度契合'))
assert.notStrictEqual(report.confidence, 'high')
assert.ok(report.data_limitations.some((item) => /关系偏好|心理/.test(item)))
assert.strictEqual(report.strengths[0].evidence_key, 'score_baby')

const withPsych = normalizeStructuredReport({
  summary: '关系偏好较为接近。',
  confidence: 'high',
  strengths: [{ evidence_key: 'score_view', title: '三观', detail: '文本接近' }],
  differences: [],
  hard_condition_checks: [],
  communication_suggestions: [],
  first_date_suggestions: [],
  data_limitations: []
}, allowed, { hasPsychEvidence: true })
assert.strictEqual(withPsych.confidence, 'high')

console.log('PASS trustworthy report tone and evidence schema')
