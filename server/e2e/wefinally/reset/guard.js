'use strict'

function assertSafeRunId(runId) {
  if (!runId || typeof runId !== 'string') {
    throw new Error('Refusing operation: missing runId')
  }
  if (runId.length < 8 || runId.length > 80) {
    throw new Error('Refusing operation: runId length out of bounds')
  }
  if (/[;'"\\]/.test(runId)) {
    throw new Error('Refusing operation: unsafe runId characters')
  }
}

function assertSafeOpenidPrefix(openid) {
  if (!/^e2e_[a-z0-9_]+$/i.test(String(openid || ''))) {
    throw new Error(`Refusing seed: openid must match e2e_* pattern, got ${openid}`)
  }
}

function assertSafeCleanupTarget(runId) {
  assertSafeRunId(runId)
  if (!String(runId).startsWith('e2e_')) {
    throw new Error(`Refusing cleanup: runId must start with e2e_, got ${runId}`)
  }
}

function assertRowIsE2eTest(row) {
  if (!row) return false
  if (row.is_test_fixture === 1 || row.is_test_fixture === true) return true
  if (row.profile_origin === 'synthetic_fixture') return true
  if (row.e2e_run_id) return true
  if (row.fixture_run_id && String(row.fixture_run_id).startsWith('e2e_')) return true
  if (row.openid && /^e2e_/i.test(String(row.openid))) return true
  return false
}

module.exports = {
  assertSafeCleanupTarget,
  assertRowIsE2eTest,
  assertSafeRunId,
  assertSafeOpenidPrefix
}
