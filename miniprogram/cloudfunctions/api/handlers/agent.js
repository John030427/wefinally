const { AGENT_TYPES, isAgentType } = require('../agent/types')
const { RISK, classifyRisk, sanitizeOutput } = require('../agent/safety')
const { buildContext } = require('../agent/context')
const { searchReviewedKnowledge } = require('../agent/knowledge')
const { generateDecision } = require('../agent/provider')
const { TOOL_NAMES, inferTool, executeTool } = require('../agent/toolRegistry')

const FREE_DAILY_LIMIT = 5
const VIP_DAILY_LIMIT = 30

function defaultDeps() {
  const db = require('../lib/db')
  return {
    currentUser: require('./user').currentUser,
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    now: db.now,
    generateDecision
  }
}

function publicSession(row) {
  return {
    id: row.id,
    agent_type: row.agent_type,
    status: row.status || 'active',
    coordination_id: Number(row.coordination_id || 0),
    summary: String(row.summary || '').slice(0, 800),
    create_time: row.create_time,
    update_time: row.update_time
  }
}

function publicMessage(row) {
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    sender_type: row.sender_type || (row.role === 'user' ? 'user' : 'agent'),
    content: sanitizeOutput(String(row.content || '')).slice(0, 2000),
    create_time: row.create_time
  }
}

function isVip(user, now) {
  if (Number(user.free_member || 0) === 1) return true
  if (Number(user.is_vip || 0) !== 1) return false
  return !user.vip_expire_time || new Date(user.vip_expire_time) > now
}

