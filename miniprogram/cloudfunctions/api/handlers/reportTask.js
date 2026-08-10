const { db, col, first, byId, now } = require('../lib/db')
const { currentUser } = require('./user')
const { isVipActive } = require('../lib/format')
const { MEMBER_STATUS, memberStatus, canUseMatching } = require('../lib/memberPolicy')
const { generateStructuredMatchReports } = require('../lib/deepseek')
const {
  STATUS,
  MAX_ATTEMPTS,
  taskId,
  canRetry,
  classifyError,
  retentionDates,
  leaseExpired
} = require('../lib/reportTaskPolicy')

const GENERATION_LEASE_MS = 120000

function parseJson(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (err) { return {} }
}

function databaseSafe(value) {
  return JSON.parse(JSON.stringify(value))
}

function publicTask(task, side) {
  if (!task) return { status: STATUS.NOT_REQUESTED }
  const storedReports = task.reports || parseJson(task.reports_json)
  const report = storedReports && storedReports[side || 'a']
  return {
    id: task._id,
    status: task.status,
    version: Number(task.version || 1),
    attempt_count: Number(task.attempt_count || 0),
    error_code: task.error_code || '',
    error_message: task.status === STATUS.FAILED ? (task.error_message || '') : '',
    report: task.status === STATUS.SUCCEEDED ? (report || null) : null,
    generated_at: task.generated_at || null,
    updated_at: task.update_time || null
  }
}

async function ownedMatch(data, wxContext) {
  const user = await currentUser(wxContext)
  if (!canUseMatching({ member_status: memberStatus(user), vipActive: isVipActive(user) })) {
    const message = memberStatus(user) === MEMBER_STATUS.APPROVED ? '请先开通 VIP' : '会员审核通过后才能查看 AI 报告'
    const err = new Error(message)
    err.code = 401
    throw err
  }
  const matchId = Number(data.match_log_id || data.matchLogId || data.id || 0)
  const match = await byId('user_match_log', matchId)
  if (!match || Number(match.user_id) !== Number(user.id)) throw new Error('匹配记录不存在')
  return { user, match }
}

async function reverseMatch(match) {
  return first('user_match_log', {
    user_id: Number(match.match_user_id),
    match_user_id: Number(match.user_id)
  })
}

function groupId(match, reverse) {
  const ids = [Number(match.id), Number(reverse && reverse.id)].filter(Boolean).sort((a, b) => a - b)
  return ids.length === 2 ? ids.join('-') : String(match.id)
}

function legacyReport(text) {
  return {
    summary: String(text || '').trim(),
    confidence: 'low',
    strengths: [],
    differences: [],
    hard_condition_checks: [],
    communication_suggestions: [],
    first_date_suggestions: [],
    data_limitations: ['该报告由历史文本迁移，未包含新版结构化证据。']
  }
}

async function findTaskForMatch(match) {
  const reverse = await reverseMatch(match)
  return first('ai_report_task', { _id: taskId(groupId(match, reverse), 1) })
}

async function ensureTaskForMatch(match, source) {
  const reverse = await reverseMatch(match)
  const pairId = groupId(match, reverse)
  const id = taskId(pairId, 1)
  let task = await first('ai_report_task', { _id: id })
  if (!task) {
    const created = now()
    const score = parseJson(match.score_detail_json)
    const reverseScore = parseJson(reverse && reverse.score_detail_json)
    const legacySucceeded = Number(match.ai_report_status) === 1 && match.ai_report_text && score.report_fallback_used !== true
    const doc = {
      match_group_id: pairId,
      match_log_ids: { a: Number(match.id), b: Number(reverse && reverse.id || 0) },
      user_ids: { a: Number(match.user_id), b: Number(match.match_user_id) },
      status: legacySucceeded ? STATUS.SUCCEEDED : STATUS.QUEUED,
      version: 1,
      attempt_count: 0,
      generation_source: source || 'manual',
      report_version: 'match_report_v1',
      prompt_version: 'match_prompt_v1',
      reports: legacySucceeded ? {
        a: legacyReport(match.ai_report_text),
        b: legacyReport(reverse && reverse.ai_report_text)
      } : null,
      generated_at: legacySucceeded ? (match.ai_report_time || created) : null,
      legacy_migrated: legacySucceeded,
      legacy_score_versions: { a: score.version || match.score_version || '', b: reverseScore.version || (reverse && reverse.score_version) || '' },
      create_time: created,
      update_time: created
    }
    try {
      await col('ai_report_task').doc(id).set({ data: doc })
      task = Object.assign({ _id: id }, doc)
    } catch (err) {
      task = await first('ai_report_task', { _id: id })
      if (!task) throw err
    }
  }
  return { task, side: Number(task.user_ids.a) === Number(match.user_id) ? 'a' : 'b' }
}

