const KNOWLEDGE_CATEGORIES = Object.freeze([
  'platform_faq',
  'platform_rules',
  'member_vip',
  'matching',
  'dating_safety',
  'first_date',
  'communication',
  'relationship_boundaries',
  'original_articles'
])
const { isTestUser, projectUserIdentity, supportCodeFor } = require('./userIdentity')
const { buildCoordinationOperatorView } = require('../lib/coordinationOperatorView')

function adminRole(actor) {
  if (!actor || actor.role !== 'admin') throw new Error('无权访问Agent后台')
  return String(actor.admin_role || 'super_admin')
}

function requireRole(actor, allowed) {
  const role = adminRole(actor)
  if (!allowed.includes(role)) throw new Error('无权执行该后台操作')
  return role
}

function ref(prefix, value) {
  return `WF-${prefix}-${String(Number(value || 0)).padStart(6, '0')}`
}

function refId(value, prefix) {
  const text = String(value || '').trim()
  const matched = text.match(new RegExp(`^WF-${prefix}-(\\d+)$`, 'i'))
  if (matched) return Number(matched[1])
  return /^\d+$/.test(text) ? Number(text) : 0
}

function ticketDto(row, user) {
  return {
    id: row.id,
    ticket_ref: ref('T', row.id),
    session_ref: ref('S', row.session_id),
    user_ref: user ? (supportCodeFor(user) || ref('U', row.user_id)) : ref('U', row.user_id),
    user: user ? projectUserIdentity(user, { includeSensitive: false }) : undefined,
    coordination_ref: row.coordination_id ? ref('D', row.coordination_id) : '',
    priority: row.priority,
    category: row.category,
    summary: String(row.summary || '').slice(0, 500),
    status: row.status,
    assigned_admin_ref: row.assigned_admin_id ? ref('A', row.assigned_admin_id) : '',
    handoff_status: String(row.handoff_status || ''),
    last_reply_at: row.last_reply_at || null,
    create_time: row.create_time,
    update_time: row.update_time
  }
}

function sessionDto(row, user) {
  return {
    id: row.id,
    session_ref: ref('S', row.id),
    user_ref: user ? (supportCodeFor(user) || ref('U', row.user_id)) : ref('U', row.user_id),
    user: user ? projectUserIdentity(user, { includeSensitive: false }) : undefined,
    coordination_ref: row.coordination_id ? ref('D', row.coordination_id) : '',
    agent_type: String(row.agent_type || ''),
    status: String(row.status || ''),
    summary: String(row.summary || '').slice(0, 500),
    create_time: row.create_time,
    update_time: row.update_time
  }
}

function messageDto(row) {
  const senderType = ['user', 'agent', 'human_agent', 'system'].includes(String(row.sender_type || ''))
    ? String(row.sender_type)
    : (row.role === 'user' ? 'user' : 'agent')
  return {
    source_type: 'message',
    message_ref: ref('M', row.id),
    role: row.role === 'user' ? 'user' : 'assistant',
    sender_type: senderType,
    content: String(row.content || '').slice(0, 2000),
    event_type: String(row.event_type || ''),
    notification_job_ref: row.notification_job_id ? ref('N', row.notification_job_id) : '',
    risk_level: String(row.risk_level || ''),
    create_time: row.create_time
  }
}

function runDto(row) {
  return {
    run_ref: ref('R', row.id),
    provider: String(row.provider || ''),
    status: String(row.status || ''),
    error_code: String(row.error_code || '').slice(0, 100),
    create_time: row.create_time
  }
}

function notificationJobDto(row) {
  return {
    job_ref: ref('N', row.id),
    stage: String(row.stage || ''),
    status: String(row.status || ''),
    attempts: Number(row.attempts || 0),
    error_code: String(row.error_code || '').slice(0, 100),
    create_time: row.create_time,
    sent_at: row.sent_at || null
  }
}

