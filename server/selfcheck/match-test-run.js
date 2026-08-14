const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { createMatchTestRunHandlers } = require('../../miniprogram/cloudfunctions/api/lib/matchTestRunService')
const { isInternalQaAccount } = require('../../miniprogram/cloudfunctions/api/lib/testIdentityPolicy')

const now = new Date('2026-08-14T08:00:00.000Z')
const qa = {
  id: 10,
  account_mode: 'internal_qa',
  profile_origin: 'real_user',
  member_status: 'approved',
  is_vip: 1,
  vip_expire_time: '2026-09-01T00:00:00.000Z',
  status: 1,
  gender: 1
}
const production = { id: 1, profile_origin: 'real_user', account_mode: 'production', openid: 'omOfficial', status: 1, gender: 1 }
const fixture = {
  id: 20,
  status: 1,
  gender: 2,
  member_status: 'approved',
  is_vip: 1,
  vip_expire_time: '2026-09-01T00:00:00.000Z',
  is_test_fixture: 1,
  fixture_owner_user_id: 10,
  fixture_expires_at: '2026-08-15T08:00:00.000Z',
  allow_date_coordination: 0
}

assert.strictEqual(isInternalQaAccount(qa), true)
assert.strictEqual(isInternalQaAccount(production), false)

function memory(user, extraUsers = []) {
  const tables = {
    user: [user, fixture].concat(extraUsers),
    match_batch_run: [],
    match_claim: [],
    user_match_setting: [
      { user_id: 10, self_view_text: '真诚稳定责任沟通共同经营家庭', target_view_text: '希望对方真诚稳定愿意认真进入婚姻' },
      { user_id: 20, self_view_text: '希望对方真诚稳定愿意认真进入婚姻', target_view_text: '真诚稳定责任沟通共同经营家庭' }
    ],
    user_match_log: []
  }
  let seq = 1
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const handlers = createMatchTestRunHandlers({
    currentUser: async () => user,
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (tables[name] || []).filter((row) => !query || matches(row, query)),
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      const row = { _id: `${name}_${seq}`, id: seq++, ...data }
      tables[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    now: () => now
  })
  return { tables, handlers }
}

async function main() {
  const prod = memory(production)
  await assert.rejects(() => prod.handlers.create({ request_id: 'req-aaaaaaaa' }, {}), /内部测试账号/)

  const qaMem = memory(qa)
  const created = await qaMem.handlers.create({ request_id: 'req-aaaaaaaa' }, {})
  assert.strictEqual(created.mode, 'internal_test')
  assert.strictEqual(created.status, 'queued')
  assert.ok(new Date(created.execute_after).getTime() >= now.getTime())
  const createdAgain = await qaMem.handlers.create({ request_id: 'req-aaaaaaaa' }, {})
  assert.strictEqual(createdAgain.id, created.id)

  const executed = await qaMem.handlers.execute({ id: created.id }, {})
  assert.ok(['completed_matched', 'completed_no_match', 'blocked'].includes(executed.status))
  assert.strictEqual(qaMem.tables.match_claim.length, 0)
  const executedAgain = await qaMem.handlers.execute({ id: created.id }, {})
  assert.strictEqual(executedAgain.id, executed.id)
  assert.strictEqual(qaMem.tables.match_batch_run.length, 1)

  const got = await qaMem.handlers.get({ id: created.id }, {})
  assert.strictEqual(got.id, created.id)

  const blockedMem = memory(qa, [])
  blockedMem.tables.user = [qa]
  const blocked = await blockedMem.handlers.create({ request_id: 'req-bbbbbbbb' }, {})
  const blockedExec = await blockedMem.handlers.execute({ id: blocked.id }, {})
  assert.strictEqual(blockedExec.status, 'blocked')

  const root = path.resolve(__dirname, '../..')
  const route = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
  const indexJs = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8')
  const indexWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxml'), 'utf8')
  assert(route.includes('/api/match/test-runs'))
  assert(indexWxml.includes('10 秒测试匹配') || indexWxml.includes('10秒测试匹配'))
  assert(indexWxml.includes('qaTestRunEnabled'))
  assert(indexJs.includes('testRunStatus'))
  assert(!indexJs.includes('reset_user_batch'))
  assert(indexJs.includes('MATCH_TEST_RUN') || indexJs.includes('/api/match/test-runs'))
  console.log('PASS isolated ten-second QA match runs never write formal claims')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
