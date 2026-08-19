const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { shanghaiBusinessClock } = require('../../miniprogram/cloudfunctions/api/lib/businessClock')
const {
  resolveProductionMatchCycle,
  buildQaMatchCycle,
  indexClaimsForMatching,
  userHasProductionClaimInCycle,
  dryRunProductionCycle,
  formalBatchDocumentId,
  isProductionClaim,
  isClaimInCycle
} = require('../../miniprogram/cloudfunctions/api/lib/matchCycleService')
const { runFormalMatchBatch } = require('../../miniprogram/cloudfunctions/api/lib/matchingRunService')
const { executeFormalMatching } = require('../../miniprogram/cloudfunctions/api/lib/formalMatching')
const {
  claimPair,
  deliverPair,
  claimDocumentIds,
  cycleSlug,
  canonicalPairKey
} = require('../../miniprogram/cloudfunctions/api/lib/matchClaim')
const { createMatchTestRunHandlers } = require('../../miniprogram/cloudfunctions/api/lib/matchTestRunService')
const { filterCandidatesByJourney, poolEntryForJourney } = require('../../miniprogram/cloudfunctions/api/lib/qaFixturePool')
const { isInternalQaAccount } = require('../../miniprogram/cloudfunctions/api/lib/testIdentityPolicy')

const wednesdayUtc = new Date('2026-08-11T16:00:00.000Z')
const fridayUtc = new Date('2026-08-13T16:00:00.000Z')
const nextWednesdayUtc = new Date('2026-08-18T16:00:00.000Z')
const thursdayUtc = new Date('2026-08-12T16:00:00.000Z')

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

function productionClaim(userId, partnerId, cycleId, pairKey) {
  return {
    user_id: userId,
    match_user_id: partnerId,
    pair_key: pairKey || canonicalPairKey(userId, partnerId),
    status: 'claimed',
    match_cycle_id: cycleId,
    qa_cycle: 0,
    is_test: 0
  }
}

function createCycleClaimStore() {
  const claims = new Map()
  let queue = Promise.resolve()
  function scopedUserKey(id, cycleId) {
    const slug = cycleId ? cycleSlug(cycleId) : ''
    return slug ? `user:${id}:${slug}` : `user:${id}`
  }
  function scopedPairKey(pairKey, cycleId) {
    const slug = cycleId ? cycleSlug(cycleId) : ''
    return slug ? `pair:${pairKey}:${slug}` : `pair:${pairKey}`
  }
  return {
    claims,
    runAtomic(work) {
      const execute = queue.then(() => work({
        findByUserIds: async (ids, cycleId) => ids
          .map((id) => claims.get(scopedUserKey(id, cycleId)))
          .filter(Boolean),
        findByPairKey: async (pairKey, cycleId) => claims.get(scopedPairKey(pairKey, cycleId)) || null,
        createClaim: async (claim) => {
          const cycleId = claim.match_cycle_id || null
          claims.set(scopedUserKey(claim.user_id, cycleId), claim)
          claims.set(scopedUserKey(claim.match_user_id, cycleId), claim)
          claims.set(scopedPairKey(claim.pair_key, cycleId), claim)
          return claim
        }
      }))
      queue = execute.catch(() => {})
      return execute
    }
  }
}

async function runFormal(clock, users, settings, claims, options = {}) {
  const deliveries = []
  return executeFormalMatching({
    clock,
    deps: {
      list: async (name) => {
        if (name === 'user') return users
        if (name === 'match_claim') return claims
        if (name === 'user_match_setting') return settings
        return []
      },
      semanticRerank: async (ranked) => ({ applied: true, ranked }),
      deliverPair: async (input) => {
        deliveries.push(input)
        if (options.failDelivery) return { delivered: false }
        return { delivered: true, logA: { id: deliveries.length, ...input.deliveryData.logA } }
      }
    }
  })
}

function compatibleSetting(userId) {
  return {
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
  }
}

