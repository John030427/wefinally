const { STATUS, normalizeApplication, nextStatus } = require('../lib/dateCoordinationPolicy')
const { QA_REAL_DEVICE_MATCH_COHORT, QA_REGISTRATION_PUBLIC_FLAG } = require('../lib/qaRegistrationReplayPolicy')
const { isInternalQaAccount } = require('../lib/testIdentityPolicy')
const { businessError } = require('../lib/businessError')
const { dateError, RECOVERY } = require('../lib/dateCoordinationErrors')
const { MEMBER_STATUS, memberStatus } = require('../lib/memberPolicy')
const { createReminderJob } = require('../agent/notificationJobs')
const { assertOfflineDatingAllowed } = require('../lib/testFixturePolicy')
const { canScheduleFixtureDecline, scheduleFixtureDecline, publicJob, politeDeclineMessage } = require('../lib/fixtureResponseService')
const {
  canUseRealCoordinationWithFixture,
  resolveFixtureJourney,
  advanceSyntheticPartner,
  publicSafeDeclineMessage,
  syntheticPartnerPreferences,
  fixtureSceneBadge
} = require('../lib/syntheticPartnerJourney')
const { MAX_COORDINATION_ROUNDS, roundNumber, canStartAnotherRound, enqueueProcessing } = require('../lib/dateCoordinationProcessingPolicy')
const { publishCoordinationEvent, attachMemoryIdempotentCreates } = require('../agent/dateCoordinationEvents')
const {
  commitDateApplicationSubmission,
  projectDateSubmission,
  attachMemoryTransaction
} = require('../lib/dateApplicationSubmission')
const crypto = require('crypto')
const { publicState: publicMeetingState, applyMeetingCheckIn } = require('../lib/meetingCheckInService')
const {
  buildStructuredCounterProposal,
  applyAcceptedCounterProposal
} = require('../lib/dateCounterOfferPolicy')
const {
  ACTIVE_COORDINATION_STATUSES,
  canOpenCoordinatorChat,
  canRecoordinate,
  canWriteCoordinatorAction,
  isTerminalCoordination,
  terminalWriteError
} = require('../lib/dateCoordinationAccessPolicy')
const {
  STALE_INVITATION_MESSAGE,
  DECLINED_PUBLIC_MESSAGE,
  EXPIRED_PUBLIC_MESSAGE,
  COORDINATING_WAITING_B_MESSAGE,
  staleInvitationError,
  missingInvitationVersionError,
  invitationAlreadyRespondedError,
  invitationExpiredError,
  isExpiredInvitationRow,
  invitingPartnerDeadlinePassed,
  persistExpiredInvitationRecord,
  publicInvitationProposal,
  buildInvitationCard,
  invitationVersionOf,
  invitationProposalOf,
  invitationPrimaryOf,
  resolvePrimaryInvitationProposal,
  isPrimaryProposalComplete,
  isPrimaryProposalDraftComplete,
  allExplicitEvidence,
  buildSharedCoordinationState,
  buildProposalCard,
  buildDirectAcceptProposal,
  coordinatorWelcomeText,
  buildCoordinationViewModel
} = require('../lib/invitationCoordination')

async function upsertConfirmation(existing, data) {
  const db = require('../lib/db')
  if (existing) return db.updateByDoc('date_coordination_confirmation', existing, data)
  const docId = `date-confirmation-${data.coordination_id}-${data.user_id}-v${data.coordination_version}`
  const timestamp = db.now()
  const row = Object.assign({ _id: docId, create_time: timestamp, update_time: timestamp }, data)
  const writeData = Object.assign({}, row)
  delete writeData._id
  await db.col('date_coordination_confirmation').doc(docId).set({ data: writeData })
  return row
}

async function updateConfirmationState(coordination, result) {
  const db = require('../lib/db')
  const data = {
    status: result.coordination.status,
    business_state: result.coordination.status === STATUS.ARRANGED ? 'completed' : 'waiting_confirm',
    final_proposal_id: Number(result.coordination.final_proposal_id || 0)
  }
  if (result.coordination.status === STATUS.ARRANGED) {
    return db.updateByDoc('date_coordination', coordination, data)
  }
  const update = await db.col('date_coordination').where({
    _id: coordination._id,
    status: db._.neq(STATUS.ARRANGED)
  }).update({ data: Object.assign({}, data, { update_time: db.now() }) })
  if (!update.stats || !update.stats.updated) return db.byId('date_coordination', coordination.id)
  return Object.assign({}, coordination, data)
}

async function expireCoordinationIfCurrent(coordination) {
  const db = require('../lib/db')
  const update = await db.col('date_coordination').where({
    _id: coordination._id,
    status: coordination.status
  }).update({
    data: {
      status: STATUS.EXPIRED,
      business_state: 'expired',
      update_time: db.now()
    }
  })
  return Boolean(update.stats && update.stats.updated)
}

function defaultDeps() {
  const db = require('../lib/db')
  const { claimPendingPatch } = require('./dateApplicationPatch')
  return {
    env: process.env,
    currentUser: require('./user').currentUser,
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    acquireFixtureResponseJob: db.acquireFixtureResponseJob,
    upsertConfirmation,
    updateConfirmationState,
    commitConfirmation: db.commitCoordinationConfirmation,
    commitDirectInvitationAccept: db.commitDirectInvitationAccept,
    commitInvitationResponse: db.commitInvitationResponse,
    claimDateCoordinationDraft: db.claimDateCoordinationDraft,
    claimPendingPatch,
    commitPreAcceptInvitationPatch: db.commitPreAcceptInvitationPatch,
    commitPostAcceptApplicationPatch: db.commitPostAcceptApplicationPatch,
    expireIfCurrent: expireCoordinationIfCurrent,
    publishCoordinationEvent,
    flagEnabled: require('../lib/flags').flagEnabled,
    now: db.now,
    transaction: (work) => db.withCollection('date_submission_outbox', () => db.withCollection('date_coordination_application', () => db.withCollection('date_coordination', () => db.transaction(work)))),
    writeInboxNotification(input) {
      const { notifyInbox } = require('../lib/coordinationInbox')
      return notifyInbox(input)
    }
  }
}

async function qaResetAllowedFor(user, dep) {
  if (isInternalQaAccount(user)) return true
  if (String(user.qa_match_cohort || '') !== QA_REAL_DEVICE_MATCH_COHORT) return false
  if (typeof dep('flagEnabled') !== 'function') return false
  return Boolean(await dep('flagEnabled')(QA_REGISTRATION_PUBLIC_FLAG))
}

function pairKey(userAId, userBId) {
  return [Number(userAId), Number(userBId)].sort((a, b) => a - b).join(':')
}

function isEligible(user, now) {
  if (!user || memberStatus(user) !== MEMBER_STATUS.APPROVED) return false
  if (Number(user.free_member || 0) === 1) return true
  return Number(user.is_vip || 0) === 1
    && Boolean(user.vip_expire_time)
    && new Date(user.vip_expire_time).getTime() > new Date(now).getTime()
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000)
}

function coordinationId(data) {
  return Number(data.coordination_id || data.coordinationId || data.id || 0)
}

function participant(coordination, userId) {
  return [Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(userId))
}

function sharedChangedDimensions(input, evidence) {
  const allowed = new Set(['time', 'area', 'activity', 'budget', 'payment', 'duration'])
  const supplied = Array.isArray(input) ? input.map(String).filter((item) => allowed.has(item)) : []
  if (supplied.length) return [...new Set(supplied)]
  const fields = {
    availability: 'time', areas: 'area', activities: 'activity', budget: 'budget',
    payment_preference: 'payment', duration: 'duration'
  }
  return Object.keys(fields)
    .filter((field) => evidence && evidence[field] === 'explicit')
    .map((field) => fields[field])
}

function deadlinePassed(value, now) {
  return Boolean(value) && new Date(value).getTime() < new Date(now).getTime()
}

async function processCoordinationDeadlines({ deps = defaultDeps(), now = new Date(), limit = 50 } = {}) {
  const deadlineFields = {
    collecting_initiator: 'application_deadline_at',
    inviting_partner: 'invitation_deadline_at',
    collecting_preferences: 'application_deadline_at',
    waiting_confirmations: 'confirmation_deadline_at'
  }
  const boundedLimit = Math.max(1, Math.min(Number(limit || 50), 100))
  const perStatusLimit = Math.max(1, Math.ceil(boundedLimit / Object.keys(deadlineFields).length))
  const rows = []
  for (const status of Object.keys(deadlineFields)) {
    rows.push(...await deps.list('date_coordination', { status }, perStatusLimit))
  }
  let expired = 0
  for (const row of rows) {
    const field = deadlineFields[row.status]
    if (!field || !deadlinePassed(row[field], now)) continue
    const previousStatus = String(row.status || '')
    if (await deps.expireIfCurrent(row)) {
      expired += 1
      if (typeof deps.writeInboxNotification === 'function' && previousStatus === STATUS.INVITING_PARTNER) {
        try {
          await deps.writeInboxNotification({
            coordination: Object.assign({}, row, { status: STATUS.EXPIRED }),
            user_id: Number(row.user_a_id),
            event_type: 'invitation_expired',
            coordination_version: Number(row.coordination_version || 1),
            title: '约会邀请已结束',
            body: EXPIRED_PUBLIC_MESSAGE,
            stage: 'expired'
          })
        } catch (err) {
          console.warn('inbox invitation expired notification skipped:', err.message || err)
        }
      }
    }
  }
  return { scanned: rows.length, expired }
}

