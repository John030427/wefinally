const crypto = require('crypto')
const { AGENT_TYPES, isAgentType } = require('../agent/types')
const { RISK, classifyRisk, sanitizeOutput } = require('../agent/safety')
const { buildContext } = require('../agent/context')
const { searchReviewedKnowledge } = require('../agent/knowledge')
const { BUILTIN_KNOWLEDGE_ARTICLES } = require('../agent/knowledgeSeeds')
const { generateDecision } = require('../agent/provider')
const { TOOL_NAMES, inferTool, executeTool } = require('../agent/toolRegistry')
const { createDateApplicationPatchHandlers, claimPendingPatch, publicPatch } = require('./dateApplicationPatch')
const { createDateCoordinationHandlers } = require('./dateCoordination')
const { readHumanServiceConfig, buildHumanServiceHandoff } = require('../agent/humanService')
const { readLangGraphConfig, createActorRef, createThreadId, runLangGraphStep } = require('../agent/langgraphClient')
const { executeGraphTool } = require('../agent/langgraphToolBridge')
const { buildDateCoordinationGraphInput, normalizeContextRef } = require('../agent/dateCoordinationGraphState')
const { buildResumeSummary } = require('../lib/coordinationConcurrency')
const { publishCoordinationEvent } = require('../agent/dateCoordinationEvents')
const {
  toRuntimeCoordinationChanges,
  toCanonicalCoordinationEventType,
  toRuntimeCoordinationEventType
} = require('../lib/coordinationAdapters.cjs')
const {
  canOpenCoordinatorChat,
  canWriteCoordinatorAction,
  isInvitee,
  isInitiator,
  isTerminalCoordination,
  terminalWriteError,
  inviteeCoordinatorBlockedError
} = require('../lib/dateCoordinationAccessPolicy')
const { coordinatorWelcomeText } = require('../lib/invitationCoordination')
const { buildCoordinationEventCard } = require('../lib/coordinationProjection')

const FREE_DAILY_LIMIT = 5
const VIP_DAILY_LIMIT = 30
const CLIENT_REQUEST_LEASE_MS = 120000
const localClientRequestClaims = new Map()

function dateCoordinatorFallback(code) {
  const rawCode = String(code || 'graph_unavailable')
  const baseCode = rawCode.split(':', 1)[0]
  const replies = {
    graph_disabled: '约会协调 AI 当前未启用，尚未执行任何修改或通知。请稍后重试。',
    graph_timeout: '约会协调 AI 响应超时，尚未执行任何修改或通知。请稍后重试。',
    graph_unavailable: '约会协调 AI 当前不可用，尚未执行任何修改或通知。请稍后重试。'
  }
  return {
    code: Object.prototype.hasOwnProperty.call(replies, baseCode) ? baseCode : 'graph_unavailable',
    reply: replies[baseCode] || replies.graph_unavailable
  }
}

function graphDiagnosticFields(input = {}) {
  const bounded = (value, limit) => String(value || '').slice(0, limit)
  return {
    graph_stage: bounded(input.graphStage || input.graph_stage, 80),
    graph_fallback_code: bounded(input.graphFallbackCode || input.graph_fallback_code || input.code, 120),
    model_error_code: bounded(input.modelErrorCode || input.model_error_code, 120),
    tool_name: bounded(input.toolName || input.tool_name, 80),
    tool_error_code: bounded(input.toolErrorCode || input.tool_error_code, 120)
  }
}

function clientRequestDocumentId(sessionId, userId, clientRequestId) {
  return `agent-message-dedupe-${crypto.createHash('sha256')
    .update(`${Number(sessionId)}:${Number(userId)}:${String(clientRequestId)}`)
    .digest('hex')
    .slice(0, 40)}`
}