function qaOwnerProfile() {
  return {
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
}
function qaFixture(id, ownerId, journey, extra = {}) {
  const now = new Date('2026-08-14T08:00:00.000Z')
  return Object.assign({
    id,
    status: 1,
    gender: 2,
    member_status: 'approved',
    is_vip: 1,
    vip_expire_time: '2026-09-01T00:00:00.000Z',
    is_test_fixture: 1,
    profile_origin: 'synthetic_fixture',
    fixture_owner_user_id: ownerId,
    fixture_expires_at: new Date(now.getTime() + 86400000).toISOString(),
    fixture_journey: journey,
    fixture_access_mode: 'owned',
    birth_year: 1995,
    height_range: '160-165cm',
    education: '本科',
    circle_id: 1,
    city: '汕头',
    baby_plan: '3-5年内',
    appearance_description: '干净清爽',
    appearance_want: '干净清爽'
  }, extra)
}

function qaMemory(owner, fixtures, options = {}) {
  let clock = new Date('2026-08-14T08:00:00.000Z')
  const tables = {
    user: [owner].concat(fixtures),
    match_batch_run: [],
    match_claim: [],
    user_match_setting: [compatibleSetting(owner.id)].concat(fixtures.map((row) => compatibleSetting(row.id))),
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
    currentUser: async () => owner,
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (tables[name] || []).filter((row) => !query || matches(row, query)),
    byId: async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null,
    addWithId: async (name, data) => {
      if (name === 'user_match_setting') {
        const row = { _id: `${name}_${seq}`, id: seq++, ...compatibleSetting(data.user_id) }
        tables.user_match_setting.push(row)
        return row.id
      }
      const row = { _id: `${name}_${seq}`, id: seq++, ...data }
      tables[name].push(row)
      return row.id
    },
    acquireRun,
    claimRun,
    completeRun,
    now: () => new Date(clock),
    publicEnabled: async () => options.publicEnabled === true,
    semanticRerank: async (ranked, currentUser, settingsByUserId) => ({
      applied: true,
      model: 'deepseek-chat',
      ranked: ranked.map((item, index) => Object.assign({}, item, {
        ai_rank: index + 1,
        ai_weight: 0.2,
        semantic_score: 89,
        a_to_b_semantic_score: 88,
        b_to_a_semantic_score: 86,
        mutual_semantic_score: 87,
        semantic_strengths: ['双向长期关系目标一致'],
        semantic_confidence: 0.88,
        data_completeness: 0.82,
        quality: { pass: true, reasons: [], diagnostics: [] }
      }))
    })
  })
  return { tables, handlers, advance: (ms) => { clock = new Date(clock.getTime() + ms) } }
}

