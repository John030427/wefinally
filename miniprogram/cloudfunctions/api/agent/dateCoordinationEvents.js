const { projectParticipantEvent } = require('../lib/dateCoordinationProcessingPolicy')
const { formatPlanTime } = require('../lib/meetingPlanPolicy')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    first: db.first,
    list: db.list,
    addWithId: db.addWithId,
    now: db.now,
    ensureCoordinationAgentSession: db.ensureCoordinationAgentSession,
    createCoordinationEventOnce: db.createCoordinationEventOnce,
    createAgentMessageOnce: db.createAgentMessageOnce
  }
}

function memoryCreateOnce(deps, {
  claimsKey,
  keyOf,
  collection,
  resultField,
  missingKeyMessage
}) {
  if (!deps[claimsKey]) deps[claimsKey] = new Map()
  return async function createOnce(record) {
    const key = String(keyOf(record) || '')
    if (!key) throw new Error(missingKeyMessage)
    const claims = deps[claimsKey]
    if (claims.has(key)) {
      const stored = await Promise.resolve(claims.get(key))
      if (!stored) throw new Error(`${collection}幂等锁缺少目标记录`)
      return { created: false, [resultField]: stored }
    }
    let resolveClaim
    const pending = new Promise((resolve) => { resolveClaim = resolve })
    claims.set(key, pending)
    try {
      const stored = await deps.addWithId(collection, Object.assign({}, record), collection)
      claims.set(key, stored)
      resolveClaim(stored)
      return { created: true, [resultField]: stored }
    } catch (err) {
      claims.delete(key)
      resolveClaim(null)
      throw err
    }
  }
}

function attachMemoryIdempotentCreates(deps) {
  if (!deps || typeof deps.addWithId !== 'function') {
    throw new Error('测试幂等依赖缺少 addWithId')
  }
  if (typeof deps.createCoordinationEventOnce !== 'function') {
    deps.createCoordinationEventOnce = memoryCreateOnce(deps, {
      claimsKey: '__coordEventClaims',
      keyOf: (record) => record.idempotency_key,
      collection: 'date_coordination_event',
      resultField: 'event',
      missingKeyMessage: '协调事件缺少幂等键'
    })
  }
  if (typeof deps.ensureCoordinationAgentSession !== 'function') {
    if (!deps.__coordSessionQueues) deps.__coordSessionQueues = new Map()
    deps.ensureCoordinationAgentSession = async ({ user_id, coordination_id, agent_type = 'date_coordinator' }) => {
      const key = `${Number(user_id)}:${String(agent_type)}:${Number(coordination_id)}`
      const previous = deps.__coordSessionQueues.get(key) || Promise.resolve()
      let release
      const gate = new Promise((resolve) => { release = resolve })
      deps.__coordSessionQueues.set(key, previous.catch(() => {}).then(() => gate))
      await previous.catch(() => {})
      try {
        const query = {
          user_id: Number(user_id),
          agent_type: String(agent_type),
          coordination_id: Number(coordination_id)
        }
        const sessions = typeof deps.list === 'function'
          ? await deps.list('agent_session', query, 100)
          : (deps.tables && Array.isArray(deps.tables.agent_session)
              ? deps.tables.agent_session.filter((row) => Object.keys(query).every((field) => row[field] === query[field]))
              : [await deps.first('agent_session', Object.assign({}, query, { status: 'active' }))].filter(Boolean))
        const current = sessions
          .filter((row) => !['closed', 'cancelled'].includes(String(row.status || '')))
          .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null
        if (current) return { created: false, session: current }
        const session = await deps.addWithId('agent_session', {
          user_id: Number(user_id),
          agent_type: String(agent_type),
          coordination_id: Number(coordination_id),
          status: 'active',
          summary: ''
        }, 'agent_session')
        return { created: true, session }
      } finally {
        release()
      }
    }
  }
  if (typeof deps.createAgentMessageOnce !== 'function') {
    deps.createAgentMessageOnce = memoryCreateOnce(deps, {
      claimsKey: '__agentMessageClaims',
      keyOf: (record) => record.coordination_event_key,
      collection: 'agent_message',
      resultField: 'message',
      missingKeyMessage: '协调投影消息缺少幂等键'
    })
  }
  return deps
}

function eventKey(coordination, event) {
  const actor = Number(event.actor_user_id || 0)
  const suffix = String(event.idempotency_suffix || '').trim().slice(0, 60)
  return `coordination:${Number(coordination.id)}:v${Number(event.coordination_version || coordination.coordination_version || 1)}:${String(event.event_type || 'updated')}:${actor}:${suffix}`
}

function safeChangedDimensions(value) {
  const allowed = new Set([
    'time', 'availability', 'area', 'activity', 'budget', 'payment', 'duration',
    'exact_time', 'activity_venue', 'meet_point', 'arrival_hint'
  ])
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter((item) => allowed.has(item))))
}

function safeCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const proposal = value.proposal && typeof value.proposal === 'object' ? value.proposal : {}
  const changes = Array.isArray(value.changes) ? value.changes.slice(0, 8).map((item) => ({
    label: String(item && item.label || '').slice(0, 30),
    before_text: String(item && item.before_text || '').slice(0, 100),
    after_text: String(item && item.after_text || '').slice(0, 100)
  })) : []
  return {
    kind: String(value.kind || 'update').slice(0, 30),
    title: String(value.title || '约会方案有更新').slice(0, 60),
    changes,
    proposal: {
      time_text: String(proposal.time_text || formatPlanTime(proposal.date, proposal.period, proposal.start_time)).slice(0, 80),
      area_text: String(proposal.area_text || proposal.area || '').slice(0, 80),
      activity_text: String(proposal.activity_text || proposal.activity || '').slice(0, 50),
      activity_venue_text: String(proposal.activity_venue_text || proposal.activity_venue || '').slice(0, 80),
      open_items_text: String(proposal.open_items_text || require('../lib/datePlanContract').locationAgreement(proposal).open_items.map((item) => item.label).join('、')).slice(0, 160),
      meet_point_text: String(proposal.meet_point_text || proposal.meet_point || '').slice(0, 80),
      budget_text: String(proposal.budget_text || proposal.budget || '').slice(0, 50),
      payment_text: String(proposal.payment_text || proposal.payment_mode || proposal.payment_preference || '').slice(0, 50),
      duration_text: String(proposal.duration_text || proposal.duration || '').slice(0, 50)
    }
  }
}

const TERMINAL_EVENT_TYPES = Object.freeze(new Set([
  'qa_coordination_reset',
  'coordination_closed',
  'coordination_expired'
]))

async function ensureSession(deps, coordination, userId, options = {}) {
  const allowCreate = options.allowCreate !== false
  const query = {
    user_id: Number(userId),
    agent_type: 'date_coordinator',
    coordination_id: Number(coordination.id)
  }
  const sessions = typeof deps.list === 'function' ? await deps.list('agent_session', query, 100) : []
  let session = sessions
    .filter((row) => !['closed', 'cancelled'].includes(String(row.status || '')))
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null
  if (!session && typeof deps.list !== 'function') {
    session = await deps.first('agent_session', Object.assign({}, query, { status: 'active' }))
  }
  if (!session && !allowCreate) return null
  if (allowCreate && typeof deps.ensureCoordinationAgentSession === 'function') {
    const ensured = await deps.ensureCoordinationAgentSession(query)
    session = ensured.session
  } else if (!session) {
    session = await deps.addWithId('agent_session', Object.assign({}, query, {
      status: 'active',
      summary: ''
    }), 'agent_session')
  }
  return session
}

async function publishCoordinationEvent(input = {}, overrides) {
  const deps = overrides || defaultDeps()
  if (typeof deps.createCoordinationEventOnce !== 'function' || typeof deps.createAgentMessageOnce !== 'function') {
    throw new Error('协调事件缺少原子幂等创建依赖')
  }
  const coordination = input.coordination
  if (!coordination || !coordination.id) throw new Error('协调事件缺少任务')
  const event = Object.assign({}, input.event, {
    coordination_version: Number(input.event && input.event.coordination_version || coordination.coordination_version || 1)
  })
  const key = eventKey(coordination, event)
  const createdEvent = await deps.createCoordinationEventOnce({
    coordination_id: Number(coordination.id),
    coordination_version: event.coordination_version,
    event_type: String(event.event_type || 'coordination_updated'),
    actor_user_id: Number(event.actor_user_id || 0),
    idempotency_key: key,
    shareable_summary: {
      changed_dimensions: safeChangedDimensions(event.changed_dimensions)
    },
    safe_summary: {
      stage: projectParticipantEvent(event, { viewer_user_id: 0 }).stage,
      proposal_key: String(event.proposal && event.proposal.proposal_key || '')
    }
  })
  const stored = createdEvent.event
  const created = createdEvent.created === true

  const participants = [Number(coordination.user_a_id), Number(coordination.user_b_id)].filter((id) => id > 0)
  const messages = []
  for (const userId of participants) {
    const projection = projectParticipantEvent(event, {
      viewer_user_id: userId,
      partner_user_id: participants.find((id) => id !== userId) || 0
    })
    const messageKey = `${key}:user:${userId}`
    const allowCreate = !TERMINAL_EVENT_TYPES.has(String(event.event_type || ''))
    const session = await ensureSession(deps, coordination, userId, { allowCreate })
    if (!session) continue
    const createdMessage = await deps.createAgentMessageOnce({
      session_id: Number(session.id),
      user_id: userId,
      agent_type: 'date_coordinator',
      coordination_id: Number(coordination.id),
      coordination_version: event.coordination_version,
      coordination_event_id: Number(stored.id || 0),
      coordination_event_key: messageKey,
      event_type: projection.event_type,
      stage: projection.stage,
      role: 'assistant',
      sender_type: 'assistant',
      content: projection.content,
      coordination_update_card: safeCard(projection.card)
    })
    messages.push(createdMessage.message)
  }
  return { event: stored, messages, created, duplicate: !created }
}

module.exports = {
  eventKey,
  publishCoordinationEvent,
  ensureSession,
  safeChangedDimensions,
  safeCard,
  attachMemoryIdempotentCreates
}
