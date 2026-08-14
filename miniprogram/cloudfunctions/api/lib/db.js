const cloud = require('wx-server-sdk')
const crypto = require('crypto')
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

function matchTestRunDocumentId(userId, requestId) {
  const digest = crypto.createHash('sha256').update(`${userId}:${requestId}`).digest('hex').slice(0, 32)
  return `match_batch_test_${digest}`
}

async function acquireMatchTestRun(data) {
  const userId = Number(data && data.requester_user_id)
  const requestId = String(data && data.request_id || '')
  if (!Number.isSafeInteger(userId) || userId <= 0 || requestId.length < 8) throw new Error('测试匹配批次编号无效')
  const documentId = matchTestRunDocumentId(userId, requestId)
  return withCollection('match_batch_run', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('match_batch_run', documentId)
    if (current) return { created: false, batch: current }
    const id = await adapter.nextCounter('match_batch_run')
    const timestamp = now()
    const batch = Object.assign({}, data, {
      _id: documentId,
      id,
      create_time: timestamp,
      update_time: timestamp
    })
    await adapter.setByDocId('match_batch_run', documentId, batch)
    return { created: true, batch }
  }))
}

async function claimMatchTestRun(run, timestamp = now()) {
  if (!run || !run._id) throw new Error('测试匹配批次无效')
  return withCollection('match_batch_run', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('match_batch_run', run._id)
    if (!current) return { acquired: false, batch: null }
    if (!['queued', 'failed'].includes(current.status)) return { acquired: false, batch: current }
    if (new Date(current.execute_after).getTime() > new Date(timestamp).getTime()) {
      return { acquired: false, batch: current }
    }
    const claimed = Object.assign({}, current, {
      status: 'running',
      execution_token: crypto.randomBytes(16).toString('hex'),
      started_at: timestamp,
      update_time: timestamp
    })
    await adapter.setByDocId('match_batch_run', run._id, claimed)
    return { acquired: true, batch: claimed }
  }))
}

async function completeMatchTestRun(run, outcome) {
  if (!run || !run._id || !run.execution_token) throw new Error('测试匹配执行权无效')
  return withCollection('match_batch_run', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('match_batch_run', run._id)
    if (!current) throw new Error('测试匹配批次不存在')
    if (['completed_matched', 'completed_no_match', 'blocked'].includes(current.status)) return current
    if (current.status !== 'running' || current.execution_token !== run.execution_token) {
      throw new Error('测试匹配执行权已失效')
    }
    let matchId = null
    if (outcome.log) {
      const log = await adapter.addWithId('user_match_log', outcome.log, 'match_log')
      matchId = log.id
    }
    const completed = Object.assign({}, current, outcome.patch, {
      match_id: matchId || outcome.patch.match_id || null,
      execution_token: '',
      completed_at: now(),
      update_time: now()
    })
    await adapter.setByDocId('match_batch_run', run._id, completed)
    return completed
  }))
}

async function acquireFixtureResponseJob(data) {
  const interactionId = String(data && data.interaction_id || '')
  if (!interactionId) throw new Error('互动编号无效')
  const digest = crypto.createHash('sha256').update(interactionId).digest('hex').slice(0, 32)
  const documentId = `fixture_response_${digest}`
  return withCollection('fixture_response_job', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('fixture_response_job', documentId)
    if (current) return { created: false, job: current }
    const id = await adapter.nextCounter('fixture_response_job')
    const timestamp = now()
    const job = Object.assign({}, data, { _id: documentId, id, create_time: timestamp, update_time: timestamp })
    await adapter.setByDocId('fixture_response_job', documentId, job)
    return { created: true, job }
  }))
}

async function listDueFixtureResponseJobs(timestamp = now(), limit = 20) {
  const bounded = Math.max(1, Math.min(Number(limit || 20), 100))
  const scheduled = await withCollection('fixture_response_job', () => col('fixture_response_job')
    .where({ status: 'scheduled', scheduled_at: _.lte(timestamp) })
    .orderBy('scheduled_at', 'asc')
    .limit(bounded)
    .get())
  const rows = scheduled.data || []
  if (rows.length >= bounded) return rows
  const expired = await withCollection('fixture_response_job', () => col('fixture_response_job')
    .where({ status: 'processing', lease_expires_at: _.lte(timestamp) })
    .orderBy('lease_expires_at', 'asc')
    .limit(bounded - rows.length)
    .get())
  return rows.concat(expired.data || [])
}

async function claimFixtureResponseJob(job, timestamp = now()) {
  if (!job || !job._id) throw new Error('测试回复任务无效')
  return withCollection('fixture_response_job', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('fixture_response_job', job._id)
    if (!current) return null
    const leaseExpired = current.status === 'processing'
      && current.lease_expires_at
      && new Date(current.lease_expires_at).getTime() <= new Date(timestamp).getTime()
    if (current.status !== 'scheduled' && !leaseExpired) return null
    if (current.status === 'scheduled' && new Date(current.scheduled_at).getTime() > new Date(timestamp).getTime()) return null
    const claimed = Object.assign({}, current, {
      status: 'processing',
      lease_token: crypto.randomBytes(16).toString('hex'),
      lease_expires_at: new Date(new Date(timestamp).getTime() + 5 * 60 * 1000),
      update_time: timestamp
    })
    await adapter.setByDocId('fixture_response_job', job._id, claimed)
    return claimed
  }))
}

async function completeFixtureResponseJob(job, eventData, timestamp = now()) {
  if (!job || !job._id || !job.lease_token) throw new Error('测试回复任务执行权无效')
  return withCollection('fixture_response_job', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('fixture_response_job', job._id)
    if (!current) throw new Error('测试回复任务不存在')
    if (current.status === 'delivered') return current
    if (current.status !== 'processing' || current.lease_token !== job.lease_token) throw new Error('测试回复任务执行权已失效')
    await adapter.addWithId('date_coordination_event', eventData, 'date_event')
    const completed = Object.assign({}, current, {
      status: 'delivered', delivered_at: timestamp, lease_token: '', lease_expires_at: null, update_time: timestamp
    })
    await adapter.setByDocId('fixture_response_job', job._id, completed)
    return completed
  }))
}

async function retryFixtureResponseJob(job, error, timestamp = now()) {
  if (!job || !job._id || !job.lease_token) return null
  return withCollection('fixture_response_job', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('fixture_response_job', job._id)
    if (!current || current.status !== 'processing' || current.lease_token !== job.lease_token) return current
    const retry = Object.assign({}, current, {
      status: 'scheduled',
      scheduled_at: new Date(new Date(timestamp).getTime() + 5 * 60 * 1000),
      attempts: Number(current.attempts || 0) + 1,
      error_class: String(error && error.message || 'deliver_failed').slice(0, 80),
      lease_token: '',
      lease_expires_at: null,
      update_time: timestamp
    })
    await adapter.setByDocId('fixture_response_job', job._id, retry)
    return retry
  }))
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
  acquireMatchTestRun,
  claimMatchTestRun,
  completeMatchTestRun,
  acquireFixtureResponseJob,
  listDueFixtureResponseJobs,
  claimFixtureResponseJob,
  completeFixtureResponseJob,
  retryFixtureResponseJob,
  acquireFormalMatchBatch,
  removeByDoc,
  transaction,
  ensureUserSupportCode,
  authError,
  withCollection
}
