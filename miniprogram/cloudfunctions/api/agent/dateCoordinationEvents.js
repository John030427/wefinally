const { projectParticipantEvent } = require('../lib/dateCoordinationProcessingPolicy')
const { formatPlanTime } = require('../lib/meetingPlanPolicy')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    first: db.first,
    addWithId: db.addWithId,
    now: db.now
  }
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
      meet_point_text: String(proposal.meet_point_text || proposal.meet_point || '').slice(0, 80),
      budget_text: String(proposal.budget_text || proposal.budget || '').slice(0, 50),
      payment_text: String(proposal.payment_text || proposal.payment_mode || proposal.payment_preference || '').slice(0, 50),
      duration_text: String(proposal.duration_text || proposal.duration || '').slice(0, 50)
    }
  }
}

async function ensureSession(deps, coordination, userId) {
  let session = await deps.first('agent_session', {
    user_id: Number(userId),
    agent_type: 'date_coordinator',
    coordination_id: Number(coordination.id),
    status: 'active'
  })
  if (!session) {
    session = await deps.addWithId('agent_session', {
      user_id: Number(userId),
      agent_type: 'date_coordinator',
      coordination_id: Number(coordination.id),
      status: 'active',
      summary: ''
    }, 'agent_session')
  }
  return session
}

async function publishCoordinationEvent(input = {}, overrides) {
  const deps = overrides || defaultDeps()
  const coordination = input.coordination
  if (!coordination || !coordination.id) throw new Error('协调事件缺少任务')
  const event = Object.assign({}, input.event, {
    coordination_version: Number(input.event && input.event.coordination_version || coordination.coordination_version || 1)
  })
  const key = eventKey(coordination, event)
  let stored = await deps.first('date_coordination_event', { idempotency_key: key })
  if (!stored) {
    stored = await deps.addWithId('date_coordination_event', {
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
    }, 'date_coordination_event')
  }

  const participants = [Number(coordination.user_a_id), Number(coordination.user_b_id)].filter((id) => id > 0)
  const messages = []
  for (const userId of participants) {
    const projection = projectParticipantEvent(event, {
      viewer_user_id: userId,
      partner_user_id: participants.find((id) => id !== userId) || 0
    })
    const messageKey = `${key}:user:${userId}`
    let message = await deps.first('agent_message', { coordination_event_key: messageKey })
    if (!message) {
      const session = await ensureSession(deps, coordination, userId)
      message = await deps.addWithId('agent_message', {
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
      }, 'agent_message')
    }
    messages.push(message)
  }
  return { event: stored, messages }
}

module.exports = { eventKey, publishCoordinationEvent, safeChangedDimensions, safeCard }
