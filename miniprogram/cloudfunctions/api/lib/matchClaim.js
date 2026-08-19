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

function cycleSlug(cycleId) {
  return String(cycleId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function claimDocumentIds(pairKey, userId, partnerId, cycleId) {
  const base = {
    pair: `pair_${pairKey}`,
    user: `user_${numericUserId(userId)}`,
    partner: `user_${numericUserId(partnerId)}`,
    history: `pair_hist_${pairKey}`
  }
  if (!cycleId) return base
  const slug = cycleSlug(cycleId)
  return {
    pair: `${base.pair}__${slug}`,
    user: `${base.user}__${slug}`,
    partner: `${base.partner}__${slug}`,
    history: base.history
  }
}

function claimPayload(input) {
  const userId = numericUserId(input.userId)
  const partnerId = numericUserId(input.partnerId)
  const pairKey = canonicalPairKey(userId, partnerId)
  const requestId = String(input.requestId || '').trim().slice(0, 120)
  if (!requestId) throw new Error('匹配请求号缺失')
  const matchCycleId = String(input.matchCycleId || input.match_cycle_id || '').trim()
  const isTest = input.isTest === true || Number(input.is_test || 0) === 1
  const qaCycle = input.qaCycle === true || Number(input.qa_cycle || 0) === 1
  const matchedAt = input.matchedAt || input.matched_at || new Date()
  return {
    user_id: userId,
    match_user_id: partnerId,
    pair_key: pairKey,
    request_id: requestId,
    status: CLAIM_STATUS,
    match_cycle_id: matchCycleId || null,
    is_test: isTest ? 1 : 0,
    qa_cycle: qaCycle ? 1 : 0,
    matched_at: matchedAt
  }
}

async function claimPair(input, store) {
  const claim = claimPayload(input)
  const adapter = store && typeof store.runAtomic === 'function' ? store : createCloudClaimStore()
  const cycleId = claim.match_cycle_id || null
  return adapter.runAtomic(async (transaction) => {
    const existingUsers = await transaction.findByUserIds([claim.user_id, claim.match_user_id], cycleId)
    const existingPair = await transaction.findByPairKey(claim.pair_key, cycleId)
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

function deliveryPayload(input) {
  const claim = claimPayload(input)
  const logA = input && input.logA
  const logB = input && input.logB
  const audit = input && input.audit
  const deliveryData = input && input.deliveryData
  if (!deliveryData) {
    if (!logA || !logA._id || !Number(logA.id)) throw new Error('发起方匹配记录无效')
    if (!logB || !logB._id || !Number(logB.id)) throw new Error('候选方匹配记录无效')
    if (!audit || !audit._id || !Number(audit.id)) throw new Error('匹配审计记录无效')
  }
  if (!input.userDoc || !input.userDoc._id || !input.partnerDoc || !input.partnerDoc._id) {
    throw new Error('匹配用户文档无效')
  }
  return {
    claim,
    logA,
    logB,
    audit,
    deliveryData,
    userDoc: input.userDoc,
    partnerDoc: input.partnerDoc,
    userPatch: input.userPatch || {},
    partnerPatch: input.partnerPatch || {}
  }
}

async function deliverPair(input, store) {
  let delivery = deliveryPayload(input)
  const claim = delivery.claim
  const adapter = store && typeof store.runAtomic === 'function' ? store : createCloudClaimStore()
  const cycleId = claim.match_cycle_id || null
  return adapter.runAtomic(async (transaction) => {
    const existingUsers = await transaction.findByUserIds([claim.user_id, claim.match_user_id], cycleId)
    const existingPair = await transaction.findByPairKey(claim.pair_key, cycleId)
    const existing = existingUsers[0] || existingPair
    if (existing) {
      if (existing.request_id === claim.request_id && existing.pair_key === claim.pair_key) {
        return { delivered: true, replayed: true, claim: existing }
      }
      return { delivered: false, replayed: false, reason: 'already_matched', claim: existing }
    }
    if (delivery.deliveryData) {
      if (typeof transaction.prepareDelivery !== 'function') throw new Error('原子匹配记录准备依赖未配置')
      delivery = Object.assign({}, delivery, await transaction.prepareDelivery(delivery.deliveryData))
    }
    const created = Object.assign({}, claim, {
      match_log_ids: { a: Number(delivery.logA.id), b: Number(delivery.logB.id) },
      create_time: new Date(),
      update_time: new Date()
    })
    if (typeof transaction.createDelivery !== 'function') throw new Error('原子匹配交付依赖未配置')
    await transaction.createDelivery(created, delivery)
    return { delivered: true, replayed: false, claim: created, logA: delivery.logA, logB: delivery.logB, audit: delivery.audit }
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

async function readCollectionDocument(transaction, collectionName, id) {
  try {
    const result = await transaction.collection(collectionName).doc(id).get()
    return result && result.data ? result.data : null
  } catch (err) {
    return null
  }
}

function createCloudClaimStore() {
  const { db, withCollection } = require('./db')
  function documentData(doc) {
    const data = Object.assign({}, doc)
    delete data._id
    return data
  }
  return {
    runAtomic(work) {
      return withCollection('match_claim', () => db.runTransaction(async (transaction) => work({
        findByUserIds: async (ids, cycleId) => {
          const rows = []
          for (const id of ids) {
            const scopedId = cycleId
              ? `user_${numericUserId(id)}__${cycleSlug(cycleId)}`
              : `user_${numericUserId(id)}`
            const row = await readDocument(transaction, scopedId)
            if (row && row.status === CLAIM_STATUS) rows.push(row)
          }
          return rows
        },
        findByPairKey: async (pairKey, cycleId) => {
          const scopedId = cycleId ? `pair_${pairKey}__${cycleSlug(cycleId)}` : `pair_${pairKey}`
          const row = await readDocument(transaction, scopedId)
          return row && row.status === CLAIM_STATUS ? row : null
        },
        findHistoricalPair: async (pairKey) => {
          const row = await readDocument(transaction, `pair_hist_${pairKey}`)
          return row || null
        },
        createClaim: async (claim) => {
          const ids = claimDocumentIds(claim.pair_key, claim.user_id, claim.match_user_id, claim.match_cycle_id)
          const data = Object.assign({}, claim, {
            claim_id: ids.pair,
            pair_key: claim.pair_key
          })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.user).set({ data })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.partner).set({ data })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.pair).set({ data })
          return data
        },
        prepareDelivery: async (data) => {
          async function allocate(logicalName, count) {
            const counterRef = transaction.collection('system_counters').doc(logicalName)
            const counter = await readCollectionDocument(transaction, 'system_counters', logicalName)
            const start = Number(counter && counter.seq || 0) + 1
            const end = start + count - 1
            const timestamp = new Date()
            if (counter) await counterRef.update({ data: { seq: end, update_time: timestamp } })
            else await counterRef.set({ data: { seq: end, create_time: timestamp, update_time: timestamp } })
            return { start, timestamp }
          }
          function document(prefix, id, payload, timestamp) {
            return Object.assign({}, payload, {
              _id: `${prefix}_${id}`,
              id,
              create_time: payload.create_time || timestamp,
              update_time: payload.update_time || timestamp
            })
          }
          const logs = await allocate('user_match_log', 2)
          const audits = await allocate('match_claim_audit', 1)
          return {
            logA: document('match_log', logs.start, data.logA, logs.timestamp),
            logB: document('match_log', logs.start + 1, data.logB, logs.timestamp),
            audit: document('match_audit', audits.start, data.audit, audits.timestamp)
          }
        },
        createDelivery: async (claim, delivery) => {
          const ids = claimDocumentIds(claim.pair_key, claim.user_id, claim.match_user_id, claim.match_cycle_id)
          const claimData = Object.assign({}, claim, {
            claim_id: ids.pair,
            pair_key: claim.pair_key
          })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.user).set({ data: claimData })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.partner).set({ data: claimData })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.pair).set({ data: claimData })
          await transaction.collection(CLAIM_COLLECTION).doc(ids.history).set({ data: Object.assign({}, claimData, {
            status: CLAIM_STATUS,
            history_marker: 1
          }) })
          await transaction.collection(collections.user_match_log).doc(delivery.logA._id).set({ data: documentData(delivery.logA) })
          await transaction.collection(collections.user_match_log).doc(delivery.logB._id).set({ data: documentData(delivery.logB) })
          await transaction.collection(collections.user).doc(delivery.userDoc._id).update({ data: delivery.userPatch })
          await transaction.collection(collections.user).doc(delivery.partnerDoc._id).update({ data: delivery.partnerPatch })
          await transaction.collection(collections.match_claim_audit).doc(delivery.audit._id).set({ data: documentData(delivery.audit) })
          return claimData
        }
      })))
    },
    async releaseClaim(claim) {
      return withCollection('match_claim', () => db.runTransaction(async (transaction) => {
        const ids = claimDocumentIds(claim.pair_key, claim.user_id, claim.match_user_id, claim.match_cycle_id)
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
  cycleSlug,
  claimDocumentIds,
  claimPair,
  deliverPair,
  releasePair,
  createCloudClaimStore
}