function coordinationEventDto(row) {
  const eventType = String(row.event_type || 'coordination_updated')
  const content = ({
    application_sent: '约会申请已提交，系统开始等待另一方回应。',
    preference_changed: '约会偏好修改已确认，系统已重新计算双方交集。',
    proposal_generated: '系统已生成新的候选方案。',
    proposal_confirmed: '一方已确认候选方案。',
    coordination_arranged: '双方已确认同一方案，协调状态已完成。'
  })[eventType] || '约会协调状态已更新。'
  return {
    source_type: 'coordination_event',
    event_ref: ref('E', row.id),
    role: 'assistant',
    sender_type: 'system',
    event_type: eventType,
    content,
    coordination_version: Number(row.coordination_version || 1),
    create_time: row.create_time
  }
}

function notificationTimelineDto(row) {
  const stage = String(row.stage || 'notification')
  const status = String(row.status || 'pending')
  const action = ({
    invitation_created: '约会协调邀请',
    invitation: '邀请提醒',
    application: '偏好表单提醒',
    proposal_generated: '候选方案通知',
    confirmation: '方案确认提醒',
    preference_changed: '偏好变更通知'
  })[stage] || '自动通知'
  const state = ({ pending: '等待发送', sent: '已发送', expired: '已过期', failed: '发送失败' })[status] || status
  return {
    source_type: 'notification',
    notification_job_ref: ref('N', row.id),
    role: 'assistant',
    sender_type: 'system',
    event_type: stage,
    content: `${action}：${state}。`,
    create_time: row.sent_at || row.create_time
  }
}