function defaultDeps() {
  const db = require('../lib/db')
  const cloud = require('wx-server-sdk')
  return {
    currentUser: require('./user').currentUser,
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    transaction: db.transaction,
    ensureCollection: db.ensureCollection,
    claimPendingPatch,
    commitConfirmation: db.commitCoordinationConfirmation,
    publishCoordinationEvent,
    writeInboxNotification(input) {
      const { notifyInbox } = require('../lib/coordinationInbox')
      return notifyInbox(input)
    },
    now: db.now,
    generateDecision,
    env: process.env,
    invokeGraphFunction: (name, payload) => cloud.callFunction({ name, data: payload })
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

function patchPreviewId(value) {
  const patch = value && typeof value === 'object' ? value : {}
  const id = Number(patch.id || patch.patch_id || 0)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function publicMessage(row, facts = {}) {
  const result = {
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    sender_type: row.sender_type || (row.role === 'user' ? 'user' : 'agent'),
    content: sanitizeOutput(String(row.content || '')).slice(0, 2000),
    create_time: row.create_time
  }
  const patchFact = facts.patchFacts && facts.patchFacts.get(patchPreviewId(row.patch_preview))
  if (row.patch_preview) {
    result.patch_preview = sanitizeOutput(patchFact
      ? Object.assign({}, row.patch_preview, publicPatch(patchFact), {
        status: patchFact.status,
        preview: patchFact.preview
      })
      : row.patch_preview)
  }
  if (Object.prototype.hasOwnProperty.call(row, 'context_ref')) {
    const patchStatus = patchFact && String(patchFact.status || '')
    const patchIsActionable = ['pending_confirmation', 'pending_primary_selection'].includes(patchStatus)
    result.context_ref = patchFact && patchPreviewId(row.patch_preview) > 0 && !patchIsActionable
      ? null
      : (row.context_ref ? sanitizeOutput(row.context_ref) : null)
  }
  if (row.handoff) result.handoff = sanitizeOutput(row.handoff)
  const eventFact = facts.eventFacts && facts.eventFacts.get(Number(row.coordination_event_id || 0))
  if (eventFact) {
    const eventCard = buildCoordinationEventCard({
      viewer_user_id: Number(row.user_id || 0),
      event: Object.assign({}, eventFact, { id: Number(eventFact.id || row.coordination_event_id || 0) }),
      content: result.content
    })
    if (patchFact
      && !['pending_confirmation', 'pending_primary_selection'].includes(String(patchFact.status || ''))
      && eventCard.context_ref
      && eventCard.context_ref.type === 'patch_preview') {
      eventCard.context_ref = null
    }
    result.event_card = sanitizeOutput(eventCard)
  } else if (row.event_card) result.event_card = sanitizeOutput(row.event_card)
  else if (row.coordination_event_id || row.coordination_event_key) {
    result.event_card = sanitizeOutput(buildCoordinationEventCard({
      event: row,
      content: result.content
    }))
  }
  return result
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
    if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name]
    if (!defaults) defaults = defaultDeps()
    return defaults[name]
  }

  async function ownedSession(sessionId, user) {
    const session = await dep('byId')('agent_session', Number(sessionId || 0))
    if (!session) throw new Error('会话不存在')
    if (Number(session.user_id) !== Number(user.id)) throw new Error('无权访问该会话')
    if (session.agent_type === AGENT_TYPES.DATE_COORDINATOR) {
      const coordination = await dep('byId')('date_coordination', Number(session.coordination_id || 0))
      if (!coordination || ![Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(user.id))) {
        throw new Error('无权读取该约会协调任务')
      }
    }
    return session
  }

  async function saveMessage(session, user, role, content, extra = {}) {
    const saved = await dep('addWithId')('agent_message', Object.assign({
      session_id: session.id,
      user_id: user.id,
      agent_type: session.agent_type,
      role,
      sender_type: role === 'user' ? 'user' : 'agent',
      content: sanitizeOutput(String(content || '')).slice(0, 2000)
    }, extra), 'agent_message')
    if (role === 'assistant') {
      const rows = await dep('list')('agent_message', { session_id: session.id }, 100)
      if (rows.length >= 12) {
        rows.sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
        const summary = rows.slice(0, -8).slice(-12).map((row) => {
          const label = row.role === 'user' ? '用户' : '客服'
          return `${label}:${String(row.content || '').slice(0, 120)}`
        }).join('\n').slice(0, 800)
        if (summary && summary !== session.summary) await dep('updateByDoc')('agent_session', session, { summary })
      }
    }
    return saved
  }

  async function claimClientRequest(session, user, clientRequestId) {
    const normalized = String(clientRequestId || '').trim().slice(0, 120)
    if (!normalized) return null
    const documentId = clientRequestDocumentId(session.id, user.id, normalized)
    const transaction = Object.prototype.hasOwnProperty.call(overrides, 'transaction')
      ? overrides.transaction
      : (overrides.first && overrides.addWithId ? null : dep('transaction'))
    const ensureCollection = Object.prototype.hasOwnProperty.call(overrides, 'ensureCollection')
      ? overrides.ensureCollection
      : (overrides.first && overrides.addWithId ? null : dep('ensureCollection'))
    if (typeof ensureCollection === 'function') await ensureCollection('agent_message_dedupe')
    const work = async (adapter) => {
      const timestamp = adapter.now ? adapter.now() : dep('now')()
      const existing = await adapter.byDocId('agent_message_dedupe', documentId)
      const existingRow = existing && Object.assign({ _id: documentId }, existing)
      const leaseExpiresAt = existingRow && existingRow.lease_expires_at
        ? new Date(existingRow.lease_expires_at).getTime()
        : 0
      const expired = existingRow
        && existingRow.status === 'processing'
        && (!leaseExpiresAt || leaseExpiresAt <= new Date(timestamp).getTime())
      if (existingRow && existingRow.status === 'completed') return { claimed: false, row: existingRow }
      if (existingRow && existingRow.status === 'processing' && !expired) return { claimed: false, row: existingRow }
      const existingMessages = existingRow && typeof adapter.list === 'function'
        ? await adapter.list('agent_message', {
          session_id: Number(session.id),
          user_id: Number(user.id),
          client_request_id: normalized
        }, 10)
        : []
      const row = {
        ...(existingRow || {}),
        session_id: Number(session.id),
        user_id: Number(user.id),
        client_request_id: normalized,
        status: 'processing',
        response: null,
        attempts: Number(existingRow && existingRow.attempts || 0) + 1,
        lease_expires_at: new Date(new Date(timestamp).getTime() + CLIENT_REQUEST_LEASE_MS),
        reclaimed_from: expired ? 'failed_retryable' : String(existingRow && existingRow.status || ''),
        reclaimed_at: expired ? timestamp : (existingRow && existingRow.reclaimed_at || null),
        user_message_id: Number(existingRow && existingRow.user_message_id
          || (existingMessages[0] && existingMessages[0].id) || 0),
        create_time: existingRow && existingRow.create_time ? existingRow.create_time : timestamp
      }
      await adapter.setByDocId('agent_message_dedupe', documentId, row)
      return { claimed: true, row: Object.assign({ _id: documentId }, row) }
    }
    if (typeof transaction === 'function') return transaction(work)
    const previous = localClientRequestClaims.get(documentId)
    const previousLeaseExpiresAt = previous && previous.lease_expires_at
      ? new Date(previous.lease_expires_at).getTime()
      : 0
    const previousExpired = previous
      && previous.status === 'processing'
      && (!previousLeaseExpiresAt || previousLeaseExpiresAt <= dep('now')().getTime())
    if (previous && previous.status === 'completed') return { claimed: false, row: previous }
    if (previous && previous.status === 'processing' && !previousExpired) return { claimed: false, row: previous }
    const row = {
      ...(previous || {}),
      _id: documentId,
      session_id: Number(session.id),
      user_id: Number(user.id),
      client_request_id: normalized,
      status: 'processing',
      response: null,
      attempts: Number(previous && previous.attempts || 0) + 1,
      lease_expires_at: new Date(dep('now')().getTime() + CLIENT_REQUEST_LEASE_MS),
      reclaimed_from: previousExpired ? 'failed_retryable' : String(previous && previous.status || ''),
      reclaimed_at: previousExpired ? dep('now')() : (previous && previous.reclaimed_at || null),
      user_message_id: Number(previous && previous.user_message_id || 0),
      create_time: previous && previous.create_time ? previous.create_time : dep('now')()
    }
    localClientRequestClaims.set(documentId, row)
    return { claimed: true, row }
  }

  async function bindClientRequestMessage(claim, userMessage) {
    if (!claim || !claim.row || !claim.row._id || !userMessage || !userMessage.id) return
    const transaction = Object.prototype.hasOwnProperty.call(overrides, 'transaction')
      ? overrides.transaction
      : (overrides.first && overrides.addWithId ? null : dep('transaction'))
    const work = async (adapter) => {
      const current = await adapter.byDocId('agent_message_dedupe', claim.row._id)
      if (!current) return
      await adapter.setByDocId('agent_message_dedupe', claim.row._id, Object.assign({}, current, {
        user_message_id: Number(userMessage.id)
      }))
    }
    if (typeof transaction === 'function') await transaction(work)
    else localClientRequestClaims.set(claim.row._id, Object.assign({}, claim.row, { user_message_id: Number(userMessage.id) }))
    claim.row.user_message_id = Number(userMessage.id)
  }

  async function completeClientRequest(claim, response) {
    if (!claim || !claim.row || !claim.row._id) return response
    const transaction = Object.prototype.hasOwnProperty.call(overrides, 'transaction')
      ? overrides.transaction
      : (overrides.first && overrides.addWithId ? null : dep('transaction'))
    const work = async (adapter) => {
      const current = await adapter.byDocId('agent_message_dedupe', claim.row._id)
      if (!current) return response
      await adapter.setByDocId('agent_message_dedupe', claim.row._id, Object.assign({}, current, {
        status: 'completed',
        response,
        lease_expires_at: null,
        completed_at: adapter.now ? adapter.now() : dep('now')()
      }))
      return response
    }
    if (typeof transaction === 'function') return transaction(work)
    localClientRequestClaims.set(claim.row._id, Object.assign({}, claim.row, {
      status: 'completed',
      response,
      lease_expires_at: null,
      completed_at: dep('now')()
    }))
    return response
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
      const ownApp = await dep('first')('date_coordination_application', {
        coordination_id: coordinationId,
        user_id: Number(user.id)
      }).catch(() => null)
      if (coordination.status === 'inviting_partner' && isInvitee(coordination, user)) {
        throw new Error(inviteeCoordinatorBlockedError())
      }
      const canOpen = canOpenCoordinatorChat(coordination, user, { hasOwnApplication: Boolean(ownApp) })
        || (coordination.status === 'collecting_initiator' && isInitiator(coordination, user))
      if (!canOpen) {
        throw new Error(terminalWriteError(coordination.status))
      }
    }
    const sessions = await dep('list')('agent_session', { user_id: user.id, agent_type: agentType }, 100)
    const reusable = sessions
      .filter((row) => !['closed', 'cancelled'].includes(row.status))
      .filter((row) => agentType !== AGENT_TYPES.DATE_COORDINATOR || Number(row.coordination_id) === coordinationId)
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
    const sessionRow = reusable || await dep('addWithId')('agent_session', {
      user_id: user.id,
      agent_type: agentType,
      coordination_id: coordinationId,
      status: 'active',
      summary: '',
      unresolved_count: 0
    }, 'agent_session')
    const publicRow = publicSession(sessionRow)
    if (agentType === AGENT_TYPES.DATE_COORDINATOR && coordinationId) {
      const coordination = await dep('byId')('date_coordination', coordinationId)
      const role = isInitiator(coordination, user) ? 'initiator' : 'invitee'
      const ownApp = await dep('first')('date_coordination_application', {
        coordination_id: coordinationId,
        user_id: Number(user.id)
      }).catch(() => null)
      publicRow.coordinator_welcome = coordinatorWelcomeText(Object.assign({}, coordination, {
        my_application: ownApp && ownApp.application
      }), role)
      publicRow.coordinator_read_only = !canWriteCoordinatorAction(coordination, user, { hasOwnApplication: Boolean(ownApp) })
      publicRow.coordination_status = coordination && coordination.status
    }
    return publicRow
  }

  async function messages(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const session = await ownedSession(data.id || data.session_id || data.sessionId, user)
    const rows = await dep('list')('agent_message', { session_id: session.id }, 100)
    rows.sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    const patchIds = Array.from(new Set(rows.map((row) => patchPreviewId(row.patch_preview)).filter(Boolean)))
    const eventIds = Array.from(new Set(rows.map((row) => Number(row.coordination_event_id || 0)).filter((id) => id > 0)))
    const [patchRows, eventRows] = await Promise.all([
      Promise.all(patchIds.map((id) => dep('byId')('date_application_patch', id).catch(() => null))),
      Promise.all(eventIds.map((id) => dep('byId')('date_coordination_event', id).catch(() => null)))
    ])
    const facts = {
      patchFacts: new Map(patchRows.filter(Boolean).map((row) => [Number(row.id), row])),
      eventFacts: new Map(eventRows.filter(Boolean).map((row) => [Number(row.id), row]))
    }
    return { session: publicSession(session), messages: rows.map((row) => publicMessage(row, facts)) }
  }

  async function createTicketFor(session, user, input) {
    const existing = (await dep('list')('agent_human_ticket', { session_id: session.id }, 100))
      .find((row) => ['open', 'processing'].includes(row.status))
    const serviceConfig = readHumanServiceConfig()
    const handoff = buildHumanServiceHandoff(serviceConfig)
    if (existing) return Object.assign({}, existing, { handoff })
    const ticket = await dep('addWithId')('agent_human_ticket', {
      session_id: session.id,
      user_id: user.id,
      coordination_id: Number(session.coordination_id || 0),
      priority: input.priority || 'P2',
      category: String(input.category || 'general').slice(0, 50),
      summary: String(input.summary || '').slice(0, 500),
      status: 'open',
      service_provider: handoff.provider,
      external_ticket_id: '',
      external_contact_url: handoff.service_url || '',
      assigned_agent: '',
      handoff_status: handoff.available ? 'available' : 'internal_pending',
      handoff_at: null
    }, 'agent_ticket')
    await dep('updateByDoc')('agent_session', session, { status: 'manual_pending' })
    return Object.assign({}, ticket, { handoff })
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
      create_time: ticket.create_time,
      handoff: ticket.handoff || buildHumanServiceHandoff()
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
    const clientRequestId = String(data.client_request_id || data.clientRequestId || '').trim().slice(0, 120)
    const requestClaim = clientRequestId ? await claimClientRequest(session, user, clientRequestId) : null
    if (requestClaim && !requestClaim.claimed) {
      if (requestClaim.row && requestClaim.row.status === 'completed' && requestClaim.row.response) return requestClaim.row.response
      return {
        session_id: session.id,
        agent_type: session.agent_type,
        reply: '上一次请求仍在处理中，请稍后刷新协调状态。',
        provider: 'deduplicated',
        deduplicated: true,
        pending: true
      }
    }
    const finalize = (response) => completeClientRequest(requestClaim, response)
    const rawContextRef = data.context_ref || data.contextRef
    const contextRef = rawContextRef ? normalizeContextRef(rawContextRef) : null
    if (rawContextRef && (!contextRef || (session.agent_type === AGENT_TYPES.DATE_COORDINATOR
      && Number(contextRef.coordination_id) !== Number(session.coordination_id)))) {
      throw new Error('invalid_context_ref')
    }
    if (session.status === 'manual_pending') {
      return finalize({
        session_id: session.id,
        agent_type: session.agent_type,
        reply: '你的会话已转人工客服，请耐心等待工作人员回复。',
        manual_pending: true,
        handoff: buildHumanServiceHandoff()
      })
    }
    if (session.agent_type === AGENT_TYPES.DATE_COORDINATOR && Number(session.coordination_id || 0)) {
      const coordination = await dep('byId')('date_coordination', Number(session.coordination_id))
      const ownApp = coordination
        ? await dep('first')('date_coordination_application', {
          coordination_id: Number(coordination.id),
          user_id: Number(user.id)
        }).catch(() => null)
        : null
      if (coordination && coordination.status === 'inviting_partner' && isInvitee(coordination, user)) {
        const reply = inviteeCoordinatorBlockedError()
        await saveMessage(session, user, 'assistant', reply)
        return finalize({ session_id: session.id, agent_type: session.agent_type, reply, declined: false })
      }
      if (coordination && isTerminalCoordination(coordination.status) && !canWriteCoordinatorAction(coordination, user, { hasOwnApplication: Boolean(ownApp) })) {
        const role = isInitiator(coordination, user) ? 'initiator' : 'invitee'
        const reply = coordinatorWelcomeText(coordination, role) || terminalWriteError(coordination.status)
        await saveMessage(session, user, 'assistant', reply)
        return finalize({
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          declined: coordination.status === 'invitation_declined',
          read_only: true
        })
      }
    }
    if (session.agent_type === AGENT_TYPES.LOVE_ADVISOR) await enforceLoveQuota(user)
    const existingUserMessage = requestClaim && requestClaim.row && Number(requestClaim.row.user_message_id || 0) > 0
      ? await dep('byId')('agent_message', Number(requestClaim.row.user_message_id))
      : (requestClaim && clientRequestId
          ? (await dep('list')('agent_message', {
            session_id: Number(session.id),
            user_id: Number(user.id),
            client_request_id: clientRequestId
          }, 10)).filter((row) => row.role === 'user')[0] || null
          : null)
    const userMessage = existingUserMessage || await saveMessage(session, user, 'user', content, Object.assign(
      contextRef ? { context_ref: contextRef } : {},
      clientRequestId ? { client_request_id: clientRequestId } : {}
    ))
    await bindClientRequestMessage(requestClaim, userMessage)

    const risk = classifyRisk(content)
    if (!risk.allowed) {
      if (risk.category === RISK.HIGH_RISK) {
        await createTicketFor(session, user, { priority: 'P0', category: 'safety_crisis', summary: '系统识别到高风险求助，请人工尽快查看' })
      }
      const reply = riskReply(risk.category)
      await saveMessage(session, user, 'assistant', reply, { risk_level: risk.category })
      return finalize({ session_id: session.id, agent_type: session.agent_type, reply, risk_level: risk.category, manual_pending: risk.category === RISK.HIGH_RISK })
    }

    const graphConfig = readLangGraphConfig(dep('env'))
    if (session.agent_type === AGENT_TYPES.PLATFORM_SERVICE && graphConfig.enabled) {
      try {
        const actorSecret = graphConfig.actorSecret
        const graphStep = await runLangGraphStep({
          threadId: createThreadId(session.id, actorSecret),
          actorRef: createActorRef(user.id, actorSecret),
          mode: 'customer_service',
          userText: content,
          safeSummary: String(session.summary || '').slice(0, 800)
        }, {
          env: dep('env'),
          invokeFunction: dep('invokeGraphFunction'),
          executeTool: (action) => executeGraphTool(action, {
            userId: Number(user.id),
            sessionId: Number(session.id),
            coordinationId: 0,
            coordinationVersion: 0
          }, {
            create_human_ticket: async (args) => {
              const ticket = await createTicketFor(session, user, {
                priority: args.priority || 'P1',
                category: args.category || 'graph_manual_review',
                summary: args.summary || 'AI 客服转人工核查'
              })
              return {
                ok: true,
                data: {
                  ticketId: String(ticket.id || ''),
                  status: ticket.status || 'open',
                  priority: ticket.priority || args.priority || 'P1'
                }
              }
            }
          })
        })
        if (graphStep.kind === 'result') {
          const graphResult = graphStep.result
          const reply = graphResult.replyDraft || (graphResult.status === 'manual_pending'
            ? '已转人工客服核查，请耐心等待工作人员回复。'
            : '我已收到你的问题。')
          await dep('addWithId')('agent_run', {
            session_id: session.id,
            user_id: user.id,
            agent_type: session.agent_type,
            status: graphResult.status,
            provider: 'langgraph',
            risk_level: 'safe',
            error_code: graphResult.errorCode || ''
          }, 'agent_run')
          await saveMessage(session, user, 'assistant', reply, { graph_phase: graphResult.phase })
          return finalize({
            session_id: session.id,
            agent_type: session.agent_type,
            reply,
            provider: 'langgraph',
            manual_pending: graphResult.status === 'manual_pending',
            risk_level: 'safe'
          })
        }
      } catch (_) {
        // A typed graph/config/tool failure deliberately falls through to the legacy path.
      }
    }

    if (session.agent_type === AGENT_TYPES.DATE_COORDINATOR) {
      const coordination = await dep('byId')('date_coordination', Number(session.coordination_id || 0))
      if (!coordination || ![Number(coordination.user_a_id), Number(coordination.user_b_id)].includes(Number(user.id))) {
        throw new Error('无权读取该约会协调任务')
      }
      const coordinationHandlerDeps = {
        first: dep('first'),
        list: dep('list'),
        byId: dep('byId'),
        addWithId: dep('addWithId'),
        updateByDoc: dep('updateByDoc'),
        now: dep('now')
      }
      for (const name of ['commitConfirmation', 'publishCoordinationEvent', 'writeInboxNotification']) {
        if (Object.prototype.hasOwnProperty.call(overrides, name)) coordinationHandlerDeps[name] = overrides[name]
      }
      const coordinationHandlers = createDateCoordinationHandlers(coordinationHandlerDeps)
      const patchHandlerOverrides = {
        first: dep('first'),
        list: dep('list'),
        byId: dep('byId'),
        addWithId: dep('addWithId'),
        updateByDoc: dep('updateByDoc'),
        transaction: Object.prototype.hasOwnProperty.call(overrides, 'transaction')
          ? dep('transaction')
          : (overrides.first && overrides.addWithId ? null : dep('transaction')),
        claimPendingPatch: dep('claimPendingPatch'),
        now: dep('now'),
        saveApplicationForUser: coordinationHandlers.saveApplicationForUser
      }
      for (const name of ['publishCoordinationEvent', 'writeInboxNotification']) {
        if (Object.prototype.hasOwnProperty.call(overrides, name)) patchHandlerOverrides[name] = dep(name)
      }
      const patchHandlers = createDateApplicationPatchHandlers(patchHandlerOverrides)
      const graphEvent = async (args, fallbackEventType) => {
        const current = await dep('byId')('date_coordination', Number(args.coordinationId || coordination.id))
        if (!current) throw new Error('日期协调不存在')
        if (Number(args.coordinationVersion) !== Number(current.coordination_version || 1)) throw new Error('stale_coordination_version')
        const canonicalType = toCanonicalCoordinationEventType(String(args.eventType || fallbackEventType))
        if (!canonicalType) throw new Error('invalid_coordination_event_type')
        const runtimeType = toRuntimeCoordinationEventType(canonicalType)
        const relay = args.relay && typeof args.relay === 'object' ? args.relay : {}
        const partnerRequest = args.partnerRequest && typeof args.partnerRequest === 'object' ? args.partnerRequest : {}
        const published = await publishCoordinationEvent({
          coordination: current,
          event: {
            event_type: runtimeType,
            actor_user_id: Number(user.id),
            coordination_version: Number(current.coordination_version || 1),
            idempotency_suffix: String(args.idempotencySuffix || `graph:${session.id}:${userMessage.id}`).slice(0, 60),
            changed_dimensions: Array.isArray(args.changedDimensions) ? args.changedDimensions : [],
            relay_text: sanitizeOutput(String(relay.text || partnerRequest.topic || '')).slice(0, 240),
            partner_request: partnerRequest
          }
        }, {
          first: dep('first'),
          addWithId: dep('addWithId'),
          now: dep('now')
        })
        return {
          ok: true,
          data: {
            eventId: Number(published.event && published.event.id || 0),
            eventType: runtimeType,
            coordinationVersion: Number(current.coordination_version || 1),
            status: current.status
          }
        }
      }
      const graphToolServices = {
        create_date_application_patch: async (args) => {
          const runtimeChanges = toRuntimeCoordinationChanges(args.changes || {}, args.candidatePlan || null)
          const preview = await patchHandlers.createPreviewForUser({
            coordination_id: Number(args.coordinationId),
            coordination_version: Number(args.coordinationVersion),
            session_id: Number(session.id),
            source_message_id: Number(userMessage.id || 0),
            changes: runtimeChanges,
            partner_request: args.partnerRequest
          }, user, session)
          return {
            ok: true,
            data: {
              patchId: Number(preview.id || 0),
              status: preview.status,
              coordinationVersion: Number(preview.base_version || args.coordinationVersion)
            }
          }
        },
        create_date_application_preview: async (args) => {
          const preview = await patchHandlers.createInitialPreviewForUser({
            coordination_id: Number(args.coordinationId),
            session_id: Number(session.id),
            source_message_id: Number(userMessage.id || 0),
            application: args.application || args.candidatePlan || {}
          }, user, session)
          return { ok: true, data: { previewId: Number(preview.id || 0), status: preview.status, coordinationVersion: Number(preview.base_version || coordination.coordination_version) } }
        },
        confirm_date_application_patch: async (args) => {
          const applied = await patchHandlers.confirmForUser({ coordination_id: Number(args.coordinationId), patch_id: Number(args.patchId) }, user)
          if (args.partnerRequest) {
            await graphEvent({
              ...args,
              coordinationVersion: Number(applied.coordination_version || args.coordinationVersion),
              eventType: 'PARTNER_QUESTION',
              partnerRequest: args.partnerRequest,
              relay: { type: 'SAFE_NOTE', text: args.partnerRequest.topic }
            }, 'PARTNER_QUESTION')
          }
          return { ok: true, data: {
            patchId: Number(applied.patch && applied.patch.id || args.patchId),
            status: applied.status || (applied.patch && applied.patch.status) || 'applied',
            coordinationVersion: Number(applied.coordination_version || args.coordinationVersion),
            applied: applied.applied === true,
            applicationSent: applied.application_sent === true,
            partnerNotified: applied.partner_notified === true,
            projection_pending: applied.projection_pending === true,
            notification_status: applied.notification_status || '',
            skipped: applied.skipped === true,
            event_status: applied.event_status || ''
          } }
        },
        cancel_date_application_patch: async (args) => {
          const cancelled = await patchHandlers.cancelForUser({ patch_id: Number(args.patchId) }, user)
          return { ok: true, data: { patchId: Number(cancelled.id || args.patchId), status: cancelled.status, coordinationVersion: Number(args.coordinationVersion) } }
        },
        confirm_date_application: async (args) => {
          const confirmed = await coordinationHandlers.confirmProposalForUser({
            coordination_id: Number(args.coordinationId),
            coordination_version: Number(args.coordinationVersion),
            proposal_id: Number(args.proposalId || 0),
            decision: 'confirm'
          }, user)
          return { ok: true, data: {
            status: confirmed.status,
            coordinationVersion: Number(confirmed.coordination_version || args.coordinationVersion),
            applicationSent: false,
            applied: confirmed.applied === true,
            partnerNotified: confirmed.partner_notified === true,
            projection_pending: confirmed.projection_pending === true,
            notification_status: confirmed.notification_status || '',
            event_status: confirmed.event_status || ''
          } }
        },
        reject_date_application: async (args) => {
          const rejected = await coordinationHandlers.confirmProposalForUser({
            coordination_id: Number(args.coordinationId),
            coordination_version: Number(args.coordinationVersion),
            proposal_id: Number(args.proposalId || 0),
            decision: 'reject'
          }, user)
          return { ok: true, data: { status: rejected.status, businessState: rejected.business_state, coordinationVersion: Number(rejected.coordination_version || args.coordinationVersion) } }
        },
        respond_date_invitation: async (args) => {
          const responded = await coordinationHandlers.respondInvitationForUser({
            coordination_id: Number(args.coordinationId),
            decision: String(args.decision || ''),
            invitation_version: Number(args.invitationVersion)
          }, user)
          return { ok: true, data: { status: responded.status, coordinationVersion: Number(responded.coordination_version || args.coordinationVersion), invitationVersion: Number(args.invitationVersion), partnerNotified: true } }
        },
        cancel_coordination: async (args) => {
          const current = await dep('byId')('date_coordination', Number(args.coordinationId))
          if (!current) throw new Error('日期协调不存在')
          if (Number(current.coordination_version || 1) !== Number(args.coordinationVersion)) throw new Error('stale_coordination_version')
          if (![Number(current.user_a_id), Number(current.user_b_id)].includes(Number(user.id))) throw new Error('无权操作该日期协调')
          const updated = await dep('updateByDoc')('date_coordination', current, { status: 'cancelled', business_state: 'cancelled' })
          await graphEvent({ ...args, eventType: 'COORDINATION_CANCELLED' }, 'COORDINATION_CANCELLED')
          return { ok: true, data: { status: updated.status, coordinationVersion: Number(updated.coordination_version || args.coordinationVersion) } }
        },
        publish_coordination_event: (args) => graphEvent(args, 'COORDINATION_UPDATED'),
        notify_coordination_partner: (args) => graphEvent(args, 'PARTNER_QUESTION'),
        record_arrival_and_request_partner_status: async (args) => {
          const arrival = await graphEvent({
            ...args,
            eventType: 'ARRIVED',
            idempotencySuffix: `arrival:${Number(coordination.id)}:${Number(user.id)}`,
            relay: { type: 'ARRIVAL_STATUS', text: '我已到达。' }
          }, 'ARRIVED')
          const requested = await graphEvent({
            ...args,
            eventType: 'ARRIVAL_STATUS_REQUESTED',
            idempotencySuffix: `arrival-status:${session.id}:${userMessage.id}`
          }, 'ARRIVAL_STATUS_REQUESTED')
          return {
            ok: true,
            data: {
              arrivalEventId: arrival.data.eventId,
              requestEventId: requested.data.eventId,
              eventType: requested.data.eventType,
              coordinationVersion: requested.data.coordinationVersion,
              status: requested.data.status
            }
          }
        },
        get_coordination_status: async (args) => {
          const current = await dep('byId')('date_coordination', Number(args.coordinationId))
          if (!current) throw new Error('日期协调不存在')
          return { ok: true, data: { status: current.status, businessState: current.business_state || '', coordinationVersion: Number(current.coordination_version || 1), missingDimensions: current.missing_dimensions || [] } }
        },
        get_coordination_overlap: async (args) => {
          const current = await dep('byId')('date_coordination', Number(args.coordinationId))
          if (!current) throw new Error('日期协调不存在')
          return { ok: true, data: { hasOverlap: current.status === 'waiting_confirmations' || current.status === 'arranged', missingFields: current.missing_dimensions || [], proposal: null, coordinationVersion: Number(current.coordination_version || 1) } }
        }
      }
      const allApplications = await dep('list')('date_coordination_application', {
        coordination_id: Number(coordination.id)
      }, 200)
      const allProposals = await dep('list')('date_coordination_proposal', {
        coordination_id: Number(coordination.id)
      }, 50).catch(() => [])
      const confirmations = await dep('list')('date_coordination_confirmation', {
        coordination_id: Number(coordination.id)
      }, 50).catch(() => [])
      let dateGraphResult = null
      const coordinationEvents = await dep('list')('date_coordination_event', {
        coordination_id: Number(coordination.id)
      }, 200).catch(() => [])
      const lastSeenVersion = Number(session.last_seen_coordination_version || 0)
      const resume = buildResumeSummary(coordinationEvents, lastSeenVersion)
      const resumeText = resume.has_updates ? resume.lines.join('\n') : ''
      const markSeen = async () => {
        await dep('updateByDoc')('agent_session', session, {
          last_seen_coordination_version: Number(coordination.coordination_version || 1)
        }).catch(() => null)
      }
      const recordGraphFailure = async (diagnostic = {}) => {
        const fields = graphDiagnosticFields(diagnostic)
        return dep('addWithId')('agent_run', {
          session_id: session.id,
          user_id: user.id,
          agent_type: session.agent_type,
          coordination_id: Number(coordination.id),
          coordination_version: Number(coordination.coordination_version || 1),
          status: 'fallback',
          provider: 'langgraph',
          intent: 'date_coordination_state',
          risk_level: 'safe',
          error_code: String(diagnostic.code || fields.graph_fallback_code || 'graph_unavailable').slice(0, 120),
          ...fields
        }, 'agent_run')
      }
      let graphFailure = { kind: 'disabled', code: 'graph_disabled' }
      if (graphConfig.enabled) {
        graphFailure = { kind: 'fallback', code: 'graph_unavailable' }
        const graphPendingPatches = await dep('list')('date_application_patch', {
          coordination_id: Number(coordination.id),
          session_id: Number(session.id),
          user_id: Number(user.id),
          status: 'pending_confirmation'
        }, 100).catch(() => [])
        const graphPendingPatch = graphPendingPatches
          .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null
        const graphInput = buildDateCoordinationGraphInput(coordination, allApplications, user, {
          confirmations,
          pendingPatch: graphPendingPatch,
          proposals: allProposals,
          contextRef
        })
        const refreshGraphInput = async () => {
          const freshCoordination = await dep('byId')('date_coordination', Number(coordination.id))
          const freshApplications = await dep('list')('date_coordination_application', { coordination_id: Number(coordination.id) }, 200)
          const freshConfirmations = await dep('list')('date_coordination_confirmation', { coordination_id: Number(coordination.id) }, 50).catch(() => [])
          const freshProposals = await dep('list')('date_coordination_proposal', { coordination_id: Number(coordination.id) }, 50).catch(() => [])
          const freshPendingPatches = await dep('list')('date_application_patch', {
            coordination_id: Number(coordination.id),
            session_id: Number(session.id),
            user_id: Number(user.id),
            status: 'pending_confirmation'
          }, 100).catch(() => [])
          const freshPendingPatch = freshPendingPatches
            .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null
          return buildDateCoordinationGraphInput(freshCoordination, freshApplications, user, {
            confirmations: freshConfirmations,
            pendingPatch: freshPendingPatch,
            proposals: freshProposals,
            contextRef
          })
        }
        try {
          const graphStep = await runLangGraphStep({
            threadId: createThreadId('date:' + coordination.id + ':user:' + user.id, graphConfig.actorSecret),
            actorRef: createActorRef(user.id, graphConfig.actorSecret),
            mode: 'date_coordination',
            userText: content,
            safeSummary: String([session.summary, resumeText].filter(Boolean).join('\n')).slice(0, 800),
            ...graphInput
          }, {
            env: dep('env'),
            invokeFunction: dep('invokeGraphFunction'),
            executeTool: (action) => executeGraphTool(action, {
              userId: Number(user.id),
              sessionId: Number(session.id),
              coordinationId: Number(coordination.id),
              coordinationVersion: Number(coordination.coordination_version || 1),
              idempotencyKey: `graph:${session.id}:${userMessage.id}:${action.type}`
            }, graphToolServices),
            refreshInput: refreshGraphInput
          })
          if (graphStep.kind === 'result') {
            dateGraphResult = graphStep.result
            await dep('addWithId')('agent_run', {
              session_id: session.id,
              user_id: user.id,
              agent_type: session.agent_type,
              coordination_id: Number(coordination.id),
              coordination_version: Number(dateGraphResult.coordinationVersion || coordination.coordination_version || 1),
              status: dateGraphResult.status,
              provider: 'langgraph',
              intent: 'date_coordination_state',
              risk_level: 'safe',
              error_code: dateGraphResult.errorCode || dateGraphResult.graph_fallback_code || '',
              ...graphDiagnosticFields({
                graphStage: graphStep.toolName ? 'resume_agent_graph' : 'invoke_agent_graph',
                graphFallbackCode: dateGraphResult.graph_fallback_code || '',
                modelErrorCode: dateGraphResult.model_error_code || '',
                toolName: graphStep.toolName || '',
                toolErrorCode: graphStep.toolErrorCode || ''
              })
            }, 'agent_run')
            if (dateGraphResult.status === 'fallback') {
              graphFailure = { kind: 'fallback', code: dateGraphResult.errorCode || 'graph_unavailable' }
            }
          } else {
            graphFailure = graphStep
            await recordGraphFailure({
              code: graphStep.code || graphStep.kind || 'graph_fallback',
              graphStage: graphStep.graphStage || 'invoke_agent_graph',
              graphFallbackCode: graphStep.graphFallbackCode || graphStep.code || '',
              modelErrorCode: graphStep.modelErrorCode || '',
              toolName: graphStep.toolName || '',
              toolErrorCode: graphStep.toolErrorCode || ''
            })
          }
          if (dateGraphResult && dateGraphResult.status !== 'fallback') {
            const reply = [resumeText, dateGraphResult.replyDraft].filter(Boolean).join('\n') || '我已按当前协调状态处理这次请求。'
            const graphToolData = graphStep && graphStep.toolResult && graphStep.toolResult.data
              && typeof graphStep.toolResult.data === 'object'
              ? graphStep.toolResult.data
              : {}
            const pendingPreviewId = dateGraphResult.pendingPreview && (
              dateGraphResult.pendingPreview.patchId || dateGraphResult.pendingPreview.patch_id
            )
            const pendingPreviewRow = pendingPreviewId
              ? await dep('byId')('date_application_patch', Number(pendingPreviewId))
              : null
            const patchPreview = pendingPreviewRow
              && ['pending_confirmation', 'pending_primary_selection'].includes(String(pendingPreviewRow.status || ''))
              ? sanitizeOutput(publicPatch(pendingPreviewRow))
              : null
            const clearsActionableContext = [
              'CONFIRM_PREVIEW',
              'CANCEL_PREVIEW',
              'CONFIRM_CURRENT_PLAN',
              'REJECT_CURRENT_PLAN',
              'ACCEPT_INVITATION',
              'DECLINE_INVITATION',
              'CANCEL_COORDINATION'
            ].includes(String(dateGraphResult.coordinationCommand && dateGraphResult.coordinationCommand.type || ''))
              && dateGraphResult.status === 'completed'
            const resultContextRef = clearsActionableContext
              ? null
              : dateGraphResult.contextRef
              || (dateGraphResult.pendingPreview && dateGraphResult.pendingPreview.contextRef)
              || graphInput.contextRef
              || null
            await saveMessage(session, user, 'assistant', reply, {
              graph_phase: dateGraphResult.phase,
              coordination_command: dateGraphResult.coordinationCommand || null,
              candidate_plan: dateGraphResult.candidatePlan || null,
              pending_preview: dateGraphResult.pendingPreview || null,
              patch_preview: patchPreview,
              context_ref: resultContextRef,
              partner_notified: graphToolData.partnerNotified === true,
              projection_pending: graphToolData.projection_pending === true,
              event_status: graphToolData.event_status || ''
            })
            await markSeen()
            return finalize({
              session_id: session.id,
              agent_type: session.agent_type,
              reply,
              provider: 'langgraph',
              graph_phase: dateGraphResult.phase,
              coordination_version: dateGraphResult.coordinationVersion,
              coordination_command: dateGraphResult.coordinationCommand || null,
              candidate_plan: dateGraphResult.candidatePlan || null,
              pending_preview: dateGraphResult.pendingPreview || null,
              patch_preview: patchPreview,
              context_ref: resultContextRef,
              requires_confirmation: dateGraphResult.status === 'awaiting_confirmation',
              partner_notified: graphToolData.partnerNotified === true,
              projection_pending: graphToolData.projection_pending === true,
              event_status: graphToolData.event_status || '',
              risk_level: 'safe'
            })
          }
        } catch (error) {
          const diagnostic = {
            code: 'graph_error',
            graphStage: error && error.graphStage || 'graph_workflow',
            graphFallbackCode: error && error.graphFallbackCode || 'graph_error',
            modelErrorCode: error && error.modelErrorCode || '',
            toolName: error && error.toolName || '',
            toolErrorCode: error && error.toolErrorCode || error && error.code || error && error.message || 'graph_error'
          }
          graphFailure = { kind: 'fallback', code: diagnostic.graphFallbackCode }
          await recordGraphFailure(diagnostic)
        }
      }
      if (!graphConfig.enabled) await recordGraphFailure({
        code: graphFailure.code,
        graphStage: 'graph_disabled',
        graphFallbackCode: graphFailure.code
      })
      const fallback = dateCoordinatorFallback(graphFailure.code)
      const reply = [resumeText, fallback.reply].filter(Boolean).join('\n')
      await saveMessage(session, user, 'assistant', reply, {
        graph_fallback: fallback.code,
        coordination_version: Number(coordination.coordination_version || 1)
      })
      await markSeen()
      return finalize({
        session_id: session.id,
        agent_type: session.agent_type,
        reply,
        provider: 'fallback',
        graph_fallback: fallback.code,
        coordination_version: Number(coordination.coordination_version || 1),
        risk_level: 'safe',
        suggested_actions: ['retry_coordination']
      })
    }

    const tool = session.agent_type === AGENT_TYPES.PLATFORM_SERVICE ? inferTool(content) : ''
    if (tool === TOOL_NAMES.HUMAN_TICKET) {
      await recordTool(session, user, tool, 'completed')
      const ticket = await createTicketFor(session, user, { priority: 'P2', category: 'user_request', summary: content })
      const reply = '已为你转接人工客服，工作人员会在服务时间内查看并回复。'
      await saveMessage(session, user, 'assistant', reply, { handoff: ticket.handoff })
      return finalize({ session_id: session.id, agent_type: session.agent_type, reply, tool, manual_pending: true, handoff: ticket.handoff })
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
        return finalize({ session_id: session.id, agent_type: session.agent_type, reply: result.reply, tool, risk_level: 'safe' })
      } catch (err) {
        await recordTool(session, user, tool, 'failed', 'tool_failed')
        const reply = '暂时无法查询你的实时状态，请稍后重试或联系人工客服。'
        await saveMessage(session, user, 'assistant', reply)
        return finalize({ session_id: session.id, agent_type: session.agent_type, reply, tool, tool_failed: true })
      }
    }

    if (session.agent_type === AGENT_TYPES.LOVE_ADVISOR && /会员|审核|VIP|匹配状态|订单|退款/.test(content)) {
      const reply = '这是平台业务问题，请前往“我的 → 平台AI客服”查询真实状态。'
      await saveMessage(session, user, 'assistant', reply)
      return finalize({ session_id: session.id, agent_type: session.agent_type, reply, suggested_actions: ['open_platform_service'] })
    }

    const records = await dep('list')('knowledge_article', {}, 200)
    const knowledge = searchReviewedKnowledge(records.concat(BUILTIN_KNOWLEDGE_ARTICLES), content, 4)
    if (!knowledge.length && session.agent_type !== AGENT_TYPES.LOVE_ADVISOR) {
      const reply = '现有平台资料暂时没有可靠答案。涉及真实业务状态时，请说明具体想查询的项目或联系人工客服。'
      await saveMessage(session, user, 'assistant', reply)
      return finalize({ session_id: session.id, agent_type: session.agent_type, reply, knowledge_limited: true })
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
    const reply = decision.fallback
      ? (decision.replyDraft || '我暂时无法生成建议，请稍后再试或联系人工客服。')
      : decision.replyDraft
    await dep('addWithId')('agent_run', {
      session_id: session.id,
      user_id: user.id,
      agent_type: session.agent_type,
      status: decision.fallback ? 'fallback' : 'completed',
      provider: decision.provider || 'fallback',
      risk_level: decision.riskLevel || 'safe',
      error_code: decision.errorCode || ''
    }, 'agent_run')
    await saveMessage(session, user, 'assistant', reply)
    return finalize({
      session_id: session.id,
      agent_type: session.agent_type,
      reply,
      provider: decision.provider || 'fallback',
      risk_level: decision.riskLevel || 'safe',
      suggested_actions: decision.suggestedActions || []
    })
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
