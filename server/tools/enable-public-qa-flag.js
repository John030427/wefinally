/**
 * DEV ONLY — enable public QA match simulator for internal testing.
 * Must set MATCH_TEST_RUN_PUBLIC_ENABLED=false and remove system_configs
 * row before experience build / audit / production release.
 * See: server/selfcheck/release-qa-flag-guard.js
 */
const { execSync } = require('child_process')
const path = require('path')

const envId = process.env.TCB_ENV || 'cloud1-d4gy8l52g08bba326'
const root = path.resolve(__dirname, '../../miniprogram')
const flagKey = 'match_test_run_public_enabled'

function parseJson(raw) {
  return JSON.parse(raw.slice(raw.indexOf('{')))
}

function apiEnvVars() {
  const raw = execSync(`tcb fn detail api -e ${envId} --json`, { cwd: root, encoding: 'utf8' })
  const detail = parseJson(raw)
  return (((detail.data || detail).Environment || {}).Variables) || []
}

function readPublicQaFlag() {
  const vars = apiEnvVars()
  const envRow = vars.find((row) => row.Key === 'MATCH_TEST_RUN_PUBLIC_ENABLED')
  return {
    env: envRow ? String(envRow.Value || '') : '(unset)',
    env_enabled: envRow ? String(envRow.Value).toLowerCase() === 'true' : false
  }
}

function nosqlQuery(filter) {
  const payload = JSON.stringify([{
    TableName: 'system_configs',
    CommandType: 'QUERY',
    Command: JSON.stringify({ find: 'system_configs', filter, limit: 5 })
  }])
  const raw = execSync(`tcb db nosql execute -e ${envId} --json --command ${JSON.stringify(payload)}`, {
    cwd: root,
    encoding: 'utf8'
  })
  const parsed = parseJson(raw)
  const rows = parsed && parsed.data && parsed.data.results && parsed.data.results[0]
  return Array.isArray(rows) ? rows : []
}

function nosqlUpsertConfig() {
  const existing = nosqlQuery({ key: flagKey })[0]
    || nosqlQuery({ config_key: flagKey })[0]
    || nosqlQuery({ name: flagKey })[0]
  const doc = Object.assign({
    key: flagKey,
    config_key: flagKey,
    name: flagKey,
    value: 'true',
    config_value: 'true',
    enabled: true,
    description: 'DEV ONLY: expose QA match simulator to all logged-in testers. Disable before release.'
  }, existing || {}, {
    _id: (existing && existing._id) || flagKey,
    value: 'true',
    config_value: 'true',
    enabled: true,
    update_time: new Date().toISOString()
  })
  const payload = JSON.stringify([{
    TableName: 'system_configs',
    CommandType: 'UPDATE',
    Command: JSON.stringify({
      update: 'system_configs',
      updates: [{
        q: { _id: doc._id },
        u: { $set: doc },
        upsert: true,
        multi: false
      }]
    })
  }])
  execSync(`tcb db nosql execute -e ${envId} --json --command ${JSON.stringify(payload)}`, {
    cwd: root,
    encoding: 'utf8'
  })
}

function setApiEnvTrue() {
  const vars = apiEnvVars()
  const mapped = vars.map((row) => ({ Key: row.Key, Value: row.Value }))
  const idx = mapped.findIndex((row) => row.Key === 'MATCH_TEST_RUN_PUBLIC_ENABLED')
  if (idx >= 0) mapped[idx].Value = 'true'
  else mapped.push({ Key: 'MATCH_TEST_RUN_PUBLIC_ENABLED', Value: 'true' })
  const body = JSON.stringify({
    FunctionName: 'api',
    Namespace: envId,
    Environment: { Variables: mapped }
  })
  execSync(`tcb api scf UpdateFunctionConfiguration --body ${JSON.stringify(body)}`, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
  })
}

function verifyProfileLogic() {
  const { resolveQaTestRunEnabled } = require('../../miniprogram/cloudfunctions/api/lib/qaAccessPolicy')
  const ordinary = { id: 999, account_mode: 'production', profile_origin: 'real_user' }
  assertTrue(resolveQaTestRunEnabled(ordinary, true), 'resolveQaTestRunEnabled with public flag')
}

function assertTrue(value, label) {
  if (!value) throw new Error(`${label} failed`)
}

const before = readPublicQaFlag()
console.log('Public QA flag before:', JSON.stringify(before))

nosqlUpsertConfig()
setApiEnvTrue()

const after = readPublicQaFlag()
verifyProfileLogic()

console.log(JSON.stringify({
  public_qa_flag_before: before,
  public_qa_flag_after: after,
  user_profile_qa_test_run_enabled_expectation: true,
  note: 'DEV ONLY — run release-qa-flag-guard before experience/audit/release'
}, null, 2))
