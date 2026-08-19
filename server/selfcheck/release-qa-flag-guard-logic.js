const assert = require('assert')

function isTruthy(value) {
  const text = String(value || '').trim().toLowerCase()
  return value === true || value === 1 || text === 'true' || text === '1' || text === 'yes' || text === 'on'
}

function shouldFailRelease(envValue, dbEnabled) {
  return isTruthy(envValue) || dbEnabled === true
}

assert.strictEqual(shouldFailRelease('true', false), true)
assert.strictEqual(shouldFailRelease('false', true), true)
assert.strictEqual(shouldFailRelease('false', false), false)
assert.strictEqual(shouldFailRelease('', false), false)

const guardSource = require('fs').readFileSync(require('path').join(__dirname, 'release-qa-flag-guard.js'), 'utf8')
assert(guardSource.includes('PUBLIC_QA_TEST_FLAG_MUST_BE_DISABLED'))
assert(guardSource.includes('match_test_run_public_enabled'))

console.log('PASS release QA flag guard logic')
