const { resolveProductionMatchCycle, dryRunProductionCycle, formalBatchDocumentId } = require('./matchCycleService')

const TRANSIENT = /timeout|ECONNRESET|unavailable|429|503|ETIMEDOUT/i
const TERMINAL = new Set(['completed_matched', 'completed_no_match', 'blocked'])

function redactBatchError(error) {
  const raw = String(error && error.message || error || 'unknown')
  const errorClass = TRANSIENT.test(raw) ? 'transient' : 'permanent'
  return {
    error_class: errorClass,
    message: errorClass === 'transient' ? 'transient_upstream_error' : 'permanent_match_error'
  }
}

function batchRecord(input, clock, extra = {}) {
  return Object.assign({
    batch_key: clock.batchKey,
    match_cycle_id: clock.matchCycleId || '',
    mode: 'formal',
    business_date: clock.businessDate,
    match_type: clock.matchType,
    request_id: String(input.requestId || '').slice(0, 120),
    trigger_source: String(input.triggerSource || 'timer'),
    algorithm_version: 'algo_evidence_v3',
    retry_count: 0,
    users_considered: 0,
    candidates_evaluated: 0,
    matched_count: 0,
    reason_code: '',
    error_class: ''
  }, extra)
}

async function runMatcher(deps, input, clock) {
  if (typeof deps.executeMatching === 'function') {
    return deps.executeMatching({ input, clock, deps })
  }
  return { matched_count: 0, users_considered: 0, candidates_evaluated: 0 }
}

async function persistResult(deps, batch, result) {
  const matchedCount = Number(result && result.matched_count || 0)
  const status = matchedCount > 0 ? 'completed_matched' : 'completed_no_match'
  return deps.updateByDoc('match_batch_run', batch, {
    status,
    matched_count: matchedCount,
    users_considered: Number(result && result.users_considered || 0),
    candidates_evaluated: Number(result && result.candidates_evaluated || 0),
    match_cycle_id: result && result.match_cycle_id || batch.match_cycle_id || '',
    completed_at: deps.now(),
    reason_code: matchedCount > 0 ? 'matched' : 'completed_no_match'
  })
}

async function runFormalMatchBatch(input = {}, deps) {
  if (!deps || typeof deps.acquireBatch !== 'function') throw new Error('匹配批次依赖未配置')
  const now = input.now || (deps.now && deps.now()) || new Date()
  if (input.dryRun === true || input.dry_run === true) {
    return dryRunProductionCycle(input.simulatedNow || now)
  }
  const clock = resolveProductionMatchCycle(now)
  if (!clock.isMatchDay) {
    return {
      status: 'blocked',
      reason_code: 'not_match_day',
      business_date: clock.businessDate,
      batch_key: clock.batchKey,
      match_cycle_id: clock.matchCycleId
    }
  }

  const acquisition = await deps.acquireBatch(batchRecord(input, clock, {
    status: 'running',
    started_at: deps.now()
  }))
  let batch = acquisition && acquisition.batch
  if (!batch) throw new Error('匹配批次占用失败')
  if (!acquisition.acquired) return batch

  const attempt = async () => persistResult(deps, batch, await runMatcher(deps, input, clock))
  try {
    return await attempt()
  } catch (error) {
    const redacted = redactBatchError(error)
    if (redacted.error_class === 'transient' && Number(batch.retry_count || 0) < 1) {
      try {
        batch = await deps.updateByDoc('match_batch_run', batch, { retry_count: 1 })
        return await attempt()
      } catch (retryError) {
        const retryRedacted = redactBatchError(retryError)
        return deps.updateByDoc('match_batch_run', batch, {
          status: 'failed',
          retry_count: 1,
          error_class: retryRedacted.error_class,
          reason_code: 'failed',
          completed_at: deps.now()
        })
      }
    }
    return deps.updateByDoc('match_batch_run', batch, {
      status: 'failed',
      retry_count: Number(batch.retry_count || 0),
      error_class: redacted.error_class,
      reason_code: 'failed',
      completed_at: deps.now()
    })
  }
}

module.exports = {
  runFormalMatchBatch,
  redactBatchError,
  batchRecord,
  formalBatchDocumentId
}