function dayKey(value) {
  const date = new Date(value)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function riskReply(category) {
  if (category === RISK.INJECTION) return '我不能忽略平台规则、展示系统提示词或执行未授权操作，但可以继续帮助你处理平台和健康恋爱相关问题。'
  if (category === RISK.PRIVACY) return '我不能查询或透露其他用户的隐私、联系方式或后台数据。涉及你自己的平台状态，我可以通过安全工具帮你查询。'
  if (category === RISK.IRRELEVANT) return '这个请求不在 WeFinally 平台与健康恋爱助手的服务范围内。我们可以聊注册、会员、匹配、约会安全或关系沟通。'
  return '听起来你现在可能正处在很难受或有现实危险的处境。请先远离危险物品和冲突现场，尽快联系可信任的人陪在身边；如果存在立即危险，请联系当地紧急服务。平台也已将情况转交人工关注。'
}

function createAgentHandlers(overrides = {}) {
  let defaults = null
  function dep(name) {
    if (overrides[name]) return overrides[name]
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function ownedSession(sessionId, user) {
    const session = await dep('byId')('agent_session', Number(sessionId || 0))
    if (!session) throw new Error('会话不存在')
    if (Number(session.user_id) !== Number(user.id)) throw new Error('无权访问该会话')
    return session
  }

  async function saveMessage(session, user, role, content, extra = {}) {
    return dep('addWithId')('agent_message', Object.assign({
      session_id: session.id,
      user_id: user.id,
      agent_type: session.agent_type,
      role,
      sender_type: role === 'user' ? 'user' : 'agent',
      content: sanitizeOutput(String(content || '')).slice(0, 2000)
    }, extra), 'agent_message')
  }

  async function createSession(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const agentType = String(data.agent_type || data.agentType || AGENT_TYPES.PLATFORM_SERVICE)
    if (!isAgentType(agentType)) throw new Error('不支持的AI助手类型')
    const coordinationId = Number(data.coordination_id || data.coordinationId || 0)
    if (agentType === AGENT_TYPES.DATE_COORDINATOR) {
      if (!coordinationId) throw new Error('约会协调会话缺少协调任务')
      const coordination = await dep('byId')('date_coordination', coordinationId)
      if (!coordination || ![Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(user.id))) {
        throw new Error('无权进入该约会协调会话')
      }
    }
    const sessions = await dep('list')('agent_session', { user_id: user.id, agent_type: agentType }, 100)
    const reusable = sessions
      .filter((row) => !['closed', 'cancelled'].includes(row.status))
      .filter((row) => agentType !== AGENT_TYPES.DATE_COORDINATOR || Number(row.coordination_id) === coordinationId)
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
    if (reusable) return publicSession(reusable)
    const row = await dep('addWithId')('agent_session', {
      user_id: user.id,
      agent_type: agentType,
      coordination_id: coordinationId,
      status: 'active',
      summary: '',
      unresolved_count: 0
    }, 'agent_session')
    return publicSession(row)
  }

  async function messages(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const session = await ownedSession(data.id || data.session_id || data.sessionId, user)
    const rows = await dep('list')('agent_message', { session_id: session.id }, 100)
    rows.sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    return { session: publicSession(session), messages: rows.map(publicMessage) }
  }

  async function createTicketFor(session, user, input) {
    const existing = (await dep('list')('agent_human_ticket', { session_id: session.id }, 100))
      .find((row) => ['open', 'processing'].includes(row.status))
    if (existing) return existing
    const ticket = await dep('addWithId')('agent_human_ticket', {
      session_id: session.id,
      user_id: user.id,
      coordination_id: Number(session.coordination_id || 0),
      priority: input.priority || 'P2',
      category: String(input.category || 'general').slice(0, 50),
      summary: String(input.summary || '').slice(0, 500),
      status: 'open'
    }, 'agent_ticket')
    await dep('updateByDoc')('agent_session', session, { status: 'manual_pending' })
    return ticket
  }

  async function createHumanTicket(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const session = await ownedSession(data.session_id || data.sessionId, user)
    const ticket = await createTicketFor(session, user, {
      priority: data.priority || 'P2',
      category: data.category || 'general',
      summary: data.summary || '用户请求人工客服'
    })
    return {
      id: ticket.id,
      priority: ticket.priority,
      category: ticket.category,
      status: ticket.status,
      create_time: ticket.create_time
    }
  }

  async function enforceLoveQuota(user) {
    const rows = await dep('list')('agent_message', { user_id: user.id, agent_type: AGENT_TYPES.LOVE_ADVISOR }, 200)
    const today = dayKey(dep('now')())
    const used = rows.filter((row) => row.role === 'user' && dayKey(row.create_time) === today).length
    const limit = isVip(user, dep('now')()) ? VIP_DAILY_LIMIT : FREE_DAILY_LIMIT
    if (used >= limit) throw new Error(`今日体验次数已用完（${limit}次），明天再来聊聊吧`)
    return { used, limit, remaining: limit - used }
  }

  async function recentTurns(session) {
    const rows = await dep('list')('agent_message', { session_id: session.id }, 100)
    rows.sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    const turns = []
    for (const row of rows.slice(-16)) {
      if (row.role === 'user') turns.push({ user: row.content, assistant: '' })
      else if (turns.length) turns[turns.length - 1].assistant = row.content
    }
    return turns
  }

  async function recordTool(session, user, tool, status, errorCode = '') {
    return dep('addWithId')('agent_tool_call', {
      session_id: session.id,
      user_id: user.id,
      tool_name: tool,
      permission_granted: status === 'completed',
      status,
      error_code: String(errorCode || '').slice(0, 80)
    }, 'agent_tool_call')
  }

  async function send(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const session = await ownedSession(data.session_id || data.sessionId, user)
    const content = String(data.message || data.content || '').trim()
    if (!content) throw new Error('请输入内容')
    if (session.status === 'manual_pending') {
      return { session_id: session.id, agent_type: session.agent_type, reply: '你的会话已转人工客服，请耐心等待工作人员回复。', manual_pending: true }
    }
    if (session.agent_type === AGENT_TYPES.LOVE_ADVISOR) await enforceLoveQuota(user)
    await saveMessage(session, user, 'user', content)

    const risk = classifyRisk(content)
    if (!risk.allowed) {
      if (risk.category === RISK.HIGH_RISK) {
        await createTicketFor(session, user, { priority: 'P0', category: 'safety_crisis', summary: '系统识别到高风险求助，请人工尽快查看' })
      }
      const reply = riskReply(risk.category)
      await saveMessage(session, user, 'assistant', reply, { risk_level: risk.category })
      return { session_id: session.id, agent_type: session.agent_type, reply, risk_level: risk.category, manual_pending: risk.category === RISK.HIGH_RISK }
    }

    if (session.agent_type === AGENT_TYPES.DATE_COORDINATOR) {
      const coordination = await dep('byId')('date_coordination', Number(session.coordination_id || 0))
      if (!coordination || ![Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(user.id))) {
        throw new Error('无权读取该约会协调任务')
      }
      const statusText = {
        inviting_partner: '正在等待对方确认是否参与协调',
        collecting_preferences: '正在分别填写约会偏好',
        computing_overlap: '正在计算双方条件交集',
        waiting_confirmations: '已有候选方案，正在等待双方确认同一个方案',
        no_overlap: '暂时没有完整交集，可以调整偏好重新协调',
        replanning: '正在进行新一轮偏好协调',
        arranged: '双方已确认同一个方案，约会安排已经形成',
        manual_handoff: '自动协调已暂停，正在等待人工客服协助',
        expired: '当前协调已过期'
      }[coordination.status] || '协调任务正在处理中'
      const reply = `当前进度：${statusText}。我只会说明共同进度，不会展示对方的原始回答。`
      await recordTool(session, user, TOOL_NAMES.DATE_COORDINATION, 'completed')
      await saveMessage(session, user, 'assistant', reply)
      return {
        session_id: session.id,
        agent_type: session.agent_type,
        reply,
        tool: TOOL_NAMES.DATE_COORDINATION,
        risk_level: 'safe'
      }
    }

    const tool = session.agent_type === AGENT_TYPES.PLATFORM_SERVICE ? inferTool(content) : ''
    if (tool === TOOL_NAMES.HUMAN_TICKET) {
      await recordTool(session, user, tool, 'completed')
      await createTicketFor(session, user, { priority: 'P2', category: 'user_request', summary: content })
      const reply = '已为你转接人工客服，工作人员会在服务时间内查看并回复。'
      await saveMessage(session, user, 'assistant', reply)
      return { session_id: session.id, agent_type: session.agent_type, reply, tool, manual_pending: true }
    }
    if (tool) {
      try {
        const result = await executeTool(tool, user, {
          list: dep('list'),
          first: dep('first'),
          byId: dep('byId'),
          now: dep('now')
        })
        await recordTool(session, user, tool, 'completed')
        await saveMessage(session, user, 'assistant', result.reply)
        return { session_id: session.id, agent_type: session.agent_type, reply: result.reply, tool, risk_level: 'safe' }
      } catch (err) {
        await recordTool(session, user, tool, 'failed', 'tool_failed')
        const reply = '暂时无法查询你的实时状态，请稍后重试或联系人工客服。'
        await saveMessage(session, user, 'assistant', reply)
        return { session_id: session.id, agent_type: session.agent_type, reply, tool, tool_failed: true }
      }
    }

    if (session.agent_type === AGENT_TYPES.LOVE_ADVISOR && /会员|审核|VIP|匹配状态|订单|退款/.test(content)) {
      const reply = '这是平台业务问题，请前往“我的 → 平台AI客服”查询真实状态。'
      await saveMessage(session, user, 'assistant', reply)
      return { session_id: session.id, agent_type: session.agent_type, reply, suggested_actions: ['open_platform_service'] }
    }

    const records = await dep('list')('knowledge_article', {}, 200)
    const knowledge = searchReviewedKnowledge(records, content, 4)
    if (!knowledge.length) {
      const reply = session.agent_type === AGENT_TYPES.LOVE_ADVISOR
        ? '现有知识库对这个问题的信息有限，我不想凭空给你专业结论。你可以换个角度描述，或联系人工客服。'
        : '现有平台资料暂时没有可靠答案。涉及真实业务状态时，请说明具体想查询的项目或联系人工客服。'
      await saveMessage(session, user, 'assistant', reply)
      return { session_id: session.id, agent_type: session.agent_type, reply, knowledge_limited: true }
    }

    const context = buildContext({
      summary: session.summary || '',
      turns: await recentTurns(session),
      businessState: { member_status: user.member_status || '', vip_status: isVip(user, dep('now')()) ? 'active' : 'inactive' },
      coordinationState: {},
      knowledge,
      budget: 6000
    })
    const decision = await dep('generateDecision')({
      agentType: session.agent_type,
      message: content,
      context,
      prompt: JSON.stringify({ agent_type: session.agent_type, user_message: content, context }).slice(0, 7000)
    })
    const reply = decision.fallback ? knowledge[0].content : decision.replyDraft
    await dep('addWithId')('agent_run', {
      session_id: session.id,
      user_id: user.id,
      agent_type: session.agent_type,
      status: decision.fallback ? 'fallback' : 'completed',
      provider: decision.provider || 'fallback',
      risk_level: decision.riskLevel || 'safe'
    }, 'agent_run')
    await saveMessage(session, user, 'assistant', reply)
    return {
      session_id: session.id,
      agent_type: session.agent_type,
      reply,
      provider: decision.provider || 'fallback',
      risk_level: decision.riskLevel || 'safe',
      suggested_actions: decision.suggestedActions || []
    }
  }

  return { createSession, messages, send, createHumanTicket }
}

const handlers = createAgentHandlers()

module.exports = {
  createSession: handlers.createSession,
  messages: handlers.messages,
  send: handlers.send,
  createHumanTicket: handlers.createHumanTicket,
  createAgentHandlers,
  FREE_DAILY_LIMIT,
  VIP_DAILY_LIMIT
}