async function notifyInvitationExpiredOnce(dep, coordination) {
  if (!coordination || typeof dep !== 'function') return
  try {
    if (typeof dep('first') === 'function') {
      const existing = await dep('first')('coordination_notification', {
        coordination_id: Number(coordination.id),
        user_id: Number(coordination.user_a_id),
        event_type: 'invitation_expired'
      })
      if (existing) return
    }
    if (typeof dep('writeInboxNotification') !== 'function') return
    await dep('writeInboxNotification')({
      coordination,
      user_id: Number(coordination.user_a_id),
      event_type: 'invitation_expired',
      coordination_version: Number(coordination.coordination_version || 1),
      title: '约会邀请已结束',
      body: EXPIRED_PUBLIC_MESSAGE,
      stage: 'expired'
    })
  } catch (err) {
    console.warn('inbox invitation expired notification skipped:', err.message || err)
  }
}

async function expireInvitationFromCommit(dep, row) {
  return persistExpiredInvitationRecord(row, (data) => dep('updateByDoc')('date_coordination', row, data))
}

/**
 * In-memory / non-transaction CAS used by unit selfchecks.
 * Production path must use db.commitDirectInvitationAccept.
 */
async function memoryCommitDirectAccept(dep, input = {}) {
  const { coordination, user, submittedVersion, proposalData, now, beforeCommitHook } = input
  const current = await dep('byId')('date_coordination', coordination.id)
  if (!current) throw new Error('日期协调不存在')
  const proposalKey = String(proposalData.proposal_key)
  const version = Number(current.coordination_version || 1)
  const ts = now || new Date()

  if (current.status === STATUS.ARRANGED
    && Number(current.accepted_base_invitation_version) === Number(submittedVersion)
    && Number(current.final_proposal_id) > 0) {
    const existingProposal = await dep('byId')('date_coordination_proposal', current.final_proposal_id)
    if (existingProposal && String(existingProposal.proposal_key) === proposalKey) {
      return { coordination: current, proposal: existingProposal, arranged: true, idempotent: true }
    }
  }

  if (isExpiredInvitationRow(current) || invitingPartnerDeadlinePassed(current, ts)) {
    return expireInvitationFromCommit(dep, current)
  }
  if (current.status !== STATUS.INVITING_PARTNER) throw invitationAlreadyRespondedError()
  if (Number(current.user_b_id) !== Number(user.id)) throw new Error('仅受邀参与者可以处理邀请')
  if (current.invitation_responded_at) throw invitationAlreadyRespondedError()
  if (invitationVersionOf(current) !== Number(submittedVersion)) throw staleInvitationError()

  if (typeof beforeCommitHook === 'function') await beforeCommitHook('direct_accept')

  const afterHook = await dep('byId')('date_coordination', current.id)
  if (isExpiredInvitationRow(afterHook) || invitingPartnerDeadlinePassed(afterHook, ts)) {
    return expireInvitationFromCommit(dep, afterHook || current)
  }
  if (!afterHook
    || afterHook.status !== STATUS.INVITING_PARTNER
    || invitationVersionOf(afterHook) !== Number(submittedVersion)
    || afterHook.invitation_responded_at) {
    throw staleInvitationError()
  }

  let proposal = (await dep('list')('date_coordination_proposal', {
    coordination_id: Number(current.id),
    proposal_key: proposalKey
  }, 5))[0]
  if (!proposal) {
    proposal = await dep('addWithId')('date_coordination_proposal', Object.assign({
      coordination_id: Number(current.id)
    }, proposalData), 'date_coordination_proposal')
  }

  const aQuery = {
    coordination_id: Number(current.id),
    user_id: Number(current.user_a_id),
    coordination_version: version
  }
  const bQuery = {
    coordination_id: Number(current.id),
    user_id: Number(user.id),
    coordination_version: version
  }
  const existingA = await dep('first')('date_coordination_confirmation', aQuery)
  const existingB = await dep('first')('date_coordination_confirmation', bQuery)
  const aConfirm = Object.assign({}, aQuery, {
    proposal_id: Number(proposal.id),
    decision: 'confirm',
    status: 'active',
    source: 'initiator_invitation'
  })
  const bConfirm = Object.assign({}, bQuery, {
    proposal_id: Number(proposal.id),
    decision: 'confirm',
    status: 'active',
    source: 'direct_accept'
  })
  if (existingA) await dep('updateByDoc')('date_coordination_confirmation', existingA, aConfirm)
  else await dep('addWithId')('date_coordination_confirmation', aConfirm, 'date_coordination_confirmation')
  if (existingB) await dep('updateByDoc')('date_coordination_confirmation', existingB, bConfirm)
  else await dep('addWithId')('date_coordination_confirmation', bConfirm, 'date_coordination_confirmation')

  const updated = await dep('updateByDoc')('date_coordination', afterHook, {
    status: nextStatus(STATUS.INVITING_PARTNER, 'accept_invitation'),
    business_state: 'completed',
    invitation_responded_at: ts,
    invitee_intent: 'accept',
    accepted_base_invitation_version: submittedVersion,
    final_proposal_id: Number(proposal.id)
  })
  return { coordination: updated, proposal, arranged: true, idempotent: false }
}

async function memoryCommitInvitationResponse(dep, input = {}) {
  const {
    coordination,
    user,
    submittedVersion,
    decision,
    now,
    beforeCommitHook,
    applicationDeadlineAt
  } = input
  const current = await dep('byId')('date_coordination', coordination.id)
  if (!current) throw new Error('日期协调不存在')
  const ts = now || new Date()

  if (decision === 'coordinate'
    && current.status === STATUS.COLLECTING_PREFERENCES
    && String(current.invitee_intent || '') === 'coordinate'
    && Number(current.accepted_base_invitation_version) === Number(submittedVersion)) {
    return { coordination: current, decision, idempotent: true }
  }
  if (decision === 'decline'
    && current.status === STATUS.INVITATION_DECLINED
    && String(current.invitee_intent || '') === 'decline'
    && Number(current.accepted_base_invitation_version || current.invitation_version) === Number(submittedVersion)) {
    return { coordination: current, decision, idempotent: true }
  }

  if (isExpiredInvitationRow(current) || invitingPartnerDeadlinePassed(current, ts)) {
    return expireInvitationFromCommit(dep, current)
  }
  if (current.status !== STATUS.INVITING_PARTNER) throw invitationAlreadyRespondedError()
  if (Number(current.user_b_id) !== Number(user.id)) throw new Error('仅受邀参与者可以处理邀请')
  if (current.invitation_responded_at) throw invitationAlreadyRespondedError()
  if (invitationVersionOf(current) !== Number(submittedVersion)) throw staleInvitationError()

  if (typeof beforeCommitHook === 'function') await beforeCommitHook(`invitation_${decision}`)

  const refreshed = await dep('byId')('date_coordination', current.id)
  if (isExpiredInvitationRow(refreshed) || invitingPartnerDeadlinePassed(refreshed, ts)) {
    return expireInvitationFromCommit(dep, refreshed || current)
  }
  if (!refreshed
    || refreshed.status !== STATUS.INVITING_PARTNER
    || invitationVersionOf(refreshed) !== Number(submittedVersion)
    || refreshed.invitation_responded_at) {
    throw staleInvitationError()
  }

  const update = {
    status: nextStatus(STATUS.INVITING_PARTNER, decision === 'coordinate' ? 'coordinate_invitation' : 'decline_invitation'),
    business_state: decision === 'coordinate' ? 'waiting_invitee_preference' : 'cancelled',
    invitation_responded_at: ts,
    invitee_intent: decision,
    accepted_base_invitation_version: submittedVersion
  }
  if (decision === 'coordinate') update.application_deadline_at = applicationDeadlineAt
  const updated = await dep('updateByDoc')('date_coordination', refreshed, update)
  return { coordination: updated, decision, idempotent: false }
}

