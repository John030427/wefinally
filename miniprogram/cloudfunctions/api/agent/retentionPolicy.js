const DEFAULT_RETENTION_DAYS = {
  messages: 180,
  toolCalls: 365,
  memories: 365
}

function retentionDays(env = process.env) {
  const value = (name, fallback) => {
    const parsed = Number(env[name])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }
  return {
    messages: value('AGENT_MESSAGE_RETENTION_DAYS', DEFAULT_RETENTION_DAYS.messages),
    toolCalls: value('AGENT_TOOL_RETENTION_DAYS', DEFAULT_RETENTION_DAYS.toolCalls),
    memories: value('AGENT_MEMORY_RETENTION_DAYS', DEFAULT_RETENTION_DAYS.memories)
  }
}

function cutoffDates(now = new Date(), env = process.env) {
  const days = retentionDays(env)
  const cutoff = count => new Date(now.getTime() - count * 86400000)
  return {
    agent_message: cutoff(days.messages),
    agent_tool_call: cutoff(days.toolCalls),
    user_agent_memory: cutoff(days.memories)
  }
}

function isExpiredMemory(memory, now = new Date(), env = process.env) {
  if (memory && memory.expires_at) return new Date(memory.expires_at) <= now
  const created = memory && (memory.create_time || memory.created_at)
  return Boolean(created) && new Date(created) <= cutoffDates(now, env).user_agent_memory
}

module.exports = { DEFAULT_RETENTION_DAYS, retentionDays, cutoffDates, isExpiredMemory }
