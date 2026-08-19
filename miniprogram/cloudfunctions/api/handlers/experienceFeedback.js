const {
  normalizeMatchFeedback,
  normalizeDateFeedback,
  matchFeedbackDocId,
  dateFeedbackDocId,
  businessDateKey,
  dateFeedbackWindowState
} = require('../lib/experienceFeedbackPolicy')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    currentUser: require('./user').currentUser,
    now: db.now,
    byId: db.byId,
    first: db.first,
    addWithId: db.addWithId,
    setDoc: async (name, id, data) => {
      const writeData = Object.assign({}, data)
      delete writeData._id
      await db.withCollection(name, () => db.col(name).doc(id).set({ data: writeData }))
      return Object.assign({ _id: id }, writeData)
    }
  }
}

function publicFeedback(row) {
  if (!row) return null
  const output = Object.assign({}, row)
  delete output._id
  delete output.user_id
  delete output.match_user_id
  return output
}

function pairQuery(userId, partnerId) {
  return {
    user_a_id: Number(userId),
    user_b_id: Number(partnerId)
  }
}

function createExperienceFeedbackHandlers(overrides) {
  let defaults = null
  const injected = overrides || {}
  function dep(name) {
    if (injected[name]) return injected[name]
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function ownMatch(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const matchLogId = Number(data.match_log_id || data.matchLogId || data.id || 0)
    const match = matchLogId ? await dep('byId')('user_match_log', matchLogId) : null
    if (!match || Number(match.user_id) !== Number(user.id)) {
      throw new Error('仅可反馈自己的匹配记录')
    }
    return { user, match }
  }

  async function findCoordination(data, user, match) {
    const requestedId = Number(data.coordination_id || data.coordinationId || 0)
    let coordination = requestedId ? await dep('byId')('date_coordination', requestedId) : null
    if (!coordination) {
      coordination = await dep('first')('date_coordination', pairQuery(user.id, match.match_user_id))
        || await dep('first')('date_coordination', pairQuery(match.match_user_id, user.id))
    }
    const participant = coordination
      && [Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(user.id))
    const samePair = coordination
      && [Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(match.match_user_id))
    if (!participant || !samePair) throw new Error('无权反馈该约会')
    return coordination
  }

  async function dateFeedbackWindow(coordination) {
    if (!coordination || coordination.status !== 'arranged') {
      return { can_submit: false, reason: '约会协调尚未完成安排', proposal_date: '' }
    }
    const finalProposalId = Number(coordination.final_proposal_id || 0)
    let proposal = finalProposalId
      ? await dep('byId')('date_coordination_proposal', finalProposalId)
      : null
    if (!proposal) {
      proposal = await dep('first')('date_coordination_proposal', {
        coordination_id: Number(coordination.id),
        status: 'active'
      })
    }
    const proposalDate = String(proposal && proposal.date || '').slice(0, 10)
    if (!proposalDate) {
      return { can_submit: false, reason: '约会日期尚未确认', proposal_date: '' }
    }
    return dateFeedbackWindowState(proposal, dep('now')())
  }

  async function ensureReviewTicket(input) {
    if (!input.feedback.request_human_review) return null
    const feedbackKey = `${input.type}:${Number(input.match.id)}:${Number(input.user.id)}`
    const existing = await dep('first')('agent_human_ticket', { feedback_key: feedbackKey })
    if (existing) return existing

    let session = await dep('first')('agent_session', {
      user_id: Number(input.user.id),
      agent_type: 'platform_service',
      status: 'active'
    })
    if (!session) {
      session = await dep('addWithId')('agent_session', {
        user_id: Number(input.user.id),
        agent_type: 'platform_service',
        coordination_id: Number(input.coordination && input.coordination.id || 0),
        status: 'active',
        summary: '',
        unresolved_count: 0
      }, 'agent_session')
    }

    const isUrgent = input.type === 'date'
      && (input.feedback.safety === 'unsafe' || input.feedback.authenticity === 'major_gap')
    const structuredSummary = input.type === 'match'
      ? `用户申请复核匹配结果；结论：${input.feedback.verdict}；原因：${input.feedback.reasons.join(',') || '未选择'}`
      : `用户申请复核约会反馈；见面：${input.feedback.met_status}；真实性：${input.feedback.authenticity}；安全：${input.feedback.safety}`
    return dep('addWithId')('agent_human_ticket', {
      session_id: Number(session.id),
      user_id: Number(input.user.id),
      coordination_id: Number(input.coordination && input.coordination.id || 0),
      priority: isUrgent ? 'P1' : 'P2',
      category: input.type === 'match' ? 'match_feedback_review' : 'date_feedback_review',
      summary: structuredSummary.slice(0, 500),
      status: 'open',
      service_provider: 'internal',
      external_ticket_id: '',
      external_contact_url: '',
      assigned_agent: '',
      handoff_status: 'internal_pending',
      handoff_at: null,
      feedback_key: feedbackKey,
      match_log_id: Number(input.match.id)
    }, 'agent_ticket')
  }

  async function getMatch(data, wxContext) {
    const owned = await ownMatch(data, wxContext)
    const row = await dep('first')('match_experience_feedback', {
      match_log_id: Number(owned.match.id),
      user_id: Number(owned.user.id)
    })
    return publicFeedback(row)
  }

  async function saveMatch(data, wxContext) {
    const owned = await ownMatch(data, wxContext)
    const normalized = normalizeMatchFeedback(data)
    const timestamp = dep('now')()
    const query = {
      match_log_id: Number(owned.match.id),
      user_id: Number(owned.user.id)
    }
    const existing = await dep('first')('match_experience_feedback', query)
    const payload = Object.assign({}, normalized, query, {
      match_user_id: Number(owned.match.match_user_id),
      create_time: existing && existing.create_time ? existing.create_time : timestamp,
      update_time: timestamp
    })
    const saved = await dep('setDoc')(
      'match_experience_feedback',
      matchFeedbackDocId(owned.match.id, owned.user.id),
      payload
    )
    await ensureReviewTicket({
      type: 'match',
      user: owned.user,
      match: owned.match,
      feedback: normalized,
      coordination: null
    })
    return publicFeedback(saved)
  }

  async function dateEligibility(data, wxContext) {
    const owned = await ownMatch(data, wxContext)
    let coordination = null
    try {
      coordination = await findCoordination(data, owned.user, owned.match)
    } catch (err) {
      return { can_submit: false, coordination_id: 0, reason: '该匹配尚未完成约会安排' }
    }
    const window = await dateFeedbackWindow(coordination)
    return {
      can_submit: window.can_submit,
      coordination_id: Number(coordination.id || 0),
      proposal_date: window.proposal_date,
      reason: window.reason
    }
  }

  async function getDate(data, wxContext) {
    const eligibility = await dateEligibility(data, wxContext)
    if (!eligibility.can_submit) return Object.assign({ feedback: null }, eligibility)
    const owned = await ownMatch(data, wxContext)
    const row = await dep('first')('date_experience_feedback', {
      match_log_id: Number(owned.match.id),
      user_id: Number(owned.user.id)
    })
    return Object.assign({ feedback: publicFeedback(row) }, eligibility)
  }

  async function saveDate(data, wxContext) {
    const owned = await ownMatch(data, wxContext)
    const coordination = await findCoordination(data, owned.user, owned.match)
    const window = await dateFeedbackWindow(coordination)
    if (!window.can_submit) throw new Error(window.reason)
    const normalized = normalizeDateFeedback(data)
    const timestamp = dep('now')()
    const query = {
      match_log_id: Number(owned.match.id),
      user_id: Number(owned.user.id)
    }
    const existing = await dep('first')('date_experience_feedback', query)
    const payload = Object.assign({}, normalized, query, {
      coordination_id: Number(coordination.id),
      match_user_id: Number(owned.match.match_user_id),
      create_time: existing && existing.create_time ? existing.create_time : timestamp,
      update_time: timestamp
    })
    const saved = await dep('setDoc')(
      'date_experience_feedback',
      dateFeedbackDocId(owned.match.id, owned.user.id),
      payload
    )
    await ensureReviewTicket({
      type: 'date',
      user: owned.user,
      match: owned.match,
      feedback: normalized,
      coordination
    })
    return publicFeedback(saved)
  }

  return {
    getMatch,
    saveMatch,
    dateEligibility,
    getDate,
    saveDate
  }
}

const handlers = createExperienceFeedbackHandlers()

module.exports = Object.assign({ createExperienceFeedbackHandlers }, handlers)
