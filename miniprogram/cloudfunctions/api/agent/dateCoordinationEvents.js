const { projectParticipantEvent } = require('../lib/dateCoordinationProcessingPolicy')
const {
  toCanonicalCoordinationEventType,
  toRuntimeCoordinationEventType
} = require('../lib/coordinationAdapters.cjs')
const { buildCoordinationEventCard } = require('../lib/coordinationProjection')

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
  const allowed = new Set(['availability', 'time', 'area', 'activity', 'budget', 'payment', 'duration'])
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter((item) => allowed.has(item))))
}

function positiveId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function factReferences(event = {}) {
  const proposalId = positiveId(event.proposal_id || event.proposal?.id || event.proposal?.proposal_id)
  const patchId = positiveId(event.patch_id || event.patch?.id)
  const inquiryId = positiveId(event.inquiry_id || event.partner_inquiry_id)
  return {
    ...(proposalId ? { proposal_id: proposalId } : {}),
    ...(patchId ? { patch_id: patchId } : {}),
    ...(inquiryId ? { inquiry_id: inquiryId } : {}),
    changed_dimensions: safeChangedDimensions(event.changed_dimensions)
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
  const requestedEventType = String(input.event && input.event.event_type || 'COORDINATION_UPDATED')
  const canonicalEventType = toCanonicalCoordinationEventType(requestedEventType)
  if (!canonicalEventType) throw new Error('invalid_coordination_event_type')
  const runtimeEventType = toRuntimeCoordinationEventType(requestedEventType)
  if (!runtimeEventType) throw new Error('invalid_coordination_event_type')
  const event = Object.assign({}, input.event, {
    event_type: runtimeEventType,
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
      safe_payload: factReferences(event),
      safe_summary: {
        stage: projectParticipantEvent(event, { viewer_user_id: 0 }).stage,
        proposal_key: String(event.proposal && event.proposal.proposal_key || ''),
        relay_text: String(event.relay_text || '').slice(0, 240),
        content: projectParticipantEvent(event, { viewer_user_id: 0 }).content
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
    const eventCard = buildCoordinationEventCard({
      viewer_user_id: userId,
      event: Object.assign({}, event, {
        id: stored.id,
        coordination_id: coordination.id,
        shareable_summary: stored.shareable_summary,
        safe_payload: stored.safe_payload,
        safe_summary: stored.safe_summary
      }),
      content: projection.content
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
        event_card: eventCard
      }, 'agent_message')
    }
    messages.push(message)
  }
  return { event: stored, messages }
}

module.exports = { eventKey, publishCoordinationEvent, safeChangedDimensions }
