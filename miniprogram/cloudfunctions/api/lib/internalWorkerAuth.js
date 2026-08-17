const crypto = require('crypto')

function workerAuthError(message) {
  const error = new Error(message)
  error.code = 403
  return error
}

function assertInternalWorkerSecret(provided, configured = process.env.MATCH_WORKER_SECRET) {
  const expected = String(configured || '')
  const actual = String(provided || '')
  if (expected.length < 24 || actual.length !== expected.length) {
    throw workerAuthError('内部 worker 调用已拒绝')
  }
  const accepted = crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  if (!accepted) throw workerAuthError('内部 worker 调用已拒绝')
  return true
}

module.exports = { assertInternalWorkerSecret }
