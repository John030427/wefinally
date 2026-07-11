const STATUS = Object.freeze({
  NOT_REQUESTED: 'not_requested',
  QUEUED: 'queued',
  GENERATING: 'generating',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  DISABLED: 'disabled',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
})

const MAX_ATTEMPTS = 3

function taskId(matchGroupId, version) {
  return `match-report-${String(matchGroupId)}-v${Number(version || 1)}`
}

function canUserRequest(status) {
  return status === STATUS.NOT_REQUESTED || status === STATUS.FAILED
}

function canRetry(task) {
  return Boolean(task && task.status === STATUS.FAILED && Number(task.manual_retry_count || 0) < 2)
}

function classifyError(err) {
  const message = String((err && err.message) || err || '')
  const retryable = /timeout|timed out|ECONN|ENOTFOUND|HTTP 429|HTTP 5\d\d/i.test(message)
  return {
    code: /429/.test(message) ? 'rate_limited' : (retryable ? 'provider_unavailable' : 'invalid_output'),
    retryable,
    message: message.slice(0, 500)
  }
}

function addDays(value, days) {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

function retentionDates(generatedAt) {
  return {
    input_expires_at: addDays(generatedAt, 30),
    report_expires_at: addDays(generatedAt, 365)
  }
}

module.exports = {
  STATUS,
  MAX_ATTEMPTS,
  taskId,
  canUserRequest,
  canRetry,
  classifyError,
  retentionDates
}