async function main() {
  // MATCH CYCLE 01 — WED cycle id correct
  const wedCycle = resolveProductionMatchCycle(wednesdayUtc)
  assert.strictEqual(wedCycle.businessDate, '2026-08-12')
  assert.strictEqual(wedCycle.matchCycleId, '2026-08-12-WED')
  assert.strictEqual(wedCycle.batchKey, 'formal:2026-08-12-WED')
  assert.strictEqual(dryRunProductionCycle(wednesdayUtc).match_cycle_id, '2026-08-12-WED')

  // MATCH CYCLE 02 — FRI cycle id correct
  const friCycle = resolveProductionMatchCycle(fridayUtc)
  assert.strictEqual(friCycle.businessDate, '2026-08-14')
  assert.strictEqual(friCycle.matchCycleId, '2026-08-14-FRI')
  assert.strictEqual(friCycle.batchKey, 'formal:2026-08-14-FRI')

  // MATCH CYCLE 03 — non-match days do not create production cycle
  const thu = resolveProductionMatchCycle(thursdayUtc)
  assert.strictEqual(thu.isMatchDay, false)
  assert.strictEqual(thu.matchCycleId, '')
  assert.strictEqual(dryRunProductionCycle(thursdayUtc).is_match_day, false)
  assert.strictEqual(dryRunProductionCycle(thursdayUtc).match_cycle_id, '')

  // MATCH CYCLE 04 — same user same cycle at most one match
  const usersFour = [
    user(1, 1, 1992, '175-180cm'),
    user(2, 2, 1995, '160-165cm'),
    user(3, 1, 1990, '170-175cm'),
    user(4, 2, 1993, '160-165cm')
  ]
  const settingsFour = usersFour.map((row) => setting(row.id))
  const friClock = { businessDate: '2026-08-14', matchType: '周五', matchCycleId: '2026-08-14-FRI' }
  const claimsFour = [productionClaim(1, 2, '2026-08-14-FRI')]
  const resultFour = await runFormal(friClock, usersFour, settingsFour, claimsFour)
  assert.strictEqual(resultFour.matched_count, 1)
  const indexedFour = indexClaimsForMatching(claimsFour, '2026-08-14-FRI')
  assert.strictEqual(indexedFour.cycleClaimed.has(1), true)
  assert.strictEqual(indexedFour.cycleClaimed.has(2), true)
  assert.strictEqual(indexedFour.cycleClaimed.has(3), false)

  // MATCH CYCLE 05 — WED matched, FRI still eligible
  const claimsFive = [productionClaim(1, 2, '2026-08-12-WED')]
  const indexedFive = indexClaimsForMatching(claimsFive, '2026-08-14-FRI')
  assert.strictEqual(indexedFive.cycleClaimed.has(1), false)
  assert.strictEqual(userHasProductionClaimInCycle(1, claimsFive, '2026-08-14-FRI'), false)
  const resultFive = await runFormal(friClock, [user(1, 1, 1992, '175-180cm'), user(3, 2, 1995, '160-165cm')], [setting(1), setting(3)], claimsFive)
  assert.strictEqual(resultFive.matched_count, 1)

  // MATCH CYCLE 06 — FRI matched, next WED still eligible
  const claimsSix = [productionClaim(1, 2, '2026-08-14-FRI')]
  assert.strictEqual(userHasProductionClaimInCycle(1, claimsSix, '2026-08-19-WED'), false)
  const wedClock = { businessDate: '2026-08-19', matchType: '周三', matchCycleId: '2026-08-19-WED' }
  const resultSix = await runFormal(wedClock, [user(1, 1, 1992, '175-180cm'), user(4, 2, 1994, '160-165cm')], [setting(1), setting(4)], claimsSix)
  assert.strictEqual(resultSix.matched_count, 1)

  // MATCH CYCLE 07 — legacy claim without cycle does not block new cycle
  const legacyClaim = {
    user_id: 1,
    match_user_id: 99,
    pair_key: '1-99',
    status: 'claimed',
    match_cycle_id: null,
    qa_cycle: 0,
    is_test: 0
  }
  const indexedSeven = indexClaimsForMatching([legacyClaim], '2026-08-14-FRI')
  assert.strictEqual(indexedSeven.cycleClaimed.has(1), false)
  const resultSeven = await runFormal(
    friClock,
    [user(1, 1, 1992, '175-180cm'), user(2, 2, 1995, '160-165cm')],
    [setting(1), setting(2)],
    [legacyClaim]
  )
  assert.strictEqual(resultSeven.matched_count, 1)

  // MATCH CYCLE 08 — historical partner not repeated
  const histClaim = productionClaim(1, 2, '2026-01-01-WED')
  const indexedEight = indexClaimsForMatching([histClaim], '2026-08-14-FRI')
  assert.strictEqual(indexedEight.historicalPairKeys.has('1-2'), true)
  const resultEight = await runFormal(friClock, [user(1, 1, 1992, '175-180cm'), user(2, 2, 1995, '160-165cm')], [setting(1), setting(2)], [histClaim])
  assert.strictEqual(resultEight.matched_count, 0)

  // MATCH CYCLE 09 — same production cycle retry idempotent
  const batchTables = { match_batch_run: [] }
  const friBatchKey = 'formal:2026-08-14-FRI'
  const batchDeps = {
    tables: batchTables,
    acquireBatch: async (data) => {
      const existing = batchTables.match_batch_run.find((row) => row.batch_key === data.batch_key)
      if (existing) return { acquired: false, batch: existing }
      const row = {
        _id: formalBatchDocumentId(data.match_cycle_id),
        id: 1,
        ...data
      }
      batchTables.match_batch_run.push(row)
      return { acquired: true, batch: row }
    },
    updateByDoc: async (_name, doc, patch) => Object.assign(doc, patch),
    now: () => fridayUtc,
    executeMatching: async () => ({ matched_count: 1, users_considered: 2, candidates_evaluated: 1 })
  }
  const firstBatch = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-cycle-9' }, batchDeps)
  const replayBatch = await runFormalMatchBatch({ now: fridayUtc, requestId: 'req-cycle-9b' }, batchDeps)
  assert.strictEqual(firstBatch.batch_key, friBatchKey)
  assert.strictEqual(replayBatch.id, firstBatch.id)
  assert.strictEqual(batchTables.match_batch_run.length, 1)

  // MATCH CYCLE 10 — two users cannot claim same partner in same cycle
  const claimStore = createCycleClaimStore()
  const cycleTen = '2026-08-14-FRI'
  const attemptsTen = await Promise.all([
    claimPair({ userId: 1, partnerId: 3, requestId: 'req-10-a', matchCycleId: cycleTen }, claimStore),
    claimPair({ userId: 2, partnerId: 3, requestId: 'req-10-b', matchCycleId: cycleTen }, claimStore)
  ])
  assert.strictEqual(attemptsTen.filter((row) => row.claimed).length, 1)
  assert.strictEqual(attemptsTen.filter((row) => !row.claimed)[0].reason, 'already_matched')
  const idsTen = claimDocumentIds('1-3', 1, 3, cycleTen)
  assert.ok(claimStore.claims.has(`pair:1-3:${cycleSlug(cycleTen)}`))
  assert.ok(claimStore.claims.has(`user:3:${cycleSlug(cycleTen)}`))

  // MATCH CYCLE 11 — QA claim does not block production cycle
  const qaClaim = {
    user_id: 1,
    match_user_id: 20,
    pair_key: '1-20',
    status: 'claimed',
    match_cycle_id: 'QA:10:123',
    qa_cycle: 1,
    is_test: 1
  }
  assert.strictEqual(isProductionClaim(qaClaim), false)
  const indexedEleven = indexClaimsForMatching([qaClaim], '2026-08-14-FRI')
  assert.strictEqual(indexedEleven.cycleClaimed.has(1), false)
  assert.strictEqual(userHasProductionClaimInCycle(1, [qaClaim], '2026-08-14-FRI'), false)

  // MATCH CYCLE 12 — QA countdown endpoint internal-only
  const qaUser = qaOwnerProfile()
  const prodUser = { id: 1, account_mode: 'production', profile_origin: 'real_user', openid: 'omOfficial', status: 1, gender: 1 }
  assert.strictEqual(isInternalQaAccount(qaUser), true)
  assert.strictEqual(isInternalQaAccount(prodUser), false)
  const qaFixtureForRun = {
    id: 20,
    status: 1,
    gender: 2,
    member_status: 'approved',
    is_vip: 1,
    vip_expire_time: '2026-09-01T00:00:00.000Z',
    is_test_fixture: 1,
    profile_origin: 'synthetic_fixture',
    fixture_owner_user_id: 10,
    fixture_expires_at: '2026-08-15T08:00:00.000Z',
    allow_date_coordination: 0,
    fixture_journey: 'coordinate',
    fixture_access_mode: 'owned',
    birth_year: 1995,
    height_range: '160-165cm',
    education: '本科',
    circle_id: 1,
    city: '汕头',
    baby_plan: '3-5年内',
    appearance_description: '干净清爽',
    appearance_want: '干净清爽'
  }
  const qaOnly = qaMemory(qaUser, [qaFixtureForRun])
  await assert.rejects(
    () => qaMemory(prodUser, []).handlers.create({ request_id: 'req-prod-block' }, {}),
    /内部测试账号/
  )
  const qaCreated = await qaOnly.handlers.create({ request_id: 'req-qacycle12', fixture_journey: 'coordinate' }, {})
  assert.strictEqual(qaCreated.mode, 'internal_test')
  assert.ok(String(qaCreated.batch_key || '').startsWith('qa:'))
  assert.ok(String(qaCreated.match_cycle_id || '').startsWith('QA:10:'))
  qaOnly.advance(10000)
  const qaExecuted = await qaOnly.handlers.execute({ id: qaCreated.id }, {})
  assert.strictEqual(qaExecuted.status, 'completed_matched')
  assert.strictEqual(qaExecuted.fixture_journey, 'coordinate')

  // MATCH FIXTURE 13 — coordinate scenario
  assert.strictEqual(poolEntryForJourney('coordinate').journey, 'coordinate')
  const coordOnly = filterCandidatesByJourney([
    qaFixture(41, 10, 'coordinate'),
    qaFixture(42, 10, 'accept_direct')
  ], 'coordinate')
  assert.strictEqual(coordOnly.length, 1)
  assert.strictEqual(coordOnly[0].fixture_journey, 'coordinate')

  // MATCH FIXTURE 14 — accept_direct scenario
  const acceptOnly = filterCandidatesByJourney([
    qaFixture(43, 10, 'accept_direct'),
    qaFixture(44, 10, 'decline')
  ], 'accept_direct')
  assert.strictEqual(acceptOnly.length, 1)
  assert.strictEqual(acceptOnly[0].fixture_journey, 'accept_direct')

  // MATCH FIXTURE 15 — decline scenario
  const declineOnly = filterCandidatesByJourney([
    qaFixture(45, 10, 'decline'),
    qaFixture(46, 10, 'coordinate')
  ], 'decline')
  assert.strictEqual(declineOnly.length, 1)
  assert.strictEqual(declineOnly[0].fixture_journey, 'decline')

  // MATCH FIXTURE 16 — no_response scenario
  const noResponseOnly = filterCandidatesByJourney([
    qaFixture(47, 10, 'no_response'),
    qaFixture(48, 10, 'coordinate')
  ], 'no_response')
  assert.strictEqual(noResponseOnly.length, 1)
  assert.strictEqual(noResponseOnly[0].fixture_journey, 'no_response')

  // MATCH FIXTURE 17 — accept_no_prefs correct
  const acceptNoPrefsOnly = filterCandidatesByJourney([
    qaFixture(49, 10, 'accept_no_prefs'),
    qaFixture(50, 10, 'coordinate')
  ], 'accept_no_prefs')
  assert.strictEqual(acceptNoPrefsOnly.length, 1)
  assert.strictEqual(acceptNoPrefsOnly[0].fixture_journey, 'accept_no_prefs')

  // MATCH FIXTURE 18 — manual step does not auto advance
  const manualFixture = qaFixture(51, 10, 'coordinate', { fixture_mode: 'manual_step', fixture_journey: 'coordinate' })
  const manualOnly = filterCandidatesByJourney([manualFixture, qaFixture(52, 10, 'coordinate')], 'manual_step')
  assert.strictEqual(manualOnly.length, 1)
  assert.strictEqual(manualOnly[0].fixture_mode, 'manual_step')
  const dateCoordination = fs.readFileSync(
    path.join(__dirname, '../../miniprogram/cloudfunctions/api/handlers/dateCoordination.js'),
    'utf8'
  )
  assert(dateCoordination.includes("mode === 'manual_step'"))
  assert(dateCoordination.includes("reason: 'manual_step'"))

  // MATCH FIXTURE 19 — ordinary user cannot call QA endpoint
  await assert.rejects(
    () => qaMemory(prodUser, []).handlers.create({ request_id: 'req-fixture19' }, {}),
    /内部测试账号/
  )

  // MATCH FIXTURE 20 — ordinary user cannot see QA controls
  const root = path.resolve(__dirname, '../..')
  const matchListJs = fs.readFileSync(path.join(root, 'miniprogram/pages/match-list/match-list.js'), 'utf8')
  const matchListWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/match-list/match-list.wxml'), 'utf8')
  const indexWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const indexJs = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8')
  assert(matchListWxml.includes('qa-match-panel'))
  assert(indexWxml.includes('qa-match-panel'))
  assert(!matchListJs.includes('onQaSimulateMatch'))
  assert(!indexJs.includes('MATCH_TEST_RUN'))

  console.log('PASS Wed/Fri match cycle and QA fixture journeys (MATCH CYCLE 01-20)')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
