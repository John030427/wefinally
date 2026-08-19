const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const route = read('miniprogram/cloudfunctions/api/handlers/route.js')
const collections = read('miniprogram/cloudfunctions/api/lib/collections.js')
const handler = read('miniprogram/cloudfunctions/api/handlers/reportTask.js')
const worker = read('miniprogram/cloudfunctions/report-worker/index.js')
const apiIndex = read('miniprogram/cloudfunctions/api/index.js')
const deepseek = read('miniprogram/cloudfunctions/api/lib/deepseek.js')
const apiConfig = JSON.parse(read('miniprogram/cloudfunctions/api/config.json'))
const workerConfig = JSON.parse(read('miniprogram/cloudfunctions/report-worker/config.json'))
const matchDetail = read('miniprogram/pages/match-detail/match-detail.js')
const { normalizeStructuredReport, plainTextReport, unwrapStructuredReport } = require('../../miniprogram/cloudfunctions/api/lib/reportSchema')

assert(route.includes("POST /api/match/report-tasks"))
assert(route.includes("GET /api/match/report-tasks/status"))
assert(route.includes("POST /api/match/report-tasks/retry"))
assert(collections.includes("ai_report_task: 'ai_report_tasks'"))
assert(handler.includes('ensureTaskForMatch'))
assert(handler.includes('STATUS.SUCCEEDED'))
assert(worker.includes('processWorkerTasks'))
assert(apiIndex.includes("case 'processReportTasks':"))
assert(apiIndex.split("case 'processReportTasks':")[1].split("case 'processWorkerTasks':")[0].includes('assertInternalWorkerSecret(payload.worker_secret)'))
assert(handler.includes("status: STATUS.QUEUED"))
assert(handler.includes('attempt_id'))
assert(handler.includes('generateStructuredMatchReports'))
assert(handler.includes('retentionDates'))
assert(handler.includes("first('user_match_setting'"))
assert(deepseek.includes('validateStructuredReport'))
assert(deepseek.includes('evidence_key'))
assert(deepseek.includes('hard_condition_checks'))
assert(deepseek.includes('overall_score'))
assert(deepseek.includes("key: 'quality_gate'"))
assert(deepseek.includes('Promise.all'))
assert(deepseek.includes('sideSnapshot'))
assert(deepseek.includes('final_match_score'))
assert(deepseek.includes('maxTokens: 1800'))
assert(deepseek.includes('summary 不超过 300 个汉字'))
assert(deepseek.includes('generatePlainFallbackReport'))
assert(deepseek.includes('const CLOUD_FUNCTION_SAFE_TIMEOUT_MS = 45000'))
assert(deepseek.includes('CLOUD_FUNCTION_MAX_TIMEOUT_MS'))
assert(deepseek.includes('Math.min(Math.max(Number(envValue'))
assert(deepseek.includes("response_format: { type: 'json_object' }"))
assert(Number(apiConfig.timeout) >= 60)
assert(Number(workerConfig.timeout) >= 60)
assert(matchDetail.includes("const reportWasFailed = this.data.detail.aiReportStatus === 'failed'"))
assert(matchDetail.includes('const path = reportWasFailed'))
assert(handler.includes('function databaseSafe(value)'))
assert(handler.includes('input_snapshot: databaseSafe(result.input_snapshot)'))
assert(handler.includes('async function persistOptionalReportAudit'))
assert(handler.includes('await persistOptionalReportAudit(task, attemptId, result, retention, generatedAt)'))
assert(handler.includes('reports_json: JSON.stringify(databaseSafe(result.reports))'))
assert(handler.includes('parseJson(task.reports_json)'))
assert(handler.includes('counterpart_score_detail_json'))
assert(handler.includes("b: parseJson(matchB ? matchB.score_detail_json : matchA.counterpart_score_detail_json)"))
assert(handler.includes('async function recoverStaleGeneratingTasks'))
assert(handler.includes('leaseExpired(task, current, GENERATION_LEASE_MS)'))
assert(handler.includes('await recoverStaleGeneratingTasks()'))

const normalized = normalizeStructuredReport({
  summary: 'test',
  confidence: 'medium',
  strengths: [{ evidence_key: 'city', title: 'same city', detail: 'ok', 'bad.key': 'drop' }],
  differences: [],
  hard_condition_checks: [],
  communication_suggestions: ['talk'],
  first_date_suggestions: ['coffee'],
  data_limitations: [],
  'bad.key': { nested: true }
}, new Set(['city']))
assert.strictEqual(normalized['bad.key'], undefined)
assert.strictEqual(normalized.strengths[0]['bad.key'], undefined)

const normalizedEvidenceAliases = normalizeStructuredReport({
  summary: 'test aliases',
  confidence: 'medium',
  strengths: [
    { evidence_key: 'city', title: 'same city', detail: 'ok' },
    { evidence_key: 'score.age', title: 'age range', detail: 'ok' },
    { evidence_key: 'invented_private_fact', title: 'unsupported', detail: 'must be removed' }
  ],
  differences: [],
  hard_condition_checks: [],
  communication_suggestions: [],
  first_date_suggestions: [],
  data_limitations: []
}, new Set(['city', 'score_age']))
assert.deepStrictEqual(normalizedEvidenceAliases.strengths.map((item) => item.evidence_key), ['city', 'score_age'])
assert.strictEqual(unwrapStructuredReport({ report: { summary: 'wrapped' } }, 'a').summary, 'wrapped')
assert.strictEqual(unwrapStructuredReport({ a: { summary: 'side' } }, 'a').summary, 'side')
assert.strictEqual(unwrapStructuredReport([{ summary: 'array wrapped' }], 'a').summary, 'array wrapped')
const plainFallback = plainTextReport('你们适合先从生活节奏和见面安排开始了解。')
assert.strictEqual(plainFallback.confidence, 'low')
assert(plainFallback.summary.includes('生活节奏'))
assert(plainFallback.data_limitations.length > 0)

console.log('PASS ai report cloud task contract')
