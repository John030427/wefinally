const collections = require('./collections')

const CLAIM_STATUS = 'claimed'
const CLAIM_COLLECTION = collections.match_claim || 'match_claims'

function numericUserId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new Error('匹配用户无效')
  return id
}

function canonicalPairKey(left, right) {
  const ids = [numericUserId(left), numericUserId(right)].sort((a, b) => a - b)
  if (ids[0] === ids[1]) throw new Error('匹配用户不能相同')
  return `${ids[0]}-${ids[1]}`
}

function claimDocumentIds(pairKey, userId, partnerId) {
  return {
    pair: `pair_${pairKey}`,
    user: `user_${numericUserId(userId)}`,
    partner: `user_${numericUserId(partnerId)}`
  }
}

function claimPayload(input) {
  const userId = numericUserId(input.userId)
  const partnerId = numericUserId(input.partnerId)
  const pairKey = canonicalPairKey(userId, partnerId)
  const requestId = String(input.requestId || '').trim().slice(0, 120)
  if (!requestId) throw new Error('匹配请求号缺失')
  return {
    user_id: userId,
    match_user_id: partnerId,
    pair_key: pairKey,
    request_id: requestId,
    status: CLAIM_STATUS
  }
}

async function claimPair(input, store) {
  const claim = claimPayload(input)
  const adapter = store && typeof store.runAtomic === 'function' ? store : createCloudClaimStore()
  return adapter.runAtomic(async (transaction) => {
    const existingUsers = await transaction.findByUserIds([claim.user_id, claim.match_user_id])
    const existingPair = await transaction.findByPairKey(claim.pair_key)
    const existing = existingUsers[0] || existingPair
    if (existing) {
      if (existing.request_id === claim.request_id && existing.pair_key === claim.pair_key) {
        return { claimed: true, replayed: true, claim: existing }
      }
      return { claimed: false, reason: 'already_matched', claim: existing }
    }
    const created = Object.assign({}, claim, {
      create_time: new Date(),
      update_time: new Date()
    })
    await transaction.createClaim(created)
    return { claimed: true, replayed: false, claim: created }
  })
}

async function releasePair(input, store) {
  const claim = claimPayload(input)
  const adapter = store && typeof store.runAtomic === 'function' ? store : createCloudClaimStore()
  if (typeof adapter.releaseClaim !== 'function') return false
  return adapter.releaseClaim(claim)
}

async function readDocument(transaction, id) {
  try {
    const result = await transaction.collection(CLAIM_COLLECTION).doc(id).get()
    return result && result.data ? result.data : null
  } catch (err) {
    return null
  }
}

function createCloudClaimStore() {
  const { db, withCollection } = require('./db')
  return {
    runAtomic(work) {
      return withCollection('match_claim', () => db.runTransaction(async (transaction) => work({
        findByUserIds: async (ids) => {
          const rows = []
          for (const id of ids) {
            const row = await readDocument(transaction, `user_${numericUserId(id)}`)
            if (row && row.status === CLAIM_STATUS) rows.push(row)
          }
          return rows
        },
        findByPairKey: async (pairKey) => {
          const row = await readDocument(transaction, `pair_${pairKey}`)
          return row && row.status === CLAIM_STATUS ? row : null
        },
        createClaim: async (claim) => {
          const ids = claimDocumentIds(claim.pair_key, claim.user_id, claim.match_user_id)
          const data = Object.assign({}, claim, {
            claim_id: ids.pair,
            pair_key: claim.pair_key
          })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.user).set({ data })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.partner).set({ data })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.pair).set({ data })
          return data
        }
      })))
    },
    async releaseClaim(claim) {
      return withCollection('match_claim', () => db.runTransaction(async (transaction) => {
        const ids = claimDocumentIds(claim.pair_key, claim.user_id, claim.match_user_id)
        const existing = await readDocument(transaction, ids.pair)
        if (!existing || existing.request_id !== claim.request_id) return false
        await transaction.collection(CLAIM_COLLECTION).doc(ids.user).remove()
        await transaction.collection(CLAIM_COLLECTION).doc(ids.partner).remove()
        await transaction.collection(CLAIM_COLLECTION).doc(ids.pair).remove()
        return true
      }))
    }
  }
}

module.exports = {
  CLAIM_STATUS,
  canonicalPairKey,
  claimPair,
  releasePair,
  createCloudClaimStore
}
