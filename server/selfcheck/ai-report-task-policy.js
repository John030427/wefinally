const assert = require('assert')
const {
  STATUS,
  taskId,
  canUserRequest,
  canRetry,
  classifyError,
  retentionDates,
  leaseExpired
} = require('../../miniprogram/cloudfunctions/api/lib/reportTaskPolicy')

assert.strictEqual(taskId('pair_12', 1), 'match-report-pair_12-v1')
assert.strictEqual(canUserRequest(STATUS.NOT_REQUESTED), true)
assert.strictEqual(canUserRequest(STATUS.FAILED), true)
assert.strictEqual(canUserRequest(STATUS.SUCCEEDED), false)
assert.strictEqual(STATUS.EXPIRED, 'expired')
assert.strictEqual(canUserRequest(STATUS.EXPIRED), false)
assert.strictEqual(canRetry({ status: STATUS.FAILED, attempt_count: 2 }), true)
assert.strictEqual(canRetry({ status: STATUS.FAILED, attempt_count: 3, manual_retry_count: 0 }), true)
assert.strictEqual(canRetry({ status: STATUS.FAILED, manual_retry_count: 2 }), true)
assert.strictEqual(canRetry({ status: STATUS.FAILED, manual_retry_count: 3 }), false)
assert.strictEqual(classifyError(new Error('DeepSeek HTTP 429')).retryable, true)
assert.strictEqual(classifyError(new Error('socket hang up')).retryable, true)
assert.strictEqual(classifyError(new Error('getaddrinfo EAI_AGAIN api.deepseek.com')).retryable, true)
assert.strictEqual(classifyError(new Error('report schema invalid')).retryable, false)

const leaseNow = new Date('2026-07-16T08:00:00.000Z')
assert.strictEqual(leaseExpired({
  status: STATUS.GENERATING,
  started_at: new Date('2026-07-16T07:57:59.999Z')
}, leaseNow, 120000), true)
assert.strictEqual(leaseExpired({
  status: STATUS.GENERATING,
  started_at: new Date('2026-07-16T07:59:00.000Z')
}, leaseNow, 120000), false)
assert.strictEqual(leaseExpired({
  status: STATUS.QUEUED,
  started_at: new Date('2026-07-16T07:00:00.000Z')
}, leaseNow, 120000), false)

const generatedAt = new Date('2026-07-11T00:00:00.000Z')
const dates = retentionDates(generatedAt)
assert.strictEqual(dates.input_expires_at.toISOString(), '2026-08-10T00:00:00.000Z')
assert.strictEqual(dates.report_expires_at.toISOString(), '2027-07-11T00:00:00.000Z')

console.log('PASS ai report task policy')
