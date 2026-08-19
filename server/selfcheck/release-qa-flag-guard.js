/**
 * RELEASE GUARD — fails if public QA match simulator is enabled in CloudBase.
 * Run before WeChat experience upload, audit submission, or production release:
 *   npm --prefix server run selfcheck:release-guard
 *
 * DEV NOTE: match_test_run_public_enabled is intentionally ON only during
 * internal testing. It must be disabled in cloud env + system_configs before release.
 */
const { execSync } = require('child_process')
const path = require('path')

const envId = process.env.TCB_ENV || 'cloud1-d4gy8l52g08bba326'
const root = path.resolve(__dirname, '../../miniprogram')
const flagKey = 'match_test_run_public_enabled'
const ERROR_CODE = 'PUBLIC_QA_TEST_FLAG_MUST_BE_DISABLED'

function parseJson(raw) {
  return JSON.parse(raw.slice(raw.indexOf('{')))
}

function isTruthy(value) {
  const text = String(value || '').trim().toLowerCase()
  return value === true || value === 1 || text === 'true' || text === '1' || text === 'yes' || text === 'on'
}

function readApiEnvFlag() {
  const raw = execSync(`tcb fn detail api -e ${envId} --json`, { cwd: root, encoding: 'utf8' })
  const detail = parseJson(raw)
  const vars = (((detail.data || detail).Environment || {}).Variables) || []
  const row = vars.find((item) => item.Key === 'MATCH_TEST_RUN_PUBLIC_ENABLED')
  return row ? String(row.Value || '') : ''
}

function readDbFlag() {
  const payload = JSON.stringify([{
    TableName: 'system_configs',
    CommandType: 'QUERY',
    Command: JSON.stringify({
      find: 'system_configs',
      filter: { key: flagKey },
      limit: 1
    })
  }])
  const raw = execSync(`tcb db nosql execute -e ${envId} --json --command ${JSON.stringify(payload)}`, {
    cwd: root,
    encoding: 'utf8'
  })
  const parsed = parseJson(raw)
  const row = parsed && parsed.data && parsed.data.results && parsed.data.results[0] && parsed.data.results[0][0]
  if (!row) return false
  return isTruthy(row.value) || isTruthy(row.config_value) || isTruthy(row.enabled)
}

function main() {
  const envValue = readApiEnvFlag()
  const dbEnabled = readDbFlag()
  const envEnabled = isTruthy(envValue)
  if (envEnabled || dbEnabled) {
    console.error(`${ERROR_CODE}: match_test_run_public_enabled must be disabled before release`)
    console.error(JSON.stringify({
      api_env_MATCH_TEST_RUN_PUBLIC_ENABLED: envValue || '(unset)',
      system_configs_enabled: dbEnabled
    }, null, 2))
    process.exit(1)
  }
  console.log('PASS release QA public flag guard (disabled in CloudBase)')
}

main()