async function create(data, wxContext) {
  const { match } = await ownedMatch(data, wxContext)
  const found = await ensureTaskForMatch(match, data.generation_source || 'manual')
  return publicTask(found.task, found.side)
}

async function status(data, wxContext) {
  const { match } = await ownedMatch(data, wxContext)
  const reverse = await reverseMatch(match)
  const task = await first('ai_report_task', { _id: taskId(groupId(match, reverse), 1) })
  if (!task) return { status: STATUS.NOT_REQUESTED }
  const side = Number(task.user_ids.a) === Number(match.user_id) ? 'a' : 'b'
  return publicTask(task, side)
}

async function retry(data, wxContext) {
  const { match } = await ownedMatch(data, wxContext)
  const found = await ensureTaskForMatch(match, 'manual_retry')
  if (found.task.status === STATUS.SUCCEEDED) throw new Error('AI 报告已生成，不允许重新生成')
  if (!canRetry(found.task)) throw new Error('当前报告任务不可重试')
  await col('ai_report_task').doc(found.task._id).update({ data: {
    status: STATUS.QUEUED,
    manual_retry_count: db.command.inc(1),
    error_code: '',
    error_message: '',
    next_retry_at: null,
    update_time: now()
  } })
  return publicTask(Object.assign({}, found.task, { status: STATUS.QUEUED }), found.side)
}

async function claimTask(task) {
  const attemptId = `${task._id}-${Date.now()}`
  const res = await col('ai_report_task').where({ _id: task._id, status: STATUS.QUEUED }).update({ data: {
    status: STATUS.GENERATING,
    attempt_id: attemptId,
    attempt_count: db.command.inc(1),
    started_at: now(),
    update_time: now()
  } })
  return res.stats && res.stats.updated ? attemptId : ''
}

async function persistOptionalReportAudit(task, attemptId, result, retention, generatedAt) {
  try {
    await col('ai_report_task').where({ _id: task._id, attempt_id: attemptId }).update({ data: {
      input_snapshot: databaseSafe(result.input_snapshot),
      input_expires_at: retention.input_expires_at,
      report_expires_at: retention.report_expires_at,
      update_time: generatedAt
    } })
  } catch (err) {
    console.warn('[ai-report] optional audit snapshot failed:', err.message)
  }
}

