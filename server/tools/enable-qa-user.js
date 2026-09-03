const { execSync } = require('child_process')
const path = require('path')

const envId = process.env.TCB_ENV || 'cloud1-d4gy8l52g08bba326'
const root = path.resolve(__dirname, '../../miniprogram')
const targetOpenid = process.env.QA_TARGET_OPENID || 'dev_wefinally_local_openid'

function parseJson(raw) {
  return JSON.parse(raw.slice(raw.indexOf('{')))
}

function nosqlUpdate(filter, set) {
  const payload = JSON.stringify([{
    TableName: 'users',
    CommandType: 'UPDATE',
    Command: JSON.stringify({
      update: 'users',
      updates: [{ q: filter, u: { $set: set }, multi: false }]
    })
  }])
  execSync(`tcb db nosql execute -e ${envId} --json --command ${JSON.stringify(payload)}`, {
    cwd: root,
    encoding: 'utf8'
  })
}

function nosqlFind(filter) {
  const payload = JSON.stringify([{
    TableName: 'users',
    CommandType: 'QUERY',
    Command: JSON.stringify({ find: 'users', filter, limit: 1 })
  }])
  const raw = execSync(`tcb db nosql execute -e ${envId} --json --command ${JSON.stringify(payload)}`, {
    cwd: root,
    encoding: 'utf8'
  })
  const parsed = parseJson(raw)
  const row = parsed && parsed.data && parsed.data.results && parsed.data.results[0] && parsed.data.results[0][0]
  return row || null
}

const before = nosqlFind({ openid: targetOpenid })
if (!before) {
  console.error(`Target user not found for openid=${targetOpenid}`)
  process.exit(1)
}

const patch = {
  qa_test_run_enabled: true,
  account_mode: 'internal_qa',
  profile_origin: before.profile_origin || 'real_user',
  member_status: before.member_status || 'approved',
  update_time: new Date().toISOString()
}

nosqlUpdate({ openid: targetOpenid }, patch)
const after = nosqlFind({ openid: targetOpenid })

console.log(JSON.stringify({
  openid: targetOpenid,
  before: {
    id: before.id,
    account_mode: before.account_mode || null,
    qa_test_run_enabled: before.qa_test_run_enabled,
    member_status: before.member_status || null
  },
  after: {
    id: after.id,
    account_mode: after.account_mode || null,
    qa_test_run_enabled: after.qa_test_run_enabled,
    member_status: after.member_status || null
  }
}, null, 2))
