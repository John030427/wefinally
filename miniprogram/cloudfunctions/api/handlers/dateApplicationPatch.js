const { normalizeApplication, STATUS } = require('../lib/dateCoordinationPolicy')
const { previewApplicationChange, shareableSummary, cleanChanges } = require('../lib/dateApplicationPatchPolicy')
const { publishCoordinationEvent } = require('../agent/dateCoordinationEvents')
const { canStartAnotherRound, enqueueProcessing } = require('../lib/dateCoordinationProcessingPolicy')
const {
  canModifyApplication,
  terminalWriteError,
  WRITE_BLOCKED_STATUSES
} = require('../lib/dateCoordinationAccessPolicy')
const {
  publicInvitationProposal,
  invitationProposalOf,
  invitationVersionOf,
  invitationPrimaryOf,
  resolvePrimaryInvitationProposal,
  resolvePrimaryAfterPreferenceChange,
  cleanPrimarySelection,
  derivePrimaryFromSingletonPrefs,
  primaryFitsPreference,
  primaryFitsPreferenceExceptPayment,
  syncPrimaryPaymentFromPreference,
  invitationAlreadyRespondedError,
  invitationExpiredError,
  primaryResolutionRequiredError,
  isExpiredInvitationRow,
  invitingPartnerDeadlinePassed,
  persistExpiredInvitationRecord,
  paymentFactText,
  evidenceFromChanges,
  mergeInvitationWithOverrides,
  allExplicitEvidence
} = require('../lib/invitationCoordination')

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
    commitPreAcceptInvitationPatch: db.commitPreAcceptInvitationPatch,
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
    if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name]
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
    if (name === 'commitPreAcceptInvitationPatch'
      && overrides.first && overrides.addWithId
      && !Object.prototype.hasOwnProperty.call(overrides, name)) {
      return null
    }
    if (name === 'beforeCommitHook' && overrides.first && overrides.addWithId) {
      return null
    }
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function memoryCommitPreAcceptInvitationPatch(input = {}) {
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
      patch,
      preferenceEvidence,
      acceptedBaseInvitationVersion,
      beforeCommitHook
    } = input
    const ts = dep('now')()
    const current = await dep('byId')('date_coordination', coordination.id)
    if (!current) throw new Error('日期协调不存在')
    if (isExpiredInvitationRow(current) || invitingPartnerDeadlinePassed(current, ts)) {
      return persistExpiredInvitationRecord(current, (data) => dep('updateByDoc')('date_coordination', current, data))
    }
    if (current.status !== STATUS.INVITING_PARTNER) throw invitationAlreadyRespondedError()
    if (Number(current.user_a_id) !== Number(actorUserId)) throw new Error('仅发起方可以在等待回应时修改邀请')
    if (current.invitation_responded_at) throw invitationAlreadyRespondedError()
    if (Number(current.coordination_version) !== Number(expectedCoordinationVersion)) {
      const err = new Error('约会条件已更新，请重新生成修改预览')
      err.code = 'STALE_COORDINATION_VERSION'
      throw err
    }
    if (invitationVersionOf(current) !== Number(expectedInvitationVersion)) {
      const err = new Error('对方刚刚更新了约会安排，请查看最新方案后再确认')
      err.code = 'STALE_INVITATION_VERSION'
      err.refresh_invitation = true
      throw err
    }
    if (typeof beforeCommitHook === 'function') await beforeCommitHook('pre_accept_patch')

    const refreshed = await dep('byId')('date_coordination', current.id)
    if (isExpiredInvitationRow(refreshed) || invitingPartnerDeadlinePassed(refreshed, ts)) {
      return persistExpiredInvitationRecord(refreshed || current, (data) => dep('updateByDoc')('date_coordination', refreshed || current, data))
    }
    if (!refreshed
      || refreshed.status !== STATUS.INVITING_PARTNER
      || refreshed.invitation_responded_at
      || Number(refreshed.coordination_version) !== Number(expectedCoordinationVersion)
      || invitationVersionOf(refreshed) !== Number(expectedInvitationVersion)) {
      throw refreshed && refreshed.status !== STATUS.INVITING_PARTNER
        ? invitationAlreadyRespondedError()
        : (() => {
          const err = new Error('对方刚刚更新了约会安排，请查看最新方案后再确认')
          err.code = 'STALE_INVITATION_VERSION'
          err.refresh_invitation = true
          return err
        })()
    }
    await dep('addWithId')('date_coordination_application', {
      coordination_id: Number(refreshed.id),
      user_id: Number(actorUserId),
      coordination_version: Number(nextCoordinationVersion),
      application: nextApplication,
      submitted_at: ts,
      source: 'agent_confirmed_patch',
      preference_version: Number(nextPreferenceVersion || nextInvitationVersion),
      preference_evidence: preferenceEvidence || null,
      accepted_base_invitation_version: Number(acceptedBaseInvitationVersion || 0)
    }, 'date_coordination_application')
    const updated = await dep('updateByDoc')('date_coordination', refreshed, {
      coordination_version: Number(nextCoordinationVersion),
      invitation_version: Number(nextInvitationVersion),
      initiator_agreed_invitation_version: Number(nextInvitationVersion),
      invitation_proposal: invitationProposal,
      invitation_primary_proposal: nextPrimaryProposal,
      status: STATUS.INVITING_PARTNER,
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
    const appliedPatch = await dep('updateByDoc')('date_application_patch', patch, {
      status: 'applied',
      applied_version: Number(nextCoordinationVersion),
      applied_at: ts
    })
    return { coordination: updated, patch: appliedPatch, idempotent: false }
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
    if (isExpiredInvitationRow(coordination)) throw invitationExpiredError()
    if (WRITE_BLOCKED_STATUSES.includes(coordination.status) || !canModifyApplication(coordination, user, { hasOwnApplication: true })) {
      throw new Error(terminalWriteError(coordination.status))
    }
    const version = Number(coordination.coordination_version || 1)
    const rows = await applicationsFor(coordination.id)
    const mine = latestForUser(rows, user.id, version)
    if (!mine || !mine.application) {
      const isInvitee = Number(user.id) === Number(coordination.user_b_id)
      if (isInvitee && (coordination.invitation_proposal || latestForUser(rows, coordination.user_a_id, version))) {
        return createInitialPreviewForUser(Object.assign({}, data, {
          changes: data.changes,
          application: data.changes
        }), user, session)
      }
      throw new Error('请先完成自己的约会偏好表单')
    }
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
    if (coordination.status === STATUS.INVITING_PARTNER && Number(user.id) === Number(coordination.user_a_id)) {
      const primaryContext = {
        user_a_id: coordination.user_a_id,
        user_b_id: coordination.user_b_id
      }
      const afterApp = normalizeApplication(Object.assign({}, mine.application, changes), dep('now')())
      let previous = invitationPrimaryOf(coordination, null, primaryContext)
      if (!previous || !previous.date) {
        previous = derivePrimaryFromSingletonPrefs(
          mine.application,
          coordination.user_a_id,
          coordination.user_b_id
        )
      }
      const selection = cleanPrimarySelection(data.primary_selection)
      const resolution = resolvePrimaryAfterPreferenceChange(previous, afterApp, primaryContext, selection)
      preview.source_changes = changes
      preview.primary_selection = selection
      preview.primary_before = previous || null
      if (resolution.required) {
        preview.primary_resolution_required = true
        preview.primary_resolution = { fields: resolution.fields }
        preview.resolution_prompt = resolution.prompt
        preview.invitation_primary_proposal = null
      } else {
        preview.primary_resolution_required = false
        preview.invitation_primary_proposal = resolution.primary
        preview.primary_after = resolution.primary
        if (previous && resolution.primary) {
          const payBefore = paymentFactText(previous, primaryContext)
          const payAfter = paymentFactText(resolution.primary, primaryContext)
          if (payBefore !== payAfter) {
            preview.primary_payment_changed = true
            preview.primary_payment_before = previous
            preview.primary_payment_after = resolution.primary
            preview.primary_payment_before_text = payBefore
            preview.primary_payment_after_text = payAfter
            if (!preview.changed_fields) preview.changed_fields = []
            if (!preview.changed_fields.includes('payment_preference')) {
              preview.changed_fields.push('payment_preference')
            }
          }
        }
      }
    }
    const now = dep('now')()
    const created = await dep('addWithId')('date_application_patch', {
      coordination_id: Number(coordination.id),
      session_id: Number(data.session_id || (session && session.id) || 0),
      user_id: Number(user.id),
      source_message_id: Number(data.source_message_id || 0),
      base_version: version,
      operation: 'modify',
      status: preview.primary_resolution_required ? 'pending_primary_selection' : 'pending_confirmation',
      changes,
      preview,
      primary_selection: preview.primary_selection || null,
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
    const initiatorApp = latestForUser(rows, coordination.user_a_id, version)
    const invitation = invitationProposalOf(coordination, initiatorApp)
    const rawInput = data.application || data.changes || {}
    const merged = invitation.areas.length
      ? mergeInvitationWithOverrides(invitation, rawInput)
      : rawInput
    const application = normalizeApplication(merged, dep('now')())
    const changed = Object.keys(rawInput || {}).filter((key) => (
      JSON.stringify(rawInput[key]) !== JSON.stringify(invitation[key])
    ))
    const evidence = invitation.areas.length ? evidenceFromChanges(changed) : allExplicitEvidence()
    const preview = {
      before: invitation.areas.length ? invitation : null,
      after: application,
      changed_fields: changed,
      preference_evidence: evidence,
      application_source: invitation.areas.length ? 'invitee_override' : 'invitee_full_form',
      accepted_base_invitation_version: Number(coordination.invitation_version || coordination.accepted_base_invitation_version || version),
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
    if (isExpiredInvitationRow(coordination)) throw invitationExpiredError()
    if (!canModifyApplication(coordination, user, { hasOwnApplication: true })) {
      throw new Error(terminalWriteError(coordination.status))
    }
    if (patch.status === 'applied') {
      return { patch: publicPatch(patch), coordination_version: Number(patch.applied_version || coordination.coordination_version) }
    }
    if (patch.status === 'applying') throw new Error('修改预览正在处理中，请稍后刷新')
    if (patch.status === 'pending_primary_selection' || (patch.preview && patch.preview.primary_resolution_required)) {
      throw primaryResolutionRequiredError(patch.preview && patch.preview.resolution_prompt)
    }
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
        coordination_id: Number(coordination.id),
        preference_evidence: patch.preview.preference_evidence || allExplicitEvidence(),
        application_source: patch.preview.application_source || 'invitee_override',
        accepted_base_invitation_version: patch.preview.accepted_base_invitation_version
          || coordination.accepted_base_invitation_version
          || coordination.invitation_version
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
    const stillInviting = coordination.status === STATUS.INVITING_PARTNER
      && Number(user.id) === Number(coordination.user_a_id)

    // INVITING_PARTNER patches must not supersede proposals/confirmations before CAS.
    // B Direct Accept may have just written those docs; tearing them would leave ARRANGED without cards.
    if (!stillInviting) {
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
    }

    if (stillInviting) {
      const source = latestForUser(rows, Number(user.id), oldVersion)
      const nextPreferenceVersion = Number(source && (source.preference_version || source.coordination_version) || oldVersion || 1) + 1
      const initiatorPreferenceVersion = nextPreferenceVersion
      const primaryContext = {
        user_a_id: coordination.user_a_id,
        user_b_id: coordination.user_b_id
      }
      const invitationProposal = publicInvitationProposal(nextApplication)
      const previous = invitationPrimaryOf(coordination, null, primaryContext)
        || derivePrimaryFromSingletonPrefs(
          source && source.application,
          coordination.user_a_id,
          coordination.user_b_id
        )
      const resolution = resolvePrimaryAfterPreferenceChange(
        previous,
        nextApplication,
        primaryContext,
        patch.primary_selection || (patch.preview && patch.preview.primary_selection)
      )
      if (resolution.required || !resolution.primary) {
        throw primaryResolutionRequiredError(resolution.prompt)
      }
      const nextPrimary = resolution.primary
      const commitFn = dep('commitPreAcceptInvitationPatch')
      const beforeCommitHook = dep('beforeCommitHook')
      const commitInput = {
        coordination,
        actorUserId: Number(user.id),
        expectedCoordinationVersion: oldVersion,
        expectedInvitationVersion: invitationVersionOf(coordination, source),
        nextCoordinationVersion: newVersion,
        nextInvitationVersion: initiatorPreferenceVersion,
        nextApplication,
        nextPreferenceVersion,
        nextPrimaryProposal: nextPrimary,
        invitationProposal,
        patchId: Number(patch.id),
        patchDocId: patch._id,
        patch,
        preferenceEvidence: source && source.preference_evidence || allExplicitEvidence(),
        acceptedBaseInvitationVersion: Number(source && source.accepted_base_invitation_version || coordination.accepted_base_invitation_version || 0),
        beforeCommitHook: typeof beforeCommitHook === 'function' ? beforeCommitHook : undefined
      }
      let committed
      try {
        if (typeof commitFn === 'function') {
          committed = await commitFn(commitInput)
        } else {
          committed = await memoryCommitPreAcceptInvitationPatch(commitInput)
        }
        if (committed && committed.expired) {
          if (!committed.idempotent) {
            try {
              const existing = await dep('first')('coordination_notification', {
                coordination_id: Number(committed.coordination.id),
                user_id: Number(committed.coordination.user_a_id),
                event_type: 'invitation_expired'
              })
              if (!existing) {
                await dep('writeInboxNotification')({
                  coordination: committed.coordination,
                  user_id: Number(committed.coordination.user_a_id),
                  event_type: 'invitation_expired',
                  coordination_version: Number(committed.coordination.coordination_version || 1),
                  title: '约会邀请已结束',
                  body: invitationExpiredError().message,
                  stage: 'expired'
                })
              }
            } catch (notifyErr) {
              console.warn('inbox invitation expired notification skipped:', notifyErr.message || notifyErr)
            }
          }
          throw invitationExpiredError()
        }
      } catch (err) {
        await dep('updateByDoc')('date_application_patch', patch, { status: 'pending_confirmation' })
        throw err
      }
      const summary = shareableSummary(patch.preview)
      const notification = await notifyPartner(committed.coordination, user, summary, false, newVersion)
      return {
        patch: publicPatch(committed.patch || patch),
        coordination_version: newVersion,
        status: committed.coordination.status,
        business_state: committed.coordination.business_state,
        proposal_generated: false,
        partner_notified: true,
        partner_session_id: notification.session_id
      }
    }

    const participants = [Number(coordination.user_a_id), Number(coordination.user_b_id)]
    const nextApplications = new Map()
    for (const participantId of participants) {
      const source = latestForUser(rows, participantId, oldVersion)
      if (!source || !source.application) continue
      const isActor = participantId === Number(user.id)
      const application = isActor ? nextApplication : source.application
      const preferenceVersion = isActor
        ? Number(source.preference_version || source.coordination_version || oldVersion || 1) + 1
        : Number(source.preference_version || source.coordination_version || oldVersion || 1)
      await dep('addWithId')('date_coordination_application', {
        coordination_id: Number(coordination.id),
        user_id: participantId,
        coordination_version: newVersion,
        application,
        submitted_at: dep('now')(),
        source: isActor ? 'agent_confirmed_patch' : 'version_snapshot',
        preference_version: preferenceVersion,
        preference_evidence: isActor
          ? (source.preference_evidence || allExplicitEvidence())
          : (source.preference_evidence || null),
        accepted_base_invitation_version: Number(source.accepted_base_invitation_version || coordination.accepted_base_invitation_version || 0)
      }, 'date_coordination_application')
      nextApplications.set(participantId, application)
    }

    const hasBothApplications = nextApplications.has(Number(coordination.user_a_id))
      && nextApplications.has(Number(coordination.user_b_id))
    const nextRecoordCount = Number(coordination.recoordination_count || 0) + 1
    const nextCoordination = Object.assign({}, coordination, {
      coordination_version: newVersion,
      recoordination_count: nextRecoordCount
    })
    const queued = hasBothApplications
      ? enqueueProcessing(nextCoordination, { version: newVersion, now: dep('now')() })
      : nextCoordination
    const update = {
      coordination_version: newVersion,
      recoordination_count: nextRecoordCount,
      status: hasBothApplications ? queued.status : STATUS.COLLECTING_PREFERENCES,
      business_state: hasBothApplications
        ? queued.business_state
        : (coordination.invitee_intent === 'coordinate' ? 'waiting_invitee_preference' : 'waiting_partner'),
      processing_status: !hasBothApplications ? '' : queued.processing_status,
      processing_version: !hasBothApplications ? 0 : queued.processing_version,
      processing_token: '',
      processing_attempts: 0,
      processing_started_at: null,
      processing_completed_at: null,
      processing_error_code: '',
      missing_dimensions: [],
      final_proposal_id: 0,
      confirmation_deadline_at: null,
      invitation_deadline_at: coordination.invitation_deadline_at,
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
    if (patch.status === 'pending_confirmation' || patch.status === 'pending_primary_selection') {
      await dep('updateByDoc')('date_application_patch', patch, { status: 'cancelled' })
    }
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
