const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { createMatchTestRunHandlers } = require('../../miniprogram/cloudfunctions/api/lib/matchTestRunService')
const { isInternalQaAccount } = require('../../miniprogram/cloudfunctions/api/lib/testIdentityPolicy')

const initialNow = new Date('2026-08-14T08:00:00.000Z')
const qa = {
  id: 10,
  account_mode: 'internal_qa',
  profile_origin: 'real_user',
  member_status: 'approved',
  is_vip: 1,
  vip_expire_time: '2026-09-01T00:00:00.000Z',
  status: 1,
  gender: 1,
  birth_year: 1992,
  height_range: '175-180cm',
  education: '本科',
  circle_id: 1,
  city: '汕头',
  baby_plan: '3-5年内',
  appearance_description: '干净清爽',
  appearance_want: '干净清爽'
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
  allow_date_coordination: 0,
  birth_year: 1995,
  height_range: '160-165cm',
  education: '本科',
  circle_id: 1,
  city: '汕头',
  baby_plan: '3-5年内',
  appearance_description: '干净清爽',
  appearance_want: '干净清爽'
}
const publicUser = { ...qa, id: 1, account_mode: 'production', openid: 'omOfficial' }

assert.strictEqual(isInternalQaAccount(qa), true)
assert.strictEqual(isInternalQaAccount(production), false)

function memory(user, extraUsers = [], options = {}) {
  let clock = new Date(initialNow)
  const semanticCalls = []
  const psych = JSON.stringify({
    marriage_pace: '稳定推进', conflict_style: '及时沟通', security_space: '亲密也独立',
    family_boundary: '边界清晰', money_view: '共同规划', career_family: '动态平衡'
  })
  const compatibleSetting = (userId) => ({
    user_id: userId,
    age_min: 25,
    age_max: 40,
    height_min: 155,
    height_max: 185,
    min_education: '本科',
    like_circle_ids: '1',
    like_baby_plan: '3-5年内',
    self_view_text: '真诚稳定责任沟通共同经营家庭边界清晰',
    target_view_text: '真诚稳定责任沟通共同经营家庭边界清晰',
    psych_profile_json: psych
  })
  const tables = {
    user: [user, fixture].concat(extraUsers),
    match_batch_run: [],
    match_claim: [],
    user_match_setting: [compatibleSetting(user.id), compatibleSetting(20)],
    user_match_log: []
  }
  let seq = 1
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const acquireRun = async (data) => {
    const existing = tables.match_batch_run.find((row) => row.batch_key === data.batch_key)
    if (existing) return { created: false, batch: existing }
    const row = { _id: `match_batch_run_${seq}`, id: seq++, ...data }
    tables.match_batch_run.push(row)
    return { created: true, batch: row }
  }
  const claimRun = async (run) => {
    if (!['queued', 'failed'].includes(run.status) || new Date(run.execute_after).getTime() > clock.getTime()) {
      return { acquired: false, batch: run }
    }
    Object.assign(run, { status: 'running', execution_token: `token-${run.id}` })
    return { acquired: true, batch: run }
  }
  const completeRun = async (run, outcome) => {
    if (run.status !== 'running' || run.execution_token !== `token-${run.id}`) throw new Error('lost execution')
    let matchId = null
    if (outcome.log) {
      const log = { _id: `user_match_log_${seq}`, id: seq++, ...outcome.log }
      tables.user_match_log.push(log)
      matchId = log.id
    }
    Object.assign(run, outcome.patch, { match_id: matchId, execution_token: '' })
    return run
  }
  const handlers = createMatchTestRunHandlers({
    currentUser: async () => user,
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (tables[name] || []).filter((row) => !query || matches(row, query)),
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    acquireRun,
    claimRun,
    completeRun,
    now: () => new Date(clock),
    publicEnabled: async () => options.publicEnabled === true,
    semanticRerank: async (ranked, currentUser, settingsByUserId) => {
      semanticCalls.push({ ranked, currentUser, settingsByUserId })
      if (options.semanticApplied === false) {
        return { applied: false, reason: 'disabled', model: '', ranked }
      }
      return {
        applied: true,
        reason: '',
        model: 'deepseek-chat',
        ranked: ranked.map((item, index) => ({
          ...item,
          ai_rank: index + 1,
          ai_weight: 0.2,
          semantic_score: 89,
          a_to_b_semantic_score: 88,
          b_to_a_semantic_score: 86,
          mutual_semantic_score: 87,
          semantic_strengths: ['双向长期关系目标一致'],
          semantic_confidence: 0.88,
          data_completeness: 0.82,
          asymmetric_risks: ['婚育时间需要确认'],
          confirmation_questions: ['双方可接受的婚育时间窗口是什么？']
        }))
      }
    }
  })
  return { tables, handlers, semanticCalls, advance: (milliseconds) => { clock = new Date(clock.getTime() + milliseconds) } }
}

