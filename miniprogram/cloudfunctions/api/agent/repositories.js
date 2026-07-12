const { AGENT_TYPES, isAgentType } = require('./types')

function iso(value) {
  return new Date(value || Date.now()).toISOString()
}

function safeId(prefix, value) {
  return value ? String(value) : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createAgentRepositories(dependencies) {
  const deps = dependencies || {}
  if (!deps.db || typeof deps.db.insert !== 'function') throw new Error('Agent repository requires an injected db.insert')
  const now = typeof deps.now === 'function' ? deps.now : () => new Date()

  async function insert(collection, document) {
    return deps.db.insert(collection, document)
  }

  return {
    async createSession(input) {
      const data = input || {}
      if (!isAgentType(data.agentType)) throw new Error('Invalid agent type')
      const createdAt = iso(now())
      const document = {
        id: safeId('agent_session', data.id),
        agent_type: data.agentType,
        user_id: String(data.userId || ''),
        status: data.status || 'active',
        create_time: createdAt,
        update_time: createdAt
      }
      const saved = await insert('agent_session', document)
      return {
        id: String(saved.id || document.id),
        agentType: document.agent_type,
        status: document.status,
        createdAt: document.create_time,
        updatedAt: document.update_time
      }
    },

    async recordRun(input) {
      const data = input || {}
      if (!isAgentType(data.agentType || AGENT_TYPES.PLATFORM_SERVICE)) throw new Error('Invalid agent type')
      const createdAt = iso(now())
      const document = {
        id: safeId('agent_run', data.id),
        session_id: String(data.sessionId || ''),
        agent_type: data.agentType || AGENT_TYPES.PLATFORM_SERVICE,
        status: data.status || 'completed',
        provider: String(data.provider || 'fallback').slice(0, 40),
        model: String(data.model || '').slice(0, 120),
        error_code: String(data.errorCode || '').slice(0, 80),
        create_time: createdAt,
        completed_time: data.completedAt ? iso(data.completedAt) : null
      }
      const saved = await insert('agent_run', document)
      return {
        id: String(saved.id || document.id),
        sessionId: document.session_id,
        agentType: document.agent_type,
        status: document.status,
        provider: document.provider,
        createdAt: document.create_time,
        completedAt: document.completed_time
      }
    },

    async recordToolAudit(input) {
      const data = input || {}
      const createdAt = iso(now())
      const document = {
        id: safeId('agent_tool_audit', data.id),
        session_id: String(data.sessionId || ''),
        run_id: String(data.runId || ''),
        tool: String(data.tool || '').slice(0, 80),
        status: data.status || 'completed',
        error_code: String(data.errorCode || '').slice(0, 80),
        create_time: createdAt
      }
      const saved = await insert('agent_tool_audit', document)
      return {
        id: String(saved.id || document.id),
        sessionId: document.session_id,
        runId: document.run_id,
        tool: document.tool,
        status: document.status,
        createdAt: document.create_time
      }
    }
  }
}

module.exports = {
  createAgentRepositories
}
