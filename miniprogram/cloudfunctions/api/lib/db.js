const cloud = require('wx-server-sdk')
const collections = require('./collections')
const { withCollectionBootstrap } = require('./collectionBootstrapPolicy')
const { OFFICIAL_SUPPORT_CODE, isTestUser, testSupportCode } = require('../agent/userIdentity')
const { documentOrNull } = require('./documentReadPolicy')

const db = cloud.database()
const _ = db.command

function col(name) {
  return db.collection(collections[name] || name)
}

function withCollection(name, operation) {
  const physicalName = collections[name] || name
  return withCollectionBootstrap({
    logicalName: name,
    physicalName,
    operation,
    createCollection: (collectionName) => db.createCollection(collectionName)
  })
}

function now() {
  return new Date()
}

function fallbackId(name, err) {
  const timeId = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  console.warn(`fallback id for ${name}: ${(err && err.message) || err}`)
  return timeId
}

async function first(name, query) {
  const res = await withCollection(name, () => col(name).where(query).limit(1).get())
  return res.data && res.data[0] ? res.data[0] : null
}

async function list(name, query, limit) {
  const q = query || {}
  const max = limit || 100
  const res = await withCollection(name, () => col(name).where(q).limit(max).get())
  return res.data || []
}

async function byId(name, id) {
  const n = Number(id)
  if (!Number.isNaN(n)) {
    const row = await first(name, { id: n })
    if (row) return row
  }
  if (!id) return null
  try {
    const res = await withCollection(name, () => col(name).doc(String(id)).get())
    return res.data || null
  } catch (err) {
    return null
  }
}

async function nextId(name) {
  const id = String(name)
  try {
    await withCollection('system_counters', () => db.collection('system_counters').doc(id).update({
      data: {
        seq: _.inc(1),
        update_time: now()
      }
    }))
  } catch (updateErr) {
    try {
      await withCollection('system_counters', () => db.collection('system_counters').doc(id).set({
        data: {
          seq: 1,
          create_time: now(),
          update_time: now()
        }
      }))
      return 1
    } catch (setErr) {
      return fallbackId(name, setErr)
    }
  }
  try {
    const res = await withCollection('system_counters', () => db.collection('system_counters').doc(id).get())
    return Number(res.data.seq || 1)
  } catch (err) {
    return fallbackId(name, err)
  }
}

async function addWithId(name, data, prefix, stableId) {
  const hasStableId = stableId !== undefined && stableId !== null
  const stableNumber = Number(stableId)
  if (hasStableId && (!Number.isInteger(stableNumber) || stableNumber <= 0)) {
    throw new Error('稳定记录 ID 无效')
  }
  const id = hasStableId ? stableNumber : await nextId(name)
  const doc = Object.assign({}, data, {
    _id: `${prefix || name}_${id}`,
    id,
    create_time: data.create_time || now(),
    update_time: data.update_time || now()
  })
  const writeData = Object.assign({}, doc)
  delete writeData._id
  await withCollection(name, () => col(name).doc(doc._id).set({ data: writeData }))
  return doc
}

async function updateByDoc(name, doc, data) {
  if (!doc || !doc._id) throw new Error('记录不存在')
  await withCollection(name, () => col(name).doc(doc._id).update({
    data: Object.assign({}, data, { update_time: now() })
  }))
  return Object.assign({}, doc, data, { update_time: now() })
}

async function claimIfStatus(name, doc, expectedStatus, data) {
  if (!doc || !doc._id) return null
  const update = await withCollection(name, () => col(name).where({
    _id: doc._id,
    status: expectedStatus
  }).update({
    data: Object.assign({}, data, { update_time: now() })
  }))
  if (!update.stats || !update.stats.updated) return null
  return Object.assign({}, doc, data, { update_time: now() })
}

async function acquireFormalMatchBatch(data) {
  const businessDate = String(data && data.business_date || '')
  const batchKey = String(data && data.batch_key || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || batchKey !== `formal:${businessDate}`) {
    throw new Error('正式匹配批次编号无效')
  }
  const documentId = `match_batch_formal_${businessDate}`
  return withCollection('match_batch_run', () => db.runTransaction(async (transaction) => {
    const ref = transaction.collection(collections.match_batch_run).doc(documentId)
    const current = await documentOrNull(() => ref.get())
    const timestamp = now()
    if (current) {
      const leaseExpired = current.status === 'running'
        && current.lease_expires_at
        && new Date(current.lease_expires_at).getTime() <= timestamp.getTime()
      if (!leaseExpired || Number(current.retry_count || 0) >= 1) {
        return { acquired: false, batch: Object.assign({ _id: documentId }, current) }
      }
      const resumed = Object.assign({}, current, {
        status: 'running',
        retry_count: Number(current.retry_count || 0) + 1,
        request_id: String(data.request_id || current.request_id || '').slice(0, 120),
        lease_expires_at: new Date(timestamp.getTime() + 2 * 60 * 1000),
        update_time: timestamp
      })
      await ref.update({ data: resumed })
      return { acquired: true, batch: Object.assign({ _id: documentId }, resumed) }
    }
    const created = Object.assign({}, data, {
      id: Number(businessDate.replace(/-/g, '')),
      status: 'running',
      lease_expires_at: new Date(timestamp.getTime() + 2 * 60 * 1000),
      create_time: timestamp,
      update_time: timestamp
    })
    await ref.set({ data: created })
    return { acquired: true, batch: Object.assign({ _id: documentId }, created) }
  }))
}

