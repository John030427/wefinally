const MAX_COORDINATION_ROUNDS = 5

const PROCESSING_STATUS = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
})

function dateValue(value, fallback = new Date()) {
  const parsed = new Date(value || fallback)
  if (Number.isNaN(parsed.getTime())) throw new Error('协调处理时间无效')
  return parsed
}

function nextProcessingStatus(current, event) {
  const transitions = {
    [PROCESSING_STATUS.QUEUED]: {
      claim: PROCESSING_STATUS.PROCESSING
    },
    [PROCESSING_STATUS.PROCESSING]: {
      complete: PROCESSING_STATUS.COMPLETED,
      fail: PROCESSING_STATUS.FAILED,
      lease_expired: PROCESSING_STATUS.QUEUED
    },
    [PROCESSING_STATUS.FAILED]: {
      retry: PROCESSING_STATUS.QUEUED
    }
  }
  const next = transitions[current] && transitions[current][event]
  if (!next) throw new Error('当前处理状态不能执行该操作')
  return next
}

function roundNumber(coordination = {}) {
  const count = Math.max(0, Number(coordination.recoordination_count || 0))
  return Math.min(MAX_COORDINATION_ROUNDS, count + 1)
}

function canStartAnotherRound(coordination = {}) {
  return roundNumber(coordination) < MAX_COORDINATION_ROUNDS
}

function enqueueProcessing(coordination = {}, input = {}) {
  const version = Number(input.version || coordination.coordination_version || 0)
  if (!Number.isSafeInteger(version) || version <= 0) throw new Error('协调版本无效')
  const now = dateValue(input.now)
  return Object.assign({}, coordination, {
    status: 'computing_overlap',
    business_state: 'processing',
    processing_status: PROCESSING_STATUS.QUEUED,
    processing_version: version,
    processing_token: '',
    processing_started_at: null,
    processing_completed_at: null,
    processing_error_code: '',
    last_event_at: now
  })
}

function claimProcessingVersion(coordination = {}, input = {}) {
  const token = String(input.token || '').trim()
  if (!token) throw new Error('协调处理凭证无效')
  const version = Number(coordination.coordination_version || 0)
  if (coordination.status !== 'computing_overlap'
    || coordination.processing_status !== PROCESSING_STATUS.QUEUED
    || Number(coordination.processing_version || 0) !== version) {
    throw new Error('协调任务当前不可领取')
  }
  const now = dateValue(input.now)
  return Object.assign({}, coordination, {
    processing_status: nextProcessingStatus(coordination.processing_status, 'claim'),
    processing_token: token,
    processing_attempts: Number(coordination.processing_attempts || 0) + 1,
    processing_started_at: now,
    processing_error_code: '',
    last_event_at: now
  })
}

function completeProcessingVersion(coordination = {}, input = {}) {
  const version = Number(input.version || 0)
  const token = String(input.token || '').trim()
  if (version !== Number(coordination.coordination_version || 0)
    || version !== Number(coordination.processing_version || 0)) {
    return { applied: false, reason: 'stale_processing_version', coordination: Object.assign({}, coordination) }
  }
  if (coordination.processing_status !== PROCESSING_STATUS.PROCESSING
    || !token
    || token !== String(coordination.processing_token || '')) {
    return { applied: false, reason: 'stale_processing_lease', coordination: Object.assign({}, coordination) }
  }
  const now = dateValue(input.now)
  return {
    applied: true,
    reason: '',
    coordination: Object.assign({}, coordination, {
      processing_status: nextProcessingStatus(coordination.processing_status, 'complete'),
      processing_token: '',
      processing_completed_at: now,
      processing_error_code: '',
      last_event_at: now
    })
  }
}

module.exports = {
  MAX_COORDINATION_ROUNDS,
  PROCESSING_STATUS,
  nextProcessingStatus,
  roundNumber,
  canStartAnotherRound,
  enqueueProcessing,
  claimProcessingVersion,
  completeProcessingVersion
}
