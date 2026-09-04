'use strict'

const { STATUS, nextStatus } = require('./dateCoordinationPolicy')
const { enqueueProcessing } = require('./dateCoordinationProcessingPolicy')
const {
  publicInvitationProposal,
  resolvePrimaryInvitationProposal
} = require('./invitationCoordination')
const { createReminderJob } = require('../agent/notificationJobs')
const { businessError } = require('./businessError')

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + Number(hours) * 3600 * 1000)
}

function assertSubmissionVersion(current, expectedVersion) {
  const currentVersion = Number(current && current.coordination_version || 1)
  const expected = Number(expectedVersion || 0)
  if (expected > 0 && currentVersion !== expected) {
    throw businessError('STALE_COORDINATION_VERSION', '协调版本已更新，请刷新后重试')
  }
}

function defaultDeps() {
  const db = require('./db')
  return {
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    now: db.now,
    transaction: (work) => withSubmissionCollections(() => db.transaction(work)),
    publishCoordinationEvent: require('../agent/dateCoordinationEvents').publishCoordinationEvent,
    writeInboxNotification: require('./coordinationInbox').notifyInbox
  }
}

function withSubmissionCollections(operation) {
  const db = require('./db')
  return db.withCollection('date_submission_outbox', () => db.withCollection('date_coordination_application', () => db.withCollection('date_coordination', operation)))
}

function attachMemoryTransaction(deps) {
  if (!deps || typeof deps.transaction === 'function') return deps
  const tables = deps.rows || deps.tables
  const ensureCollection = (name) => {
    if (!tables) return
    if (!Array.isArray(tables[name])) tables[name] = []
  }
  const addWithId = async (name, data, prefix) => {
    ensureCollection(name)
    return deps.addWithId(name, data, prefix)
  }
  const first = async (name, query) => {
    ensureCollection(name)
    return deps.first(name, query)
  }
  const list = async (name, query, limit) => {
    ensureCollection(name)
    return deps.list(name, query, limit)
  }
  const byId = async (name, id) => {
    ensureCollection(name)
    return deps.byId(name, id)
  }
  deps.transaction = async (work) => {
    const adapter = {
      first,
      list,
      byId,
      addWithId,
      updateByDoc: deps.updateByDoc,
      byDocId: async (name, docId) => {
        ensureCollection(name)
        if (!tables) return null
        return tables[name].find((row) => row._id === docId) || null
      }
    }
    if (!tables) return work(adapter)
    const snapshot = JSON.parse(JSON.stringify(tables))
    try {
      return await work(adapter)
    } catch (err) {
      Object.keys(tables).forEach((key) => {
        tables[key] = Array.isArray(snapshot[key]) ? snapshot[key] : []
      })
      throw err
    }
  }
  return deps
}

async function commitDateApplicationSubmission(input = {}, overrides) {
  const deps = overrides || defaultDeps()
  if (typeof deps.transaction !== 'function') {
    throw new Error('约会申请提交缺少事务依赖')
  }
  return memoryCommit(input, deps)
}

async function upsertApplication(tx, {
  coordinationId,
  userId,
  version,
  application,
  applicationSource,
  acceptedBaseVersion,
  preferenceEvidence,
  now
}) {
  const query = {
    coordination_id: Number(coordinationId),
    user_id: Number(userId),
    coordination_version: Number(version)
  }
  const existing = await tx.first('date_coordination_application', query)
  const nextPreferenceVersion = existing
    ? Number(existing.preference_version || existing.coordination_version || version || 1) + 1
    : Number(version || 1)
  const evidence = preferenceEvidence && typeof preferenceEvidence === 'object'
    ? preferenceEvidence
    : (application && application.preference_evidence) || {}
  if (existing) {
    const updated = await tx.updateByDoc('date_coordination_application', existing, {
      application,
      submitted_at: now,
      preference_version: nextPreferenceVersion,
      preference_evidence: evidence,
      source: applicationSource,
      accepted_base_invitation_version: acceptedBaseVersion || existing.accepted_base_invitation_version || 0
    })
    return { applicationRow: updated || existing, preferenceVersion: nextPreferenceVersion, created: false }
  }
  const created = await tx.addWithId('date_coordination_application', Object.assign({}, query, {
    application,
    submitted_at: now,
    preference_version: nextPreferenceVersion,
    preference_evidence: evidence,
    source: applicationSource,
    accepted_base_invitation_version: acceptedBaseVersion || 0
  }), 'date_coordination_application')
  return { applicationRow: created, preferenceVersion: nextPreferenceVersion, created: true }
}

