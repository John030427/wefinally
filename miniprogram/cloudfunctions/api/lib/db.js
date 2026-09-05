const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const collections = require('./collections')
const { withCollectionBootstrap } = require('./collectionBootstrapPolicy')
const { OFFICIAL_SUPPORT_CODE, isTestUser, testSupportCode } = require('../agent/userIdentity')
const { documentOrNull } = require('./documentReadPolicy')
const {
  isExpiredInvitationRow,
  invitingPartnerDeadlinePassed,
  persistExpiredInvitationRecord
} = require('./invitationCoordination')

async function expireInvitationInTransaction(adapter, row) {
  return persistExpiredInvitationRecord(row, (data) => adapter.updateByDoc('date_coordination', row, data))
}

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

function invitationVersionFromRow(row = {}) {
  const invite = Number(row.invitation_version || 0)
  if (invite > 0) return invite
  return Number(row.coordination_version || 1)
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

async function listPage(name, query, afterId, limit = 100) {
  const pageLimit = Math.max(1, Math.min(Number(limit || 100), 100))
  const res = await withCollection(name, () => {
    const conditions = Object.assign({}, query || {})
    if (afterId) conditions._id = _.gt(String(afterId))
    return col(name).where(conditions).orderBy('_id', 'asc').limit(pageLimit).get()
  })
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
  const matchCycleId = String(data && data.match_cycle_id || '')
  const { PRODUCTION_CYCLE_RE, formalBatchDocumentId } = require('./matchCycleService')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error('正式匹配批次编号无效')
  }
  if (!matchCycleId || !PRODUCTION_CYCLE_RE.test(matchCycleId) || batchKey !== `formal:${matchCycleId}`) {
    throw new Error('正式匹配批次编号无效')
  }
  const documentId = formalBatchDocumentId(matchCycleId)
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

async function acquireQaPairResetRun(data) {
  const requestId = String(data && data.request_id || '')
  const pairHash = String(data && data.pair_hash || '')
  if (!requestId || !pairHash) throw new Error('QA 双机重置幂等键无效')
  const documentId = `qa_pair_reset_active_${pairHash}`
  return withCollection('qa_pair_reset_run', () => db.runTransaction(async (rawTransaction) => {
    const adapter = transactionAdapter(rawTransaction)
    const current = await adapter.byDocId('qa_pair_reset_run', documentId)
    const timestamp = now()
    if (current) {
      const expired = current.status === 'deleting'
        && current.lease_expires_at
        && new Date(current.lease_expires_at).getTime() <= timestamp.getTime()
      if (current.status === 'completed' && current.request_id === requestId) {
        return { created: false, run: current }
      }
      if (!expired && current.status !== 'failed_retryable' && current.status !== 'completed') {
        return { created: false, run: current }
      }
      if (current.status === 'completed' && current.request_id !== requestId) {
        const restarted = Object.assign({}, data, {
          _id: documentId,
          id: Number(current.id || 0) || await adapter.nextCounter('qa_pair_reset_run'),
          status: 'deleting',
          retry_count: 0,
          lease_expires_at: new Date(timestamp.getTime() + 2 * 60 * 1000),
          create_time: timestamp,
          update_time: timestamp,
          completed_at: null,
          deleted_counts: {}
        })
        await adapter.setByDocId('qa_pair_reset_run', documentId, restarted)
        return { created: true, run: restarted }
      }
      const resumed = Object.assign({}, current, data, {
        status: 'deleting',
        request_id: requestId,
        retry_count: Number(current.retry_count || 0) + 1,
        lease_expires_at: new Date(timestamp.getTime() + 2 * 60 * 1000),
        update_time: timestamp
      })
      await adapter.setByDocId('qa_pair_reset_run', documentId, resumed)
      return { created: true, run: resumed }
    }
    const id = await adapter.nextCounter('qa_pair_reset_run')
    const run = Object.assign({}, data, {
      _id: documentId,
      id,
      lease_expires_at: new Date(timestamp.getTime() + 2 * 60 * 1000),
      update_time: timestamp
    })
    await adapter.setByDocId('qa_pair_reset_run', documentId, run)
    return { created: true, run }
  }))
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
    list: async (name, query, limit = 100) => {
      const result = await collection(name)
        .where(query || {})
        .limit(Math.max(1, Math.min(Number(limit || 100), 500)))
        .get()
      return result.data || []
    },
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

function submissionError(code, message, httpCode = 409) {
  const error = new Error(message)
  error.code = code
  error.errorCode = code
  error.httpCode = httpCode
  return error
}

/**
 * Core application submission transaction. Event, notification and reminder
 * projections are deliberately outside this transaction.
 */
async function commitCoordinationApplication(input = {}, timestamp = now()) {
  const coordination = input.coordination
  const userId = Number(input.user_id || 0)
  const expectedVersion = Number(input.coordination_version || 0)
  if (!coordination || !coordination._id || !userId || !expectedVersion) {
    throw submissionError('DATE_APPLICATION_INVALID', '日期申请参数无效', 400)
  }
  return transaction(async (adapter) => {
    const current = await adapter.byDocId('date_coordination', coordination._id)
    if (!current) throw submissionError('DATE_COORDINATION_NOT_FOUND', '日期协调不存在', 404)
    if (![Number(current.user_a_id), Number(current.user_b_id)].includes(userId)) {
      throw submissionError('DATE_COORDINATION_FORBIDDEN', '无权操作该日期协调', 403)
    }
    const version = Number(current.coordination_version || 1)
    if (version !== expectedVersion) {
      throw submissionError('STALE_COORDINATION_VERSION', '协调状态已更新，请刷新后重试', 409)
    }
    const query = {
      coordination_id: Number(current.id),
      user_id: userId,
      coordination_version: version
    }
    const existing = (await adapter.list('date_coordination_application', query, 5))[0] || null
    const sameApplication = existing && JSON.stringify(existing.application || {}) === JSON.stringify(input.application || {})
    if (sameApplication && !['collecting_initiator', 'collecting_preferences'].includes(String(current.status || ''))) {
      return { coordination: current, application: existing, idempotent: true }
    }
    const isInitiatorDraft = current.status === 'collecting_initiator'
    if (isInitiatorDraft && Number(current.user_a_id) !== userId) {
      throw submissionError('DATE_COORDINATION_STATE_INVALID', '请等待发起方填写约会偏好并发出邀请')
    }
    if (!['collecting_initiator', 'collecting_preferences'].includes(String(current.status || ''))) {
      throw submissionError('DATE_COORDINATION_STATE_INVALID', '当前状态不能提交日期申请')
    }
    const nextPreferenceVersion = existing
      ? Number(existing.preference_version || existing.coordination_version || version) + 1
      : version
    const applicationData = {
      application: input.application,
      submitted_at: timestamp,
      preference_version: nextPreferenceVersion,
      preference_evidence: input.preference_evidence || {},
      source: String(input.application_source || (isInitiatorDraft ? 'initiator_invitation' : 'invitee_full_form')),
      accepted_base_invitation_version: Number(input.accepted_base_invitation_version || current.accepted_base_invitation_version || 0)
    }
    const applicationRow = existing
      ? await adapter.updateByDoc('date_coordination_application', existing, applicationData)
      : await adapter.addWithId('date_coordination_application', Object.assign({}, query, applicationData), 'date_application')
    let updated = current
    if (isInitiatorDraft) {
      updated = await adapter.updateByDoc('date_coordination', current, {
        status: 'inviting_partner',
        business_state: 'waiting_partner',
        invitation_deadline_at: new Date(timestamp.getTime() + 48 * 60 * 60 * 1000),
        application_deadline_at: null,
        invitation_proposal: input.invitation_proposal || input.application,
        invitation_primary_proposal: input.invitation_primary_proposal || null,
        invitation_version: nextPreferenceVersion,
        initiator_agreed_invitation_version: nextPreferenceVersion,
        invitee_intent: ''
      })
    } else {
      const applications = await adapter.list('date_coordination_application', {
        coordination_id: Number(current.id),
        coordination_version: version
      }, 10)
      const hasA = applications.some((item) => Number(item.user_id) === Number(current.user_a_id))
      const hasB = applications.some((item) => Number(item.user_id) === Number(current.user_b_id))
      if (hasA && hasB) {
        updated = await adapter.updateByDoc('date_coordination', current, {
          status: 'computing_overlap',
          business_state: 'processing',
          processing_status: 'queued',
          processing_version: version,
          processing_token: '',
          processing_attempts: 0,
          processing_started_at: null,
          processing_completed_at: null,
          processing_error_code: '',
          last_event_at: timestamp,
          missing_dimensions: [],
          confirmation_deadline_at: null
        })
      }
    }
    return { coordination: updated, application: applicationRow, idempotent: false }
  })
}

async function ensureCollection(name) {
  const logicalName = String(name || '')
  const physicalName = collections[logicalName] || logicalName
  return withCollectionBootstrap({
    logicalName,
    physicalName,
    operation: () => col(logicalName).limit(1).get(),
    createCollection: (collectionName) => db.createCollection(collectionName)
  })
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

const COORDINATION_PROCESSING_LEASE_MS = 2 * 60 * 1000
const COORDINATION_PROCESSING_MAX_ATTEMPTS = 3

async function listCoordinationProcessingTasks(timestamp = now(), limit = 10) {
  const bounded = Math.max(1, Math.min(Number(limit || 10), 50))
  const queued = await list('date_coordination', {
    status: 'computing_overlap',
    processing_status: 'queued'
  }, bounded)
  if (queued.length >= bounded) return queued
  const processing = await list('date_coordination', {
    status: 'computing_overlap',
    processing_status: 'processing'
  }, bounded)
  const cutoff = new Date(timestamp).getTime() - COORDINATION_PROCESSING_LEASE_MS
  return queued.concat(processing.filter((row) => {
    const started = new Date(row.processing_started_at || 0).getTime()
    return Number.isFinite(started) && started <= cutoff
  })).slice(0, bounded)
}

async function claimCoordinationProcessing(task, timestamp = now()) {
  if (!task || !task._id) return null
  const { claimProcessingVersion } = require('./dateCoordinationProcessingPolicy')
  return transaction(async (adapter) => {
    const stored = await adapter.byDocId('date_coordination', task._id)
    if (!stored) return null
    const current = Object.assign({ _id: task._id }, stored)
    const started = new Date(current.processing_started_at || 0).getTime()
    const leaseExpired = current.processing_status === 'processing'
      && Number.isFinite(started)
      && started <= new Date(timestamp).getTime() - COORDINATION_PROCESSING_LEASE_MS
    if (current.processing_status !== 'queued' && !leaseExpired) return null
    if (Number(current.processing_attempts || 0) >= COORDINATION_PROCESSING_MAX_ATTEMPTS) {
      await adapter.updateByDoc('date_coordination', current, {
        processing_status: 'failed',
        processing_token: '',
        processing_error_code: 'worker_interrupted',
        last_event_at: timestamp
      })
      return null
    }
    const queued = leaseExpired ? Object.assign({}, current, { processing_status: 'queued' }) : current
    let claimed
    try {
      claimed = claimProcessingVersion(queued, {
        token: crypto.randomBytes(16).toString('hex'),
        now: timestamp
      })
    } catch (err) {
      return null
    }
    return adapter.updateByDoc('date_coordination', current, {
      processing_status: claimed.processing_status,
      processing_token: claimed.processing_token,
      processing_attempts: claimed.processing_attempts,
      processing_started_at: claimed.processing_started_at,
      processing_error_code: '',
      last_event_at: claimed.last_event_at
    })
  })
}

async function completeCoordinationProcessing(claim, result, timestamp = now()) {
  if (!claim || !claim._id) return { applied: false, reason: 'missing_claim' }
  const { completeProcessingVersion } = require('./dateCoordinationProcessingPolicy')
  return transaction(async (adapter) => {
    const stored = await adapter.byDocId('date_coordination', claim._id)
    if (!stored) return { applied: false, reason: 'missing_coordination' }
    const current = Object.assign({ _id: claim._id }, stored)
    const completed = completeProcessingVersion(current, {
      version: Number(claim.processing_version || 0),
      token: claim.processing_token,
      now: timestamp
    })
    if (!completed.applied) return completed
    const proposals = []
    for (const proposal of result.proposals || []) {
      proposals.push(await adapter.addWithId('date_coordination_proposal', Object.assign({}, proposal, {
        coordination_id: Number(current.id),
        status: 'active'
      }), 'date_coordination_proposal'))
    }
    const hasProposals = proposals.length > 0
    const coordination = await adapter.updateByDoc('date_coordination', current, {
      status: hasProposals ? 'waiting_confirmations' : 'no_overlap',
      business_state: hasProposals ? 'proposal_generated' : 'waiting_partner',
      processing_status: completed.coordination.processing_status,
      processing_token: '',
      processing_completed_at: completed.coordination.processing_completed_at,
      processing_error_code: '',
      last_event_at: completed.coordination.last_event_at,
      missing_dimensions: hasProposals ? [] : (result.missing_dimensions || []),
      confirmation_deadline_at: hasProposals
        ? new Date(new Date(timestamp).getTime() + 24 * 60 * 60 * 1000)
        : null
    })
    return { applied: true, reason: '', coordination, proposals }
  })
}

async function failCoordinationProcessing(claim, errorCode, timestamp = now()) {
  if (!claim || !claim._id) return null
  return transaction(async (adapter) => {
    const stored = await adapter.byDocId('date_coordination', claim._id)
    if (!stored) return null
    const current = Object.assign({ _id: claim._id }, stored)
    if (Number(current.processing_version || 0) !== Number(claim.processing_version || 0)
      || current.processing_status !== 'processing'
      || String(current.processing_token || '') !== String(claim.processing_token || '')) return current
    const exhausted = Number(current.processing_attempts || 0) >= COORDINATION_PROCESSING_MAX_ATTEMPTS
    return adapter.updateByDoc('date_coordination', current, {
      processing_status: exhausted ? 'failed' : 'queued',
      processing_token: '',
      processing_error_code: String(errorCode || 'coordination_processing_failed').slice(0, 80),
      last_event_at: timestamp
    })
  })
}

/**
 * CAS direct-accept of a primary invitation proposal.
 * Succeeds only when status=inviting_partner AND invitation_version matches.
 */
async function commitDirectInvitationAccept(input = {}, timestamp = now()) {
  const {
    coordination,
    inviteeUserId,
    invitationVersion,
    proposalData,
    nextStatusValue,
    invitationRespondedAt
  } = input
  if (!coordination || !coordination._id) throw new Error('日期协调不存在')
  const submittedVersion = Number(invitationVersion)
  if (!Number.isFinite(submittedVersion) || submittedVersion <= 0) {
    const err = new Error('请提交邀请版本后再确认')
    err.code = 'INVALID_INVITATION_VERSION'
    throw err
  }
  if (!proposalData || !proposalData.proposal_key) throw new Error('当前建议安排不完整，请刷新后重试')

  return transaction(async (adapter) => {
    const current = await adapter.byDocId('date_coordination', coordination._id)
    if (!current) throw new Error('日期协调不存在')

    const currentInvitationVersion = invitationVersionFromRow(current)
    const coordVersion = Number(current.coordination_version || 1)
    const proposalKey = String(proposalData.proposal_key)
    const proposalDocId = `date-proposal-direct-${current.id}-v${submittedVersion}`
    const confirmationDocId = (participantId) => `date-confirmation-${current.id}-${participantId}-v${coordVersion}`

    // Idempotent replay: already arranged on this exact direct proposal
    if (current.status === 'arranged' && Number(current.accepted_base_invitation_version) === submittedVersion) {
      const existingProposal = await adapter.byDocId('date_coordination_proposal', proposalDocId)
        || (current.final_proposal_id ? await adapter.byId('date_coordination_proposal', current.final_proposal_id) : null)
      if (existingProposal && String(existingProposal.proposal_key) === proposalKey
        && Number(current.final_proposal_id) === Number(existingProposal.id)) {
        return {
          coordination: current,
          proposal: existingProposal,
          arranged: true,
          idempotent: true,
          stale: false
        }
      }
    }

    if (isExpiredInvitationRow(current) || invitingPartnerDeadlinePassed(current, timestamp)) {
      return expireInvitationInTransaction(adapter, current)
    }
    if (current.status !== 'inviting_partner') {
      throw new Error('当前状态不能接受约会邀请')
    }
    if (Number(current.user_b_id) !== Number(inviteeUserId)) {
      throw new Error('仅受邀参与者可以处理邀请')
    }
    if (current.invitation_responded_at) {
      throw new Error('当前邀请已经回应过')
    }
    if (currentInvitationVersion !== submittedVersion) {
      const err = new Error('对方刚刚更新了约会安排，请查看最新方案后再确认')
      err.code = 'STALE_INVITATION_VERSION'
      err.refresh_invitation = true
      throw err
    }

    if (typeof input.beforeCommitHook === 'function') {
      await input.beforeCommitHook('direct_accept')
    }

    const refreshed = await adapter.byDocId('date_coordination', coordination._id)
    if (isExpiredInvitationRow(refreshed) || invitingPartnerDeadlinePassed(refreshed, timestamp)) {
      return expireInvitationInTransaction(adapter, refreshed || current)
    }
    if (!refreshed
      || refreshed.status !== 'inviting_partner'
      || invitationVersionFromRow(refreshed) !== submittedVersion
      || refreshed.invitation_responded_at) {
      const err = new Error('对方刚刚更新了约会安排，请查看最新方案后再确认')
      err.code = 'STALE_INVITATION_VERSION'
      err.refresh_invitation = true
      throw err
    }

    let proposal = await adapter.byDocId('date_coordination_proposal', proposalDocId)
    if (!proposal) {
      const proposalId = await adapter.nextCounter('date_coordination_proposal')
      proposal = await adapter.setByDocId('date_coordination_proposal', proposalDocId, Object.assign({}, proposalData, {
        id: proposalId,
        coordination_id: Number(current.id),
        coordination_version: coordVersion,
        invitation_version: submittedVersion,
        proposal_key: proposalKey,
        status: 'active',
        source: 'direct_accept',
        create_time: timestamp
      }))
    } else if (String(proposal.proposal_key) !== proposalKey) {
      throw new Error('当前建议安排已变更，请刷新后重试')
    }

    await adapter.setByDocId('date_coordination_confirmation', confirmationDocId(Number(current.user_a_id)), {
      coordination_id: Number(current.id),
      user_id: Number(current.user_a_id),
      proposal_id: Number(proposal.id),
      coordination_version: coordVersion,
      decision: 'confirm',
      status: 'active',
      source: 'initiator_invitation',
      create_time: timestamp
    })
    await adapter.setByDocId('date_coordination_confirmation', confirmationDocId(Number(inviteeUserId)), {
      coordination_id: Number(current.id),
      user_id: Number(inviteeUserId),
      proposal_id: Number(proposal.id),
      coordination_version: coordVersion,
      decision: 'confirm',
      status: 'active',
      source: 'direct_accept',
      create_time: timestamp
    })

    const updated = await adapter.updateByDoc('date_coordination', refreshed, {
      status: nextStatusValue || 'arranged',
      business_state: 'completed',
      invitation_responded_at: invitationRespondedAt || timestamp,
      invitee_intent: 'accept',
      accepted_base_invitation_version: submittedVersion,
      final_proposal_id: Number(proposal.id)
    })

    return {
      coordination: updated,
      proposal,
      arranged: true,
      idempotent: false,
      stale: false
    }
  })
}

/**
 * CAS coordinate / decline while INVITING_PARTNER.
 */
async function commitInvitationResponse(input = {}, timestamp = now()) {
  const {
    coordination,
    inviteeUserId,
    invitationVersion,
    decision,
    nextStatusValue,
    businessState,
    applicationDeadlineAt,
    invitationRespondedAt
  } = input
  if (!coordination || !coordination._id) throw new Error('日期协调不存在')
  const submittedVersion = Number(invitationVersion)
  if (!Number.isFinite(submittedVersion) || submittedVersion <= 0) {
    const err = new Error('请提交邀请版本后再确认')
    err.code = 'INVALID_INVITATION_VERSION'
    throw err
  }
  if (!['coordinate', 'decline'].includes(String(decision || ''))) {
    throw new Error('请选择和 AI 协调，或这次暂不方便')
  }

  return transaction(async (adapter) => {
    const current = await adapter.byDocId('date_coordination', coordination._id)
    if (!current) throw new Error('日期协调不存在')

    // Idempotent replay
    if (decision === 'coordinate'
      && current.status === 'collecting_preferences'
      && String(current.invitee_intent || '') === 'coordinate'
      && Number(current.accepted_base_invitation_version) === submittedVersion) {
      return { coordination: current, decision, idempotent: true }
    }
    if (decision === 'decline'
      && current.status === 'invitation_declined'
      && String(current.invitee_intent || '') === 'decline'
      && Number(current.accepted_base_invitation_version || current.invitation_version) === submittedVersion) {
      return { coordination: current, decision, idempotent: true }
    }

    if (isExpiredInvitationRow(current) || invitingPartnerDeadlinePassed(current, timestamp)) {
      return expireInvitationInTransaction(adapter, current)
    }
    if (current.status !== 'inviting_partner') {
      const err = new Error('对方刚刚回应了邀请，请查看最新协调状态。')
      err.code = 'INVITATION_ALREADY_RESPONDED'
      err.refresh_invitation = true
      throw err
    }
    if (Number(current.user_b_id) !== Number(inviteeUserId)) {
      throw new Error('仅受邀参与者可以处理邀请')
    }
    if (current.invitation_responded_at) {
      const err = new Error('对方刚刚回应了邀请，请查看最新协调状态。')
      err.code = 'INVITATION_ALREADY_RESPONDED'
      err.refresh_invitation = true
      throw err
    }
    if (invitationVersionFromRow(current) !== submittedVersion) {
      const err = new Error('对方刚刚更新了约会安排，请查看最新方案后再确认')
      err.code = 'STALE_INVITATION_VERSION'
      err.refresh_invitation = true
      throw err
    }

    if (typeof input.beforeCommitHook === 'function') {
      await input.beforeCommitHook(`invitation_${decision}`)
    }

    const refreshed = await adapter.byDocId('date_coordination', coordination._id)
    if (isExpiredInvitationRow(refreshed) || invitingPartnerDeadlinePassed(refreshed, timestamp)) {
      return expireInvitationInTransaction(adapter, refreshed || current)
    }
    if (!refreshed
      || refreshed.status !== 'inviting_partner'
      || invitationVersionFromRow(refreshed) !== submittedVersion
      || refreshed.invitation_responded_at) {
      const err = new Error('对方刚刚更新了约会安排，请查看最新方案后再确认')
      err.code = 'STALE_INVITATION_VERSION'
      err.refresh_invitation = true
      throw err
    }

    const update = {
      status: nextStatusValue,
      business_state: businessState,
      invitation_responded_at: invitationRespondedAt || timestamp,
      invitee_intent: decision,
      accepted_base_invitation_version: submittedVersion
    }
    if (decision === 'coordinate') {
      update.application_deadline_at = applicationDeadlineAt || null
    }
    const updated = await adapter.updateByDoc('date_coordination', refreshed, update)
    return { coordination: updated, decision, idempotent: false }
  })
}

/**
 * CAS pre-accept invitation patch while INVITING_PARTNER.
 * Prevents A patch from tearing state after B already responded.
 */
async function commitPreAcceptInvitationPatch(input = {}, timestamp = now()) {
  const {
    coordination,
    actorUserId,
    expectedCoordinationVersion,
    expectedInvitationVersion,
    nextCoordinationVersion,
    nextInvitationVersion,
    nextApplication,
    nextPreferenceVersion,
    nextPrimaryProposal,
    invitationProposal,
    patchId,
    patchDocId,
    preferenceEvidence,
    acceptedBaseInvitationVersion
  } = input
  if (!coordination || !coordination._id) throw new Error('日期协调不存在')
  const expectedCoord = Number(expectedCoordinationVersion)
  const expectedInvite = Number(expectedInvitationVersion)
  const nextCoord = Number(nextCoordinationVersion)
  const nextInvite = Number(nextInvitationVersion)
  if (!Number.isFinite(expectedCoord) || !Number.isFinite(nextCoord)) {
    throw new Error('约会条件已更新，请重新生成修改预览')
  }

  return transaction(async (adapter) => {
    const current = await adapter.byDocId('date_coordination', coordination._id)
    if (!current) throw new Error('日期协调不存在')

    if (isExpiredInvitationRow(current) || invitingPartnerDeadlinePassed(current, timestamp)) {
      return expireInvitationInTransaction(adapter, current)
    }
    if (current.status !== 'inviting_partner') {
      const err = new Error('对方刚刚回应了邀请，请查看最新协调状态。')
      err.code = 'INVITATION_ALREADY_RESPONDED'
      err.refresh_invitation = true
      throw err
    }
    if (Number(current.user_a_id) !== Number(actorUserId)) {
      throw new Error('仅发起方可以在等待回应时修改邀请')
    }
    if (current.invitation_responded_at) {
      const err = new Error('对方刚刚回应了邀请，请查看最新协调状态。')
      err.code = 'INVITATION_ALREADY_RESPONDED'
      err.refresh_invitation = true
      throw err
    }
    if (Number(current.coordination_version) !== expectedCoord) {
      const err = new Error('约会条件已更新，请重新生成修改预览')
      err.code = 'STALE_COORDINATION_VERSION'
      throw err
    }
    if (invitationVersionFromRow(current) !== expectedInvite) {
      const err = new Error('对方刚刚更新了约会安排，请查看最新方案后再确认')
      err.code = 'STALE_INVITATION_VERSION'
      err.refresh_invitation = true
      throw err
    }

    if (typeof input.beforeCommitHook === 'function') {
      await input.beforeCommitHook('pre_accept_patch')
    }

    const refreshed = await adapter.byDocId('date_coordination', coordination._id)
    if (isExpiredInvitationRow(refreshed) || invitingPartnerDeadlinePassed(refreshed, timestamp)) {
      return expireInvitationInTransaction(adapter, refreshed || current)
    }
    if (!refreshed
      || refreshed.status !== 'inviting_partner'
      || refreshed.invitation_responded_at
      || Number(refreshed.coordination_version) !== expectedCoord
      || invitationVersionFromRow(refreshed) !== expectedInvite) {
      const err = new Error(
        refreshed && refreshed.status !== 'inviting_partner'
          ? '对方刚刚回应了邀请，请查看最新协调状态。'
          : '对方刚刚更新了约会安排，请查看最新方案后再确认'
      )
      err.code = refreshed && refreshed.status !== 'inviting_partner'
        ? 'INVITATION_ALREADY_RESPONDED'
        : 'STALE_INVITATION_VERSION'
      err.refresh_invitation = true
      throw err
    }

    await adapter.addWithId('date_coordination_application', {
      coordination_id: Number(refreshed.id),
      user_id: Number(actorUserId),
      coordination_version: nextCoord,
      application: nextApplication,
      submitted_at: timestamp,
      source: 'agent_confirmed_patch',
      preference_version: Number(nextPreferenceVersion || nextInvite),
      preference_evidence: preferenceEvidence || null,
      accepted_base_invitation_version: Number(acceptedBaseInvitationVersion || 0)
    }, 'date_coordination_application')

    const updated = await adapter.updateByDoc('date_coordination', refreshed, {
      coordination_version: nextCoord,
      invitation_version: nextInvite,
      initiator_agreed_invitation_version: nextInvite,
      invitation_proposal: invitationProposal,
      invitation_primary_proposal: nextPrimaryProposal,
      status: 'inviting_partner',
      business_state: 'waiting_partner',
      recoordination_count: Number(refreshed.recoordination_count || 0),
      final_proposal_id: 0,
      last_changed_by_user_id: Number(actorUserId),
      processing_status: '',
      processing_version: 0,
      processing_token: '',
      processing_attempts: 0,
      processing_started_at: null,
      processing_completed_at: null,
      processing_error_code: '',
      missing_dimensions: []
    })

    let appliedPatch = null
    if (patchDocId || patchId) {
      const patchRef = patchDocId
        ? await adapter.byDocId('date_application_patch', patchDocId)
        : await adapter.byId('date_application_patch', patchId)
      if (patchRef) {
        appliedPatch = await adapter.updateByDoc('date_application_patch', patchRef, {
          status: 'applied',
          applied_version: nextCoord,
          applied_at: timestamp
        })
      }
    }

    return {
      coordination: updated,
      patch: appliedPatch,
      idempotent: false
    }
  })
}

async function commitCoordinationConfirmation(coordination, proposal, input = {}, timestamp = now()) {
  if (!coordination || !coordination._id || !proposal || !proposal._id) throw new Error('方案已失效，请刷新后重试')
  const userId = Number(input.user_id || 0)
  const decision = String(input.decision || '')
  if (decision !== 'confirm') throw new Error('协调确认事务只接受明确确认')
  return transaction(async (adapter) => {
    const current = await adapter.byDocId('date_coordination', coordination._id)
    const storedProposal = await adapter.byDocId('date_coordination_proposal', proposal._id)
    if (!current || !storedProposal
      || ![Number(current.user_a_id), Number(current.user_b_id)].includes(userId)
      || Number(storedProposal.coordination_id) !== Number(current.id)
      || Number(storedProposal.coordination_version) !== Number(current.coordination_version)
      || storedProposal.status !== 'active') {
      throw new Error('方案已失效，请刷新后重试')
    }
    const version = Number(current.coordination_version || 1)
    const confirmationDocId = (participantId) => `date-confirmation-${current.id}-${participantId}-v${version}`
    if (current.status === 'arranged') {
      const existing = await adapter.byDocId('date_coordination_confirmation', confirmationDocId(userId))
      if (existing && existing.decision === 'confirm'
        && Number(existing.proposal_id) === Number(storedProposal.id)
        && Number(current.final_proposal_id) === Number(storedProposal.id)) {
        return { coordination: current, confirmation: existing, arranged: true, idempotent: true }
      }
      throw new Error('当前状态不能确认约会方案')
    }
    if (current.status !== 'waiting_confirmations') throw new Error('当前状态不能确认约会方案')
    const documentId = confirmationDocId(userId)
    const existing = await adapter.byDocId('date_coordination_confirmation', documentId)
    const confirmation = await adapter.setByDocId('date_coordination_confirmation', documentId, Object.assign({}, existing || {}, {
      coordination_id: Number(current.id),
      user_id: userId,
      proposal_id: Number(storedProposal.id),
      coordination_version: version,
      decision: 'confirm',
      status: 'active',
      create_time: existing && existing.create_time || timestamp
    }))
    const participantConfirmations = await Promise.all([
      adapter.byDocId('date_coordination_confirmation', confirmationDocId(Number(current.user_a_id))),
      adapter.byDocId('date_coordination_confirmation', confirmationDocId(Number(current.user_b_id)))
    ])
    const arranged = participantConfirmations.every((item) => item
      && item.status !== 'superseded'
      && item.decision === 'confirm'
      && Number(item.proposal_id) === Number(storedProposal.id)
      && Number(item.coordination_version) === version)
    const updated = arranged
      ? await adapter.updateByDoc('date_coordination', current, {
        status: 'arranged',
        business_state: 'completed',
        final_proposal_id: Number(storedProposal.id)
      })
      : current
    return { coordination: updated, confirmation, arranged, idempotent: false }
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
  listPage,
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
  acquireQaPairResetRun,
  removeByDoc,
  transaction,
  commitCoordinationApplication,
  ensureUserSupportCode,
  listCoordinationProcessingTasks,
  claimCoordinationProcessing,
  completeCoordinationProcessing,
  failCoordinationProcessing,
  commitCoordinationConfirmation,
  commitDirectInvitationAccept,
  commitInvitationResponse,
  commitPreAcceptInvitationPatch,
  authError,
  withCollection,
  ensureCollection
}
