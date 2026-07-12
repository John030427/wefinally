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

function ticketDto(row) {
  return {
    id: row.id,
    ticket_ref: ref('T', row.id),
    session_ref: ref('S', row.session_id),
    user_ref: ref('U', row.user_id),
    coordination_ref: row.coordination_id ? ref('D', row.coordination_id) : '',
    priority: row.priority,
    category: row.category,
    summary: String(row.summary || '').slice(0, 500),
    status: row.status,
    create_time: row.create_time,
    update_time: row.update_time
  }
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

function coordinationDto(row) {
  return {
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
}

function createAgentBackofficeService(deps) {
  if (!deps) throw new Error('Agent backoffice dependencies are required')

  async function listTickets(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const query = filters.status ? { status: filters.status } : {}
    const rows = await deps.list('agent_human_ticket', query, 200)
    return rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).map(ticketDto)
  }

  async function replyTicket(actor, ticketId, content) {
    requireRole(actor, ['super_admin', 'customer_service'])
    const ticket = await deps.byId('agent_human_ticket', Number(ticketId || 0))
    if (!ticket || ticket.status === 'closed') throw new Error('人工工单不存在或已关闭')
    const session = await deps.byId('agent_session', ticket.session_id)
    if (!session) throw new Error('Agent会话不存在')
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
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const query = filters.status ? { status: filters.status } : {}
    const rows = await deps.list('date_coordination', query, 200)
    return rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).map(coordinationDto)
  }

  return {
    listTickets,
    replyTicket,
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
