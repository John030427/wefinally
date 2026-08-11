const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  canonicalPairKey,
  claimPair
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

const handler = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/match.js'), 'utf8')
const collections = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/collections.js'), 'utf8')
const bootstrap = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js'), 'utf8')
assert(handler.includes('claimPair'))
assert(handler.includes('releasePair'))
assert(handler.includes("removeByDoc('user_match_log'"))
assert(handler.includes('pair_key'))
assert(handler.includes('不能再次发起匹配'))
assert(collections.includes("match_claim: 'match_claims'"))
assert(bootstrap.includes("'match_claim'"))

  console.log('PASS atomic one-successful-match claim and concurrency policy')
})().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
