const { STATUS, normalizeApplication, computeOverlap, nextStatus, applyConfirmation } = require('../lib/dateCoordinationPolicy')
const { MEMBER_STATUS, memberStatus } = require('../lib/memberPolicy')
const { createReminderJob, deliverProposalNotification } = require('../agent/notificationJobs')
const { assertOfflineDatingAllowed } = require('../lib/testFixturePolicy')
const { canScheduleFixtureDecline, scheduleFixtureDecline, publicJob } = require('../lib/fixtureResponseService')

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
    upsertConfirmation,
    updateConfirmationState,
    expireIfCurrent: expireCoordinationIfCurrent,
    now: db.now
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
    if (canScheduleFixtureDecline(user, partner, now)) {
      const job = await scheduleFixtureDecline({
        actor: user,
        target: partner,
        interaction_id: `match:${match.id}`
      }, {
        first: (name, query) => dep('first')(name, query),
        addWithId: (name, data, prefix) => dep('addWithId')(name, data, prefix),
        now: () => dep('now')()
      })
      return { test_simulation: true, fixture_response_job: publicJob(job) }
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
    if (![STATUS.COLLECTING_INITIATOR, STATUS.COLLECTING_PREFERENCES, STATUS.REPLANNING].includes(coordination.status)) {
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
    if (existing) {
      await dep('updateByDoc')('date_coordination_application', existing, {
        application,
        submitted_at: now
      })
    } else {
      await dep('addWithId')('date_coordination_application', Object.assign({}, query, {
        application,
        submitted_at: now
      }), 'date_coordination_application')
    }

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

    const overlap = computeOverlap(applicationA, applicationB, { version })
    if (!overlap.proposals.length) {
      const updated = await dep('updateByDoc')('date_coordination', coordination, {
        status: nextStatus(nextStatus(coordination.status, 'applications_complete'), 'no_overlap'),
        business_state: 'waiting_partner',
        missing_dimensions: overlap.missing_dimensions,
        confirmation_deadline_at: null
      })
      return detailFor(updated, user)
    }
    for (const proposal of overlap.proposals) {
      await dep('addWithId')('date_coordination_proposal', Object.assign({}, proposal, {
        coordination_id: Number(coordination.id),
        status: 'active'
      }), 'date_coordination_proposal')
    }
    const updated = await dep('updateByDoc')('date_coordination', coordination, {
      status: nextStatus(nextStatus(coordination.status, 'applications_complete'), 'proposals_created'),
      business_state: 'proposal_generated',
      missing_dimensions: [],
      confirmation_deadline_at: addHours(now, 24)
    })
    const recipientId = Number(coordination.user_a_id) === Number(user.id)
      ? Number(coordination.user_b_id)
      : Number(coordination.user_a_id)
    const notification = createReminderJob({
      coordinationId: coordination.id,
      userId: recipientId,
      stage: 'proposal_generated',
      deadlineAt: updated.confirmation_deadline_at,
      now
    })
    const queued = await dep('first')('agent_notification_job', {
      idempotency_key: notification.idempotency_key
    })
    const job = queued || await dep('addWithId')('agent_notification_job', notification, 'agent_notification_job')
    await deliverProposalNotification({
      deps: {
        first: dep('first'),
        addWithId: dep('addWithId'),
        updateByDoc: dep('updateByDoc')
      },
      job,
      proposal: overlap.proposals[0],
      now
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
      invitation_deadline_at: coordination.invitation_deadline_at || null,
      application_deadline_at: coordination.application_deadline_at || null,
      confirmation_deadline_at: coordination.confirmation_deadline_at || null,
      final_proposal_id: Number(coordination.final_proposal_id || 0),
      missing_dimensions: coordination.missing_dimensions || [],
      role,
      can_respond_invitation: coordination.status === STATUS.INVITING_PARTNER && role === 'invitee',
      can_submit_application: (coordination.status === STATUS.COLLECTING_INITIATOR && role === 'initiator')
        || [STATUS.COLLECTING_PREFERENCES, STATUS.REPLANNING].includes(coordination.status),
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
    const confirmations = await dep('list')('date_coordination_confirmation', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    const result = applyConfirmation(coordination, proposal, confirmations, {
      user_id: user.id,
      decision: data.decision
    })
    const mine = result.confirmations.find((item) => Number(item.user_id) === Number(user.id))
    const existing = await dep('first')('date_coordination_confirmation', {
      coordination_id: Number(coordination.id),
      user_id: Number(user.id),
      coordination_version: version
    })
    await dep('upsertConfirmation')(existing, Object.assign({}, mine, {
      coordination_id: Number(coordination.id)
    }))
    const latestConfirmations = await dep('list')('date_coordination_confirmation', {
      coordination_id: Number(coordination.id),
      coordination_version: version
    }, 10)
    const confirmationBase = coordination.status === STATUS.ARRANGED
      ? Object.assign({}, coordination, { status: STATUS.WAITING_CONFIRMATIONS })
      : coordination
    const latestResult = applyConfirmation(confirmationBase, proposal, latestConfirmations, {
      user_id: user.id,
      decision: data.decision
    })
    const updated = await dep('updateConfirmationState')(coordination, latestResult)
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
    if (rounds >= 2) {
      const updated = await dep('updateByDoc')('date_coordination', coordination, {
        status: STATUS.MANUAL_HANDOFF
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
    return detailFor(updated, user)
  }

  return { create, respondInvitation, saveApplication, saveApplicationForUser, detail, confirmProposal, recoordinate }
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
  respondInvitation: handler('respondInvitation'),
  saveApplication: handler('saveApplication'),
  detail: handler('detail'),
  confirmProposal: handler('confirmProposal'),
  recoordinate: handler('recoordinate'),
  createDateCoordinationHandlers,
  processCoordinationDeadlines,
  upsertConfirmation,
  updateConfirmationState
}
