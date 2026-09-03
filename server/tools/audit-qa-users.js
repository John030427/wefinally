const { execSync } = require('child_process')
const path = require('path')

const envId = process.env.TCB_ENV || 'cloud1-d4gy8l52g08bba326'
const root = path.resolve(__dirname, '../../miniprogram')

function parseJson(raw) {
  const start = raw.indexOf('{')
  return JSON.parse(raw.slice(start))
}

function normalize(value) {
  if (value && typeof value === 'object' && value.$numberInt !== undefined) {
    return Number(value.$numberInt)
  }
  if (value && typeof value === 'object' && value.$numberDouble !== undefined) {
    return Number(value.$numberDouble)
  }
  return value
}

function normalizeDoc(doc) {
  const output = {}
  Object.keys(doc || {}).forEach((key) => {
    output[key] = normalize(doc[key])
  })
  return output
}

function nosqlQuery(filter, limit = 10) {
  const cmd = { find: 'users', limit }
  if (filter) cmd.filter = filter
  const payload = JSON.stringify([{
    TableName: 'users',
    CommandType: 'QUERY',
    Command: JSON.stringify(cmd)
  }])
  const raw = execSync(`tcb db nosql execute -e ${envId} --json --command ${JSON.stringify(payload)}`, {
    cwd: root,
    encoding: 'utf8'
  })
  const parsed = parseJson(raw)
  const rows = parsed && parsed.data && parsed.data.results && parsed.data.results[0]
  return Array.isArray(rows) ? rows.map(normalizeDoc) : []
}

function summarize(user) {
  return {
    id: user.id,
    openid: user.openid,
    account_mode: user.account_mode || '(missing)',
    qa_test_run_enabled: user.qa_test_run_enabled,
    member_status: user.member_status,
    status: user.status,
    is_test: user.is_test,
    profile_origin: user.profile_origin || '(missing)',
    is_vip: user.is_vip
  }
}

const devLocal = nosqlQuery({ openid: 'dev_wefinally_local_openid' }, 5)
const internalQa = nosqlQuery({ account_mode: 'internal_qa' }, 20)
const qaFlag = nosqlQuery({ qa_test_run_enabled: true }, 20)
const testOpenids = nosqlQuery({ openid: { $regex: '^(dev|test|sc_)' } }, 15)

console.log(JSON.stringify({
  environment: envId,
  dev_wefinally_local_openid: devLocal.map(summarize),
  internal_qa: internalQa.map(summarize),
  qa_flag: qaFlag.map(summarize),
  test_like_openids: testOpenids.map(summarize)
}, null, 2))