async function createSubmissionOutboxOnce(tx, {
  requestId,
  coordination,
  actorUserId,
  kind,
  projection,
  now
}) {
  const existing = await tx.first('date_submission_outbox', { request_id: String(requestId) })
  if (existing) return existing
  return tx.addWithId('date_submission_outbox', {
    request_id: String(requestId),
    coordination_id: Number(coordination.id),
    actor_user_id: Number(actorUserId),
    coordination_version: Number(coordination.coordination_version || 1),
    kind: String(kind || 'application'),
    status: 'pending',
    projection: projection || {},
    create_time: now,
    update_time: now,
    projected_at: null,
    last_error: ''
  }, 'date_submission_outbox')
}

async function memoryCommit(input, deps) {
  const now = deps.now()
  const requestId = String(input.request_id || '').trim()
  if (!requestId) throw businessError('DATE_APPLICATION_INVALID', '缺少提交请求编号')
  const coordinationId = Number(input.coordination_id || 0)
  const actorUserId = Number(input.actor_user_id || 0)
  const expectedVersion = Number(input.expected_version || 0)

  return deps.transaction(async (tx) => {
    const existingOutbox = await tx.first('date_submission_outbox', { request_id: requestId })
    if (existingOutbox) {
      const coordination = await tx.byId('date_coordination', Number(existingOutbox.coordination_id))
      const applicationRow = await tx.first('date_coordination_application', {
        coordination_id: Number(existingOutbox.coordination_id),
        user_id: Number(existingOutbox.actor_user_id),
        coordination_version: Number(existingOutbox.coordination_version || 1)
      })
      return {
        saved: true,
        idempotent: true,
        notification_status: String(existingOutbox.status || 'pending') === 'projected' ? 'projected' : 'pending',
        coordination,
        application: applicationRow,
        outbox: existingOutbox
      }
    }

    const current = await tx.byId('date_coordination', coordinationId)
    if (!current) throw new Error('日期协调不存在')
    assertSubmissionVersion(current, expectedVersion)
    const participants = [Number(current.user_a_id), Number(current.user_b_id)]
    if (!participants.includes(actorUserId)) throw new Error('无权操作该日期协调')

    const isInitiatorDraft = current.status === STATUS.COLLECTING_INITIATOR
    if (isInitiatorDraft && Number(current.user_a_id) !== actorUserId) {
      throw new Error('请等待发起方填写约会偏好并发出邀请')
    }
    if (![STATUS.COLLECTING_INITIATOR, STATUS.COLLECTING_PREFERENCES].includes(current.status)) {
      throw new Error('当前状态不能提交日期申请')
    }

    const version = Number(current.coordination_version || 1)
    const application = input.application
    const applicationSource = String(input.application_source || (isInitiatorDraft ? 'initiator_invitation' : 'invitee_full_form'))
    const acceptedBaseVersion = Number(input.accepted_base_invitation_version || current.accepted_base_invitation_version || 0)
    const { applicationRow, preferenceVersion } = await upsertApplication(tx, {
      coordinationId,
      userId: actorUserId,
      version,
      application,
      applicationSource,
      acceptedBaseVersion,
      preferenceEvidence: input.preference_evidence,
      now
    })

    let updated = current
    let kind = 'invitee_application'
    let projection = {
      events: [{
        event_type: 'application_submitted',
        actor_user_id: actorUserId,
        coordination_version: version
      }],
      reminder: null,
      inbox: null,
      processing_event: null
    }

    if (isInitiatorDraft) {
      const invitationDeadline = addHours(now, 48)
      const invitationProposal = publicInvitationProposal(application)
      const invitationPrimary = input.invitation_primary_proposal
        || resolvePrimaryInvitationProposal(input, application, {
          user_a_id: Number(current.user_a_id),
          user_b_id: Number(current.user_b_id)
        })
      updated = await tx.updateByDoc('date_coordination', current, {
        status: nextStatus(current.status, 'initiator_submitted'),
        business_state: 'waiting_partner',
        invitation_deadline_at: invitationDeadline,
        application_deadline_at: null,
        invitation_proposal: invitationProposal,
        invitation_primary_proposal: invitationPrimary,
        invitation_version: preferenceVersion,
        initiator_agreed_invitation_version: preferenceVersion,
        invitee_intent: ''
      })
      kind = 'initiator_invitation'
      const reminder = createReminderJob({
        coordinationId: current.id,
        userId: current.user_b_id,
        stage: 'invitation_created',
        deadlineAt: invitationDeadline,
        now
      })
      projection.reminder = reminder || null
      projection.inbox = {
        user_id: Number(updated.user_b_id),
        event_type: 'invitation_created',
        coordination_version: Number(updated.coordination_version || 1),
        title: '新的约会协调邀请',
        body: '你收到了一个约会协调邀请，请打开协调页查看并决定是否参与。',
        stage: 'invitation_created'
      }
    } else {
      const applications = await tx.list('date_coordination_application', {
        coordination_id: Number(current.id),
        coordination_version: version
      })
      const byUser = new Map(applications.map((item) => [Number(item.user_id), item.application]))
      byUser.set(actorUserId, application)
      const applicationA = byUser.get(Number(current.user_a_id))
      const applicationB = byUser.get(Number(current.user_b_id))
      if (applicationA && applicationB) {
        const queued = enqueueProcessing(current, { version, now })
        updated = await tx.updateByDoc('date_coordination', current, {
          status: queued.status,
          business_state: queued.business_state,
          processing_status: queued.processing_status,
          processing_version: queued.processing_version,
          processing_token: '',
          processing_attempts: 0,
          processing_started_at: null,
          processing_completed_at: null,
          processing_error_code: '',
          last_event_at: queued.last_event_at,
          missing_dimensions: [],
          confirmation_deadline_at: null,
          last_changed_by_user_id: actorUserId,
          last_changed_dimensions: Array.isArray(input.changed_dimensions) ? input.changed_dimensions.slice(0, 8) : []
        })
        projection.processing_event = {
          event_type: 'processing_queued',
          actor_user_id: actorUserId,
          coordination_version: version
        }
      }
    }

    const outbox = await createSubmissionOutboxOnce(tx, {
      requestId,
      coordination: updated,
      actorUserId,
      kind,
      projection,
      now
    })
    return {
      saved: true,
      idempotent: false,
      notification_status: 'pending',
      coordination: updated,
      application: applicationRow,
      outbox
    }
  })
}

