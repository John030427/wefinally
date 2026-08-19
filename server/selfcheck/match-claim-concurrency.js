const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  canonicalPairKey,
  claimPair,
  deliverPair
} = require('../../miniprogram/cloudfunctions/api/lib/matchClaim')

;(async () => {
  assert.strictEqual(canonicalPairKey(20, 3), '3-20')
  assert.strictEqual(canonicalPairKey('3', '20'), '3-20')
  assert.throws(() => canonicalPairKey(0, 2), /匹配用户无效/)

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
    audits: new Map()
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
          findByUserIds: async (ids) => ids.map((id) => draft.claims.get(`user:${id}`)).filter(Boolean),
          findByPairKey: async (pairKey) => draft.claims.get(`pair:${pairKey}`) || null,
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
assert(handler.includes('userHasProductionClaimInCycle'))
assert(handler.includes('本轮已成功匹配'))
assert(collections.includes("match_claim: 'match_claims'"))
assert(bootstrap.includes("'match_claim'"))

  console.log('PASS atomic one-successful-match claim and concurrency policy')
})().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