async function processOne(task) {
  const attemptId = await claimTask(task)
  if (!attemptId) return false
  try {
    const matchA = await byId('user_match_log', task.match_log_ids.a)
    const matchB = task.match_log_ids.b ? await byId('user_match_log', task.match_log_ids.b) : null
    const userA = await byId('user', task.user_ids.a)
    const userB = await byId('user', task.user_ids.b)
    if (!matchA || !userA || !userB) throw new Error('report input missing')
    const settingA = await first('user_match_setting', { user_id: Number(userA.id) })
    const settingB = await first('user_match_setting', { user_id: Number(userB.id) })
    const input = {
      users: {
        a: Object.assign({}, userA, settingA || {}),
        b: Object.assign({}, userB, settingB || {})
      },
      scores: { a: parseJson(matchA.score_detail_json), b: parseJson(matchB && matchB.score_detail_json) }
    }
    const started = Date.now()
    const result = await generateStructuredMatchReports(input)
    const generatedAt = now()
    const retention = retentionDates(generatedAt)
    await col('ai_report_task').where({ _id: task._id, attempt_id: attemptId }).update({ data: {
      status: STATUS.SUCCEEDED,
      reports_json: JSON.stringify(databaseSafe(result.reports)),
      model_name: result.model,
      generated_at: generatedAt,
      generation_duration_ms: Date.now() - started,
      error_code: '',
      error_message: '',
      update_time: generatedAt
    } })
    await persistOptionalReportAudit(task, attemptId, result, retention, generatedAt)
  } catch (err) {
    const failure = classifyError(err)
    const attempts = Number(task.attempt_count || 0) + 1
    const autoRetry = failure.retryable && attempts < MAX_ATTEMPTS
    await col('ai_report_task').where({ _id: task._id, attempt_id: attemptId }).update({ data: {
      status: autoRetry ? STATUS.QUEUED : STATUS.FAILED,
      error_code: failure.code,
      error_message: failure.message,
      next_retry_at: autoRetry ? new Date(Date.now() + attempts * 60000) : null,
      update_time: now()
    } })
  }
  return true
}

async function recoverStaleGeneratingTasks() {
  const current = now()
  const res = await col('ai_report_task').where({ status: STATUS.GENERATING }).limit(5).get()
  let requeued = 0
  let failed = 0
  for (const task of res.data || []) {
    if (!leaseExpired(task, current, GENERATION_LEASE_MS)) continue
    const exhausted = Number(task.attempt_count || 0) >= MAX_ATTEMPTS
    await col('ai_report_task').where({
      _id: task._id,
      status: STATUS.GENERATING,
      attempt_id: task.attempt_id
    }).update({ data: {
      status: exhausted ? STATUS.FAILED : STATUS.QUEUED,
      attempt_id: '',
      error_code: 'worker_interrupted',
      error_message: exhausted ? 'AI 报告生成多次中断，请手动重试' : '',
      next_retry_at: null,
      update_time: current
    } })
    if (exhausted) failed += 1
    else requeued += 1
  }
  return { requeued, failed }
}

async function processQueuedTasks(limit) {
  const recovered = await recoverStaleGeneratingTasks()
  const res = await col('ai_report_task').where({ status: STATUS.QUEUED }).limit(Math.max(1, Math.min(Number(limit || 2), 5))).get()
  let processed = 0
  for (const task of res.data || []) {
    if (task.next_retry_at && new Date(task.next_retry_at).getTime() > Date.now()) continue
    if (await processOne(task)) processed += 1
  }
  const cleanup = await cleanupExpiredTasks()
  return { processed, recovered, cleanup }
}

async function cleanupExpiredTasks() {
  const current = now()
  const input = await col('ai_report_task').where({
    input_expires_at: db.command.lte(current)
  }).update({ data: { input_snapshot: null, input_expires_at: null, update_time: current } })
  const reports = await col('ai_report_task').where({
    status: STATUS.SUCCEEDED,
    report_expires_at: db.command.lte(current)
  }).update({ data: {
    status: STATUS.EXPIRED,
    reports: null,
    report_expires_at: null,
    update_time: current
  } })
  const cancelled = await col('ai_report_task').where({
    status: STATUS.CANCELLED,
    delete_after: db.command.lte(current)
  }).remove()
  return {
    inputs_redacted: Number(input.stats && input.stats.updated || 0),
    reports_expired: Number(reports.stats && reports.stats.updated || 0),
    cancelled_deleted: Number(cancelled.stats && cancelled.stats.removed || 0)
  }
}

module.exports = { create, status, retry, ensureTaskForMatch, findTaskForMatch, publicTask, processQueuedTasks, cleanupExpiredTasks, STATUS }
