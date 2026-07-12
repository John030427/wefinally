const { STATUS, normalizeApplication, computeOverlap, nextStatus, applyConfirmation } = require('../lib/dateCoordinationPolicy')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    currentUser: require('./user').currentUser,
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    now: db.now
  }
}

function pairKey(userAId, userBId) {
  return [Number(userAId), Number(userBId)].sort((a, b) => a - b).join(':')
}

function isEligible(user, now) {
  if (!user || user.member_status !== 'approved') return false
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

function createDateCoordinationHandlers(overrides = {}) {
  let defaults = null
  function dep(name) {
    if (overrides[name]) return overrides[name]
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function create(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const partnerId = Number(data.match_user_id || data.matchUserId || 0)
    if (!partnerId || partnerId === Number(user.id)) throw new Error('请选择有效的匹配对象')
    const now = dep('now')()
    if (!isEligible(user, now)) throw new Error('需审核通过且为有效 VIP 才能发起日期协调')

    const key = pairKey(user.id, partnerId)
    const existing = await dep('first')('date_coordination', { pair_key: key })
    if (existing) return detailFor(existing, user)

    const match = await dep('first')('user_match_log', {
      user_id: Number(user.id),
      match_user_id: partnerId
    })
    if (!match) throw new Error('仅可与当前匹配对象发起日期协调')
    const partner = await dep('byId')('user', partnerId)
    if (!isEligible(partner, now)) throw new Error('匹配对象暂不满足日期协调条件')

    const created = await dep('addWithId')('date_coordination', {
      pair_key: key,
      user_a_id: Number(user.id),
      user_b_id: partnerId,
      status: STATUS.INVITING_PARTNER,
      coordination_version: 1,
      recoordination_count: 0,
      invitation_deadline_at: addHours(now, 48),
      application_deadline_at: null,
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
      invitation_responded_at: now
    }
    if (event === 'accept_invitation') update.application_deadline_at = addHours(now, 72)
    const updated = await dep('updateByDoc')('date_coordination', coordination, update)
    return detailFor(updated, user)
  }

  async function saveApplication(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const coordination = await dep('byId')('date_coordination', coordinationId(data))
    if (!coordination) throw new Error('日期协调不存在')
    if (!participant(coordination, user.id)) throw new Error('无权操作该日期协调')
    if (![STATUS.COLLECTING_PREFERENCES, STATUS.REPLANNING].includes(coordination.status)) {
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
      missing_dimensions: [],
      confirmation_deadline_at: addHours(now, 24)
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
      coordination_version: version,
      recoordination_count: Number(coordination.recoordination_count || 0),
      invitation_deadline_at: coordination.invitation_deadline_at || null,
      application_deadline_at: coordination.application_deadline_at || null,
      confirmation_deadline_at: coordination.confirmation_deadline_at || null,
      final_proposal_id: Number(coordination.final_proposal_id || 0),
      missing_dimensions: coordination.missing_dimensions || [],
      role,
      can_respond_invitation: coordination.status === STATUS.INVITING_PARTNER && role === 'invitee',
      can_submit_application: [STATUS.COLLECTING_PREFERENCES, STATUS.REPLANNING].includes(coordination.status),
      confirmed_by_me: mineConfirmed,
      invitation_status_text: coordination.status === STATUS.INVITING_PARTNER ? '等待确认' : (coordination.status === STATUS.INVITATION_DECLINED ? '已婉拒' : '已确认'),
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
    if (existing) {
      await dep('updateByDoc')('date_coordination_confirmation', existing, mine)
    } else {
      await dep('addWithId')('date_coordination_confirmation', Object.assign({}, mine, {
        coordination_id: Number(coordination.id)
      }), 'date_coordination_confirmation')
    }
    const updated = await dep('updateByDoc')('date_coordination', coordination, {
      status: result.coordination.status,
      final_proposal_id: Number(result.coordination.final_proposal_id || 0)
    })
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
      coordination_version: currentVersion + 1,
      recoordination_count: rounds + 1,
      application_deadline_at: addHours(now, 72),
      confirmation_deadline_at: null,
      missing_dimensions: [],
      final_proposal_id: 0
    })
    return detailFor(updated, user)
  }

  return { create, respondInvitation, saveApplication, detail, confirmProposal, recoordinate }
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
  createDateCoordinationHandlers
}
