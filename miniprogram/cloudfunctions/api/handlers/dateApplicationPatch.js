const { normalizeApplication, STATUS } = require('../lib/dateCoordinationPolicy')
const { previewApplicationChange, shareableSummary, cleanChanges } = require('../lib/dateApplicationPatchPolicy')
const { publishCoordinationEvent } = require('../agent/dateCoordinationEvents')
const { canStartAnotherRound, enqueueProcessing } = require('../lib/dateCoordinationProcessingPolicy')
const {
  canModifyApplication,
  terminalWriteError,
  WRITE_BLOCKED_STATUSES
} = require('../lib/dateCoordinationAccessPolicy')

async function claimPendingPatch(patch) {
  const db = require('../lib/db')
  const result = await db.col('date_application_patch').where({
    _id: patch._id,
    status: 'pending_confirmation'
  }).update({ data: { status: 'applying', update_time: db.now() } })
  return Boolean(result.stats && result.stats.updated)
}

function defaultDeps() {
  const db = require('../lib/db')
  return {
    currentUser: require('./user').currentUser,
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    claimPendingPatch,
    publishCoordinationEvent,
    now: db.now,
    saveApplicationForUser(data, user) {
      const { createDateCoordinationHandlers } = require('./dateCoordination')
      return createDateCoordinationHandlers().saveApplicationForUser(data, user)
    },
    writeInboxNotification(input) {
      const { notifyInbox } = require('../lib/coordinationInbox')
      return notifyInbox(input)
    }
  }
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000)
}

function owns(coordination, userId) {
  return coordination && [Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(userId))
}

function publicPatch(row) {
  return {
    id: Number(row.id),
    coordination_id: Number(row.coordination_id),
    session_id: Number(row.session_id || 0),
    base_version: Number(row.base_version),
    operation: row.operation || 'modify',
    status: row.status,
    preview: row.preview,
    expires_at: row.expires_at || null
  }
}