async function projectDateSubmission(outboxId, overrides) {
  const deps = overrides || defaultDeps()
  const now = deps.now()
  const outbox = typeof outboxId === 'object' && outboxId
    ? outboxId
    : await deps.byId('date_submission_outbox', outboxId)
  if (!outbox) throw new Error('提交投影任务不存在')
  if (String(outbox.status || '') === 'projected') {
    return { projected: true, outbox }
  }

  const coordination = await deps.byId('date_coordination', Number(outbox.coordination_id))
  if (!coordination) throw new Error('协调任务不存在')
  const projection = outbox.projection || {}

  try {
    for (const event of Array.isArray(projection.events) ? projection.events : []) {
      if (typeof deps.publishCoordinationEvent === 'function') {
        await deps.publishCoordinationEvent({ coordination, event })
      }
    }
    if (projection.processing_event && typeof deps.publishCoordinationEvent === 'function') {
      await deps.publishCoordinationEvent({
        coordination,
        event: projection.processing_event
      })
    }
    if (projection.reminder && typeof deps.addWithId === 'function') {
      const queued = typeof deps.first === 'function'
        ? await deps.first('agent_notification_job', { idempotency_key: projection.reminder.idempotency_key })
        : null
      if (!queued) {
        await deps.addWithId('agent_notification_job', projection.reminder, 'agent_notification_job')
      }
    }
    if (projection.inbox && typeof deps.writeInboxNotification === 'function') {
      await deps.writeInboxNotification(Object.assign({}, projection.inbox, { coordination }))
    }
    const updated = await deps.updateByDoc('date_submission_outbox', outbox, {
      status: 'projected',
      projected_at: now,
      update_time: now,
      last_error: ''
    })
    return { projected: true, outbox: updated || outbox }
  } catch (err) {
    if (typeof deps.updateByDoc === 'function') {
      await deps.updateByDoc('date_submission_outbox', outbox, {
        status: 'pending',
        update_time: now,
        last_error: String(err && err.message || err || 'projection_failed').slice(0, 120)
      })
    }
    return { projected: false, outbox, error: err }
  }
}

module.exports = {
  commitDateApplicationSubmission,
  projectDateSubmission,
  assertSubmissionVersion,
  createSubmissionOutboxOnce,
  attachMemoryTransaction
}