async function removeByDoc(name, doc) {
  if (!doc || !doc._id) throw new Error('记录不存在')
  const result = await withCollection(name, () => col(name).doc(doc._id).remove())
  const removed = Number(result && result.stats && result.stats.removed || 0)
  if (removed !== 1) throw new Error('记录删除失败')
  return { removed }
}

function transactionAdapter(rawTransaction) {
  const collection = (name) => rawTransaction.collection(collections[name] || name)

  async function txByDocId(name, documentId) {
    return documentOrNull(() => collection(name).doc(String(documentId)).get())
  }

  async function txById(name, id) {
    const numericId = Number(id)
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return null
    return txByDocId(name, `${name}_${numericId}`)
  }

  async function txNextCounter(name) {
    const ref = collection('system_counters').doc(String(name))
    const current = await documentOrNull(() => ref.get())
    const sequence = Number(current && current.seq || 0) + 1
    const timestamp = now()
    if (current) await ref.update({ data: { seq: sequence, update_time: timestamp } })
    else await ref.set({ data: { seq: sequence, create_time: timestamp, update_time: timestamp } })
    return sequence
  }

  async function txAddWithId(name, data, prefix, stableId) {
    const hasStableId = stableId !== undefined && stableId !== null
    const id = hasStableId ? Number(stableId) : await txNextCounter(name)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('事务记录 ID 无效')
    const timestamp = now()
    const document = Object.assign({}, data, {
      _id: `${prefix || name}_${id}`,
      id,
      create_time: data.create_time || timestamp,
      update_time: data.update_time || timestamp
    })
    const writeData = Object.assign({}, document)
    delete writeData._id
    await collection(name).doc(document._id).set({ data: writeData })
    return document
  }

  async function txUpdateByDoc(name, doc, data) {
    if (!doc || !doc._id) throw new Error('记录不存在')
    const timestamp = now()
    await collection(name).doc(doc._id).update({ data: Object.assign({}, data, { update_time: timestamp }) })
    return Object.assign({}, doc, data, { update_time: timestamp })
  }

  async function txSetByDocId(name, documentId, data) {
    const timestamp = now()
    const document = Object.assign({}, data, {
      _id: String(documentId),
      update_time: data.update_time || timestamp
    })
    const writeData = Object.assign({}, document)
    delete writeData._id
    await collection(name).doc(document._id).set({ data: writeData })
    return document
  }

  return {
    now,
    byDocId: txByDocId,
    byId: txById,
    nextCounter: txNextCounter,
    addWithId: txAddWithId,
    updateByDoc: txUpdateByDoc,
    setByDocId: txSetByDocId
  }
}

async function transaction(work) {
  if (typeof work !== 'function') throw new Error('事务回调无效')
  return db.runTransaction((rawTransaction) => work(transactionAdapter(rawTransaction)))
}

async function ensureUserSupportCode(userDoc) {
  if (!userDoc || !userDoc._id || !Number(userDoc.id)) throw new Error('用户记录无效')
  if (isTestUser(userDoc)) return testSupportCode(userDoc)

  return db.runTransaction(async (transaction) => {
    const userRef = transaction.collection(collections.user).doc(String(userDoc._id))
    const userResult = await userRef.get()
    const current = userResult && userResult.data
    if (!current) throw new Error('用户不存在')
    if (isTestUser(current)) return testSupportCode(current)

    const existing = String(current.support_code || '').trim().toUpperCase()
    if (existing) {
      if (!OFFICIAL_SUPPORT_CODE.test(existing)) throw new Error('用户编号格式无效')
      return existing
    }

    const counterRef = transaction.collection('system_counters').doc('user_support_code')
    const counterResult = await counterRef.get()
    const counter = counterResult && counterResult.data
    const next = Number(counter && counter.seq || 0) + 1
    if (!Number.isSafeInteger(next) || next <= 0 || next > 999999) throw new Error('用户编号已耗尽')

    const timestamp = now()
    if (counter) {
      await counterRef.update({ data: { seq: next, update_time: timestamp } })
    } else {
      await counterRef.set({ data: { seq: next, create_time: timestamp, update_time: timestamp } })
    }
    const supportCode = `WF-${String(next).padStart(6, '0')}`
    await userRef.update({ data: { support_code: supportCode, update_time: timestamp } })
    return supportCode
  })
}

function authError(message) {
  const err = new Error(message || '登录已过期，请重新登录')
  err.code = 401
  return err
}

module.exports = {
  db,
  _,
  col,
  now,
  first,
  list,
  byId,
  nextId,
  addWithId,
  updateByDoc,
  claimIfStatus,
  acquireFormalMatchBatch,
  removeByDoc,
  transaction,
  ensureUserSupportCode,
  authError,
  withCollection
}
