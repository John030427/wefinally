const GRAPH_TOOL_ALLOWLIST = Object.freeze({
  confirm_date_application: ['status', 'coordinationVersion', 'applicationSent', 'partnerNotified'],
  create_date_application_patch: ['patchId', 'status', 'coordinationVersion'],
  create_date_application_preview: ['previewId', 'status', 'coordinationVersion'],
  create_human_ticket: ['ticketId', 'status', 'priority'],
  get_coordination_overlap: ['hasOverlap', 'missingFields', 'proposal', 'coordinationVersion'],
  get_coordination_status: ['status', 'businessState', 'coordinationVersion', 'missingDimensions'],
  get_match_status: ['status', 'matchId'],
  notify_coordination_partner: ['notificationId', 'status', 'coordinationVersion']
})

const COORDINATION_TOOLS = new Set([
  'confirm_date_application',
  'create_date_application_patch',
  'create_date_application_preview',
  'get_coordination_overlap',
  'get_coordination_status',
  'notify_coordination_partner'
])

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function assertSafeObject(value, depth = 0) {
  if (depth > 6) throw new Error('graph_tool_arguments_invalid')
  if (!plainObject(value)) throw new Error('graph_tool_arguments_invalid')
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('graph_tool_arguments_invalid')
    if (plainObject(item)) assertSafeObject(item, depth + 1)
    if (Array.isArray(item) && item.length > 20) throw new Error('graph_tool_arguments_invalid')
  }
  if (JSON.stringify(value).length > 6000) throw new Error('graph_tool_arguments_invalid')
}

function safeToolResult(tool, raw) {
  const value = plainObject(raw) ? raw : {}
  const result = { ok: value.ok === true }
  if (typeof value.code === 'string') result.code = value.code.slice(0, 80)
  if (plainObject(value.data)) {
    const allowed = GRAPH_TOOL_ALLOWLIST[tool]
    result.data = allowed.reduce((output, key) => {
      if (value.data[key] !== undefined) output[key] = value.data[key]
      return output
    }, {})
  }
  return result
}

async function executeGraphTool(request, context, services) {
  if (!plainObject(request)) throw new Error('graph_tool_request_invalid')
  const tool = String(request.type || '')
  if (!Object.prototype.hasOwnProperty.call(GRAPH_TOOL_ALLOWLIST, tool)) throw new Error('graph_tool_not_allowed')
  const args = request.arguments || {}
  assertSafeObject(args)
  if (!plainObject(context) || !Number.isInteger(context.userId) || !Number.isInteger(context.sessionId)) {
    throw new Error('graph_tool_context_invalid')
  }
  if (COORDINATION_TOOLS.has(tool)) {
    if (Number(args.coordinationId) !== Number(context.coordinationId)) throw new Error('coordination_scope_mismatch')
    if (Number(args.coordinationVersion) !== Number(context.coordinationVersion)) throw new Error('stale_coordination_version')
  }
  const service = services && services[tool]
  if (typeof service !== 'function') throw new Error('graph_tool_service_missing')
  const safeContext = {
    userId: context.userId,
    sessionId: context.sessionId,
    coordinationId: Number(context.coordinationId || 0),
    coordinationVersion: Number(context.coordinationVersion || 0)
  }
  return safeToolResult(tool, await service(args, safeContext))
}

module.exports = {
  GRAPH_TOOL_ALLOWLIST,
  executeGraphTool,
  safeToolResult
}
