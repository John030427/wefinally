const crypto = require('crypto')
const { sanitizeOutput } = require('./safety')

const RESULT_STATUSES = new Set(['completed', 'awaiting_tool', 'awaiting_confirmation', 'manual_pending', 'fallback'])

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true'
}

function readLangGraphConfig(env = process.env) {
  const rawTimeout = Number(env.LANGGRAPH_TIMEOUT_MS || 8000)
  return {
    enabled: enabled(env.LANGGRAPH_ENABLED),
    shadowMode: enabled(env.LANGGRAPH_SHADOW_MODE),
    timeoutMs: Math.max(10, Math.min(30000, Number.isFinite(rawTimeout) ? rawTimeout : 8000)),
    actorSecret: String(env.LANGGRAPH_ACTOR_SECRET || '').trim()
  }
}

function requireSecret(secret) {
  const value = String(secret || '').trim()
  if (!value) throw new Error('langgraph_actor_secret_missing')
  return value
}

function opaqueId(prefix, value, secret) {
  return `${prefix}${crypto.createHmac('sha256', requireSecret(secret)).update(String(value)).digest('hex').slice(0, 32)}`
}

function createActorRef(userId, secret) {
  return opaqueId('usr_', `user:${userId}`, secret)
}

function createThreadId(sessionId, secret) {
  return opaqueId('wf_thread_', `session:${sessionId}`, secret)
}

function sanitizeText(value, limit) {
  return String(sanitizeOutput(String(value || '')))
    .replace(/\b(?:sk|api)[-_][A-Za-z0-9_-]{12,}\b/gi, '[已隐藏密钥]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}

function safePendingAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const type = String(value.type || '')
  const args = value.arguments
  if (!/^[a-z_]{1,80}$/.test(type) || !args || typeof args !== 'object' || Array.isArray(args)) return null
  return {
    type,
    arguments: JSON.parse(JSON.stringify(args)),
    requiresConfirmation: value.requiresConfirmation === true
  }
}

function normalizeResult(value) {
  if (!value || typeof value !== 'object' || !RESULT_STATUSES.has(value.status)) return null
  const threadId = String(value.threadId || '')
  const phase = String(value.phase || '')
  if (!/^wf_thread_[A-Za-z0-9_-]{10,80}$/.test(threadId) || !phase || phase.length > 80) return null
  const result = {
    status: value.status,
    threadId,
    phase,
    replyDraft: sanitizeText(value.replyDraft, 1200),
    pendingAction: safePendingAction(value.pendingAction)
  }
  if (Number.isInteger(value.coordinationVersion) && value.coordinationVersion > 0) result.coordinationVersion = value.coordinationVersion
  if (typeof value.errorCode === 'string') result.errorCode = value.errorCode.slice(0, 80)
  for (const key of ['coordinationCommand', 'candidatePlan', 'candidateChanges', 'baseVersion', 'contextRef', 'pendingPreview']) {
    if (value[key] !== undefined) result[key] = JSON.parse(JSON.stringify(value[key]))
  }
  if (value.pendingTool !== undefined) result.pendingTool = safePendingAction(value.pendingTool)
  return result
}

function safePayload(input) {
  const payload = {
    operation: input.operation || 'run',
    threadId: String(input.threadId || ''),
    actorRef: String(input.actorRef || '')
  }
  if (payload.operation === 'run') {
    payload.mode = input.mode
    payload.userText = sanitizeText(input.userText, 2000)
    payload.safeSummary = sanitizeText(input.safeSummary, 800)
    for (const key of [
      'coordinationId',
      'coordinationVersion',
      'party',
      'partyAState',
      'partyBState',
      'ownPreference',
      'canonicalOverlap',
      'sharedState',
      'partnerProgress',
      'confirmationSnapshot',
      'confirmationA',
      'confirmationB',
      'canonicalState',
      'candidatePlan',
      'candidateChanges',
      'baseVersion',
      'contextRef',
      'pendingPreview',
      'pendingTool'
    ]) {
      if (input[key] !== undefined) payload[key] = input[key]
    }
  } else if (payload.operation === 'resume_tool') {
    payload.toolResult = input.toolResult
    if (input.canonicalState !== undefined) payload.canonicalState = input.canonicalState
    if (input.pendingPreview !== undefined) payload.pendingPreview = input.pendingPreview
  } else if (payload.operation === 'resume_confirmation') {
    payload.confirmation = input.confirmation
  }
  return payload
}

function hasSafeIdentifiers(input) {
  return /^wf_thread_[A-Za-z0-9_-]{10,80}$/.test(String(input.threadId || ''))
    && /^usr_[a-f0-9]{16,64}$/.test(String(input.actorRef || ''))
    && (!input.operation || ['run', 'resume_tool', 'resume_confirmation'].includes(input.operation))
    && (input.operation && input.operation !== 'run' ? true : ['customer_service', 'date_coordination'].includes(input.mode))
}

async function invokeLangGraph(input, deps = {}) {
  const config = readLangGraphConfig(deps.env || process.env)
  if (!config.enabled) return { kind: 'disabled', code: 'graph_disabled' }
  if (!config.actorSecret) return { kind: 'fallback', code: 'graph_config_invalid' }
  if (typeof deps.invokeFunction !== 'function') return { kind: 'fallback', code: 'graph_invoker_missing' }
  if (!hasSafeIdentifiers(input)) return { kind: 'fallback', code: 'unsafe_context' }

  let timer
  try {
    const response = await Promise.race([
      deps.invokeFunction('agent-graph', safePayload(input)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('graph_timeout')), config.timeoutMs)
      })
    ])
    const body = response && typeof response === 'object' && response.result ? response.result : response
    if (!body || body.success !== true) {
      const baseCode = String((body && body.code) || 'graph_failed')
      const details = String((body && body.details) || '').replace(/[^A-Za-z0-9_.:,-]/g, '').slice(0, 120)
      return { kind: 'fallback', code: `${baseCode}${details ? `:${details}` : ''}`.slice(0, 160) }
    }
    const result = normalizeResult(body.data)
    return result ? { kind: 'result', result } : { kind: 'fallback', code: 'invalid_graph_result' }
  } catch (error) {
    return { kind: 'fallback', code: error && error.message === 'graph_timeout' ? 'graph_timeout' : 'graph_unavailable' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runLangGraphStep(input, deps = {}) {
  const config = readLangGraphConfig(deps.env || process.env)
  const first = await invokeLangGraph(input, deps)
  if (first.kind !== 'result') return first
  if (config.shadowMode) return { kind: 'shadow', result: first.result }
  if (first.result.status !== 'awaiting_tool' || !first.result.pendingAction) return first
  if (typeof deps.executeTool !== 'function') return { kind: 'fallback', code: 'graph_tool_executor_missing' }
  const toolResult = await deps.executeTool(first.result.pendingAction)
  const refreshed = typeof deps.refreshInput === 'function'
    ? await deps.refreshInput(input, first.result.pendingAction, toolResult)
    : {}
  return invokeLangGraph({
    operation: 'resume_tool',
    threadId: first.result.threadId,
    actorRef: input.actorRef,
    toolResult,
    ...refreshed
  }, deps)
}

module.exports = {
  readLangGraphConfig,
  createActorRef,
  createThreadId,
  invokeLangGraph,
  runLangGraphStep,
  normalizeResult
}
