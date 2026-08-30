const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  canonicalPairKey,
  claimDocumentIds,
  claimPair,
  deliverPair
} = require('../../miniprogram/cloudfunctions/api/lib/matchClaim')

;(async () => {
  assert.strictEqual(canonicalPairKey(20, 3), '3-20')
  assert.strictEqual(canonicalPairKey('3', '20'), '3-20')
  assert.throws(() => canonicalPairKey(0, 2), /匹配用户无效/)
  const qaRunOneIds = claimDocumentIds('3-20', 3, 20, '2026-08-28-FRI', {
    pair: 'qarunpair_run_one', user: 'qarun_user_3_one', partner: 'qarun_user_20_one'
  })
  const qaRunTwoIds = claimDocumentIds('3-20', 3, 20, '2026-08-28-FRI', {
    pair: 'qarunpair_run_two', user: 'qarun_user_3_two', partner: 'qarun_user_20_two'
  })
  assert.notStrictEqual(qaRunOneIds.pair, qaRunTwoIds.pair)
  assert.notStrictEqual(qaRunOneIds.user, qaRunTwoIds.user)
  assert.strictEqual(qaRunOneIds.history, qaRunTwoIds.history)
  const qaRunSameUserOtherPartner = claimDocumentIds('3-99', 3, 99, '2026-08-28-FRI', {
    pair: 'qarunpair_run_other', user: 'qarun_user_3_one', partner: 'qarun_user_99_one'
  })
  assert.strictEqual(qaRunOneIds.user, qaRunSameUserOtherPartner.user)
  assert.notStrictEqual(qaRunOneIds.pair, qaRunSameUserOtherPartner.pair)

function createStore() {
  const claims = new Map()
  let queue = Promise.resolve()
  return {
    runAtomic(work) {
      const execute = queue.then(() => work({
        findByUserIds: async (ids) => ids.map((id) => claims.get(`user:${String(id)}`)).filter(Boolean),
        findByPairKey: async (pairKey) => claims.get(`pair:${pairKey}`) || null,
        createClaim: async (claim) => {
          claims.set(`user:${claim.user_id}`, claim)
          claims.set(`user:${claim.match_user_id}`, claim)
          claims.set(`pair:${claim.pair_key}`, claim)
          return claim
        }
      }))
      queue = execute.catch(() => {})
      return execute
    }
  }
}

function createDeliveryStore(options = {}) {
  const state = {
    claims: new Map(),
    logs: new Map(),
    users: new Map([[3, { id: 3, match_status: '' }], [20, { id: 20, match_status: '' }]]),
    audits: new Map(),
    lookupScopes: []
  }
  let queue = Promise.resolve()
  return {
    state,
    runAtomic(work) {
      const execute = queue.then(async () => {
        const draft = {
          claims: new Map(state.claims),
          logs: new Map(state.logs),
          users: new Map([...state.users].map(([id, row]) => [id, { ...row }])),
          audits: new Map(state.audits)
        }
        const result = await work({
          findByUserIds: async (ids, cycleId, qaUserRunIds) => {
            state.lookupScopes.push({ kind: 'users', cycleId, qaUserRunIds })
            return ids.map((id) => draft.claims.get(`user:${id}`)).filter(Boolean)
          },
          findByPairKey: async (pairKey, cycleId, qaMatchRunKey) => {
            state.lookupScopes.push({ kind: 'pair', cycleId, qaMatchRunKey })
            return draft.claims.get(`pair:${pairKey}`) || null
          },
          prepareDelivery: async (data) => ({
            logA: { _id: 'match_log_301', id: 301, ...data.logA },
            logB: { _id: 'match_log_302', id: 302, ...data.logB },
            audit: { _id: 'match_audit_401', id: 401, ...data.audit }
          }),
          createDelivery: async (claim, delivery) => {
            draft.claims.set(`user:${claim.user_id}`, claim)
            draft.claims.set(`user:${claim.match_user_id}`, claim)
            draft.claims.set(`pair:${claim.pair_key}`, claim)
            draft.logs.set(delivery.logA.id, delivery.logA)
            if (options.failAfterFirstLog) throw new Error('injected second-log failure')
            draft.logs.set(delivery.logB.id, delivery.logB)
            draft.users.set(claim.user_id, { ...draft.users.get(claim.user_id), ...delivery.userPatch })
            draft.users.set(claim.match_user_id, { ...draft.users.get(claim.match_user_id), ...delivery.partnerPatch })
            draft.audits.set(delivery.audit.id, delivery.audit)
          }
        })
        state.claims = draft.claims
        state.logs = draft.logs
        state.users = draft.users
        state.audits = draft.audits
        return result
      })
      queue = execute.catch(() => {})
      return execute
    }
  }
}

function deliveryFixture(requestId) {
  return {
    requestId,
    userId: 3,
    partnerId: 20,
    logA: { _id: 'match_log_101', id: 101, user_id: 3, match_user_id: 20 },
    logB: { _id: 'match_log_102', id: 102, user_id: 20, match_user_id: 3 },
    userDoc: { _id: 'user_3', id: 3 },
    partnerDoc: { _id: 'user_20', id: 20 },
    userPatch: { match_status: 'matched', matched_partner_id: 20 },
    partnerPatch: { match_status: 'matched', matched_partner_id: 3 },
    audit: { _id: 'match_audit_201', id: 201, action: 'claim_and_deliver' }
  }
}

function createQaScopedStore() {
  const documents = new Map()
  const histories = new Map()
  let queue = Promise.resolve()
  let sequence = 500
  function userDocumentId(id, cycleId, runId) {
    const other = Number(id) === 1 ? 2 : 1
    return claimDocumentIds(`${Math.min(Number(id), other)}-${Math.max(Number(id), other)}`, id, other, cycleId, {
      user: runId
    }).user
  }
  return {
    runAtomic(work) {
      const execute = queue.then(() => work({
        findByUserIds: async (ids, cycleId, runIds) => ids
          .map((id) => documents.get(userDocumentId(id, cycleId, runIds[String(id)])))
          .filter(Boolean),
        findByPairKey: async (pairKey, cycleId, pairRunKey) => {
          const [left, right] = pairKey.split('-').map(Number)
          const ids = claimDocumentIds(pairKey, left, right, cycleId, { pair: pairRunKey })
          return documents.get(ids.pair) || null
        },
        findHistoricalPair: async (pairKey) => histories.get(pairKey) || null,
        prepareDelivery: async (data) => {
          sequence += 3
          return {
            logA: { _id: `match_log_${sequence}`, id: sequence, ...data.logA },
            logB: { _id: `match_log_${sequence + 1}`, id: sequence + 1, ...data.logB },
            audit: { _id: `match_audit_${sequence + 2}`, id: sequence + 2, ...data.audit }
          }
        },
        createDelivery: async (claim) => {
          const ids = claimDocumentIds(claim.pair_key, claim.user_id, claim.match_user_id, claim.match_cycle_id, {
            pair: claim.qa_match_run_key,
            user: claim.qa_user_run_id,
            partner: claim.qa_match_user_run_id
          })
          documents.set(ids.user, claim)
          documents.set(ids.partner, claim)
          documents.set(ids.pair, claim)
          histories.set(claim.pair_key, claim)
        }
      }))
      queue = execute.catch(() => {})
      return execute
    }
  }
}

function qaDeliveryFixture(partnerId, pairRunKey, partnerRunId, options = {}) {
  const userRunId = options.userRunId || 'qarun_user_3_one'
  const runStartedAt = options.runStartedAt || '2026-08-21T08:00:00.000Z'
  return {
    userId: 3,
    partnerId,
    requestId: `qa-delivery-${partnerId}`,
    matchCycleId: '2026-08-28-FRI',
    qaMatchRunKey: pairRunKey,
    qaUserRunId: userRunId,
    qaPartnerRunId: partnerRunId,
    deliveryData: {
      logA: { user_id: 3, match_user_id: partnerId },
      logB: { user_id: partnerId, match_user_id: 3 },
      audit: { action: 'formal_batch' }
    },
    userDoc: {
      _id: 'user_3', id: 3, qa_test_run_enabled: true,
      qa_match_cohort: 'qa-real-device-registration-v1',
      qa_match_run_id: userRunId,
      qa_match_run_started_at: new Date(runStartedAt)
    },
    partnerDoc: {
      _id: `user_${partnerId}`, id: partnerId, qa_test_run_enabled: true,
      qa_match_cohort: 'qa-real-device-registration-v1',
      qa_match_run_id: partnerRunId,
      qa_match_run_started_at: new Date(runStartedAt)
    },
    userPatch: {},
    partnerPatch: {}
  }
}

  const store = createStore()
  const attempts = await Promise.all([
    claimPair({ userId: 3, partnerId: 20, requestId: 'req-a' }, store),
    claimPair({ userId: 20, partnerId: 3, requestId: 'req-b' }, store)
  ])
  assert.strictEqual(attempts.filter((item) => item.claimed).length, 1)
  assert.strictEqual(attempts.filter((item) => !item.claimed)[0].reason, 'already_matched')
  const reusedUser = await claimPair({ userId: 3, partnerId: 99, requestId: 'req-c' }, store)
  assert.strictEqual(reusedUser.claimed, false)
  assert.strictEqual(reusedUser.reason, 'already_matched')

  const failingStore = createDeliveryStore({ failAfterFirstLog: true })
  await assert.rejects(() => deliverPair(deliveryFixture('delivery-fail'), failingStore), /injected second-log failure/)
  assert.strictEqual(failingStore.state.claims.size, 0)
  assert.strictEqual(failingStore.state.logs.size, 0)
  assert.strictEqual(failingStore.state.audits.size, 0)
  assert.strictEqual(failingStore.state.users.get(3).match_status, '')
  assert.strictEqual(failingStore.state.users.get(20).match_status, '')

  const deliveryStore = createDeliveryStore()
  const delivered = await Promise.all([
    deliverPair(deliveryFixture('delivery-a'), deliveryStore),
    deliverPair({ ...deliveryFixture('delivery-b'), userId: 20, partnerId: 3 }, deliveryStore)
  ])
  assert.strictEqual(delivered.filter((item) => item.delivered).length, 1)
  assert.strictEqual(deliveryStore.state.logs.size, 2)
  assert.strictEqual(deliveryStore.state.audits.size, 1)

  const preparedStore = createDeliveryStore()
  const prepared = await deliverPair({
    userId: 3,
    partnerId: 20,
    requestId: 'prepared-delivery',
    deliveryData: {
      logA: { user_id: 3, match_user_id: 20 },
      logB: { user_id: 20, match_user_id: 3 },
      audit: { action: 'formal_batch' }
    },
    userDoc: { _id: 'user_3', id: 3 },
    partnerDoc: { _id: 'user_20', id: 20 },
    userPatch: { match_status: 'matched', matched_partner_id: 20 },
    partnerPatch: { match_status: 'matched', matched_partner_id: 3 }
  }, preparedStore)
  assert.strictEqual(prepared.delivered, true)
  assert.strictEqual(prepared.logA.id, 301)
  assert.notStrictEqual(prepared.logA.id, prepared.logB.id)
  assert.strictEqual(preparedStore.state.logs.size, 2)
  assert.strictEqual(preparedStore.state.audits.size, 1)
  const qaScopedStore = createDeliveryStore()
  const qaScoped = await deliverPair({
    userId: 3,
    partnerId: 20,
    requestId: 'qa-scoped-delivery',
    matchCycleId: '2026-08-28-FRI',
    qaMatchRunKey: 'qarunpair_run_one',
    qaUserRunId: 'qarun_user_3_one',
    qaPartnerRunId: 'qarun_user_20_one',
    deliveryData: {
      logA: { user_id: 3, match_user_id: 20 },
      logB: { user_id: 20, match_user_id: 3 },
      audit: { action: 'formal_batch' }
    },
    userDoc: { _id: 'user_3', id: 3 },
    partnerDoc: { _id: 'user_20', id: 20 },
    userPatch: {},
    partnerPatch: {}
  }, qaScopedStore)
  assert.strictEqual(qaScoped.delivered, true)
  assert.strictEqual(qaScopedStore.state.lookupScopes.length, 2)
  assert.deepStrictEqual(qaScopedStore.state.lookupScopes[0].qaUserRunIds, {
    3: 'qarun_user_3_one',
    20: 'qarun_user_20_one'
  })
  assert.strictEqual(qaScopedStore.state.lookupScopes[1].qaMatchRunKey, 'qarunpair_run_one')
  const qaConcurrentStore = createQaScopedStore()
  const qaConcurrent = await Promise.all([
    deliverPair(qaDeliveryFixture(20, 'qarunpair_ab', 'qarun_user_20_one'), qaConcurrentStore),
    deliverPair(qaDeliveryFixture(99, 'qarunpair_ac', 'qarun_user_99_one'), qaConcurrentStore)
  ])
  assert.strictEqual(qaConcurrent.filter((item) => item.delivered).length, 1)
  assert.strictEqual(qaConcurrent.filter((item) => !item.delivered)[0].reason, 'already_matched')
  const qaReplayStore = createQaScopedStore()
  const qaFirstRun = await deliverPair(
    qaDeliveryFixture(20, 'qarunpair_ab_one', 'qarun_user_20_one'),
    qaReplayStore
  )
  const qaSecondRun = await deliverPair(qaDeliveryFixture(
    20,
    'qarunpair_ab_two',
    'qarun_user_20_two',
    { userRunId: 'qarun_user_3_two', runStartedAt: '2026-09-01T08:00:00.000Z' }
  ), qaReplayStore)
  assert.strictEqual(qaFirstRun.delivered, true)
  assert.strictEqual(qaSecondRun.delivered, true)
  assert.strictEqual(deliveryStore.state.users.get(3).match_status, 'matched')
  assert.strictEqual(deliveryStore.state.users.get(20).match_status, 'matched')
  const replay = await deliverPair(deliveryFixture('delivery-a'), deliveryStore)
  assert.strictEqual(replay.delivered, true)
  assert.strictEqual(replay.replayed, true)
  assert.strictEqual(deliveryStore.state.logs.size, 2)
  assert.strictEqual(deliveryStore.state.audits.size, 1)

const handler = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/match.js'), 'utf8')
const claimLibrary = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/matchClaim.js'), 'utf8')
const collections = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/collections.js'), 'utf8')
const bootstrap = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js'), 'utf8')
assert(handler.includes('deliverPair'))
assert(!handler.includes("removeByDoc('user_match_log'"))
assert(claimLibrary.includes('createDelivery'))
assert(handler.includes('pair_key'))
assert(handler.includes('shouldBlockUserForClaim'))
assert(handler.includes('本轮已成功匹配'))
assert(collections.includes("match_claim: 'match_claims'"))
assert(bootstrap.includes("'match_claim'"))

  console.log('PASS atomic one-successful-match claim and concurrency policy')
})().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
