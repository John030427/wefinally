const { isInternalQaAccount } = require('./testIdentityPolicy')

function boolFlag(value) {
  return value === true || value === 1 || value === '1'
}

function resolveQaTestRunEnabled(user = {}, publicTestRunEnabled = false) {
  if (boolFlag(user.qa_test_run_enabled)) return true
  if (isInternalQaAccount(user)) return true
  return !!publicTestRunEnabled
}

module.exports = {
  resolveQaTestRunEnabled,
  isInternalQaAccount
}