async function main() {
  const prod = memory(production)
  await assert.rejects(() => prod.handlers.create({ request_id: 'req-aaaaaaaa' }, {}), /内部测试账号/)
  const spoofed = memory({ ...production, openid: 'test_spoofed_user' })
  await assert.rejects(() => spoofed.handlers.create({ request_id: 'req-spoofed1' }, {}), /内部测试账号/)

  const publicRun = memory(publicUser, [], { publicEnabled: true })
  publicRun.tables.user.find((row) => row.id === fixture.id).fixture_access_mode = 'public_test_pool'
  const publicCreated = await publicRun.handlers.create({ request_id: 'req-public01' }, {})
  assert.strictEqual(publicCreated.status, 'queued')
  publicRun.advance(10000)
  const publicCompleted = await publicRun.handlers.execute({ id: publicCreated.id }, {})
  assert.strictEqual(publicCompleted.status, 'completed_matched')
  assert.strictEqual(publicCompleted.matched_count, 1)
  assert.strictEqual(publicRun.tables.match_claim.length, 0)
  assert.strictEqual(publicRun.semanticCalls.length, 1)
  const publicLog = publicRun.tables.user_match_log[0]
  assert.strictEqual(publicLog.score_version, 'algo_evidence_v2')
  const scoreDetail = JSON.parse(publicLog.score_detail_json)
  const counterpartScoreDetail = JSON.parse(publicLog.counterpart_score_detail_json)
  assert.strictEqual(scoreDetail.ai_rerank.applied, true)
  assert.strictEqual(scoreDetail.ai_rerank.model, 'deepseek-chat')
  assert.strictEqual(scoreDetail.normalized_total, scoreDetail.normalizedTotal)
  assert(scoreDetail.normalized_total < publicLog.total_score)
  assert.strictEqual(counterpartScoreDetail.ai_rerank.applied, true)
  assert.strictEqual(scoreDetail.mutual_semantic_score, 87)

  const unavailable = memory(publicUser, [], { publicEnabled: true, semanticApplied: false })
  unavailable.tables.user.find((row) => row.id === fixture.id).fixture_access_mode = 'public_test_pool'
  const unavailableCreated = await unavailable.handlers.create({ request_id: 'req-ai-down1' }, {})
  unavailable.advance(10000)
  const unavailableCompleted = await unavailable.handlers.execute({ id: unavailableCreated.id }, {})
  assert.strictEqual(unavailableCompleted.status, 'failed')
  assert.strictEqual(unavailableCompleted.reason_code, 'ai_rerank_unavailable')
  assert.strictEqual(unavailable.tables.user_match_log.length, 0)

  const qaMem = memory(qa)
  const [created, concurrentCreate] = await Promise.all([
    qaMem.handlers.create({ request_id: 'req-aaaaaaaa' }, {}),
    qaMem.handlers.create({ request_id: 'req-aaaaaaaa' }, {})
  ])
  assert.strictEqual(created.mode, 'internal_test')
  assert.strictEqual(created.status, 'queued')
  assert.ok(new Date(created.execute_after).getTime() >= initialNow.getTime())
  assert.strictEqual(concurrentCreate.id, created.id)
  const createdAgain = await qaMem.handlers.create({ request_id: 'req-aaaaaaaa' }, {})
  assert.strictEqual(createdAgain.id, created.id)

  const early = await qaMem.handlers.execute({ id: created.id }, {})
  assert.strictEqual(early.status, 'queued')
  assert.strictEqual(qaMem.tables.user_match_log.length, 0)
  qaMem.advance(10000)
  const concurrent = await Promise.all([
    qaMem.handlers.execute({ id: created.id }, {}),
    qaMem.handlers.execute({ id: created.id }, {})
  ])
  const executed = concurrent.find((row) => row.status === 'completed_matched') || concurrent[0]
  assert.ok(['completed_matched', 'completed_no_match', 'blocked', 'running'].includes(executed.status))
  assert.strictEqual(qaMem.tables.user_match_log.length, 1)
  assert.strictEqual(qaMem.tables.match_claim.length, 0)
  const executedAgain = await qaMem.handlers.execute({ id: created.id }, {})
  assert.strictEqual(executedAgain.id, executed.id)
  assert.strictEqual(qaMem.tables.match_batch_run.length, 1)

  const got = await qaMem.handlers.get({ id: created.id }, {})
  assert.strictEqual(got.id, created.id)

  const blockedMem = memory(qa, [])
  blockedMem.tables.user = [qa]
  const blocked = await blockedMem.handlers.create({ request_id: 'req-bbbbbbbb' }, {})
  blockedMem.advance(10000)
  const blockedExec = await blockedMem.handlers.execute({ id: blocked.id }, {})
  assert.strictEqual(blockedExec.status, 'blocked')

  const root = path.resolve(__dirname, '../..')
  const route = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
  const indexJs = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8')
  const indexWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const profileWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.wxml'), 'utf8')
  const userHandler = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/user.js'), 'utf8')
  assert(route.includes('/api/match/test-runs'))
  assert(indexWxml.includes('10 秒测试匹配') || indexWxml.includes('10秒测试匹配'))
  assert(indexWxml.includes('匹配测试'))
  assert(!indexWxml.includes('>内部测试</text>'))
  assert(indexWxml.includes('qaTestRunEnabled'))
  assert(indexJs.includes('testRunStatus'))
  assert(!indexJs.includes('reset_user_batch'))
  assert(indexJs.includes('MATCH_TEST_RUN') || indexJs.includes('/api/match/test-runs'))
  assert(indexJs.includes('refreshLatestMatch'))
  assert(indexJs.includes("run.status === 'completed_matched'"))
  assert(indexJs.includes('await this.refreshLatestMatch()'))
  assert(indexJs.includes("failed: run && run.message || '测试运行失败，可安全重试'"))
  assert(profileWxml.includes('userInfo.support_code'))
  assert(userHandler.includes('match_test_run_public_enabled'))
  console.log('PASS isolated ten-second QA match runs never write formal claims')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