function createDateCoordinationHandlers(overrides = {}) {
  let defaults = null
  const unitMode = overrides.unitMode === true
  function dep(name) {
    if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name]
    if (name === 'env' && unitMode) return process.env
    if (name === 'publishCoordinationEvent' && unitMode) {
      return (input) => publishCoordinationEvent(input, attachMemoryIdempotentCreates({
        first: overrides.first,
        list: overrides.list,
        addWithId: overrides.addWithId,
        now: overrides.now
      }))
    }
    if (name === 'transaction' && unitMode
      && !Object.prototype.hasOwnProperty.call(overrides, 'transaction')) {
      attachMemoryTransaction(overrides)
      return overrides.transaction
    }
    if (name === 'writeInboxNotification' && !overrides.writeInboxNotification && unitMode) {
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
    // Unit selfchecks must opt in with unitMode: true; production never gets memory claim/null commits
    if (['commitDirectInvitationAccept', 'commitInvitationResponse', 'claimDateCoordinationDraft', 'commitPreAcceptInvitationPatch', 'commitPostAcceptApplicationPatch'].includes(name)
      && unitMode
      && !Object.prototype.hasOwnProperty.call(overrides, name)) {
      return null
    }
    if (name === 'beforeCommitHook' && unitMode) {
      return null
    }
    if (name === 'flagEnabled' && unitMode
      && !Object.prototype.hasOwnProperty.call(overrides, name)) {
      return async () => false
    }
    if (name === 'claimPendingPatch' && unitMode
      && !Object.prototype.hasOwnProperty.call(overrides, name)) {
      return async (patch) => {
        if (!patch || patch.status !== 'pending_confirmation') return false
        Object.assign(patch, { status: 'applying' })
        return true
      }
    }
    if (['expireIfCurrent', 'upsertConfirmation', 'updateConfirmationState', 'commitConfirmation', 'acquireFixtureResponseJob'].includes(name)
      && unitMode
      && !Object.prototype.hasOwnProperty.call(overrides, name)) {
      return null
    }
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function create(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const matchLogId = Number(data.match_log_id || data.matchLogId || 0)
    let match = matchLogId ? await dep('byId')('user_match_log', matchLogId) : null
    if (matchLogId && (!match || Number(match.user_id) !== Number(user.id))) {
      throw new Error('仅可从自己的匹配记录发起约会协调')
    }
    const partnerId = Number((match && match.match_user_id) || data.match_user_id || data.matchUserId || 0)
    if (!partnerId || partnerId === Number(user.id)) throw new Error('请选择有效的匹配对象')
    const now = dep('now')()
    if (!isEligible(user, now)) throw new Error('需审核通过且为有效 VIP 才能发起日期协调')

    const key = pairKey(user.id, partnerId)
    const existingRows = await dep('list')('date_coordination', { pair_key: key }, 50)
    let activeExisting = (existingRows || []).find((row) => ACTIVE_COORDINATION_STATUSES.includes(row.status))
    if (activeExisting) {
      if (activeExisting.status === STATUS.COLLECTING_INITIATOR
        && Number(activeExisting.user_b_id) === Number(user.id)) {
        const applications = await dep('list')('date_coordination_application', {
          coordination_id: Number(activeExisting.id)
        }, 1)
        if (!applications.length) {
          const claim = dep('claimDateCoordinationDraft')
          activeExisting = claim
            ? await claim({ coordination: activeExisting, claimantUserId: Number(user.id) }, now)
            : await dep('updateByDoc')('date_coordination', activeExisting, {
              user_a_id: Number(user.id),
              user_b_id: Number(activeExisting.user_a_id),
              application_deadline_at: addHours(now, 72)
            })
        }
      }
      return detailFor(activeExisting, user)
    }

    if (!match) match = await dep('first')('user_match_log', {
      user_id: Number(user.id),
      match_user_id: partnerId
    })
    if (!match) throw new Error('仅可与当前匹配对象发起日期协调')
    const partner = await dep('byId')('user', partnerId)
    if (!isEligible(partner, now)) throw new Error('匹配对象暂不满足日期协调条件')

    // REAL UI path for synthetic partners with accept/reject/full journeys.
    // Legacy polite_decline queue only when fixture_journey=legacy_queue.
    const useRealFixtureJourney = canUseRealCoordinationWithFixture(user, partner, now)
    if (!useRealFixtureJourney && canScheduleFixtureDecline(user, partner, now, { allowMatchedPublicFixture: true })) {
      const responseJob = await dep('first')('fixture_response_job', {
        interaction_id: `match:${match.id}`
      })
      if (responseJob
        && Number(responseJob.actor_user_id) === Number(user.id)
        && Number(responseJob.fixture_user_id) === partnerId) {
        return {
          test_simulation: true,
          fixture_response_job: publicJob(responseJob),
          response_message: responseJob.status === 'delivered' ? politeDeclineMessage() : '',
          test_data_badge: '测试数据'
        }
      }
      return {
        test_simulation: true,
        await_application: true,
        match_log_id: Number(match.id),
        match_user_id: partnerId,
        test_data_badge: '测试数据'
      }
    }
    if (!useRealFixtureJourney) {
      assertOfflineDatingAllowed(partner)
    }

    const journey = useRealFixtureJourney ? resolveFixtureJourney(partner) : ''
    const created = await dep('addWithId')('date_coordination', {
      pair_key: key,
      user_a_id: Number(user.id),
      user_b_id: partnerId,
      status: STATUS.COLLECTING_INITIATOR,
      business_state: 'created',
      coordination_version: 1,
      recoordination_count: 0,
      invitation_deadline_at: null,
      application_deadline_at: addHours(now, 72),
      confirmation_deadline_at: null,
      final_proposal_id: 0,
      synthetic_partner_journey: journey || '',
      synthetic_partner_mode: useRealFixtureJourney ? (String(partner.fixture_mode || 'auto').toLowerCase() === 'manual_step' ? 'manual_step' : 'auto') : '',
      ab_test_run_id: useRealFixtureJourney ? String(partner.ab_test_run_id || partner.fixture_run_id || '') : '',
      is_test_data: useRealFixtureJourney ? 1 : 0
    }, 'date_coordination')
    return detailFor(created, user)
  }

  async function submitFixtureApplication(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const matchLogId = Number(data.match_log_id || data.matchLogId || 0)
    const partnerId = Number(data.match_user_id || data.matchUserId || 0)
    const match = matchLogId ? await dep('byId')('user_match_log', matchLogId) : null
    if (!match || Number(match.user_id) !== Number(user.id) || Number(match.match_user_id) !== partnerId) {
      throw new Error('仅可从自己的匹配记录提交约会申请')
    }
    const partner = await dep('byId')('user', partnerId)
    if (!canScheduleFixtureDecline(user, partner, dep('now')(), { allowMatchedPublicFixture: true })) {
      const error = new Error('当前对象暂时不能提交约会申请')
      error.code = 403
      throw error
    }
    const application = normalizeApplication(data.application || data, dep('now')())
    const job = await scheduleFixtureDecline({
      actor: user,
      target: partner,
      interaction_id: `match:${match.id}`,
      allow_matched_public_fixture: true
    }, {
      acquireJob: (jobData) => dep('acquireFixtureResponseJob')(Object.assign({}, jobData, {
        application_snapshot: {
          areas: application.areas,
          activities: application.activities,
          budget: application.budget
        }
      })),
      now: () => dep('now')()
    })
    return {
      test_simulation: true,
      fixture_response_job: publicJob(job),
      test_data_badge: '测试数据'
    }
  }

  async function fixtureResponse(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const job = await dep('byId')('fixture_response_job', Number(data.id || data.job_id || 0))
    if (!job || Number(job.actor_user_id) !== Number(user.id)) throw new Error('测试回复任务不存在')
    return {
      test_simulation: true,
      fixture_response_job: publicJob(job),
      response_message: job.status === 'delivered' ? politeDeclineMessage() : ''
    }
  }

  async function throwIfExpiredCommit(committed) {
    if (committed && committed.expired) {
      if (!committed.idempotent) await notifyInvitationExpiredOnce(dep, committed.coordination)
      throw invitationExpiredError()
    }
    return committed
  }

  async function respondInvitation(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return respondInvitationForUser(data, user)
  }

  async function respondInvitationForUser(data, user) {
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (Number(coordination.user_b_id) !== Number(user.id)) throw new Error('仅受邀参与者可以处理邀请')
    if (isExpiredInvitationRow(coordination)
      || invitingPartnerDeadlinePassed(coordination, dep('now')())) {
      if (String(coordination.status) === STATUS.INVITING_PARTNER) {
        const expired = await persistExpiredInvitationRecord(
          coordination,
          (data) => dep('updateByDoc')('date_coordination', coordination, data)
        )
        if (!expired.idempotent) await notifyInvitationExpiredOnce(dep, expired.coordination)
      }
      throw invitationExpiredError()
    }
    const decision = String(data.decision || '')
    if (!['accept', 'coordinate', 'decline'].includes(decision)) {
      throw new Error('请选择接受完整方案、只调整部分安排，或这次暂不方便')
    }
    const now = dep('now')()
    const version = Number(coordination.coordination_version || 1)
    const applications = await dep('list')('date_coordination_application', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    const initiatorApp = (applications || []).find((item) => Number(item.user_id) === Number(coordination.user_a_id))
      || await latestInitiatorApplication(coordination)
    const currentInvitationVersion = invitationVersionOf(coordination, initiatorApp)
    const invitationProposal = invitationProposalOf(coordination, initiatorApp)

    if (decision === 'accept') {
      if (data.invitation_version == null || data.invitation_version === '') {
        throw missingInvitationVersionError()
      }
      const submittedVersion = Number(data.invitation_version)
      if (!Number.isFinite(submittedVersion) || submittedVersion <= 0) {
        throw missingInvitationVersionError()
      }
      if (submittedVersion !== currentInvitationVersion) {
        throw staleInvitationError()
      }
      const primary = invitationPrimaryOf(coordination, initiatorApp, {
        user_a_id: coordination.user_a_id,
        user_b_id: coordination.user_b_id
      })
      if (!isPrimaryProposalComplete(primary)) {
        if (isPrimaryProposalDraftComplete(primary)) {
          throw businessError('DATE_VENUE_NEEDS_CLARIFICATION', '请先确认这里是会合地点还是活动场地，可与 AI 继续协调')
        }
        const err = new Error('当前建议安排不完整，请先和 AI 协调其他安排，或等待发起方更新方案')
        err.code = 'PRIMARY_PROPOSAL_INCOMPLETE'
        throw err
      }
      const proposalData = buildDirectAcceptProposal(primary, version, {
        coordination_id: Number(coordination.id),
        invitation_version: submittedVersion,
        user_a_id: coordination.user_a_id,
        user_b_id: coordination.user_b_id
      })
      const commitFn = dep('commitDirectInvitationAccept')
      const beforeCommitHook = dep('beforeCommitHook')
      let committed
      if (typeof commitFn === 'function') {
        committed = await commitFn({
          coordination,
          inviteeUserId: Number(user.id),
          invitationVersion: submittedVersion,
          proposalData,
          nextStatusValue: nextStatus(STATUS.INVITING_PARTNER, 'accept_invitation'),
          invitationRespondedAt: now,
          beforeCommitHook: typeof beforeCommitHook === 'function' ? beforeCommitHook : undefined
        })
      } else {
        committed = await memoryCommitDirectAccept(dep, {
          coordination,
          user,
          submittedVersion,
          proposalData,
          now,
          beforeCommitHook: typeof beforeCommitHook === 'function' ? beforeCommitHook : undefined
        })
      }
      await throwIfExpiredCommit(committed)
      const updated = committed.coordination
      if (!committed.idempotent) {
        await dep('publishCoordinationEvent')({
          coordination: updated,
          event: {
            event_type: 'arranged',
            actor_user_id: Number(user.id),
            coordination_version: version,
            proposal: committed.proposal
          }
        })
        try {
          await dep('writeInboxNotification')({
            coordination: updated,
            user_id: Number(updated.user_a_id),
            event_type: 'arranged',
            coordination_version: version,
            title: '双方已确认最终方案',
            body: '对方接受了你的第一次约会安排，双方已确认最终方案。',
            stage: 'arranged'
          })
        } catch (err) {
          console.warn('inbox direct-accept notification skipped:', err.message || err)
        }
      }
      return detailFor(updated, user)
    }

    if (data.invitation_version == null || data.invitation_version === '') {
      throw missingInvitationVersionError()
    }
    const submittedVersion = Number(data.invitation_version)
    if (!Number.isFinite(submittedVersion) || submittedVersion <= 0) {
      throw missingInvitationVersionError()
    }
    if (submittedVersion !== currentInvitationVersion) {
      throw staleInvitationError()
    }

    const responseCommit = dep('commitInvitationResponse')
    const beforeCommitHook = dep('beforeCommitHook')
    const responseInput = {
      coordination,
      inviteeUserId: Number(user.id),
      invitationVersion: submittedVersion,
      decision,
      invitationRespondedAt: now,
      beforeCommitHook: typeof beforeCommitHook === 'function' ? beforeCommitHook : undefined
    }

    if (decision === 'coordinate') {
      responseInput.nextStatusValue = nextStatus(STATUS.INVITING_PARTNER, 'coordinate_invitation')
      responseInput.businessState = 'waiting_invitee_preference'
      responseInput.applicationDeadlineAt = addHours(now, 72)
      let committed
      if (typeof responseCommit === 'function') {
        committed = await responseCommit(responseInput)
      } else {
        committed = await memoryCommitInvitationResponse(dep, {
          coordination,
          user,
          submittedVersion,
          decision: 'coordinate',
          now,
          applicationDeadlineAt: responseInput.applicationDeadlineAt,
          beforeCommitHook: responseInput.beforeCommitHook
        })
      }
      await throwIfExpiredCommit(committed)
      const updated = committed.coordination
      if (!committed.idempotent) {
        await dep('publishCoordinationEvent')({
          coordination: updated,
          event: {
            event_type: 'invitation_accepted',
            actor_user_id: Number(user.id),
            coordination_version: version
          }
        })
        try {
          await dep('writeInboxNotification')({
            coordination: updated,
            user_id: Number(updated.user_a_id),
            event_type: 'invitation_accepted',
            coordination_version: version,
            title: '对方已接受约会邀请',
            body: COORDINATING_WAITING_B_MESSAGE,
            stage: 'invitation_accepted'
          })
        } catch (err) {
          console.warn('inbox coordinate notification skipped:', err.message || err)
        }
      }
      return detailFor(updated, user)
    }

    responseInput.nextStatusValue = nextStatus(STATUS.INVITING_PARTNER, 'decline_invitation')
    responseInput.businessState = 'cancelled'
    let declined
    if (typeof responseCommit === 'function') {
      declined = await responseCommit(responseInput)
    } else {
      declined = await memoryCommitInvitationResponse(dep, {
        coordination,
        user,
        submittedVersion,
        decision: 'decline',
        now,
        beforeCommitHook: responseInput.beforeCommitHook
      })
    }
    await throwIfExpiredCommit(declined)
    const updated = declined.coordination
    if (!declined.idempotent) {
      await dep('publishCoordinationEvent')({
        coordination: updated,
        event: {
          event_type: 'invitation_declined',
          actor_user_id: Number(user.id),
          coordination_version: version
        }
      })
      try {
        await dep('writeInboxNotification')({
          coordination: updated,
          user_id: Number(updated.user_a_id),
          event_type: 'invitation_declined',
          coordination_version: version,
          title: '约会邀请状态更新',
          body: publicSafeDeclineMessage(),
          stage: 'invitation_declined'
        })
      } catch (err) {
        console.warn('inbox invitation decline notification skipped:', err.message || err)
      }
    }
    return detailFor(updated, user)
  }

  async function latestInitiatorApplication(coordination) {
    const rows = await dep('list')('date_coordination_application', {
      coordination_id: Number(coordination.id)
    }, 50)
    return (rows || [])
      .filter((row) => Number(row.user_id) === Number(coordination.user_a_id))
      .sort((a, b) => Number(b.coordination_version || 0) - Number(a.coordination_version || 0))[0] || null
  }

  function patchHelpers() {
    const { createDateApplicationPatchHandlers } = require('./dateApplicationPatch')
    const patchDeps = {
      first: dep('first'),
      list: dep('list'),
      byId: dep('byId'),
      addWithId: dep('addWithId'),
      updateByDoc: dep('updateByDoc'),
      now: dep('now'),
      publishCoordinationEvent: (input) => dep('publishCoordinationEvent')(input),
      writeInboxNotification: (input) => dep('writeInboxNotification')(input),
      saveApplicationForUser: (data, user) => saveApplicationForUser(data, user)
    }
    if (unitMode) patchDeps.unitMode = true
    const claimPendingPatchDep = dep('claimPendingPatch')
    if (typeof claimPendingPatchDep === 'function') {
      patchDeps.claimPendingPatch = claimPendingPatchDep
    } else {
      patchDeps.claimPendingPatch = async (patch) => {
        const current = await dep('byId')('date_application_patch', Number(patch.id))
        if (!current || current.status !== 'pending_confirmation') return false
        await dep('updateByDoc')('date_application_patch', current, { status: 'applying' })
        return true
      }
    }
    const commitPreAcceptInvitationPatchDep = dep('commitPreAcceptInvitationPatch')
    const commitPostAcceptApplicationPatchDep = dep('commitPostAcceptApplicationPatch')
    if (typeof commitPreAcceptInvitationPatchDep === 'function') {
      patchDeps.commitPreAcceptInvitationPatch = commitPreAcceptInvitationPatchDep
    }
    if (typeof commitPostAcceptApplicationPatchDep === 'function') {
      patchDeps.commitPostAcceptApplicationPatch = commitPostAcceptApplicationPatchDep
    }
    return createDateApplicationPatchHandlers(patchDeps)
  }

  async function maybeAdvanceSyntheticPartner(coordination, options = {}) {
    if (!coordination || !Number(coordination.is_test_data || 0)) return null
    const partner = await dep('byId')('user', Number(coordination.user_b_id))
    if (!partner) return null
    const journey = String(coordination.synthetic_partner_journey || resolveFixtureJourney(partner) || '')
    if (!journey || journey === 'legacy_queue') return null
    const mode = String(coordination.synthetic_partner_mode || partner.fixture_mode || 'auto').toLowerCase()
    if (mode === 'manual_step' && options.force !== true) {
      return { advanced: false, reason: 'manual_step', journey, mode }
    }
    try {
      const patches = patchHelpers()
      const result = await advanceSyntheticPartner({
        coordination,
        partner: Object.assign({}, partner, { fixture_journey: journey })
      }, {
        first: dep('first'),
        list: dep('list'),
        now: () => dep('now')(),
        respondInvitation: (data) => respondInvitationForUser(data, partner),
        saveApplicationForUser: (data, user) => saveApplicationForUser(data, user),
        confirmProposalForUser: (data, user) => confirmProposalForUser(data, user),
        createPreviewForUser: (data, user) => patches.createPreviewForUser(data, user),
        confirmForUser: (data, user) => patches.confirmForUser(data, user)
      })
      if (result && result.advanced && result.step === 'coordinate_invitation') {
        const canonical = resolveFixtureJourney({ fixture_journey: journey })
        const nextCoordination = await dep('byId')('date_coordination', Number(coordination.id))
        if (nextCoordination && String(nextCoordination.status) === STATUS.COLLECTING_PREFERENCES
          && canonical === 'coordinate') {
          const prefs = syntheticPartnerPreferences('coordinate', dep('now')())
          if (prefs) {
            await saveApplicationForUser(Object.assign({ coordination_id: coordination.id }, prefs), partner)
            return { advanced: true, step: 'coordinate_and_submit_prefs', journey: canonical }
          }
        }
      }
      return result
    } catch (err) {
      console.warn('synthetic partner advance skipped:', err.message || err)
      return { advanced: false, error: err.message || String(err) }
    }
  }

  async function saveApplication(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return saveApplicationForUser(data, user)
  }

  async function saveApplicationForUser(data, user) {
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw dateError('CURRENT_STATE_INVALID', '日期协调不存在', RECOVERY.REFRESH)
    if (!participant(coordination, user.id)) throw dateError('FORBIDDEN', '无权操作该日期协调', RECOVERY.REFRESH)
    const isInitiatorDraft = coordination.status === STATUS.COLLECTING_INITIATOR
    if (isInitiatorDraft && Number(coordination.user_a_id) !== Number(user.id)) {
      throw dateError('WAITING_PARTNER', '请等待发起方填写约会偏好并发出邀请', RECOVERY.WAIT_PARTNER)
    }
    if (![STATUS.COLLECTING_INITIATOR, STATUS.COLLECTING_PREFERENCES].includes(coordination.status)) {
      throw dateError('CURRENT_STATE_INVALID', '当前状态不能提交日期申请', RECOVERY.REFRESH)
    }
    const now = dep('now')()
    if (deadlinePassed(coordination.application_deadline_at, now)) {
      await dep('expireIfCurrent')(coordination)
      throw businessError('COORDINATION_FINALIZED', '本次约会协调已结束')
    }
    const version = Number(coordination.coordination_version || 1)
    const expectedVersion = Number(data.expected_coordination_version || data.expected_version || version)
    const evidence = data.preference_evidence && typeof data.preference_evidence === 'object'
      ? data.preference_evidence
      : allExplicitEvidence()
    const changedDimensions = sharedChangedDimensions(data.changed_dimensions, evidence)
    let application
    try {
      application = normalizeApplication(data, now)
    } catch (error) {
      error.code = 400
      error.publicCode = 'DATE_APPLICATION_INVALID'
      error.publicMessage = String(error.message || '约会安排格式有误，请检查后重试').slice(0, 80)
      throw error
    }
    const primaryContext = {
      user_a_id: Number(coordination.user_a_id),
      user_b_id: Number(coordination.user_b_id)
    }
    let invitationPrimary = null
    if (isInitiatorDraft) {
      invitationPrimary = resolvePrimaryInvitationProposal(data, application, primaryContext)
    }
    const applicationSource = String(data.application_source || (isInitiatorDraft ? 'initiator_invitation' : 'invitee_full_form'))
    const acceptedBaseVersion = Number(data.accepted_base_invitation_version || coordination.accepted_base_invitation_version || 0)
    const explicitRequestId = String(data.request_id || '').trim().slice(0, 80)
    const requestId = explicitRequestId || `legacy:${crypto.createHash('sha256').update(JSON.stringify({
      coordination_id: Number(coordination.id),
      user_id: Number(user.id),
      version,
      application
    })).digest('hex').slice(0, 24)}`

    const committed = await commitDateApplicationSubmission({
      coordination_id: Number(coordination.id),
      actor_user_id: Number(user.id),
      expected_version: expectedVersion,
      request_id: requestId,
      application,
      preference_evidence: evidence,
      application_source: applicationSource,
      accepted_base_invitation_version: acceptedBaseVersion,
      invitation_primary_proposal: invitationPrimary,
      changed_dimensions: changedDimensions
    }, {
      first: dep('first'),
      list: dep('list'),
      byId: dep('byId'),
      addWithId: dep('addWithId'),
      updateByDoc: dep('updateByDoc'),
      now: dep('now'),
      transaction: dep('transaction'),
      publishCoordinationEvent: dep('publishCoordinationEvent'),
      writeInboxNotification: dep('writeInboxNotification')
    })

    const projected = await projectDateSubmission(committed.outbox, {
      first: dep('first'),
      byId: dep('byId'),
      addWithId: dep('addWithId'),
      updateByDoc: dep('updateByDoc'),
      now: dep('now'),
      publishCoordinationEvent: dep('publishCoordinationEvent'),
      writeInboxNotification: dep('writeInboxNotification')
    })

    let latest = committed.coordination
    if (isInitiatorDraft) {
      await maybeAdvanceSyntheticPartner(latest)
      latest = await dep('byId')('date_coordination', Number(latest.id)) || latest
    }
    const detail = await detailFor(latest, user)
    return Object.assign({}, detail, {
      saved: true,
      notification_status: projected.projected ? 'projected' : 'pending',
      request_id: requestId,
      idempotent: Boolean(committed.idempotent)
    })
  }

  async function detailFor(coordination, user) {
    if (!coordination || !participant(coordination, user.id)) throw new Error('无权查看该日期协调')
    const version = Number(coordination.coordination_version || 1)
    const applications = await dep('list')('date_coordination_application', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    if (coordination.status === STATUS.INVITING_PARTNER
      && !coordination.invitation_responded_at
      && applications.length === 0
      && !coordination.invitation_proposal) {
      coordination = await dep('updateByDoc')('date_coordination', coordination, {
        status: STATUS.COLLECTING_INITIATOR,
        business_state: 'created',
        invitation_deadline_at: null,
        application_deadline_at: addHours(dep('now')(), 72)
      })
    }
    const confirmations = await dep('list')('date_coordination_confirmation', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    const proposals = await dep('list')('date_coordination_proposal', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    const applicationUsers = new Set(applications.map((item) => Number(item.user_id)))
    const confirmedUsers = new Set(confirmations
      .filter((item) => item.decision === 'confirm')
      .map((item) => Number(item.user_id)))
    const mine = applications.find((item) => Number(item.user_id) === Number(user.id))
    const initiatorApp = applications.find((item) => Number(item.user_id) === Number(coordination.user_a_id))
      || await latestInitiatorApplication(coordination)
    const inviteeApp = applications.find((item) => Number(item.user_id) === Number(coordination.user_b_id))
    const role = Number(coordination.user_a_id) === Number(user.id) ? 'initiator' : 'invitee'
    const mineConfirmed = confirmedUsers.has(Number(user.id))
    const invitationVersion = invitationVersionOf(coordination, initiatorApp)
    const invitationProposal = invitationProposalOf(coordination, initiatorApp)
    const invitationPrimary = invitationPrimaryOf(coordination, initiatorApp, {
      user_a_id: coordination.user_a_id,
      user_b_id: coordination.user_b_id
    })
    const invitationCard = initiatorApp || coordination.invitation_proposal || coordination.invitation_primary_proposal
      ? buildInvitationCard(invitationPrimary || invitationProposal, invitationVersion, {
        primary: invitationPrimary,
        preference: invitationProposal,
        user_a_id: coordination.user_a_id,
        user_b_id: coordination.user_b_id
      })
      : null
    const partnerId = role === 'initiator' ? Number(coordination.user_b_id) : Number(coordination.user_a_id)
    const partnerApplicationSubmitted = applicationUsers.has(partnerId)
    const sharedCoordination = buildSharedCoordinationState(
      initiatorApp && initiatorApp.application,
      inviteeApp && inviteeApp.application,
      {
        version,
        inviteeIntent: coordination.invitee_intent || '',
        user_a_id: coordination.user_a_id,
        user_b_id: coordination.user_b_id
      }
    )
    const counterOfferCard = buildStructuredCounterProposal({
      coordination,
      applicationA: initiatorApp && initiatorApp.application,
      applicationB: inviteeApp && inviteeApp.application,
      applicationRowA: initiatorApp,
      applicationRowB: inviteeApp,
      invitationPrimary,
      viewerUserId: user.id
    })
    const activeProposal = proposals.find((item) => item.status === 'active')
      || (coordination.final_proposal_id
        ? proposals.find((item) => Number(item.id) === Number(coordination.final_proposal_id))
        : null)
    const proposalCard = buildProposalCard(activeProposal, {
      user_a_id: coordination.user_a_id,
      user_b_id: coordination.user_b_id
    })
    const invitationStatusText = coordination.status === STATUS.COLLECTING_INITIATOR
      ? '准备邀请'
      : (coordination.status === STATUS.INVITING_PARTNER
        ? '等待对方回应'
        : (coordination.status === STATUS.INVITATION_DECLINED
          ? '对方暂未接受'
          : (coordination.status === STATUS.EXPIRED
            ? '邀请已结束'
            : (coordination.status === STATUS.CLOSED
              ? '本轮协调已关闭'
              : (coordination.status === STATUS.CANCELLED
                ? '已取消'
                : (coordination.status === STATUS.MANUAL_HANDOFF
                  ? '已转人工'
                  : (coordination.status === STATUS.ARRANGED ? '已确认' : '协调中')))))))
    const payload = {
      id: Number(coordination.id),
      status: coordination.status,
      business_state: coordination.business_state || ({
        [STATUS.COLLECTING_INITIATOR]: 'created',
        [STATUS.INVITING_PARTNER]: 'waiting_partner',
        [STATUS.COLLECTING_PREFERENCES]: coordination.invitee_intent === 'coordinate' && !inviteeApp
          ? 'waiting_invitee_preference'
          : 'coordinating',
        [STATUS.WAITING_CONFIRMATIONS]: 'proposal_generated',
        [STATUS.ARRANGED]: 'completed',
        [STATUS.CANCELLED]: 'cancelled',
        [STATUS.INVITATION_DECLINED]: 'cancelled',
        [STATUS.EXPIRED]: 'expired'
      }[coordination.status] || 'coordinating'),
      coordination_version: version,
      invitation_version: invitationVersion,
      invitation_primary_proposal: invitationPrimary,
      invitee_intent: coordination.invitee_intent || '',
      accepted_base_invitation_version: Number(coordination.accepted_base_invitation_version || 0),
      recoordination_count: Number(coordination.recoordination_count || 0),
      round_number: roundNumber(coordination),
      max_rounds: MAX_COORDINATION_ROUNDS,
      processing_status: coordination.processing_status || '',
      processing_version: Number(coordination.processing_version || 0),
      invitation_deadline_at: coordination.invitation_deadline_at || null,
      application_deadline_at: coordination.application_deadline_at || null,
      confirmation_deadline_at: coordination.confirmation_deadline_at || null,
      final_proposal_id: Number(coordination.final_proposal_id || 0),
      missing_dimensions: coordination.missing_dimensions || [],
      role,
      can_respond_invitation: coordination.status === STATUS.INVITING_PARTNER && role === 'invitee',
      can_open_coordinator_chat: canOpenCoordinatorChat(coordination, user, { hasOwnApplication: Boolean(mine) }),
      can_write_coordinator: canWriteCoordinatorAction(coordination, user, { hasOwnApplication: Boolean(mine) }),
      can_submit_application: (coordination.status === STATUS.COLLECTING_INITIATOR && role === 'initiator')
        || (coordination.status === STATUS.COLLECTING_PREFERENCES && !mine),
      confirmed_by_me: mineConfirmed,
      invitation_status_text: invitationStatusText,
      application_status_text: applications.length >= 2 ? '双方已填写' : (mine ? '我已填写' : '等待填写'),
      confirmation_status_text: coordination.status === STATUS.ARRANGED
        ? '双方已确认'
        : (mineConfirmed ? '你已确认，正在等待对方。' : '等待确认'),
      participant_progress: [
        Number(user.id),
        partnerId
      ].map((participantId, index) => ({
        side: index === 0 ? 'mine' : 'partner',
        application_submitted: applicationUsers.has(participantId),
        proposal_confirmed: confirmedUsers.has(participantId)
      })),
      my_application: mine ? Object.assign({}, mine.application) : null,
      my_preference_evidence: mine && mine.preference_evidence ? Object.assign({}, mine.preference_evidence) : null,
      invitation_card: invitationCard,
      shared_coordination: sharedCoordination,
      counter_offer_card: counterOfferCard,
      proposal_card: proposalCard,
      meeting_checkin: publicMeetingState(coordination, applications, user.id, dep('env')),
      coordinator_welcome: coordinatorWelcomeText(Object.assign({}, coordination, {
        my_application: mine && mine.application
      }), role),
      is_test_data: Number(coordination.is_test_data || 0) === 1,
      qa_reset_allowed: await qaResetAllowedFor(user, dep),
      test_data_badge: fixtureSceneBadge(Object.assign({}, coordination, {
        fixture_journey: coordination.synthetic_partner_journey
      })),
      synthetic_partner_journey: coordination.synthetic_partner_journey || '',
      synthetic_partner_mode: coordination.synthetic_partner_mode || '',
      declined_public_message: coordination.status === STATUS.INVITATION_DECLINED
        ? publicSafeDeclineMessage()
        : (coordination.status === STATUS.EXPIRED ? EXPIRED_PUBLIC_MESSAGE : ''),
      proposals: proposals.filter((item) => item.status === 'active' || Number(item.id) === Number(coordination.final_proposal_id)).map((item) => ({
        id: Number(item.id),
        proposal_key: item.proposal_key,
        coordination_version: Number(item.coordination_version),
        source: item.source || 'backend',
        date: item.date,
        period: item.period,
        start_time: item.start_time || '',
        area: item.area,
        activity: item.activity,
        activity_venue: item.activity_venue || '',
        meet_point: item.meet_point || '',
        contract_version: Number(item.contract_version || 1),
        budget: item.budget,
        payment_preference: item.payment_preference,
        duration: item.duration
      }))
    }
    payload.view_model = buildCoordinationViewModel(Object.assign({}, payload, {
      partner_application_submitted: partnerApplicationSubmitted
    }))
    return payload
  }

  async function detail(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    let coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (data && (data.advance_synthetic === true || data.advanceSynthetic === true)) {
      await advanceSyntheticForUser(coordination, user)
      coordination = await dep('byId')('date_coordination', Number(coordination && coordination.id)) || coordination
    }
    if (coordination
      && Number(coordination.is_test_data || 0) === 1
      && Number(user.id) === Number(coordination.user_a_id)
      && [STATUS.NO_OVERLAP, STATUS.REPLANNING, STATUS.WAITING_CONFIRMATIONS].includes(coordination.status)) {
      const version = Number(coordination.coordination_version || 1)
      const shouldAdvance = coordination.status !== STATUS.WAITING_CONFIRMATIONS
        || await dep('first')('date_coordination_confirmation', {
          coordination_id: Number(coordination.id),
          user_id: Number(coordination.user_a_id),
          coordination_version: version,
          decision: 'confirm'
        })
      if (shouldAdvance) {
        await maybeAdvanceSyntheticPartner(coordination)
        coordination = await dep('byId')('date_coordination', Number(coordination.id)) || coordination
      }
    }
    return detailFor(coordination, user)
  }

  async function advanceSynthetic(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    await advanceSyntheticForUser(coordination, user)
    const updated = await dep('byId')('date_coordination', Number(coordination && coordination.id))
    return detailFor(updated || coordination, user)
  }

  async function meetingCheckIn(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return applyMeetingCheckIn({
      coordination_id: coordinationId(data),
      user_id: Number(user.id),
      action: data.action,
      arrival_hint: data.arrival_hint || data.arrivalHint,
      arrival_position: data.arrival_position || data.arrivalPosition
    }, {
      byId: dep('byId'),
      list: dep('list'),
      first: dep('first'),
      addWithId: dep('addWithId'),
      updateByDoc: dep('updateByDoc'),
      publishCoordinationEvent: dep('publishCoordinationEvent'),
      writeInboxNotification: dep('writeInboxNotification'),
      now: dep('now'),
      env: dep('env')
    })
  }

  async function qaReset(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    if (!(await qaResetAllowedFor(user, dep))) {
      throw businessError('QA_RESET_FORBIDDEN', '仅限双真机 QA 测试账号重置')
    }
    if (String(data.confirm_text || '') !== '重新开始本轮测试') {
      throw businessError('QA_RESET_CONFIRM_REQUIRED', '请确认重新开始本轮测试')
    }
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination || !participant(coordination, user.id)) {
      throw businessError('QA_RESET_FORBIDDEN', '无权重置该约会协调')
    }
    if (isTerminalCoordination(coordination.status)) {
      return { id: Number(coordination.id), status: coordination.status, reset: false, idempotent: true }
    }
    const now = dep('now')()
    const related = [
      ['agent_session', ['closed', 'cancelled'], 'closed'],
      ['agent_notification_job', ['delivered', 'cancelled', 'failed', 'skipped', 'sent', 'expired'], 'cancelled'],
      ['date_application_patch', ['applied', 'cancelled', 'expired'], 'cancelled'],
      ['date_coordination_proposal', ['superseded'], 'superseded'],
      ['date_coordination_confirmation', ['superseded'], 'superseded']
    ]
    for (const [name, terminalStatuses, nextStatusValue] of related) {
      const rows = await dep('list')(name, { coordination_id: Number(coordination.id) }, 100)
      for (const row of rows) {
        if (!terminalStatuses.includes(String(row.status || ''))) {
          await dep('updateByDoc')(name, row, { status: nextStatusValue })
        }
      }
    }
    const updated = await dep('updateByDoc')('date_coordination', coordination, {
      status: STATUS.CLOSED,
      business_state: 'qa_reset',
      processing_status: 'idle',
      processing_token: null,
      confirmation_deadline_at: null,
      counter_offer: null,
      qa_reset_at: now,
      qa_reset_by_user_id: Number(user.id)
    })
    await dep('publishCoordinationEvent')({
      coordination: updated,
      allowCreate: false,
      event: {
        event_type: 'qa_coordination_reset',
        actor_user_id: Number(user.id),
        coordination_version: Number(coordination.coordination_version || 1)
      }
    })
    const partnerId = Number(user.id) === Number(coordination.user_a_id)
      ? Number(coordination.user_b_id)
      : Number(coordination.user_a_id)
    if (partnerId > 0) {
      try {
        await dep('writeInboxNotification')({
          coordination: updated,
          user_id: partnerId,
          event_type: 'qa_coordination_reset',
          coordination_version: Number(coordination.coordination_version || 1),
          title: '本轮协调已关闭',
          body: '本轮协调已由测试人员关闭，如需继续请重新发起邀请。',
          stage: 'qa_coordination_reset'
        })
      } catch (err) {
        console.warn('inbox qa-reset notification skipped:', err.message || err)
      }
    }
    return { id: Number(coordination.id), status: STATUS.CLOSED, reset: true, idempotent: false }
  }

  async function advanceSyntheticForUser(coordination, user) {
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权操作该日期协调')
    if (Number(coordination.is_test_data || 0) !== 1) throw new Error('仅测试协调可推进合成对象')
    if (Number(user.id) !== Number(coordination.user_a_id)) throw new Error('仅发起方可推进测试对象')
    if (String(coordination.synthetic_partner_mode || '') !== 'manual_step') {
      throw new Error('当前不是分步测试模式')
    }
    await maybeAdvanceSyntheticPartner(coordination, { force: true })
  }

  async function confirmProposal(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return confirmProposalForUser(data, user)
  }

  async function acceptCounterOffer(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return acceptCounterOfferForUser(data, user)
  }

  async function acceptCounterOfferForUser(data, user) {
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination || !participant(coordination, user.id)) {
      throw businessError('COUNTER_OFFER_STALE', '调整方案已更新，请刷新后重试')
    }
    const version = Number(coordination.coordination_version || 1)
    if (Number(data.coordination_version || data.coordinationVersion || 0) !== version) {
      throw businessError('COUNTER_OFFER_STALE', '调整方案已更新，请刷新后重试')
    }
    const applications = await dep('list')('date_coordination_application', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    const applicationA = applications.find((item) => Number(item.user_id) === Number(coordination.user_a_id))
    const applicationB = applications.find((item) => Number(item.user_id) === Number(coordination.user_b_id))
    const mine = applications.find((item) => Number(item.user_id) === Number(user.id))
    const invitationPrimary = invitationPrimaryOf(coordination, applicationA, {
      user_a_id: coordination.user_a_id,
      user_b_id: coordination.user_b_id
    })
    const counterOffer = buildStructuredCounterProposal({
      coordination,
      applicationA: applicationA && applicationA.application,
      applicationB: applicationB && applicationB.application,
      applicationRowA: applicationA,
      applicationRowB: applicationB,
      invitationPrimary,
      viewerUserId: user.id
    })
    if (!counterOffer || String(data.proposal_token || data.proposalToken || '') !== counterOffer.proposal_token) {
      throw businessError('COUNTER_OFFER_STALE', '调整方案已更新，请刷新后重试')
    }
    if (!mine || !mine.application) throw new Error('请先完成自己的约会偏好')

    const patchHandlerDeps = {
      first: dep('first'),
      list: dep('list'),
      byId: dep('byId'),
      addWithId: dep('addWithId'),
      updateByDoc: dep('updateByDoc'),
      now: dep('now'),
      currentUser: async () => user,
      publishCoordinationEvent: dep('publishCoordinationEvent'),
      writeInboxNotification: dep('writeInboxNotification')
    }
    if (unitMode) patchHandlerDeps.unitMode = true
    const claimPendingPatchDep = dep('claimPendingPatch')
    const commitPreAcceptInvitationPatchDep = dep('commitPreAcceptInvitationPatch')
    const commitPostAcceptApplicationPatchDep = dep('commitPostAcceptApplicationPatch')
    if (typeof claimPendingPatchDep === 'function') patchHandlerDeps.claimPendingPatch = claimPendingPatchDep
    if (typeof commitPreAcceptInvitationPatchDep === 'function') {
      patchHandlerDeps.commitPreAcceptInvitationPatch = commitPreAcceptInvitationPatchDep
    }
    if (typeof commitPostAcceptApplicationPatchDep === 'function') {
      patchHandlerDeps.commitPostAcceptApplicationPatch = commitPostAcceptApplicationPatchDep
    }
    const patchHandlers = overrides.applicationPatchHandlers
      || require('./dateApplicationPatch').createDateApplicationPatchHandlers(patchHandlerDeps)
    const acceptedApplication = applyAcceptedCounterProposal(mine.application, counterOffer)
    const acceptedChanges = (counterOffer.changes || []).reduce((out, item) => {
      out[item.field] = acceptedApplication[item.field]
      return out
    }, {})
    const patch = await patchHandlers.createPreviewForUser({
      coordination_id: Number(coordination.id),
      changes: acceptedChanges
    }, user)
    await patchHandlers.confirmForUser({ patch_id: Number(patch.id) }, user)
    const updated = await dep('byId')('date_coordination', Number(coordination.id))
    return detailFor(updated || coordination, user)
  }

  async function confirmProposalForUser(data, user) {
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权确认该约会方案')
    const version = Number(coordination.coordination_version || 1)
    const proposal = await dep('byId')('date_coordination_proposal', Number(data.proposal_id || data.proposalId || 0))
    if (!proposal || Number(proposal.coordination_id) !== Number(coordination.id)) {
      throw businessError('STALE_COORDINATION_VERSION', '方案已失效，请刷新后重试')
    }
    if (coordination.status === STATUS.ARRANGED) {
      const completed = await dep('first')('date_coordination_confirmation', {
        coordination_id: Number(coordination.id),
        user_id: Number(user.id),
        coordination_version: version
      })
      if (completed && completed.decision === 'confirm'
        && Number(completed.proposal_id) === Number(proposal.id)
        && Number(coordination.final_proposal_id) === Number(proposal.id)) {
        return detailFor(coordination, user)
      }
      throw businessError('COORDINATION_FINALIZED', '本次约会协调已结束')
    }
    if ([STATUS.CLOSED, STATUS.CANCELLED, STATUS.EXPIRED, STATUS.INVITATION_DECLINED, STATUS.MANUAL_HANDOFF]
      .includes(coordination.status)) {
      throw businessError('COORDINATION_FINALIZED', '本次约会协调已结束')
    }
    if (deadlinePassed(coordination.confirmation_deadline_at, dep('now')())) {
      await dep('expireIfCurrent')(coordination)
      throw businessError('COORDINATION_FINALIZED', '方案确认已过期')
    }
    if (Number(data.coordination_version || version) !== version) {
      throw businessError('STALE_COORDINATION_VERSION', '方案已失效，请刷新后重试')
    }
    const decision = String(data.decision || '')
    if (!['confirm', 'reject'].includes(decision)) throw new Error('请选择确认或重新协调')
    if (decision === 'reject') {
      const now = dep('now')()
      const proposals = await dep('list')('date_coordination_proposal', {
        coordination_id: Number(coordination.id),
        coordination_version: version
      }, 20)
      const confirmations = await dep('list')('date_coordination_confirmation', {
        coordination_id: Number(coordination.id),
        coordination_version: version
      }, 20)
      for (const item of proposals.filter((row) => row.status === 'active')) {
        await dep('updateByDoc')('date_coordination_proposal', item, { status: 'superseded' })
      }
      for (const item of confirmations) {
        await dep('updateByDoc')('date_coordination_confirmation', item, { status: 'superseded' })
      }
      if (!canStartAnotherRound(coordination)) {
        const handedOff = await dep('updateByDoc')('date_coordination', coordination, {
          status: STATUS.MANUAL_HANDOFF,
          business_state: 'manual_handoff'
        })
        await dep('publishCoordinationEvent')({
          coordination: handedOff,
          event: {
            event_type: 'manual_handoff',
            actor_user_id: Number(user.id),
            coordination_version: version,
            round_number: roundNumber(handedOff)
          }
        })
        return detailFor(handedOff, user)
      }
      const newVersion = version + 1
      const applications = await dep('list')('date_coordination_application', {
        coordination_id: Number(coordination.id),
        coordination_version: version
      }, 10)
      for (const application of applications) {
        await dep('addWithId')('date_coordination_application', {
          coordination_id: Number(coordination.id),
          user_id: Number(application.user_id),
          coordination_version: newVersion,
          application: application.application,
          submitted_at: now,
          source: 'proposal_rejection_snapshot'
        }, 'date_coordination_application')
      }
      const updated = await dep('updateByDoc')('date_coordination', coordination, {
        status: STATUS.REPLANNING,
        business_state: 'coordinating',
        coordination_version: newVersion,
        recoordination_count: Number(coordination.recoordination_count || 0) + 1,
        application_deadline_at: addHours(now, 72),
        confirmation_deadline_at: null,
        final_proposal_id: 0,
        missing_dimensions: [],
        processing_status: '',
        processing_version: 0,
        processing_token: '',
        processing_attempts: 0,
        processing_started_at: null,
        processing_completed_at: null,
        processing_error_code: ''
      })
      await dep('publishCoordinationEvent')({
        coordination: updated,
        event: {
          event_type: 'proposal_rejected',
          actor_user_id: Number(user.id),
          coordination_version: newVersion,
          round_number: roundNumber(updated)
        }
      })
      return detailFor(updated, user)
    }
    const committed = await dep('commitConfirmation')(coordination, proposal, {
      user_id: Number(user.id),
      decision: 'confirm'
    }, dep('now')())
    const updated = committed.coordination
    await dep('publishCoordinationEvent')({
      coordination: updated,
      event: {
        event_type: decision === 'confirm' ? 'proposal_confirmed' : 'proposal_rejected',
        actor_user_id: Number(user.id),
        coordination_version: version,
        proposal
      }
    })
    if (decision === 'confirm') {
      const partnerId = Number(updated.user_a_id) === Number(user.id)
        ? Number(updated.user_b_id)
        : Number(updated.user_a_id)
      const isArranged = updated.status === STATUS.ARRANGED
      try {
        await dep('writeInboxNotification')({
          coordination: updated,
          user_id: partnerId,
          event_type: isArranged ? 'arranged' : 'proposal_confirmed',
          coordination_version: Number(updated.coordination_version || version),
          title: isArranged ? '双方已确认最终方案' : '对方已确认方案',
          body: isArranged
            ? '双方已确认最终方案，约会安排已经形成。'
            : '对方已确认当前的候选方案，正在等待你的确认。',
          stage: isArranged ? 'arranged' : 'proposal_confirmed'
        })
      } catch (err) {
        console.warn('inbox confirm notification skipped:', err.message || err)
      }
    }
    if (updated.status === STATUS.ARRANGED) {
      await dep('publishCoordinationEvent')({
        coordination: updated,
        event: {
          event_type: 'arranged',
          actor_user_id: Number(user.id),
          coordination_version: version,
          proposal
        }
      })
      return detailFor(updated, user)
    }
    return detailFor(updated, user)
  }

  async function recoordinate(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权操作该日期协调')
    if (!canRecoordinate(coordination, user)) {
      throw new Error(isTerminalCoordination(coordination.status)
        ? terminalWriteError(coordination.status)
        : '当前状态不能重新协调')
    }
    const rounds = Number(coordination.recoordination_count || 0)
    if (!canStartAnotherRound(coordination)) {
      const updated = await dep('updateByDoc')('date_coordination', coordination, {
        status: STATUS.MANUAL_HANDOFF
      })
      await dep('publishCoordinationEvent')({
        coordination: updated,
        event: {
          event_type: 'manual_handoff',
          actor_user_id: Number(user.id),
          coordination_version: Number(updated.coordination_version || 1),
          round_number: roundNumber(updated)
        }
      })
      return detailFor(updated, user)
    }
    const currentVersion = Number(coordination.coordination_version || 1)
    const proposals = await dep('list')('date_coordination_proposal', {
      coordination_id: Number(coordination.id),
      coordination_version: currentVersion
    }, 10)
    for (const proposal of proposals.filter((item) => item.status === 'active')) {
      await dep('updateByDoc')('date_coordination_proposal', proposal, { status: 'superseded' })
    }
    const now = dep('now')()
    const updated = await dep('updateByDoc')('date_coordination', coordination, {
      status: STATUS.REPLANNING,
      business_state: 'coordinating',
      coordination_version: currentVersion + 1,
      recoordination_count: rounds + 1,
      application_deadline_at: addHours(now, 72),
      confirmation_deadline_at: null,
      missing_dimensions: [],
      final_proposal_id: 0
    })
    await dep('publishCoordinationEvent')({
      coordination: updated,
      event: {
        event_type: 'recoordination_started',
        actor_user_id: Number(user.id),
        coordination_version: Number(updated.coordination_version || currentVersion + 1),
        round_number: roundNumber(updated)
      }
    })
    return detailFor(updated, user)
  }

  async function retryProcessing(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权重试该日期协调')
    if (coordination.status !== STATUS.COMPUTING_OVERLAP || coordination.processing_status !== 'failed') {
      throw new Error('当前协调任务不需要重试')
    }
    const version = Number(coordination.coordination_version || 1)
    const queued = enqueueProcessing(coordination, { version, now: dep('now')() })
    const updated = await dep('updateByDoc')('date_coordination', coordination, {
      status: queued.status,
      business_state: queued.business_state,
      processing_status: queued.processing_status,
      processing_version: queued.processing_version,
      processing_token: '',
      processing_attempts: 0,
      processing_started_at: null,
      processing_completed_at: null,
      processing_error_code: '',
      last_event_at: queued.last_event_at
    })
    await dep('publishCoordinationEvent')({
      coordination: updated,
      event: {
        event_type: 'processing_queued',
        actor_user_id: Number(user.id),
        coordination_version: version,
        idempotency_suffix: 'manual-retry'
      }
    })
    return detailFor(updated, user)
  }

  return {
    create,
    submitFixtureApplication,
    fixtureResponse,
    respondInvitation,
    respondInvitationForUser,
    saveApplication,
    saveApplicationForUser,
    detail,
    confirmProposal,
    confirmProposalForUser,
    acceptCounterOffer,
    acceptCounterOfferForUser,
    recoordinate,
    retryProcessing,
    maybeAdvanceSyntheticPartner,
    advanceSynthetic,
    meetingCheckIn,
    qaReset
  }
}

const handlers = {}

function handler(name) {
  return function invoke(data, wxContext) {
    if (!handlers.instance) handlers.instance = createDateCoordinationHandlers()
    return handlers.instance[name](data, wxContext)
  }
}

module.exports = {
  create: handler('create'),
  submitFixtureApplication: handler('submitFixtureApplication'),
  respondInvitation: handler('respondInvitation'),
  saveApplication: handler('saveApplication'),
  detail: handler('detail'),
  fixtureResponse: handler('fixtureResponse'),
  confirmProposal: handler('confirmProposal'),
  acceptCounterOffer: handler('acceptCounterOffer'),
  recoordinate: handler('recoordinate'),
  retryProcessing: handler('retryProcessing'),
  advanceSynthetic: handler('advanceSynthetic'),
  meetingCheckIn: handler('meetingCheckIn'),
  qaReset: handler('qaReset'),
  createDateCoordinationHandlers,
  defaultDeps,
  processCoordinationDeadlines,
  upsertConfirmation,
  updateConfirmationState
}