function createDateApplicationPatchHandlers(overrides = {}) {
  let defaults = null
  function dep(name) {
    if (overrides[name]) return overrides[name]
    if (name === 'publishCoordinationEvent' && overrides.first && overrides.addWithId) {
      return (input) => publishCoordinationEvent(input, {
        first: overrides.first,
        addWithId: overrides.addWithId,
        now: overrides.now
      })
    }
    if (name === 'writeInboxNotification' && !overrides.writeInboxNotification && overrides.first && overrides.addWithId) {
      return (input) => {
        const { notifyInbox } = require('../lib/coordinationInbox')
        const { notifyConfig } = require('../lib/coordinationNotification')
        return notifyInbox(input, {
          first: overrides.first,
          addWithId: overrides.addWithId,
          updateByDoc: overrides.updateByDoc,
          now: overrides.now,
          config: notifyConfig(process.env),
          sendSubscribeMessage: null
        })
      }
    }
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function applicationsFor(coordinationId) {
    return dep('list')('date_coordination_application', { coordination_id: Number(coordinationId) }, 200)
  }

  function latestForUser(rows, userId, maxVersion) {
    return rows
      .filter((row) => Number(row.user_id) === Number(userId) && Number(row.coordination_version || 0) <= Number(maxVersion))
      .sort((a, b) => Number(b.coordination_version || 0) - Number(a.coordination_version || 0))[0] || null
  }

  async function createPreviewForUser(data, user, session) {
    const coordination = await dep('byId')('date_coordination', Number(data.coordination_id || 0))
    if (!owns(coordination, user && user.id)) throw new Error('无权修改该约会协调')
    if (WRITE_BLOCKED_STATUSES.includes(coordination.status) || !canModifyApplication(coordination, user, { hasOwnApplication: true })) {
      throw new Error(terminalWriteError(coordination.status))
    }
    const version = Number(coordination.coordination_version || 1)
    const rows = await applicationsFor(coordination.id)
    const mine = latestForUser(rows, user.id, version)
    if (!mine || !mine.application) throw new Error('请先完成自己的约会偏好表单')
    const changes = cleanChanges(data.changes)
    const activeProposals = await dep('list')('date_coordination_proposal', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 20)
    const preview = previewApplicationChange(mine.application, changes, {
      now: dep('now')(),
      hasActiveProposal: activeProposals.some((item) => item.status === 'active'),
      notifyPartner: true
    })
    const now = dep('now')()
    const created = await dep('addWithId')('date_application_patch', {
      coordination_id: Number(coordination.id),
      session_id: Number(data.session_id || (session && session.id) || 0),
      user_id: Number(user.id),
      source_message_id: Number(data.source_message_id || 0),
      base_version: version,
      operation: 'modify',
      status: 'pending_confirmation',
      changes,
      preview,
      expires_at: addHours(now, 2)
    }, 'date_application_patch')
    return publicPatch(created)
  }

  async function createInitialPreviewForUser(data, user, session) {
    const coordination = await dep('byId')('date_coordination', Number(data.coordination_id || 0))
    if (!owns(coordination, user && user.id)) throw new Error('无权创建该约会申请')
    if (WRITE_BLOCKED_STATUSES.includes(coordination.status) || !canModifyApplication(coordination, user, { hasOwnApplication: false })) {
      throw new Error(terminalWriteError(coordination.status))
    }
    const version = Number(coordination.coordination_version || 1)
    const rows = await applicationsFor(coordination.id)
    const mine = latestForUser(rows, user.id, version)
    if (mine && mine.application) throw new Error('约会申请已经存在，请使用修改预览')
    const application = normalizeApplication(data.application || data.changes || {}, dep('now')())
    const preview = {
      before: null,
      after: application,
      changed_fields: Object.keys(application),
      affects_existing_proposal: false,
      will_notify_partner: true
    }
    const now = dep('now')()
    const created = await dep('addWithId')('date_application_patch', {
      coordination_id: Number(coordination.id),
      session_id: Number(data.session_id || (session && session.id) || 0),
      user_id: Number(user.id),
      source_message_id: Number(data.source_message_id || 0),
      base_version: version,
      operation: 'create',
      status: 'pending_confirmation',
      changes: application,
      preview,
      expires_at: addHours(now, 2)
    }, 'date_application_patch')
    return publicPatch(created)
  }

  async function notifyPartner(coordination, user, summary, proposalCreated, version) {
    const partnerId = Number(coordination.user_a_id) === Number(user.id)
      ? Number(coordination.user_b_id)
      : Number(coordination.user_a_id)
    if (coordination.status === STATUS.INVITING_PARTNER) {
      return { partner_id: partnerId, session_id: 0, shareable_summary: summary, skipped: 'waiting_partner_consent' }
    }
    const published = await dep('publishCoordinationEvent')({
      coordination,
      event: {
        event_type: 'preference_changed',
        actor_user_id: Number(user.id),
        coordination_version: Number(version),
        has_proposal: Boolean(proposalCreated),
        changed_dimensions: summary.changed_dimensions
      }
    })
    try {
      await dep('writeInboxNotification')({
        coordination,
        user_id: partnerId,
        event_type: 'preference_changed',
        coordination_version: Number(version),
        title: '对方更新了可约条件',
        body: '对方更新了可约时间，目前双方在共同条件上可能出现新的交集。请进入查看共同进度。',
        changed_dimensions: summary.changed_dimensions || [],
        stage: 'preference_changed'
      })
    } catch (err) {
      console.warn('inbox preference notification skipped:', err.message || err)
    }
    await dep('addWithId')('agent_notification_job', {
      coordination_id: Number(coordination.id),
      user_id: partnerId,
      stage: 'preference_changed',
      idempotency_key: `date:${coordination.id}:${partnerId}:preference_changed:v${version}`,
      scheduled_at: dep('now')(),
      status: 'pending',
      attempts: 0
    }, 'agent_notification_job')
    const partnerMessage = published.messages.find((item) => Number(item.user_id) === partnerId)
    return { partner_id: partnerId, session_id: Number(partnerMessage && partnerMessage.session_id || 0), shareable_summary: summary }
  }

  async function confirmForUser(data, user) {
    const patch = await dep('byId')('date_application_patch', Number(data.patch_id || data.patchId || 0))
    if (!patch || Number(patch.coordination_id) !== Number(data.coordination_id || patch.coordination_id)) {
      throw new Error('修改预览不存在')
    }
    if (Number(patch.user_id) !== Number(user && user.id)) throw new Error('无权确认该修改预览')
    const coordination = await dep('byId')('date_coordination', Number(patch.coordination_id))
    if (!owns(coordination, user.id)) throw new Error('无权确认该修改预览')
    if (!canModifyApplication(coordination, user, { hasOwnApplication: true })) {
      throw new Error(terminalWriteError(coordination.status))
    }
    if (patch.status === 'applied') {
      return { patch: publicPatch(patch), coordination_version: Number(patch.applied_version || coordination.coordination_version) }
    }
    if (patch.status === 'applying') throw new Error('修改预览正在处理中，请稍后刷新')
    if (patch.status !== 'pending_confirmation') throw new Error('修改预览已经失效')
    if (new Date(patch.expires_at).getTime() < dep('now')().getTime()) {
      await dep('updateByDoc')('date_application_patch', patch, { status: 'expired' })
      throw new Error('修改预览已过期，请重新说明需求')
    }
    const oldVersion = Number(coordination.coordination_version || 1)
    if (Number(patch.base_version) !== oldVersion) throw new Error('约会条件已更新，请重新生成修改预览')
    if (!await dep('claimPendingPatch')(patch)) {
      const latest = await dep('byId')('date_application_patch', patch.id)
      if (latest && latest.status === 'applied') {
        return { patch: publicPatch(latest), coordination_version: Number(latest.applied_version || coordination.coordination_version) }
      }
      throw new Error('修改预览正在处理中，请稍后刷新')
    }
    if (patch.operation === 'create') {
      const result = await dep('saveApplicationForUser')(Object.assign({}, patch.preview.after, {
        coordination_id: Number(coordination.id)
      }), user)
      const appliedPatch = await dep('updateByDoc')('date_application_patch', patch, {
        status: 'applied',
        applied_version: oldVersion,
        applied_at: dep('now')()
      })
      await dep('addWithId')('date_coordination_event', {
        coordination_id: Number(coordination.id),
        coordination_version: oldVersion,
        event_type: 'application_sent',
        actor_user_id: Number(user.id),
        shareable_summary: { application_submitted: true }
      }, 'date_coordination_event')
      return {
        patch: publicPatch(appliedPatch),
        coordination_version: oldVersion,
        status: result.status,
        business_state: result.business_state,
        application_sent: true,
        partner_notified: result.status === STATUS.INVITING_PARTNER
      }
    }
    const rows = await applicationsFor(coordination.id)
    const mine = latestForUser(rows, user.id, oldVersion)
    if (!mine) throw new Error('没有可修改的约会申请')
    const nextApplication = normalizeApplication(Object.assign({}, mine.application, patch.changes), dep('now')())
    if (!canStartAnotherRound(coordination)) {
      const handedOff = await dep('updateByDoc')('date_coordination', coordination, {
        status: STATUS.MANUAL_HANDOFF,
        business_state: 'manual_handoff'
      })
      const referredPatch = await dep('updateByDoc')('date_application_patch', patch, {
        status: 'manual_handoff',
        applied_version: oldVersion,
        applied_at: dep('now')()
      })
      await dep('publishCoordinationEvent')({
        coordination: handedOff,
        event: {
          event_type: 'manual_handoff',
          actor_user_id: Number(user.id),
          coordination_version: oldVersion,
          round_number: 5
        }
      })
      return {
        patch: publicPatch(referredPatch),
        coordination_version: oldVersion,
        status: handedOff.status,
        business_state: handedOff.business_state,
        proposal_generated: false,
        partner_notified: true
      }
    }
    const newVersion = oldVersion + 1

    const proposals = await dep('list')('date_coordination_proposal', {
      coordination_id: Number(coordination.id),
      coordination_version: oldVersion
    }, 20)
    for (const proposal of proposals.filter((item) => item.status === 'active')) {
      await dep('updateByDoc')('date_coordination_proposal', proposal, { status: 'superseded' })
    }
    const confirmations = await dep('list')('date_coordination_confirmation', {
      coordination_id: Number(coordination.id),
      coordination_version: oldVersion
    }, 20)
    for (const confirmation of confirmations) {
      await dep('updateByDoc')('date_coordination_confirmation', confirmation, { status: 'superseded' })
    }

    const participants = [Number(coordination.user_a_id), Number(coordination.user_b_id)]
    const nextApplications = new Map()
    for (const participantId of participants) {
      const source = latestForUser(rows, participantId, oldVersion)
      if (!source || !source.application) continue
      const isActor = participantId === Number(user.id)
      const application = isActor ? nextApplication : source.application
      await dep('addWithId')('date_coordination_application', {
        coordination_id: Number(coordination.id),
        user_id: participantId,
        coordination_version: newVersion,
        application,
        submitted_at: dep('now')(),
        source: isActor ? 'agent_confirmed_patch' : 'version_snapshot',
        // 修改方 preference_version +1；对方仅做版本快照，不伪造其偏好版本
        preference_version: isActor
          ? Number(source.preference_version || source.coordination_version || oldVersion || 1) + 1
          : Number(source.preference_version || source.coordination_version || oldVersion || 1)
      }, 'date_coordination_application')
      nextApplications.set(participantId, application)
    }

    const hasBothApplications = nextApplications.has(Number(coordination.user_a_id))
      && nextApplications.has(Number(coordination.user_b_id))
    const stillInviting = coordination.status === STATUS.INVITING_PARTNER
    const nextCoordination = Object.assign({}, coordination, {
      coordination_version: newVersion,
      recoordination_count: Number(coordination.recoordination_count || 0) + 1
    })
    const queued = hasBothApplications && !stillInviting
      ? enqueueProcessing(nextCoordination, { version: newVersion, now: dep('now')() })
      : nextCoordination
    const update = {
      coordination_version: newVersion,
      recoordination_count: nextCoordination.recoordination_count,
      status: stillInviting
        ? STATUS.INVITING_PARTNER
        : (hasBothApplications ? queued.status : STATUS.COLLECTING_PREFERENCES),
      business_state: stillInviting
        ? 'waiting_partner'
        : (hasBothApplications ? queued.business_state : 'waiting_partner'),
      processing_status: stillInviting || !hasBothApplications ? '' : queued.processing_status,
      processing_version: stillInviting || !hasBothApplications ? 0 : queued.processing_version,
      processing_token: '',
      processing_attempts: 0,
      processing_started_at: null,
      processing_completed_at: null,
      processing_error_code: '',
      missing_dimensions: [],
      final_proposal_id: 0,
      confirmation_deadline_at: stillInviting ? coordination.confirmation_deadline_at || null : null,
      invitation_deadline_at: stillInviting ? coordination.invitation_deadline_at : coordination.invitation_deadline_at,
      last_changed_by_user_id: Number(user.id)
    }
    const updatedCoordination = await dep('updateByDoc')('date_coordination', coordination, update)
    const appliedPatch = await dep('updateByDoc')('date_application_patch', patch, {
      status: 'applied',
      applied_version: newVersion,
      applied_at: dep('now')()
    })
    const summary = shareableSummary(patch.preview)
    const notification = await notifyPartner(updatedCoordination, user, summary, false, newVersion)
    return {
      patch: publicPatch(appliedPatch),
      coordination_version: newVersion,
      status: updatedCoordination.status,
      business_state: updatedCoordination.business_state,
      proposal_generated: false,
      partner_notified: true,
      partner_session_id: notification.session_id
    }
  }

  async function cancelForUser(data, user) {
    const patch = await dep('byId')('date_application_patch', Number(data.patch_id || data.patchId || 0))
    if (!patch || Number(patch.user_id) !== Number(user && user.id)) throw new Error('无权取消该修改预览')
    if (patch.status === 'pending_confirmation') await dep('updateByDoc')('date_application_patch', patch, { status: 'cancelled' })
    return publicPatch(patch)
  }

  async function createPreview(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return createPreviewForUser(data, user)
  }

  async function createInitialPreview(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return createInitialPreviewForUser(data, user)
  }

  async function confirm(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return confirmForUser(data, user)
  }

  async function cancel(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return cancelForUser(data, user)
  }

  return {
    createPreview,
    createInitialPreview,
    confirm,
    cancel,
    createPreviewForUser,
    createInitialPreviewForUser,
    confirmForUser,
    cancelForUser
  }
}

const handlers = createDateApplicationPatchHandlers()

module.exports = {
  createPreview: handlers.createPreview,
  createInitialPreview: handlers.createInitialPreview,
  confirm: handlers.confirm,
  cancel: handlers.cancel,
  createDateApplicationPatchHandlers,
  claimPendingPatch
}
