const MAX_SUMMARY_CHARS = 800
const MAX_RECENT_TURNS = 4
const MAX_KNOWLEDGE_ITEMS = 4
const DEFAULT_CONTEXT_BUDGET = 6000

function text(value) {
  return String(value === undefined || value === null ? '' : value)
}

function take(value, size) {
  return text(value).slice(0, Math.max(0, size))
}

function normalizeTurn(turn) {
  return {
    user: text(turn && (turn.user || turn.question || turn.content)),
    assistant: text(turn && (turn.assistant || turn.answer || turn.response))
  }
}

function charCount(context) {
  const turnChars = context.recentTurns.reduce((total, turn) => total + turn.user.length + turn.assistant.length, 0)
  const knowledgeChars = context.knowledge.reduce((total, item) => total + item.title.length + item.content.length, 0)
  return context.summary.length + turnChars + knowledgeChars + JSON.stringify(context.businessState).length + JSON.stringify(context.coordinationState).length + JSON.stringify(context.ownApplication).length
}

function pick(source, keys) {
  return keys.reduce((result, key) => {
    if (source && source[key] !== undefined) result[key] = source[key]
    return result
  }, {})
}

function buildContext(input) {
  const source = input || {}
  const budget = Number.isFinite(Number(source.budget)) ? Math.max(0, Number(source.budget)) : DEFAULT_CONTEXT_BUDGET
  let remaining = budget
  const summary = take(source.summary, Math.min(MAX_SUMMARY_CHARS, remaining))
  remaining -= summary.length
  const turns = (Array.isArray(source.turns) ? source.turns : (Array.isArray(source.history) ? source.history : []))
    .slice(-MAX_RECENT_TURNS)
    .map(normalizeTurn)
  const recentTurns = turns.map((turn) => {
    const user = take(turn.user, Math.min(600, remaining))
    remaining -= user.length
    const assistant = take(turn.assistant, Math.min(600, remaining))
    remaining -= assistant.length
    return { user, assistant }
  })
  const businessState = pick(source.businessState, [
    'member_status', 'review_status', 'vip_status', 'match_status', 'date_status'
  ])
  remaining -= Math.min(remaining, JSON.stringify(businessState).length)
  const coordinationState = pick(source.coordinationState, [
    'status', 'business_state', 'coordination_version', 'own_application_status', 'partner_progress', 'deadline_type', 'missing_dimensions'
  ])
  remaining -= Math.min(remaining, JSON.stringify(coordinationState).length)
  const ownApplication = pick(source.ownApplication, [
    'availability', 'areas', 'activities', 'budget', 'payment_preference', 'duration',
    'transport_constraints', 'other_requirements', 'share_message'
  ])
  remaining -= Math.min(remaining, JSON.stringify(ownApplication).length)
  const knowledge = (Array.isArray(source.knowledge) ? source.knowledge : [])
    .slice(0, MAX_KNOWLEDGE_ITEMS)
    .map((item) => {
      const title = take(item && item.title, Math.min(120, remaining))
      remaining -= title.length
      const content = take(item && item.content, Math.min(500, remaining))
      remaining -= content.length
      return { id: item && (item.id || item._id) ? String(item.id || item._id) : '', title, content }
    })
  const context = { summary, recentTurns, businessState, coordinationState, ownApplication, knowledge }
  return Object.assign(context, { charCount: charCount(context) })
}

module.exports = {
  DEFAULT_CONTEXT_BUDGET,
  MAX_KNOWLEDGE_ITEMS,
  MAX_RECENT_TURNS,
  MAX_SUMMARY_CHARS,
  buildContext
}
