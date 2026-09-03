const assert = require('assert')
const { executeFormalMatching } = require('../../miniprogram/cloudfunctions/api/lib/formalMatching')

const psych = JSON.stringify({
  marriage_pace: '稳定推进', conflict_style: '及时沟通', security_space: '亲密也独立',
  family_boundary: '边界清晰', money_view: '共同规划', career_family: '动态平衡'
})

function user(id, gender, birthYear, height) {
  return {
    _id: `user_${id}`,
    id,
    status: 1,
    member_status: 'approved',
    is_vip: 1,
    vip_expire_time: '2099-01-01T00:00:00.000Z',
    profile_origin: 'real_user',
    account_mode: 'production',
    gender,
    birth_year: birthYear,
    height_range: height,
    education: '本科',
    circle_id: 1,
    city: '深圳',
    baby_plan: '3-5年内',
    appearance_description: '干净清爽',
    appearance_want: '干净清爽'
  }
}

function setting(userId) {
  return {
    user_id: userId,
    age_min: 25,
    age_max: 40,
    min_education: '本科',
    like_circle_ids: '1',
    like_baby_plan: '3-5年内',
    self_view_text: '重视真诚责任稳定沟通共同规划生活家庭边界清晰',
    target_view_text: '重视真诚责任稳定沟通共同规划生活家庭边界清晰',
    psych_profile_json: psych
  }
}

function qaUser(id, gender, runStartedAt) {
  return {
    ...user(id, gender, gender === 1 ? 1992 : 1995, gender === 1 ? '175-180cm' : '160-165cm'),
    qa_test_run_enabled: true,
    qa_match_cohort: 'qa-real-device-registration-v1',
    qa_match_run_id: `qarun_${id}_${new Date(runStartedAt).getTime()}`,
    qa_match_run_started_at: new Date(runStartedAt)
  }
}

async function runHistoricalScenario(scenarioUsers, claims) {
  let deliveryInput = null
  const result = await executeFormalMatching({
    clock: { businessDate: '2026-08-28', matchType: '周五', matchCycleId: '2026-08-28-FRI' },
    deps: {
      list: async (name) => {
        if (name === 'user') return scenarioUsers
        if (name === 'match_claim') return claims
        if (name === 'user_match_setting') return scenarioUsers.map((row) => setting(row.id))
        return []
      },
      semanticRerank: async (ranked) => ({ applied: true, ranked }),
      deliverPair: async (input) => {
        deliveryInput = input
        return { delivered: true }
      }
    }
  })
  return { result, deliveryInput }
}

