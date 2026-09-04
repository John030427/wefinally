const { AGENT_TYPES, isAgentType } = require('../agent/types')
const { RISK, classifyRisk, sanitizeOutput } = require('../agent/safety')
const { buildContext } = require('../agent/context')
const { searchReviewedKnowledge } = require('../agent/knowledge')
const { BUILTIN_KNOWLEDGE_ARTICLES } = require('../agent/knowledgeSeeds')
const { generateDecision } = require('../agent/provider')
const { TOOL_NAMES, inferTool, executeTool } = require('../agent/toolRegistry')
const { createDateApplicationPatchHandlers, claimPendingPatch } = require('./dateApplicationPatch')
const { createDateCoordinationHandlers } = require('./dateCoordination')
const { PATCH_TOOL, classifyChangeIntent } = require('../lib/dateApplicationPatchPolicy')
const { readHumanServiceConfig, buildHumanServiceHandoff } = require('../agent/humanService')
const { readLangGraphConfig, createActorRef, createThreadId, runLangGraphStep } = require('../agent/langgraphClient')
const { executeGraphTool } = require('../agent/langgraphToolBridge')
const { buildDateCoordinationGraphInput, latestApplication } = require('../agent/dateCoordinationGraphState')
const { buildResumeSummary } = require('../lib/coordinationConcurrency')
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
const { exactTimeFromText, periodForStartTime } = require('../lib/meetingPlanPolicy')
const {
  publicState: publicMeetingState,
  applyMeetingCheckIn
} = require('../lib/meetingCheckInService')

const FREE_DAILY_LIMIT = 5
const VIP_DAILY_LIMIT = 30
const CREATE_APPLICATION_PREVIEW_TOOL = 'create_date_application_preview'
const CONFIRM_APPLICATION_TOOL = 'confirm_date_application'
const PARTNER_INQUIRY_TOOL = 'generate_partner_notification'

function meetingConversationIntent(content) {
  const text = String(content || '').trim()
  if (/现场.*不符|不是本人|感觉不对|身份不符/.test(text)) return { action: 'mismatch' }
  if (/没找到|找不到|没看见对方|对方在哪/.test(text)) return { action: 'not_found' }
  if (/见到对方|已经见面|确认见到|找到对方了/.test(text)) return { action: 'met' }
  if (/我到了|已经到了|到集合点了|已到达/.test(text)) {
    const positionMatch = text.match(/(?:我现在|目前|我)?在([^，。！？!?]{2,40})/)
    return { action: 'arrived', arrival_position: positionMatch ? positionMatch[1].trim() : '' }
  }
  if (/对方穿什么|怎么认对方|如何认出对方|识别对方/.test(text)) return { query: 'partner_hint' }
  if (/对方到了吗|对方到没到|到达了吗/.test(text)) return { query: 'partner_arrival' }
  if (/我(?:会)?穿|我的穿着|到场识别|识别提示|我拿着|我会拿着/.test(text)) {
    return { action: 'set_arrival_hint', arrival_hint: text.replace(/^(?:到场识别提示|识别提示)[:：]?\s*/, '') }
  }
  return null
}

function meetingReply(intent, state) {
  if (intent.query === 'partner_hint') {
    return state.partner_arrival_hint
      ? `对方主动提供的到场识别提示是：${state.partner_arrival_hint}。请只在约定的公共集合点核对；AI 无法替你验证现实身份。`
      : '对方还没有提供到场识别提示。你可以先补充自己的穿搭或手持物，我会在对方确认后通过协调会话转达。'
  }
  if (intent.query === 'partner_arrival') {
    if (!state.partner_arrived) return '对方尚未确认到达；我不会共享实时定位。你可以到达活动场地后告诉我自己所在的公共位置。'
    return state.partner_arrival_position
      ? `对方已确认到达，并告知现在位于：${state.partner_arrival_position}。这只是对方主动提供的现场描述。`
      : '对方已确认到达活动场地，但还没有补充现场具体位置。'
  }
  return {
    set_arrival_hint: '识别提示已经记录并通过约会协调会话同步给对方。',
    arrived: '已记录你到达活动场地；对方会在自己的协调会话中看到到达提醒和你主动填写的现场位置。',
    met: state.meeting_confirmed ? '双方都已确认见面。' : '你已确认见到对方，正在等待对方确认。',
    not_found: '已通过协调会话通知对方你暂未找到人，请留在公共集合点并核对识别提示。',
    mismatch: '现场情况不符，本次会合已暂停。请停止接触并前往安全公共区域，必要时联系平台人工客服或当地紧急服务。'
  }[intent.action] || '到场状态已更新。'
}

function applyExactTimeToDecision(decision, content, currentApplication) {
  const currentPeriod = Array.isArray(currentApplication && currentApplication.availability)
    && currentApplication.availability[0]
    && Array.isArray(currentApplication.availability[0].periods)
    ? String(currentApplication.availability[0].periods[0] || '')
    : ''
  const startTime = exactTimeFromText(content, { period: currentPeriod })
  if (!startTime || !decision) return decision
  const request = decision.toolRequest || decision.tool_request
  if (!request || !request.arguments || typeof request.arguments !== 'object') return decision
  const args = request.arguments
  const target = args.application && typeof args.application === 'object' ? args.application : args
  target.start_time = startTime
  const explicitPeriod = /上午|中午|下午|傍晚|晚上|夜里/.test(String(content || ''))
  if (explicitPeriod) {
    const period = periodForStartTime(startTime)
    if (currentPeriod && period && currentPeriod !== period) {
      decision.needs_clarification = true
      decision.clarification = '你写的具体时间和已选时段不一致，请确认是继续用当前时段，还是改成新的时段。'
      return decision
    }
  }
  return decision
}

