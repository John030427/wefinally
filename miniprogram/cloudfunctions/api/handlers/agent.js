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

const FREE_DAILY_LIMIT = 5
const VIP_DAILY_LIMIT = 30
const CREATE_APPLICATION_PREVIEW_TOOL = 'create_date_application_preview'
const CONFIRM_APPLICATION_TOOL = 'confirm_date_application'

function pendingActionIntent(content) {
  const text = String(content || '').trim()
  if (/取消|暂不|先不|不要|别发|不发送|不提交/.test(text)) return 'cancel'
  if (/确认(?:发送|提交)?|(?:帮我|请|可以|直接|就)?(?:发送|提交)(?:申请)?吧|没问题.*(?:发送|提交)|就这样.*(?:发送|提交)/.test(text)) return 'confirm'
  return ''
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
        manual_handoff: '自动协调已暂停，正在等待人工客服协助',
        expired: '当前协调已过期'
      }[coordination.status] || '协调任务正在处理中'
      const coordinationHandlers = createDateCoordinationHandlers({
        first: dep('first'),
        list: dep('list'),
        byId: dep('byId'),
        addWithId: dep('addWithId'),
        updateByDoc: dep('updateByDoc'),
        now: dep('now')
      })
      const patchHandlers = createDateApplicationPatchHandlers({
        first: dep('first'),
        list: dep('list'),
        byId: dep('byId'),
        addWithId: dep('addWithId'),
        updateByDoc: dep('updateByDoc'),
        claimPendingPatch: dep('claimPendingPatch'),
        now: dep('now'),
        saveApplicationForUser: coordinationHandlers.saveApplicationForUser
      })
      const allApplications = await dep('list')('date_coordination_application', {
        coordination_id: Number(coordination.id)
      }, 200)
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
        const graphInput = buildDateCoordinationGraphInput(coordination, allApplications, user)
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
      const modificationIntent = classifyChangeIntent(content) === 'modify_date_application'
      const questionLike = /进度|状态|哪一步|怎么样了|看看|怎么样|如何|情况|进展|确认|方案|安排|协调|在吗|\?|？/.test(content)
      if (!modificationIntent && dateGraphResult && ['completed', 'awaiting_confirmation'].includes(dateGraphResult.status)
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
          missing_dimensions: coordination.missing_dimensions || []
        },
        ownApplication: ownApplicationRow && ownApplicationRow.application,
        knowledge: [],
        budget: 6000
      })
      const allowedTools = [
        TOOL_NAMES.DATE_COORDINATION,
        PATCH_TOOL,
        CREATE_APPLICATION_PREVIEW_TOOL,
        'generate_partner_notification',
        TOOL_NAMES.MATCH
      ]
      const decision = await dep('generateDecision')({
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
            budget: 'under-50|50-100|100-200|over-200|flexible',
            payment_preference: 'aa|partner_pays|self_pays|flexible',
            duration: 'about-1h|1-2h|2-3h|flexible',
            transport_constraints: '可选字符串',
            other_requirements: '可选字符串',
            share_message: '可选字符串'
          },
          rules: [
            '只能读取和建议修改当前用户自己的约会申请',
            '明确修改请求返回 intent=modify_date_application 和 create_date_application_patch',
            '当前用户还没有申请且信息完整时，返回 intent=create_date_application 和 create_date_application_preview，arguments.application 必须包含 availability、areas、activities、budget、payment_preference、duration',
            '展示完整申请摘要时必须同时请求 create_date_application_preview，不能只生成普通聊天文本',
            '用户确认发送时只能确认已有后台预览，绝不能自行宣称已经发送',
            '只生成修改预览，绝不直接修改数据库',
            '不得输出另一方原始回答、原因或隐私'
          ]
        }).slice(0, 7000)
      })
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
      if (decision.intent === 'modify_date_application' && toolRequest && toolRequest.tool === PATCH_TOOL) {
        try {
          const patchPreview = await patchHandlers.createPreviewForUser({
            coordination_id: Number(coordination.id),
            session_id: Number(session.id),
            source_message_id: Number(userMessage.id || 0),
            changes: toolRequest.arguments || {}
          }, user, session)
          const reply = decision.replyDraft || '我整理了一份修改预览，请确认后再生效。'
          await recordTool(session, user, PATCH_TOOL, 'completed')
          await saveMessage(session, user, 'assistant', reply, { patch_preview: patchPreview })
          return {
            session_id: session.id,
            agent_type: session.agent_type,
            reply,
            provider: decision.provider || 'deepseek',
            tool: PATCH_TOOL,
            patch_preview: patchPreview,
            requires_confirmation: true,
            risk_level: decision.riskLevel || 'safe',
            suggested_actions: ['confirm_patch', 'cancel_patch']
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