async function main() {
  const syntheticConflict = {
    ...user(3, 2, 1994, '160-165cm'),
    profile_origin: 'real_user',
    is_test_fixture: 1,
    fixture_access_mode: 'public_test_pool'
  }
  const hiddenFixture = {
    ...user(4, 2, 1994, '160-165cm'),
    formal_match_hidden: true
  }
  const users = [user(1, 1, 1992, '175-180cm'), user(2, 2, 1995, '160-165cm'), syntheticConflict, hiddenFixture]
  const settings = users.map((row) => setting(row.id))
  let semanticCalls = 0
  let deliveryInput = null
  let reportLog = null
  const result = await executeFormalMatching({
    clock: { businessDate: '2026-08-14', matchType: '周五', matchCycleId: '2026-08-14-FRI' },
    deps: {
      list: async (name) => {
        if (name === 'user') return users
        if (name === 'match_claim') return []
        if (name === 'user_match_setting') return settings
        return []
      },
      semanticRerank: async (ranked) => {
        semanticCalls += 1
        return { applied: true, ranked }
      },
      deliverPair: async (input) => {
        deliveryInput = input
        return {
          delivered: true,
          logA: { _id: 'match_log_1', id: 1, ...input.deliveryData.logA },
          logB: { _id: 'match_log_2', id: 2, ...input.deliveryData.logB }
        }
      },
      ensureReportTask: async (log) => { reportLog = log },
      addWithId: async () => { throw new Error('正式交付前禁止写入日志或审计') }
    }
  })
  assert.strictEqual(result.matched_count, 1)
  assert.strictEqual(result.users_considered, 2)
  assert.strictEqual(semanticCalls, 1)
  assert(deliveryInput.deliveryData)
  assert.strictEqual(deliveryInput.logA, undefined)
  assert.strictEqual(deliveryInput.deliveryData.audit.action, 'formal_batch')
  assert.strictEqual(reportLog.id, 1)

  let unavailableDelivered = false
  let unavailableAudit = null
  let unavailableLog = null
  const unavailable = await executeFormalMatching({
    clock: { businessDate: '2026-08-14', matchType: '周五', matchCycleId: '2026-08-14-FRI' },
    deps: {
      list: async (name) => {
        if (name === 'user') return users
        if (name === 'match_claim') return []
        if (name === 'user_match_setting') return settings
        return []
      },
      semanticRerank: async (ranked) => ({ applied: true, degraded: true, reason: 'semantic_retrieval_unavailable', ranked }),
      deliverPair: async (input) => {
        unavailableDelivered = true
        unavailableAudit = input.deliveryData && input.deliveryData.audit
        unavailableLog = input.deliveryData && input.deliveryData.logA
        return { delivered: true }
      }
    }
  })
  // Provider unavailable must fall back to deterministic delivery, not abort the batch.
  assert.strictEqual(unavailable.matched_count, 1)
  assert.strictEqual(unavailableDelivered, true)
  assert.strictEqual(unavailableAudit.degraded, true)
  assert.strictEqual(unavailableAudit.degraded_reason, 'semantic_retrieval_unavailable')
  assert.ok(unavailableLog.score_detail_json.includes('semantic_score'))

  let fixtureOnlySemanticCalls = 0
  let fixtureOnlyDeliveryCalls = 0
  const fixtureOnly = await executeFormalMatching({
    clock: { businessDate: '2026-08-14', matchType: '周五', matchCycleId: '2026-08-14-FRI' },
    deps: {
      list: async (name) => {
        if (name === 'user') return [user(1, 1, 1992, '175-180cm'), syntheticConflict]
        if (name === 'match_claim') return []
        if (name === 'user_match_setting') return [setting(1), setting(3)]
        return []
      },
      semanticRerank: async (ranked) => { fixtureOnlySemanticCalls += 1; return { applied: true, ranked } },
      deliverPair: async () => { fixtureOnlyDeliveryCalls += 1; return { delivered: true } }
    }
  })
  assert.strictEqual(fixtureOnly.matched_count, 0)
  assert.strictEqual(fixtureOnly.users_considered, 1)
  assert.strictEqual(fixtureOnlySemanticCalls, 0)
  assert.strictEqual(fixtureOnlyDeliveryCalls, 0)

  const oldQaClaim = {
    status: 'claimed',
    pair_key: '21-22',
    user_id: 21,
    match_user_id: 22,
    match_cycle_id: '2026-08-20-WED',
    create_time: new Date('2026-08-20T12:00:00.000Z')
  }
  const replayedQaUsers = [
    qaUser(21, 1, '2026-08-21T08:00:00.000Z'),
    qaUser(22, 2, '2026-08-21T08:05:00.000Z')
  ]
  const replayedQa = await runHistoricalScenario(replayedQaUsers, [oldQaClaim])
  assert.strictEqual(replayedQa.result.matched_count, 1)
  assert.match(replayedQa.deliveryInput.qaMatchRunKey, /^qarunpair_[a-f0-9]{24}$/)
  assert.strictEqual(replayedQa.deliveryInput.deliveryData.audit.qa_match_run_key, replayedQa.deliveryInput.qaMatchRunKey)

  const currentQaClaim = {
    ...oldQaClaim,
    create_time: new Date('2026-08-22T12:00:00.000Z')
  }
  const blockedQa = await runHistoricalScenario(replayedQaUsers, [currentQaClaim])
  assert.strictEqual(blockedQa.result.matched_count, 0)
  assert.strictEqual(blockedQa.deliveryInput, null)

  const productionUsers = [user(31, 1, 1992, '175-180cm'), user(32, 2, 1995, '160-165cm')]
  const blockedProduction = await runHistoricalScenario(productionUsers, [{
    ...oldQaClaim,
    pair_key: '31-32',
    user_id: 31,
    match_user_id: 32
  }])
  assert.strictEqual(blockedProduction.result.matched_count, 0)
  assert.strictEqual(blockedProduction.deliveryInput, null)
  console.log('PASS formal matching reranks then atomically prepares delivery and report task')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