function timeValue(value) {
  const raw = value && typeof value === 'object' && value.$date !== undefined ? value.$date : value
  const time = new Date(raw || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function buildTimeline(messages, events, notificationJobs) {
  const messageItems = messages.map(messageDto)
  const deliveredJobRefs = new Set(messageItems.map((item) => item.notification_job_ref).filter(Boolean))
  const notificationItems = notificationJobs
    .filter((row) => !deliveredJobRefs.has(ref('N', row.id)))
    .map(notificationTimelineDto)
  return messageItems
    .concat(events.map(coordinationEventDto), notificationItems)
    .sort((a, b) => timeValue(a.create_time) - timeValue(b.create_time))
}

function knowledgeDto(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    summary: row.summary || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    audience: row.audience || 'all_registered',
    risk_level: row.risk_level || 'low',
    status: row.status || 'draft',
    version: Number(row.version || 1),
    reviewer_id: Number(row.reviewer_id || 0),
    effective_at: row.effective_at || null,
    expired_at: row.expired_at || null,
    source_type: row.source_type || 'platform_original',
    create_time: row.create_time,
    update_time: row.update_time
  }
}

function coordinationDto(row, operatorView) {
  const base = {
    id: row.id,
    coordination_ref: ref('D', row.id),
    participant_refs: [ref('U', row.user_a_id), ref('U', row.user_b_id)],
    status: row.status,
    coordination_version: Number(row.coordination_version || 1),
    recoordination_count: Number(row.recoordination_count || 0),
    missing_dimensions: Array.isArray(row.missing_dimensions) ? row.missing_dimensions : [],
    invitation_deadline_at: row.invitation_deadline_at || null,
    application_deadline_at: row.application_deadline_at || null,
    confirmation_deadline_at: row.confirmation_deadline_at || null,
    create_time: row.create_time,
    update_time: row.update_time
  }
  if (operatorView) base.operator_view = operatorView
  return base
}

function createAgentBackofficeService(deps, options = {}) {
  if (!deps) throw new Error('Agent backoffice dependencies are required')
  const userBackoffice = options.userBackoffice || null

  async function userRowsById(rows) {
    const result = new Map()
    for (const id of Array.from(new Set(rows.map((row) => Number(row.user_id || 0)).filter(Boolean)))) {
      result.set(id, await deps.byId('user', id))
    }
    return result
  }

  async function pairedConversationProjection(coordination, selectedSessionId, coordinationEvents) {
    if (!coordination) return null
    const sessions = (await deps.list('agent_session', { coordination_id: Number(coordination.id) }, 100))
      .filter((row) => row.agent_type === 'date_coordinator')
    async function projectSide(label, userId) {
      const session = sessions
        .filter((row) => Number(row.user_id) === Number(userId))
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
      if (!session) return null
      const [user, messages, runs, notificationJobs] = await Promise.all([
        deps.byId('user', userId),
        deps.list('agent_message', { session_id: session.id }, 500),
        deps.list('agent_run', { session_id: session.id }, 100),
        deps.list('agent_notification_job', { coordination_id: coordination.id, user_id: userId }, 100)
      ])
      const orderedMessages = messages.sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
      return {
        side: label,
        selected: Number(session.id) === Number(selectedSessionId),
        session: sessionDto(session, user),
        messages: orderedMessages.map(messageDto),
        timeline: buildTimeline(orderedMessages, [], notificationJobs),
        runs: runs.sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).map(runDto),
        notification_jobs: notificationJobs
          .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
          .map(notificationJobDto)
      }
    }
    const [sideA, sideB] = await Promise.all([
      projectSide('A', coordination.user_a_id),
      projectSide('B', coordination.user_b_id)
    ])
    return {
      read_only: true,
      coordination: await enrichCoordination(coordination),
      sides: {
        a: sideA,
        b: sideB
      },
      shared_events: coordinationEvents
        .slice()
        .sort((a, b) => timeValue(a.create_time) - timeValue(b.create_time))
        .map(coordinationEventDto)
    }
  }

  function includeTest(filters) {
    return filters.include_test === true || String(filters.include_test || '') === '1'
  }

  async function enrichCoordination(row) {
    if (!row) return null
    let confirmations = []
    try {
      confirmations = await deps.list('date_coordination_confirmation', {
        coordination_id: Number(row.id)
      }, 100)
    } catch (err) {
      confirmations = []
    }
    const operatorView = buildCoordinationOperatorView(row, {
      confirmations,
      a_ref: ref('U', row.user_a_id),
      b_ref: ref('U', row.user_b_id),
      coordination_ref: ref('D', row.id)
    })
    return coordinationDto(row, operatorView)
  }

  async function listTickets(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const query = filters.status ? { status: filters.status } : {}
    const rows = await deps.list('agent_human_ticket', query, 200)
    const users = await userRowsById(rows)
    return rows
      .filter((row) => includeTest(filters) || !isTestUser(users.get(Number(row.user_id))))
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .map((row) => ticketDto(row, users.get(Number(row.user_id))))
  }

  async function ticketDetail(actor, ticketId) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const ticket = await deps.byId('agent_human_ticket', Number(ticketId || 0))
    if (!ticket) throw new Error('人工工单不存在')
    const session = await deps.byId('agent_session', ticket.session_id)
    if (!session) throw new Error('Agent会话不存在')
    const user = await deps.byId('user', ticket.user_id)
    const messages = await deps.list('agent_message', { session_id: session.id }, 200)
    const runs = await deps.list('agent_run', { session_id: session.id }, 50)
    const coordination = ticket.coordination_id
      ? await deps.byId('date_coordination', ticket.coordination_id)
      : null
    const notificationJobs = ticket.coordination_id
      ? await deps.list('agent_notification_job', { coordination_id: ticket.coordination_id, user_id: ticket.user_id }, 100)
      : []
    const coordinationEvents = ticket.coordination_id
      ? await deps.list('date_coordination_event', { coordination_id: ticket.coordination_id }, 200)
      : []
    const result = {
      ticket: ticketDto(ticket, user),
      session: sessionDto(session, user),
      messages: messages
        .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
        .map(messageDto),
      timeline: buildTimeline(messages, coordinationEvents, notificationJobs),
      coordination: coordination ? await enrichCoordination(coordination) : null,
      runs: runs
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        .map(runDto),
      notification_jobs: notificationJobs
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        .map(notificationJobDto)
    }
    if (coordination) {
      result.paired_conversation = await pairedConversationProjection(
        coordination,
        session.id,
        coordinationEvents
      )
    }
    if (userBackoffice) result.user_context = await userBackoffice.userContext(actor, ticket.user_id)
    return result
  }

  async function listConversations(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const coordinationId = refId(filters.coordination_ref, 'D')
    const sessionId = refId(filters.session_ref, 'S')
    const userId = refId(filters.user_ref, 'U')
    let rows
    if (sessionId) {
      const session = await deps.byId('agent_session', sessionId)
      rows = session ? [session] : []
    } else if (coordinationId) {
      rows = await deps.list('agent_session', { coordination_id: coordinationId }, 200)
    } else if (userId) {
      rows = await deps.list('agent_session', { user_id: userId }, 200)
    } else {
      rows = await deps.list('agent_session', {}, 200)
    }
    const users = await userRowsById(rows)
    const query = String(filters.query || '').trim().toLowerCase()
    return rows
      .filter((row) => includeTest(filters) || !isTestUser(users.get(Number(row.user_id))))
      .filter((row) => {
        const user = users.get(Number(row.user_id))
        return !query || [
          ref('S', row.id),
          user ? (supportCodeFor(user) || ref('U', row.user_id)) : ref('U', row.user_id),
          user ? projectUserIdentity(user, { includeSensitive: false }).display_label : '',
          row.coordination_id ? ref('D', row.coordination_id) : '',
          row.agent_type,
          row.status,
          row.summary
        ].join(' ').toLowerCase().includes(query)
      })
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .map((row) => sessionDto(row, users.get(Number(row.user_id))))
  }

  async function conversationDetail(actor, sessionId) {
    const viewerRole = requireRole(actor, ['super_admin', 'customer_service'])
    const session = await deps.byId('agent_session', Number(sessionId || 0))
    if (!session) throw new Error('Agent会话不存在')
    const user = await deps.byId('user', session.user_id)
    const messages = await deps.list('agent_message', { session_id: session.id }, 500)
    const runs = await deps.list('agent_run', { session_id: session.id }, 100)
    const coordination = session.coordination_id
      ? await deps.byId('date_coordination', session.coordination_id)
      : null
    const notificationJobs = session.coordination_id
      ? await deps.list('agent_notification_job', { coordination_id: session.coordination_id, user_id: session.user_id }, 100)
      : []
    const coordinationEvents = session.coordination_id
      ? await deps.list('date_coordination_event', { coordination_id: session.coordination_id }, 200)
      : []
    await deps.addWithId('partner_user_audit_log', {
      actor_role: 'admin',
      actor_id: actor.id,
      admin_role: viewerRole,
      action: 'view_agent_conversation',
      session_id: session.id,
      coordination_id: Number(session.coordination_id || 0),
      user_id: session.user_id,
      reason: 'authorized_backoffice_read'
    }, 'member_audit')
    const result = {
      read_only: true,
      session: sessionDto(session, user),
      messages: messages
        .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
        .map(messageDto),
      timeline: buildTimeline(messages, coordinationEvents, notificationJobs),
      coordination: coordination ? await enrichCoordination(coordination) : null,
      runs: runs
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        .map(runDto),
      notification_jobs: notificationJobs
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        .map(notificationJobDto)
    }
    if (coordination) {
      result.paired_conversation = await pairedConversationProjection(
        coordination,
        session.id,
        coordinationEvents
      )
    }
    if (userBackoffice) result.user_context = await userBackoffice.userContext(actor, session.user_id)
    return result
  }

  async function replyTicket(actor, ticketId, content) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const ticket = await deps.byId('agent_human_ticket', Number(ticketId || 0))
    if (!ticket || ticket.status === 'closed') throw new Error('人工工单不存在或已关闭')
    const session = await deps.byId('agent_session', ticket.session_id)
    if (!session) throw new Error('Agent会话不存在')
    return writeHumanReply(actor, ticket, session, content)
  }

  async function writeHumanReply(actor, ticket, session, content) {
    const reply = String(content || '').trim().slice(0, 1000)
    if (!reply) throw new Error('请输入人工回复内容')
    await deps.addWithId('agent_message', {
      session_id: session.id,
      user_id: ticket.user_id,
      agent_type: session.agent_type,
      role: 'assistant',
      sender_type: 'human_agent',
      content: reply,
      operator_id: actor.id
    }, 'agent_message')
    await deps.updateByDoc('agent_human_ticket', ticket, {
      status: 'processing',
      assigned_admin_id: actor.id,
      last_reply_at: deps.now()
    })
    return ticketDto(ticket)
  }

  async function replyConversation(actor, sessionId, content) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const session = await deps.byId('agent_session', Number(sessionId || 0))
    if (!session) throw new Error('Agent会话不存在')
    let ticket = await deps.first('agent_human_ticket', { session_id: session.id })
    let created = false
    if (!ticket || ticket.status === 'closed') {
      ticket = await deps.addWithId('agent_human_ticket', {
        session_id: session.id,
        user_id: session.user_id,
        coordination_id: Number(session.coordination_id || 0),
        priority: 'P2',
        category: 'user_request',
        summary: '管理员从会话工作台发起人工处理',
        status: 'open',
        assigned_admin_id: actor.id,
        handoff_status: 'internal_processing'
      }, 'agent_human_ticket')
      created = true
    }
    const updated = await writeHumanReply(actor, ticket, session, content)
    return { created, ticket: updated }
  }

  async function closeTicket(actor, ticketId, input = {}) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const ticket = await deps.byId('agent_human_ticket', Number(ticketId || 0))
    if (!ticket) throw new Error('人工工单不存在')
    const session = await deps.byId('agent_session', ticket.session_id)
    await deps.updateByDoc('agent_human_ticket', ticket, {
      status: 'closed',
      resolution_note: String(input.note || '').trim().slice(0, 500),
      closed_by: actor.id,
      closed_at: deps.now()
    })
    if (session) {
      await deps.updateByDoc('agent_session', session, {
        status: input.resume_agent === true ? 'active' : 'closed'
      })
    }
    return ticketDto(ticket)
  }

  async function listKnowledge(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const query = filters.status ? { status: filters.status } : {}
    const rows = await deps.list('knowledge_article', query, 200)
    return rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).map(knowledgeDto)
  }

  async function saveKnowledge(actor, input, id) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const category = String(input.category || '')
    if (!KNOWLEDGE_CATEGORIES.includes(category)) throw new Error('知识分类无效')
    const title = String(input.title || '').trim().slice(0, 160)
    const content = String(input.content || '').trim().slice(0, 10000)
    if (!title || !content) throw new Error('请填写知识标题和正文')
    const data = {
      category,
      title,
      content,
      summary: String(input.summary || '').trim().slice(0, 500),
      tags: Array.from(new Set(Array.isArray(input.tags) ? input.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [])),
      audience: String(input.audience || 'all_registered').slice(0, 40),
      risk_level: String(input.risk_level || 'low').slice(0, 20),
      status: 'draft',
      source_type: String(input.source_type || 'platform_original').slice(0, 40),
      author_id: actor.id,
      reviewer_id: 0,
      effective_at: null,
      expired_at: input.expired_at || null
    }
    if (id) {
      const existing = await deps.byId('knowledge_article', Number(id))
      if (!existing) throw new Error('知识文章不存在')
      data.version = Number(existing.version || 1) + 1
      return knowledgeDto(await deps.updateByDoc('knowledge_article', existing, data))
    }
    data.version = 1
    return knowledgeDto(await deps.addWithId('knowledge_article', data, 'knowledge_article'))
  }

  async function publishKnowledge(actor, id) {
    requireRole(actor, ['super_admin', 'auditor'])
    const article = await deps.byId('knowledge_article', Number(id || 0))
    if (!article) throw new Error('知识文章不存在')
    return knowledgeDto(await deps.updateByDoc('knowledge_article', article, {
      status: 'published',
      reviewer_id: actor.id,
      effective_at: deps.now()
    }))
  }

  async function unpublishKnowledge(actor, id) {
    requireRole(actor, ['super_admin', 'auditor'])
    const article = await deps.byId('knowledge_article', Number(id || 0))
    if (!article) throw new Error('知识文章不存在')
    return knowledgeDto(await deps.updateByDoc('knowledge_article', article, { status: 'offline' }))
  }

  async function listCoordinations(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const query = filters.status ? { status: filters.status } : {}
    const rows = await deps.list('date_coordination', query, 200)
    const sorted = rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    return Promise.all(sorted.map((row) => enrichCoordination(row)))
  }

  return {
    listTickets,
    ticketDetail,
    listConversations,
    conversationDetail,
    replyTicket,
    replyConversation,
    closeTicket,
    listKnowledge,
    saveKnowledge,
    publishKnowledge,
    unpublishKnowledge,
    listCoordinations
  }
}

module.exports = {
  KNOWLEDGE_CATEGORIES,
  createAgentBackofficeService
}