function movieVenueClarification(content, application) {
  const text = String(content || '')
  if (/先.*(?:碰面|见面|集合)|只是集合点/.test(text) || (application && application.venue_choice_mode === 'meet_first')) return ''
  if (!/电影|看电影/.test(text)) return ''
  const venueText = `${text} ${String(application && application.activity_venue || '')}`
  if (/电影院|影城|影院/.test(venueText)) return ''
  if (/星巴克|咖啡店|咖啡馆/.test(`${text} ${String(application && application.areas || '')}`)) {
    return '先在星巴克碰面，再去看电影吗？可以回复“先在这里碰面，影院到时商量”，我会先生成修改预览。'
  }
  return ''
}

function pendingActionIntent(content) {
  const text = String(content || '').trim()
  if (/取消|暂不|先不|不要|别发|不发送|不提交/.test(text)) return 'cancel'
  if (/^(?:是|好|好的|可以|同意)$/.test(text)
    || /确认(?:发送|提交|询问)?|(?:帮我|请|可以|直接|就)?(?:发送|提交|询问)(?:申请|对方)?吧|没问题.*(?:发送|提交|询问)|就这样.*(?:发送|提交|询问)/.test(text)) return 'confirm'
  return ''
}

function partnerUserId(coordination, userId) {
  return Number(userId) === Number(coordination.user_a_id)
    ? Number(coordination.user_b_id)
    : Number(coordination.user_a_id)
}

function inquiryPreviewFromGraph(coordination, applications, sender, confirmations) {
  const recipientId = partnerUserId(coordination, sender.id)
  const state = buildDateCoordinationGraphInput(coordination, applications, { id: recipientId }, { confirmations })
  const offer = state && state.sharedState && state.sharedState.counterOffer
  if (!offer || offer.kind !== 'partner_structured_counter_proposal'
    || Number(offer.changed_by_user_id) !== Number(sender.id)) return null
  return {
    status: 'pending_confirmation',
    coordination_id: Number(coordination.id),
    coordination_version: Number(coordination.coordination_version || 1),
    recipient_user_id: recipientId,
    proposal_token: String(offer.proposal_token || ''),
    title: '询问对方前请确认',
    body: String(offer.body || '请确认要把这份调整方案询问对方。'),
    changes: offer.changes || [],
    unchanged_text: String(offer.unchanged_text || ''),
    proposal_card: offer.proposal_card || {},
    confirm_label: '确认询问对方',
    cancel_label: '暂不询问'
  }
}

function publicPartnerInquiry(value) {
  const input = value && typeof value === 'object' ? value : {}
  return sanitizeOutput({
    status: String(input.status || ''),
    coordination_version: Number(input.coordination_version || 1),
    proposal_token: String(input.proposal_token || ''),
    title: String(input.title || '').slice(0, 80),
    body: String(input.body || '').slice(0, 240),
    changes: Array.isArray(input.changes) ? input.changes.slice(0, 6) : [],
    unchanged_text: String(input.unchanged_text || '').slice(0, 160),
    proposal_card: input.proposal_card || {},
    confirm_label: String(input.confirm_label || '').slice(0, 40),
    cancel_label: String(input.cancel_label || '').slice(0, 40)
  })
}

