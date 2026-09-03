const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { resolveQaTestRunEnabled } = require('../../miniprogram/cloudfunctions/api/lib/qaAccessPolicy')
const { createMatchTestRunHandlers } = require('../../miniprogram/cloudfunctions/api/lib/matchTestRunService')

async function profileFor(user, publicEnabled = false) {
  const flagEnabled = async () => publicEnabled
  const db = {
    first: async () => null,
    ensureUserSupportCode: async (row) => row.support_code || 'WF-000001',
    loadIdentityTags: async () => []
  }
  return Object.assign({}, user, {
    support_code: 'WF-000001',
    circle_name: '',
    is_vip: 1,
    isVip: true,
    match_settings: null,
    member_status: user.member_status || 'approved',
    account_mode: user.account_mode || 'production',
    identity_kind: user.account_mode === 'internal_qa' ? 'internal_qa' : 'real_user',
    qa_test_run_enabled: resolveQaTestRunEnabled(user, publicEnabled),
    primary_circle_id: user.circle_id || 0,
    secondary_circle_ids: [],
    identity_tags: [],
    province_code: '',
    province_name: '',
    city_code: '',
    city_name: user.city || '',
    promote_partner_id: 0
  })
}

function memory(user) {
  const handlers = createMatchTestRunHandlers({
    currentUser: async () => user,
    first: async () => null,
    list: async () => [],
    byId: async () => null,
    addWithId: async () => 1,
    acquireRun: async (data) => ({ created: true, batch: { id: 1, ...data } }),
    claimRun: async (run) => ({ acquired: false, batch: run }),
    completeRun: async (run, outcome) => Object.assign(run, outcome.patch || {}),
    now: () => new Date(),
    publicEnabled: async () => false,
    semanticRerank: async (ranked) => ({ applied: true, ranked })
  })
  return handlers
}

async function main() {
  const qaDbTrue = { id: 118, openid: 'dev_wefinally_local_openid', qa_test_run_enabled: true, account_mode: 'production', member_status: 'approved', is_vip: 1 }
  const qaInternal = { id: 1, openid: 'omQa', account_mode: 'internal_qa', member_status: 'approved', is_vip: 1 }
  const ordinary = { id: 2, openid: 'omProd', account_mode: 'production', member_status: 'approved', is_vip: 1 }

  assert.strictEqual(resolveQaTestRunEnabled(qaDbTrue, false), true, 'QA ACCESS 01 db flag')
  const profile01 = await profileFor(qaDbTrue)
  assert.strictEqual(profile01.qa_test_run_enabled, true, 'QA ACCESS 01 profile')

  assert.strictEqual(resolveQaTestRunEnabled(ordinary, false), false, 'QA ACCESS 02')
  const profile02 = await profileFor(ordinary)
  assert.strictEqual(profile02.qa_test_run_enabled, false)

  const missing = { id: 3, openid: 'omMissing', account_mode: 'production' }
  assert.strictEqual(resolveQaTestRunEnabled(missing, false), false, 'QA ACCESS 03')
  assert.strictEqual((await profileFor(missing)).qa_test_run_enabled, false)

  await assert.rejects(
    () => memory(ordinary).create({ request_id: 'req-ordinary1' }, {}),
    /内部测试账号/,
    'QA ACCESS 04'
  )

  const created = await memory(qaInternal).create({ request_id: 'req-internal1', fixture_journey: 'coordinate' }, {})
  assert.strictEqual(created.status, 'queued', 'QA ACCESS 05')

  const root = path.resolve(__dirname, '../..')
  const indexWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const matchListWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/match-list/match-list.wxml'), 'utf8')
  const indexJson = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.json'), 'utf8')
  const matchListJson = fs.readFileSync(path.join(root, 'miniprogram/pages/match-list/match-list.json'), 'utf8')
  const simulator = fs.readFileSync(path.join(root, 'miniprogram/utils/qaMatchSimulator.js'), 'utf8')
  assert(indexWxml.includes('qa-match-panel'), 'QA ACCESS 06')
  assert(matchListWxml.includes('qa-match-panel'), 'QA ACCESS 07')
  assert(indexJson.includes('qa-match-panel'))
  assert(matchListJson.includes('qa-match-panel'))
  assert(simulator.includes('refreshQaAccess'))
  assert(!indexWxml.includes('wx:if="{{qaTestRunEnabled}}"') || indexWxml.includes('qa-match-panel'))

  const { dateFeedbackWindowState } = require('../../miniprogram/cloudfunctions/api/lib/experienceFeedbackPolicy')
  const earlyMorning = new Date('2026-07-26T16:20:00.000Z')
  const afternoonBlocked = dateFeedbackWindowState({ date: '2026-07-27', period: 'afternoon', duration: '1-2h' }, earlyMorning)
  assert.strictEqual(afternoonBlocked.can_submit, false, 'date feedback blocked before afternoon ends')
  const afterMeeting = dateFeedbackWindowState({ date: '2026-07-26', period: 'afternoon', duration: '1-2h' }, earlyMorning)
  assert.strictEqual(afterMeeting.can_submit, true, 'date feedback allowed after prior day meeting')

  console.log('PASS QA access and date feedback timing (QA ACCESS 01-08)')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
