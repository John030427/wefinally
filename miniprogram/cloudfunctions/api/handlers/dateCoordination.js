const { STATUS, normalizeApplication, nextStatus } = require('../lib/dateCoordinationPolicy')
const { MEMBER_STATUS, memberStatus } = require('../lib/memberPolicy')
const { createReminderJob } = require('../agent/notificationJobs')
const { assertOfflineDatingAllowed } = require('../lib/testFixturePolicy')
const { canScheduleFixtureDecline, scheduleFixtureDecline, publicJob, politeDeclineMessage } = require('../lib/fixtureResponseService')
const { MAX_COORDINATION_ROUNDS, roundNumber, canStartAnotherRound, enqueueProcessing } = require('../lib/dateCoordinationProcessingPolicy')
const { publishCoordinationEvent } = require('../agent/dateCoordinationEvents')

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
  return {
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
    expireIfCurrent: expireCoordinationIfCurrent,
    publishCoordinationEvent,
    now: db.now,
    writeInboxNotification(input) {
      const { notifyInbox } = require('../lib/coordinationInbox')
      return notifyInbox(input)
    }
  }
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
    if (await deps.expireIfCurrent(row)) expired += 1
  }
  return { scanned: rows.length, expired }
}

function createDateCoordinationHandlers(overrides = {}) {
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
    const existing = await dep('first')('date_coordination', { pair_key: key })
    if (existing) return detailFor(existing, user)

    if (!match) match = await dep('first')('user_match_log', {
      user_id: Number(user.id),
      match_user_id: partnerId
    })
    if (!match) throw new Error('仅可与当前匹配对象发起日期协调')
    const partner = await dep('byId')('user', partnerId)
    if (!isEligible(partner, now)) throw new Error('匹配对象暂不满足日期协调条件')
    if (canScheduleFixtureDecline(user, partner, now, { allowMatchedPublicFixture: true })) {
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
          simulation_badge: '虚拟体验对象'
        }
      }
      return {
        test_simulation: true,
        await_application: true,
        match_log_id: Number(match.id),
        match_user_id: partnerId,
        simulation_badge: '虚拟体验对象'
      }
    }
    assertOfflineDatingAllowed(partner)

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
      final_proposal_id: 0
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
      simulation_badge: '虚拟体验对象'
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

  async function respondInvitation(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (Number(coordination.user_b_id) !== Number(user.id)) throw new Error('仅受邀参与者可以处理邀请')
    if (deadlinePassed(coordination.invitation_deadline_at, dep('now')())) {
      await dep('updateByDoc')('date_coordination', coordination, { status: STATUS.EXPIRED })
      throw new Error('协调邀请已过期')
    }
    const decision = String(data.decision || '')
    const event = decision === 'accept'
      ? 'accept_invitation'
      : decision === 'decline'
        ? 'decline_invitation'
        : ''
    if (!event) throw new Error('请选择接受或拒绝')
    const now = dep('now')()
    const update = {
      status: nextStatus(coordination.status, event),
      business_state: event === 'accept_invitation' ? 'coordinating' : 'cancelled',
      invitation_responded_at: now
    }
    if (event === 'accept_invitation') update.application_deadline_at = addHours(now, 72)
    const updated = await dep('updateByDoc')('date_coordination', coordination, update)
    await dep('publishCoordinationEvent')({
      coordination: updated,
      event: {
        event_type: event === 'accept_invitation' ? 'invitation_accepted' : 'invitation_declined',
        actor_user_id: Number(user.id),
        coordination_version: Number(updated.coordination_version || 1)
      }
    })
    if (event === 'accept_invitation') {
      try {
        await dep('writeInboxNotification')({
          coordination: updated,
          user_id: Number(updated.user_a_id),
          event_type: 'invitation_accepted',
          coordination_version: Number(updated.coordination_version || 1),
          title: '对方已接受约会协调邀请',
          body: '对方已接受你的约会协调邀请，现在可以开始填写彼此的偏好。',
          stage: 'invitation_accepted'
        })
      } catch (err) {
        console.warn('inbox invitation notification skipped:', err.message || err)
      }
    }
    return detailFor(updated, user)
  }

  async function saveApplication(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    return saveApplicationForUser(data, user)
  }

  async function saveApplicationForUser(data, user) {
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权操作该日期协调')
    const isInitiatorDraft = coordination.status === STATUS.COLLECTING_INITIATOR
    if (isInitiatorDraft && Number(coordination.user_a_id) !== Number(user.id)) {
      throw new Error('请等待发起方填写约会偏好并发出邀请')
    }
    if (![STATUS.COLLECTING_INITIATOR, STATUS.COLLECTING_PREFERENCES].includes(coordination.status)) {
      throw new Error('当前状态不能提交日期申请')
    }
    const now = dep('now')()
    if (deadlinePassed(coordination.application_deadline_at, now)) {
      await dep('updateByDoc')('date_coordination', coordination, { status: STATUS.EXPIRED })
      throw new Error('约会申请已过期')
    }
    const version = Number(coordination.coordination_version || 1)
    const application = normalizeApplication(data, now)
    const query = { coordination_id: Number(coordination.id), user_id: Number(user.id), coordination_version: version }
    const existing = await dep('first')('date_coordination_application', query)
    // Per-party preference_version: 首版 = coordination 版本；每次更新 +1（Requirement 18）
    const nextPreferenceVersion = existing
      ? Number(existing.preference_version || existing.coordination_version || version || 1) + 1
      : Number(version || 1)
    if (existing) {
      await dep('updateByDoc')('date_coordination_application', existing, {
        application,
        submitted_at: now,
        preference_version: nextPreferenceVersion
      })
    } else {
      await dep('addWithId')('date_coordination_application', Object.assign({}, query, {
        application,
        submitted_at: now,
        preference_version: nextPreferenceVersion
      }), 'date_coordination_application')
    }
    await dep('publishCoordinationEvent')({
      coordination,
      event: {
        event_type: 'application_submitted',
        actor_user_id: Number(user.id),
        coordination_version: version
      }
    })

    if (isInitiatorDraft) {
      const invitationDeadline = addHours(now, 48)
      const updated = await dep('updateByDoc')('date_coordination', coordination, {
        status: nextStatus(coordination.status, 'initiator_submitted'),
        business_state: 'waiting_partner',
        invitation_deadline_at: invitationDeadline,
        application_deadline_at: null
      })
      const notification = createReminderJob({
        coordinationId: coordination.id,
        userId: coordination.user_b_id,
        stage: 'invitation_created',
        deadlineAt: invitationDeadline,
        now
      })
      const queued = await dep('first')('agent_notification_job', {
        idempotency_key: notification.idempotency_key
      })
      if (!queued) await dep('addWithId')('agent_notification_job', notification, 'agent_notification_job')
      try {
        await dep('writeInboxNotification')({
          coordination: updated,
          user_id: Number(updated.user_b_id),
          event_type: 'invitation_created',
          coordination_version: Number(updated.coordination_version || 1),
          title: '新的约会协调邀请',
          body: '你收到了一个约会协调邀请，请打开协调页查看并决定是否参与。',
          stage: 'invitation_created'
        })
      } catch (err) {
        console.warn('inbox invitation-created notification skipped:', err.message || err)
      }
      return detailFor(updated, user)
    }

    const applications = await dep('list')('date_coordination_application', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    const applicationsByUser = new Map(applications.map((item) => [Number(item.user_id), item.application]))
    const applicationA = applicationsByUser.get(Number(coordination.user_a_id))
    const applicationB = applicationsByUser.get(Number(coordination.user_b_id))
    if (!applicationA || !applicationB) return detailFor(coordination, user)

    const queued = enqueueProcessing(coordination, { version, now })
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
      last_event_at: queued.last_event_at,
      missing_dimensions: [],
      confirmation_deadline_at: null
    })
    await dep('publishCoordinationEvent')({
      coordination: updated,
      event: {
        event_type: 'processing_queued',
        actor_user_id: Number(user.id),
        coordination_version: version
      }
    })
    return detailFor(updated, user)
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
      && applications.length === 0) {
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
    const role = Number(coordination.user_a_id) === Number(user.id) ? 'initiator' : 'invitee'
    const mineConfirmed = confirmedUsers.has(Number(user.id))
    return {
      id: Number(coordination.id),
      status: coordination.status,
      business_state: coordination.business_state || ({
        [STATUS.COLLECTING_INITIATOR]: 'created',
        [STATUS.INVITING_PARTNER]: 'waiting_partner',
        [STATUS.COLLECTING_PREFERENCES]: 'coordinating',
        [STATUS.WAITING_CONFIRMATIONS]: 'proposal_generated',
        [STATUS.ARRANGED]: 'completed',
        [STATUS.CANCELLED]: 'cancelled',
        [STATUS.INVITATION_DECLINED]: 'cancelled'
      }[coordination.status] || 'coordinating'),
      coordination_version: version,
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
      can_submit_application: (coordination.status === STATUS.COLLECTING_INITIATOR && role === 'initiator')
        || (coordination.status === STATUS.COLLECTING_PREFERENCES && !mine),
      confirmed_by_me: mineConfirmed,
      invitation_status_text: coordination.status === STATUS.COLLECTING_INITIATOR
        ? '准备邀请'
        : (coordination.status === STATUS.INVITING_PARTNER ? '等待确认' : (coordination.status === STATUS.INVITATION_DECLINED ? '已婉拒' : '已确认')),
      application_status_text: applications.length >= 2 ? '双方已填写' : (mine ? '我已填写' : '等待填写'),
      confirmation_status_text: coordination.status === STATUS.ARRANGED ? '双方已确认' : (mineConfirmed ? '我已确认' : '等待确认'),
      participant_progress: [
        Number(user.id),
        Number(coordination.user_a_id) === Number(user.id) ? Number(coordination.user_b_id) : Number(coordination.user_a_id)
      ].map((participantId, index) => ({
        side: index === 0 ? 'mine' : 'partner',
        application_submitted: applicationUsers.has(participantId),
        proposal_confirmed: confirmedUsers.has(participantId)
      })),
      my_application: mine ? Object.assign({}, mine.application) : null,
      proposals: proposals.filter((item) => item.status === 'active').map((item) => ({
        id: Number(item.id),
        proposal_key: item.proposal_key,
        coordination_version: Number(item.coordination_version),
        date: item.date,
        period: item.period,
        area: item.area,
        activity: item.activity,
        budget: item.budget,
        payment_preference: item.payment_preference,
        duration: item.duration
      }))
    }
  }

  async function detail(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    return detailFor(coordination, user)
  }

  async function confirmProposal(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权确认该约会方案')
    if (deadlinePassed(coordination.confirmation_deadline_at, dep('now')())) {
      await dep('updateByDoc')('date_coordination', coordination, { status: STATUS.EXPIRED })
      throw new Error('方案确认已过期')
    }
    const version = Number(coordination.coordination_version || 1)
    if (Number(data.coordination_version || version) !== version) throw new Error('方案已失效，请刷新后重试')
    const proposal = await dep('byId')('date_coordination_proposal', Number(data.proposal_id || data.proposalId || 0))
    if (!proposal || Number(proposal.coordination_id) !== Number(coordination.id)) {
      throw new Error('方案已失效，请刷新后重试')
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
    }
    return detailFor(updated, user)
  }

  async function recoordinate(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权操作该日期协调')
    if (![STATUS.NO_OVERLAP, STATUS.REPLANNING].includes(coordination.status)) {
      throw new Error('当前状态不能重新协调')
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

  return { create, submitFixtureApplication, fixtureResponse, respondInvitation, saveApplication, saveApplicationForUser, detail, confirmProposal, recoordinate, retryProcessing }
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
  recoordinate: handler('recoordinate'),
  retryProcessing: handler('retryProcessing'),
  createDateCoordinationHandlers,
  processCoordinationDeadlines,
  upsertConfirmation,
  updateConfirmationState
}