function guardUnverifiedSuccessClaim(reply) {
  const text = String(reply || '')
  const claimsExecution = /(?:已经|已)(?:生成并)?(?:发送|提交|通知|创建|修改|确认)/.test(text)
    || /我(?:这就|马上|现在)(?:帮|为).*(?:发送|提交|通知|创建|生成|发给)/.test(text)
    || /(?:申请|消息).*(?:将自动|会自动)(?:发送|提交|通知)/.test(text)
  if (!claimsExecution) return text
  return '申请尚未正式发送。我会先生成后台待确认预览，确认后再由系统发送给对方。'
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
    claimPendingPatch,
    commitPreAcceptInvitationPatch: db.commitPreAcceptInvitationPatch,
    commitPostAcceptApplicationPatch: db.commitPostAcceptApplicationPatch,
    now: db.now,
    generateDecision,
    publishCoordinationEvent: require('../agent/dateCoordinationEvents').publishCoordinationEvent,
    env: process.env,
    invokeGraphFunction: (name, payload) => cloud.callFunction({ name, data: payload }),
    notifyInbox(input) {
      return require('../lib/coordinationInbox').notifyInbox(input)
    }
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
  const result = {
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    sender_type: row.sender_type || (row.role === 'user' ? 'user' : 'agent'),
    content: sanitizeOutput(String(row.content || '')).slice(0, 2000),
    create_time: row.create_time
  }
  if (row.patch_preview) result.patch_preview = sanitizeOutput(row.patch_preview)
  if (row.partner_inquiry_preview) result.partner_inquiry_preview = publicPartnerInquiry(row.partner_inquiry_preview)
  if (row.partner_inquiry) result.partner_inquiry = publicPartnerInquiry(row.partner_inquiry)
  if (row.coordination_update_card) result.coordination_update_card = sanitizeOutput(row.coordination_update_card)
  if (row.handoff) result.handoff = sanitizeOutput(row.handoff)
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
    if (overrides[name]) return overrides[name]
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
      publicRow.coordinator_read_only = coordination.status === 'arranged'
        ? false
        : !canWriteCoordinatorAction(coordination, user, { hasOwnApplication: Boolean(ownApp) })
      publicRow.coordinator_meeting_mode = coordination.status === 'arranged'
      publicRow.coordination_status = coordination && coordination.status
    }
    return publicRow
  }

  async function messages(data, wxContext) {
    const user = await dep('currentUser')(wxContext)
    const session = await ownedSession(data.id || data.session_id || data.sessionId, user)
    const rows = await dep('list')('agent_message', { session_id: session.id }, 100)
    rows.sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    let coordinationVersion = Number(session.coordination_version || session.last_seen_coordination_version || 0)
    if (Number(session.coordination_id || 0) > 0 && typeof dep('byId') === 'function') {
      const coordination = await dep('byId')('date_coordination', Number(session.coordination_id))
      if (coordination) coordinationVersion = Number(coordination.coordination_version || coordinationVersion || 1)
    }
    return {
      session: publicSession(session),
      messages: rows.map(publicMessage),
      session_generation: Number(session.session_generation || session.id || 0),
      coordination_version: coordinationVersion,
      session_status: String(session.status || '')
    }
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
    if (session.status === 'manual_pending') {
      return {
        session_id: session.id,
        agent_type: session.agent_type,
        reply: '你的会话已转人工客服，请耐心等待工作人员回复。',
        manual_pending: true,
        handoff: buildHumanServiceHandoff()
      }
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
        return { session_id: session.id, agent_type: session.agent_type, reply, declined: false }
      }
      const possibleMeetingIntent = coordination ? meetingConversationIntent(content) : null
      const meetingIntent = possibleMeetingIntent && (
        coordination.status === 'arranged'
        || (coordination.status === 'waiting_confirmations'
          && (possibleMeetingIntent.action === 'set_arrival_hint' || possibleMeetingIntent.query === 'partner_hint'))
      ) ? possibleMeetingIntent : null
      if (meetingIntent) {
        await saveMessage(session, user, 'user', content)
        const applications = await dep('list')('date_coordination_application', {
          coordination_id: Number(coordination.id)
        }, 50)
        let meetingState = publicMeetingState(coordination, applications, user.id, dep('env'))
        if (meetingIntent.action) {
          meetingState = await applyMeetingCheckIn({
            coordination_id: Number(coordination.id),
            user_id: Number(user.id),
            action: meetingIntent.action,
            arrival_hint: meetingIntent.arrival_hint,
            arrival_position: meetingIntent.arrival_position
          }, {
            byId: dep('byId'),
            list: dep('list'),
            updateByDoc: dep('updateByDoc'),
            publishCoordinationEvent: dep('publishCoordinationEvent'),
            now: dep('now'),
            env: dep('env')
          })
        }
        const reply = meetingReply(meetingIntent, meetingState)
        if (!meetingIntent.action) await saveMessage(session, user, 'assistant', reply)
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          meeting_checkin: meetingState,
          risk_level: meetingIntent.action === 'mismatch' ? 'high' : 'safe'
        }
      }
      if (coordination && isTerminalCoordination(coordination.status) && !canWriteCoordinatorAction(coordination, user, { hasOwnApplication: Boolean(ownApp) })) {
        const role = isInitiator(coordination, user) ? 'initiator' : 'invitee'
        const reply = coordinatorWelcomeText(coordination, role) || terminalWriteError(coordination.status)
        await saveMessage(session, user, 'assistant', reply)
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          declined: coordination.status === 'invitation_declined',
          read_only: true
        }
      }
    }
    if (session.agent_type === AGENT_TYPES.LOVE_ADVISOR) await enforceLoveQuota(user)
    const userMessage = await saveMessage(session, user, 'user', content)

    const risk = classifyRisk(content)
    if (!risk.allowed) {
      if (risk.category === RISK.HIGH_RISK) {
        await createTicketFor(session, user, { priority: 'P0', category: 'safety_crisis', summary: '系统识别到高风险求助，请人工尽快查看' })
      }
      const reply = riskReply(risk.category)
      await saveMessage(session, user, 'assistant', reply, { risk_level: risk.category })
      return { session_id: session.id, agent_type: session.agent_type, reply, risk_level: risk.category, manual_pending: risk.category === RISK.HIGH_RISK }
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
          return {
            session_id: session.id,
            agent_type: session.agent_type,
            reply,
            provider: 'langgraph',
            manual_pending: graphResult.status === 'manual_pending',
            risk_level: 'safe'
          }
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
      const statusText = {
        collecting_initiator: '发起方正在填写约会偏好，提交后会向对方发出邀请',
        inviting_partner: '正在等待对方确认是否参与协调',
        collecting_preferences: '正在分别填写约会偏好',
        computing_overlap: '正在计算双方条件交集',
        waiting_confirmations: '已有候选方案，正在等待双方确认同一个方案',
        no_overlap: '暂时没有完整交集，可以调整偏好重新协调',
        replanning: '正在进行新一轮偏好协调',
        arranged: '双方已确认同一个方案，约会安排已经形成',
        manual_handoff: '自动协调已转人工客服继续协助',
        closed: '本轮协调已关闭',
        cancelled: '本次约会邀请已取消',
        invitation_declined: '对方暂未接受本次约会邀请',
        expired: '当前协调已过期'
      }[coordination.status] || '协调任务正在处理中'
      const coordinationHandlerDeps = {
        first: dep('first'),
        list: dep('list'),
        byId: dep('byId'),
        addWithId: dep('addWithId'),
        updateByDoc: dep('updateByDoc'),
        claimPendingPatch: dep('claimPendingPatch'),
        writeInboxNotification: (input) => dep('notifyInbox')(input),
        now: dep('now')
      }
      if (overrides.unitMode === true) {
        coordinationHandlerDeps.unitMode = true
        if (overrides.tables) coordinationHandlerDeps.tables = overrides.tables
        if (overrides.rows) coordinationHandlerDeps.rows = overrides.rows
      }
      if (overrides.unitMode !== true || Object.prototype.hasOwnProperty.call(overrides, 'publishCoordinationEvent')) {
        coordinationHandlerDeps.publishCoordinationEvent = dep('publishCoordinationEvent')
      }
      if (overrides.unitMode !== true || Object.prototype.hasOwnProperty.call(overrides, 'commitPreAcceptInvitationPatch')) {
        const commitPre = dep('commitPreAcceptInvitationPatch')
        if (typeof commitPre === 'function') coordinationHandlerDeps.commitPreAcceptInvitationPatch = commitPre
      }
      if (overrides.unitMode !== true || Object.prototype.hasOwnProperty.call(overrides, 'commitPostAcceptApplicationPatch')) {
        const commitPost = dep('commitPostAcceptApplicationPatch')
        if (typeof commitPost === 'function') coordinationHandlerDeps.commitPostAcceptApplicationPatch = commitPost
      }
      const coordinationHandlers = createDateCoordinationHandlers(coordinationHandlerDeps)
      const patchHandlerDeps = {
        first: dep('first'),
        list: dep('list'),
        byId: dep('byId'),
        addWithId: dep('addWithId'),
        updateByDoc: dep('updateByDoc'),
        now: dep('now'),
        saveApplicationForUser: coordinationHandlers.saveApplicationForUser,
        writeInboxNotification: (input) => dep('notifyInbox')(input)
      }
      if (overrides.unitMode === true) {
        patchHandlerDeps.unitMode = true
        if (overrides.tables) patchHandlerDeps.tables = overrides.tables
        if (overrides.rows) patchHandlerDeps.rows = overrides.rows
      }
      if (overrides.unitMode !== true || Object.prototype.hasOwnProperty.call(overrides, 'publishCoordinationEvent')) {
        patchHandlerDeps.publishCoordinationEvent = dep('publishCoordinationEvent')
      }
      const claimPendingPatchDep = dep('claimPendingPatch')
      if (typeof claimPendingPatchDep === 'function') patchHandlerDeps.claimPendingPatch = claimPendingPatchDep
      if (overrides.unitMode !== true || Object.prototype.hasOwnProperty.call(overrides, 'commitPreAcceptInvitationPatch')) {
        const commitPreAcceptInvitationPatchDep = dep('commitPreAcceptInvitationPatch')
        if (typeof commitPreAcceptInvitationPatchDep === 'function') {
          patchHandlerDeps.commitPreAcceptInvitationPatch = commitPreAcceptInvitationPatchDep
        }
      }
      if (overrides.unitMode !== true || Object.prototype.hasOwnProperty.call(overrides, 'commitPostAcceptApplicationPatch')) {
        const commitPostAcceptApplicationPatchDep = dep('commitPostAcceptApplicationPatch')
        if (typeof commitPostAcceptApplicationPatchDep === 'function') {
          patchHandlerDeps.commitPostAcceptApplicationPatch = commitPostAcceptApplicationPatchDep
        }
      }
      const patchHandlers = createDateApplicationPatchHandlers(patchHandlerDeps)
      const allApplications = await dep('list')('date_coordination_application', {
        coordination_id: Number(coordination.id)
      }, 200)
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
      if (graphConfig.enabled) {
        const graphInput = buildDateCoordinationGraphInput(coordination, allApplications, user, { confirmations })
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
            invokeFunction: dep('invokeGraphFunction')
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
              error_code: dateGraphResult.errorCode || ''
            }, 'agent_run')
          } else {
            await dep('addWithId')('agent_run', {
              session_id: session.id,
              user_id: user.id,
              agent_type: session.agent_type,
              coordination_id: Number(coordination.id),
              coordination_version: Number(coordination.coordination_version || 1),
              status: 'fallback',
              provider: 'langgraph',
              intent: 'date_coordination_state',
              risk_level: 'safe',
              error_code: String(graphStep.code || graphStep.kind || 'graph_fallback').slice(0, 80)
            }, 'agent_run')
          }
        } catch (_) {
          // Graph failures fall through to the established backend/DeepSeek path.
        }
      }
      // LangGraph is the primary interaction layer for coordination when it can
      // answer directly; modification requests still go to the backend patch
      // preview pipeline (deterministic business layer owns every write).
      const modificationIntent = classifyChangeIntent(content, { coordination: true }) === 'modify_date_application'
      const partnerInquiryLike = /询问对方|问问对方|告诉对方|通知对方|发给对方|对方.*(?:可以|方便)吗/.test(content)
      const questionLike = /进度|状态|哪一步|怎么样了|看看|怎么样|如何|情况|进展|确认|方案|安排|协调|在吗|\?|？/.test(content)
      if (!modificationIntent && !partnerInquiryLike && !pendingActionIntent(content)
        && dateGraphResult && ['completed', 'awaiting_confirmation'].includes(dateGraphResult.status)
        && dateGraphResult.replyDraft && (questionLike || resumeText)) {
        const reply = [resumeText, dateGraphResult.replyDraft].filter(Boolean).join('\n')
        await saveMessage(session, user, 'assistant', reply, { graph_phase: dateGraphResult.phase })
        await markSeen()
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          provider: 'langgraph',
          graph_phase: dateGraphResult.phase,
          resume_summary: resumeText ? true : undefined,
          risk_level: 'safe'
        }
      }
      const sessionMessages = await dep('list')('agent_message', { session_id: Number(session.id) }, 100)
      const pendingInquiryMessage = sessionMessages
        .filter((row) => row.role === 'assistant'
          && row.partner_inquiry_preview
          && row.partner_inquiry_preview.status === 'pending_confirmation')
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
      const pendingPatchesEarly = await dep('list')('date_application_patch', {
        coordination_id: Number(coordination.id),
        session_id: Number(session.id),
        user_id: Number(user.id),
        status: 'pending_confirmation'
      }, 100)
      const pendingPatchEarly = pendingPatchesEarly.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
      const earlyActionIntent = pendingActionIntent(content)
      if (pendingPatchEarly && pendingInquiryMessage && earlyActionIntent === 'confirm') {
        const reply = '你现在有一份待确认的修改预览，也有一份待确认的对方询问。请明确说“确认修改”或“确认询问对方”。'
        await saveMessage(session, user, 'assistant', reply)
        return { session_id: session.id, agent_type: session.agent_type, reply, needs_clarification: true, risk_level: 'safe' }
      }
      if (pendingPatchEarly && earlyActionIntent === 'confirm' && !pendingInquiryMessage) {
        // fall through to existing pendingPatch confirm block below
      } else if (pendingInquiryMessage && earlyActionIntent === 'confirm' && !pendingPatchEarly) {
        // keep existing inquiry confirm path
      }
      const inquiryActionIntent = pendingInquiryMessage && !pendingPatchEarly ? pendingActionIntent(content) : ''
      if (pendingInquiryMessage && inquiryActionIntent === 'confirm') {
        const latestCoordination = await dep('byId')('date_coordination', Number(coordination.id))
        const latestApplications = await dep('list')('date_coordination_application', {
          coordination_id: Number(coordination.id)
        }, 200)
        const latestConfirmations = await dep('list')('date_coordination_confirmation', {
          coordination_id: Number(coordination.id)
        }, 50).catch(() => [])
        const preview = inquiryPreviewFromGraph(latestCoordination, latestApplications, user, latestConfirmations)
        const previous = pendingInquiryMessage.partner_inquiry_preview
        if (!preview
          || Number(previous.coordination_version) !== Number(latestCoordination.coordination_version || 1)
          || String(previous.proposal_token || '') !== String(preview.proposal_token || '')) {
          await dep('updateByDoc')('agent_message', pendingInquiryMessage, {
            partner_inquiry_preview: Object.assign({}, previous, { status: 'expired' })
          })
          const reply = '协调方案刚刚发生了变化，这份询问预览已失效。请重新告诉我想询问对方的方案。'
          await saveMessage(session, user, 'assistant', reply)
          return { session_id: session.id, agent_type: session.agent_type, reply, stale_preview: true, risk_level: 'safe' }
        }
        const partnerId = Number(preview.recipient_user_id)
        const partnerSessions = await dep('list')('agent_session', {
          user_id: partnerId,
          agent_type: AGENT_TYPES.DATE_COORDINATOR
        }, 100)
        const partnerSession = partnerSessions.find((row) => (
          Number(row.coordination_id) === Number(coordination.id)
          && !['closed', 'cancelled'].includes(row.status)
        )) || await dep('addWithId')('agent_session', {
          user_id: partnerId,
          agent_type: AGENT_TYPES.DATE_COORDINATOR,
          coordination_id: Number(coordination.id),
          status: 'active',
          summary: '',
          unresolved_count: 0
        }, 'agent_session')
        const sentPreview = Object.assign({}, preview, {
          status: 'sent',
          sent_at: dep('now')()
        })
        await dep('updateByDoc')('agent_message', pendingInquiryMessage, {
          partner_inquiry_preview: sentPreview
        })
        await dep('addWithId')('agent_message', {
          session_id: Number(partnerSession.id),
          user_id: partnerId,
          agent_type: AGENT_TYPES.DATE_COORDINATOR,
          role: 'assistant',
          sender_type: 'agent',
          content: `对方想询问你是否接受这份调整：${preview.body} 你可以在约会协调详情中接受，或继续告诉我希望调整哪一项。`,
          partner_inquiry: publicPartnerInquiry(sentPreview)
        }, 'agent_message')
        await dep('notifyInbox')({
          coordination: latestCoordination,
          user_id: partnerId,
          event_type: 'partner_inquiry',
          coordination_version: Number(latestCoordination.coordination_version || 1),
          title: '对方发来一份约会调整询问',
          body: '请查看调整内容，并选择接受或继续协商。',
          stage: 'coordination'
        })
        const reply = '已确认发送给对方。对方可以接受这份调整，也可以继续提出其他时间或安排。'
        await recordTool(session, user, PARTNER_INQUIRY_TOOL, 'completed')
        await saveMessage(session, user, 'assistant', reply, { execution_verified: true })
        await markSeen()
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          tool: PARTNER_INQUIRY_TOOL,
          partner_notified: true,
          risk_level: 'safe'
        }
      }
      if (pendingInquiryMessage && inquiryActionIntent === 'cancel') {
        const previous = pendingInquiryMessage.partner_inquiry_preview
        await dep('updateByDoc')('agent_message', pendingInquiryMessage, {
          partner_inquiry_preview: Object.assign({}, previous, { status: 'cancelled' })
        })
        const reply = '好的，这份询问已取消，不会通知对方。'
        await saveMessage(session, user, 'assistant', reply)
        return { session_id: session.id, agent_type: session.agent_type, reply, cancelled: true, risk_level: 'safe' }
      }
      const receivedInquiryMessage = sessionMessages
        .filter((row) => row.role === 'assistant'
          && row.partner_inquiry
          && row.partner_inquiry.status === 'sent')
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
      const acceptsReceivedInquiry = /^(?:接受|同意|可以|就这个|确认接受|接受这份调整)[！!。.]?$/.test(String(content || '').trim())
      if (receivedInquiryMessage && acceptsReceivedInquiry) {
        const inquiry = receivedInquiryMessage.partner_inquiry || {}
        try {
          await coordinationHandlers.acceptCounterOfferForUser({
            coordination_id: Number(coordination.id),
            coordination_version: Number(inquiry.coordination_version || coordination.coordination_version || 1),
            proposal_token: String(inquiry.proposal_token || '')
          }, user)
        } catch (err) {
          if (String(err && (err.publicCode || err.code) || '') === 'COUNTER_OFFER_STALE'
            || /调整方案已更新|失效|最新/.test(String(err && err.message || ''))) {
            const reply = '对方刚更新了调整方案，请先看一下最新版本。'
            await saveMessage(session, user, 'assistant', reply)
            return { session_id: session.id, agent_type: session.agent_type, reply, stale_inquiry: true, risk_level: 'safe' }
          }
          throw err
        }
        await dep('updateByDoc')('agent_message', receivedInquiryMessage, {
          partner_inquiry: Object.assign({}, inquiry, { status: 'accepted' })
        })
        const reply = '已接受这份调整并重新计算双方安排。若其他条件仍一致，系统会进入共同方案确认；如仍有差异，我会继续说明需要协调的项目。'
        await recordTool(session, user, 'accept_partner_counter_proposal', 'completed')
        await saveMessage(session, user, 'assistant', reply, { execution_verified: true })
        await markSeen()
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          tool: 'accept_partner_counter_proposal',
          accepted: true,
          risk_level: 'safe'
        }
      }
      const pendingPatches = await dep('list')('date_application_patch', {
        coordination_id: Number(coordination.id),
        session_id: Number(session.id),
        user_id: Number(user.id),
        status: 'pending_confirmation'
      }, 100)
      const pendingPatch = pendingPatches.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
      const actionIntent = pendingPatch ? pendingActionIntent(content) : ''
      if (pendingPatch && actionIntent === 'confirm') {
        try {
          const applied = await patchHandlers.confirmForUser({
            coordination_id: Number(coordination.id),
            patch_id: Number(pendingPatch.id)
          }, user)
          const isCreate = pendingPatch.operation === 'create'
          const toolName = isCreate ? CONFIRM_APPLICATION_TOOL : PATCH_TOOL
          const reply = isCreate
            ? '约会申请已发送给对方，正在等待对方回应。我会在协调状态变化后及时告诉你。'
            : '约会条件已按你的确认更新；如需对方配合，系统会使用隐私安全摘要通知对方。'
          await recordTool(session, user, toolName, 'completed')
          await dep('addWithId')('agent_run', {
            session_id: session.id,
            user_id: user.id,
            agent_type: session.agent_type,
            coordination_id: Number(coordination.id),
            coordination_version: Number(applied.coordination_version || coordination.coordination_version || 1),
            status: 'completed',
            provider: 'backend',
            intent: toolName,
            risk_level: 'safe',
            error_code: ''
          }, 'agent_run')
          await saveMessage(session, user, 'assistant', reply, {
            coordination_id: Number(coordination.id),
            execution_verified: true,
            application_sent: isCreate
          })
          await markSeen()
          return {
            session_id: session.id,
            agent_type: session.agent_type,
            reply,
            tool: toolName,
            application_sent: isCreate || undefined,
            coordination_version: applied.coordination_version,
            partner_notified: applied.partner_notified === true,
            risk_level: 'safe'
          }
        } catch (err) {
          await recordTool(session, user, pendingPatch.operation === 'create' ? CONFIRM_APPLICATION_TOOL : PATCH_TOOL, 'failed', 'confirmation_failed')
          const reply = `申请尚未发送：${err.message}`
          await saveMessage(session, user, 'assistant', reply)
          return { session_id: session.id, agent_type: session.agent_type, reply, tool_failed: true, risk_level: 'safe' }
        }
      }
      if (pendingPatch && actionIntent === 'cancel') {
        await patchHandlers.cancelForUser({ patch_id: Number(pendingPatch.id) }, user)
        const reply = '好的，这份待发送申请已取消，不会通知对方。'
        await saveMessage(session, user, 'assistant', reply)
        return { session_id: session.id, agent_type: session.agent_type, reply, cancelled: true, risk_level: 'safe' }
      }
      if (/进度|状态|哪一步|怎么样了/.test(content)) {
        const graphReply = dateGraphResult && dateGraphResult.replyDraft
          ? `${dateGraphResult.replyDraft} 我只会说明共同进度，不会展示对方的原始回答。`
          : `当前进度：${statusText}。我只会说明共同进度，不会展示对方的原始回答。`
        const reply = [resumeText, graphReply].filter(Boolean).join('\n')
        await recordTool(session, user, TOOL_NAMES.DATE_COORDINATION, 'completed')
        await saveMessage(session, user, 'assistant', reply, dateGraphResult ? { graph_phase: dateGraphResult.phase } : {})
        await markSeen()
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          tool: TOOL_NAMES.DATE_COORDINATION,
          provider: dateGraphResult ? 'langgraph' : 'backend',
          graph_phase: dateGraphResult ? dateGraphResult.phase : undefined,
          risk_level: 'safe'
        }
      }

      const ownApplicationRow = latestApplication(allApplications, user.id, coordination.coordination_version)
      const planClarification = classifyChangeIntent(content, { coordination: true }) === 'modify_date_application'
        ? movieVenueClarification(content, ownApplicationRow && ownApplicationRow.application)
        : ''
      if (planClarification) {
        await recordTool(session, user, TOOL_NAMES.DATE_COORDINATION, 'completed')
        await saveMessage(session, user, 'assistant', planClarification, {
          graph_phase: 'clarify_activity_venue',
          coordination_id: Number(coordination.id)
        })
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply: planClarification,
          tool: TOOL_NAMES.DATE_COORDINATION,
          provider: 'backend',
          graph_phase: 'clarify_activity_venue',
          risk_level: 'safe'
        }
      }
      const context = buildContext({
        summary: session.summary || '',
        turns: await recentTurns(session),
        businessState: {
          member_status: user.member_status || '',
          vip_status: isVip(user, dep('now')()) ? 'active' : 'inactive',
          date_status: coordination.status
        },
          coordinationState: {
          status: coordination.status,
          business_state: coordination.business_state || '',
          coordination_version: Number(coordination.coordination_version || 1),
          own_application_status: ownApplicationRow ? 'submitted' : 'missing',
          partner_progress: 'private',
          missing_dimensions: coordination.missing_dimensions || [],
          coordination_path: dateGraphResult && dateGraphResult.sharedState
            ? dateGraphResult.sharedState.coordinationPath || ''
            : '',
          has_complete_base_proposal: Boolean(
            coordination.invitation_primary_proposal
            && coordination.invitation_primary_proposal.date
            && coordination.invitation_primary_proposal.area
            && coordination.invitation_primary_proposal.activity
          )
        },
        ownApplication: ownApplicationRow && ownApplicationRow.application,
        knowledge: [],
        budget: 6000
      })
      const allowedTools = [
        TOOL_NAMES.DATE_COORDINATION,
        PATCH_TOOL,
        CREATE_APPLICATION_PREVIEW_TOOL,
        PARTNER_INQUIRY_TOOL,
        TOOL_NAMES.MATCH
      ]
      let decision = await dep('generateDecision')({
        agentType: session.agent_type,
        message: content,
        context,
        prompt: JSON.stringify({
          agent_role: 'WeFinally AI约会协调员',
          current_date: dep('now')().toISOString().slice(0, 10),
          user_message: content,
          context,
          allowed_tools: allowedTools,
          application_schema: {
            availability: [{ date: 'YYYY-MM-DD', periods: ['morning|afternoon|evening|night'] }],
            areas: ['行政区或公共商圈'],
            activities: ['咖啡|吃饭|奶茶|散步|看展|电影|桌游，最多3项'],
            start_time: 'HH:mm；用户说晚上8点时必须输出20:00，并将period设为night',
            activity_venue: '用户约定的公共见面地点，可为商圈、商场或门店；原文保留',
            venue_choice_mode: 'named_location|choose_on_arrival|meet_first；用户明确先在这里碰面再去影院时用meet_first',
            area_hint: '已确认的大致区域或商圈，例如大运中心附近',
            activity_detail: '已确认的活动或餐饮类型，例如椰子鸡',
            venue_resolution: '{ status: resolved|needs_specific_venue, missing_fields: [activity_venue] }',
            meet_point: '可选的初步会合范围，例如影城大厅；双方不熟悉现场时允许留空',
            arrival_hint: '可选的非敏感穿搭或手持物提示，不得包含联系方式',
            budget: 'under-50|50-100|100-200|over-200|flexible',
            payment_preference: 'aa|partner_pays|self_pays|flexible',
            duration: 'about-1h|1-2h|2-3h|flexible',
            transport_constraints: '可选字符串',
            other_requirements: '可选字符串',
            share_message: '可选字符串'
          },
          rules: [
            '只能读取和建议修改当前用户自己的约会申请',
            '区分三条路径：接受完整邀请、基于完整邀请只调整明确字段、双方分别填写可接受范围后计算交集',
            '“周日”等短答只代表时间字段，不能擅自推断地点、活动、预算、费用或时长；是否沿用其他字段由 has_complete_base_proposal 决定，并且必须展示预览让用户确认',
            '用户给出具体钟点时必须保留为start_time；20:00属于night，不能只降级为evening或“晚上”',
            '活动与场地歧义时必须澄清：例如“电影+星巴克”要询问是否先在星巴克碰面再去影院；不能静默拼接，也不能直接硬拒绝',
            '地点允许商圈/商场/公共场馆或具体门店：用户填写的“大运中心”“万象城”应保留在activity_venue，location_precision=area；纯菜品如“椰子鸡”写入activity_detail并询问地点，不得假装已有地点',
            '宽泛地点可以发送邀请与最终确认，不得反复强迫补具体门店；用户明确“到场后再选店”时应记录venue_choice_mode=choose_on_arrival并停止追问',
            '用户确认先在星巴克碰面再看电影时，保留activity_venue并将venue_choice_mode设为meet_first；影院待商量由服务器生成。不能填写accepted_by或假称双方已经同意',
            '最终方案必须有activity_venue（可为商圈级）；meet_point只是可选的初步会合范围。到场后可转述用户主动提供的吧台旁、靠窗座位等公共现场位置',
            '到场识别使用arrival_hint，只能转述用户主动提供的非敏感穿搭或手持物，不能声称AI验证了现实身份',
            '明确修改请求返回 intent=modify_date_application 和 create_date_application_patch，arguments 只包含用户明确修改的字段',
            '当前用户还没有申请但存在完整基础方案时，允许只提交明确 override；后台会继承基础方案并在预览中区分“调整项/保持不变项”',
            '当前用户还没有申请且没有完整基础方案时，返回 intent=create_date_application 和 create_date_application_preview，arguments.application 必须包含 availability、areas、activities、budget、payment_preference、duration',
            '用户表达含糊、没有指出调整哪一项时，返回 intent=clarify_scope，不调用写工具，只追问一个具体问题',
            '展示完整申请摘要时必须同时请求 create_date_application_preview，不能只生成普通聊天文本',
            '用户明确要求询问或通知对方是否接受当前调整方案时，返回 intent=generate_partner_notification 和同名工具；后台必须先生成询问预览，经用户确认后才发送',
            '用户确认发送时只能确认已有后台预览，绝不能自行宣称已经发送',
            '只生成修改预览，绝不直接修改数据库',
            '不得输出另一方原始回答、原因或隐私'
          ]
        }).slice(0, 7000)
      })
      decision = applyExactTimeToDecision(decision, content, ownApplicationRow && ownApplicationRow.application)
      await dep('addWithId')('agent_run', {
        session_id: session.id,
        user_id: user.id,
        agent_type: session.agent_type,
        coordination_id: Number(coordination.id),
        coordination_version: Number(coordination.coordination_version || 1),
        status: decision.fallback ? 'fallback' : 'completed',
        provider: decision.provider || 'fallback',
        intent: decision.intent || '',
        risk_level: decision.riskLevel || 'safe',
        error_code: decision.errorCode || ''
      }, 'agent_run')

      const toolRequest = decision.toolRequest || null
      if (decision.intent === PARTNER_INQUIRY_TOOL
        && toolRequest && toolRequest.tool === PARTNER_INQUIRY_TOOL) {
        const preview = inquiryPreviewFromGraph(coordination, allApplications, user, confirmations)
        if (!preview) {
          const reply = '目前还没有一份可以安全询问对方的明确调整方案。请先告诉我具体想改哪一项，例如“改成周日下午”，我会先生成修改预览。'
          await recordTool(session, user, PARTNER_INQUIRY_TOOL, 'failed', 'no_structured_proposal')
          await saveMessage(session, user, 'assistant', reply)
          return { session_id: session.id, agent_type: session.agent_type, reply, tool_failed: true, risk_level: 'safe' }
        }
        const reply = '我已整理好要询问对方的方案。请先核对调整项和保持不变项，确认后才会通知对方。'
        await recordTool(session, user, PARTNER_INQUIRY_TOOL, 'completed')
        await saveMessage(session, user, 'assistant', reply, { partner_inquiry_preview: preview })
        return {
          session_id: session.id,
          agent_type: session.agent_type,
          reply,
          provider: decision.provider || 'deepseek',
          tool: PARTNER_INQUIRY_TOOL,
          partner_inquiry_preview: publicPartnerInquiry(preview),
          requires_confirmation: true,
          risk_level: 'safe',
          suggested_actions: ['confirm_partner_inquiry', 'cancel_partner_inquiry']
        }
      }
      if (decision.intent === 'modify_date_application' && toolRequest && toolRequest.tool === PATCH_TOOL) {
        try {
          const args = Object.assign({}, toolRequest.arguments || {})
          const primarySelection = args.primary_selection
          delete args.primary_selection
          delete args.invitation_primary_proposal
          delete args.primary_proposal
          delete args.payment_mode
          delete args.payer_user_id
          const patchPreview = await patchHandlers.createPreviewForUser({
            coordination_id: Number(coordination.id),
            session_id: Number(session.id),
            source_message_id: Number(userMessage.id || 0),
            changes: args,
            primary_selection: primarySelection
          }, user, session)
          const needsPrimary = Boolean(patchPreview && patchPreview.preview && patchPreview.preview.primary_resolution_required)
          const reply = needsPrimary
            ? (patchPreview.preview.resolution_prompt || '可以，我已经按你的新条件更新了可接受范围。请选择这次更希望先建议的安排。')
            : (decision.replyDraft || '我整理了一份修改预览，请确认后再生效。')
          await recordTool(session, user, PATCH_TOOL, 'completed')
          await saveMessage(session, user, 'assistant', reply, { patch_preview: patchPreview })
          return {
            session_id: session.id,
            agent_type: session.agent_type,
            reply,
            provider: decision.provider || 'deepseek',
            tool: PATCH_TOOL,
            patch_preview: patchPreview,
            requires_confirmation: !needsPrimary,
            primary_resolution_required: needsPrimary,
            risk_level: decision.riskLevel || 'safe',
            suggested_actions: needsPrimary ? ['select_primary'] : ['confirm_patch', 'cancel_patch']
          }
        } catch (err) {
          await recordTool(session, user, PATCH_TOOL, 'failed', 'invalid_patch')
          const reply = `我理解你想调整约会条件，但暂时无法生成有效预览：${err.message}`
          await saveMessage(session, user, 'assistant', reply)
          return { session_id: session.id, agent_type: session.agent_type, reply, tool_failed: true, risk_level: 'safe' }
        }
      }
      if (decision.intent === 'create_date_application' && toolRequest && toolRequest.tool === CREATE_APPLICATION_PREVIEW_TOOL) {
        try {
          const patchPreview = await patchHandlers.createInitialPreviewForUser({
            coordination_id: Number(coordination.id),
            session_id: Number(session.id),
            source_message_id: Number(userMessage.id || 0),
            application: toolRequest.arguments && (toolRequest.arguments.application || toolRequest.arguments)
          }, user, session)
          const reply = '约会申请内容已经整理好。确认无误后直接回复“发送吧”，我会由后台正式发送给对方。'
          await recordTool(session, user, CREATE_APPLICATION_PREVIEW_TOOL, 'completed')
          await saveMessage(session, user, 'assistant', reply, { patch_preview: patchPreview })
          return {
            session_id: session.id,
            agent_type: session.agent_type,
            reply,
            provider: decision.provider || 'deepseek',
            tool: CREATE_APPLICATION_PREVIEW_TOOL,
            patch_preview: patchPreview,
            requires_confirmation: true,
            risk_level: decision.riskLevel || 'safe',
            suggested_actions: ['confirm_application', 'cancel_application']
          }
        } catch (err) {
          await recordTool(session, user, CREATE_APPLICATION_PREVIEW_TOOL, 'failed', 'invalid_application_preview')
          const reply = `申请还没有发送，暂时无法生成完整预览：${err.message}`
          await saveMessage(session, user, 'assistant', reply)
          return { session_id: session.id, agent_type: session.agent_type, reply, tool_failed: true, risk_level: 'safe' }
        }
      }
      if (toolRequest && toolRequest.tool && !allowedTools.includes(toolRequest.tool)) {
        await recordTool(session, user, toolRequest.tool, 'failed', 'tool_not_allowed')
      }
      const reply = guardUnverifiedSuccessClaim(decision.replyDraft || `当前进度：${statusText}。你可以直接告诉我想调整的时间、区域或活动，我会先生成预览供你确认。`)
      const finalReply = resumeText ? resumeText + '\n' + reply : reply
      await saveMessage(session, user, 'assistant', finalReply)
      await markSeen()
      return {
        session_id: session.id,
        agent_type: session.agent_type,
        reply: finalReply,
        provider: decision.provider || 'fallback',
        risk_level: decision.riskLevel || 'safe',
        suggested_actions: decision.suggestedActions || []
      }
    }

    const tool = session.agent_type === AGENT_TYPES.PLATFORM_SERVICE ? inferTool(content) : ''
    if (tool === TOOL_NAMES.HUMAN_TICKET) {
      await recordTool(session, user, tool, 'completed')
      const ticket = await createTicketFor(session, user, { priority: 'P2', category: 'user_request', summary: content })
      const reply = '已为你转接人工客服，工作人员会在服务时间内查看并回复。'
      await saveMessage(session, user, 'assistant', reply, { handoff: ticket.handoff })
      return { session_id: session.id, agent_type: session.agent_type, reply, tool, manual_pending: true, handoff: ticket.handoff }
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
    const knowledge = searchReviewedKnowledge(records.concat(BUILTIN_KNOWLEDGE_ARTICLES), content, 4)
    if (!knowledge.length && session.agent_type !== AGENT_TYPES.LOVE_ADVISOR) {
      const reply = '现有平台资料暂时没有可靠答案。涉及真实业务状态时，请说明具体想查询的项目或联系人工客服。'
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
