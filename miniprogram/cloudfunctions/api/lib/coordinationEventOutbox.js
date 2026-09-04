'use strict'

const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  PROJECTED: 'projected',
  READ: 'read',
  FAILED_RETRYABLE: 'failed_retryable'
})

function defaultDeps() {
  const db = require('./db')
  return {
    first: db.first,
    list: db.list,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    now: db.now
  }
}

async function createCoordinationEventOutboxOnce(input = {}, overrides) {
  const deps = overrides || defaultDeps()
  const eventId = Number(input.event_id || 0)
  const recipientUserId = Number(input.recipient_user_id || 0)
  const coordinationId = Number(input.coordination_id || 0)
  if (!eventId || !recipientUserId || !coordinationId) {
    throw new Error('协调事件投影缺少目标')
  }
  const key = String(input.idempotency_key || `event:${eventId}:user:${recipientUserId}`)
  const existing = typeof deps.first === 'function'
    ? await deps.first('coordination_event_outbox', { idempotency_key: key })
    : null
  if (existing) return existing
  return deps.addWithId('coordination_event_outbox', {
    idempotency_key: key,
    event_id: eventId,
    coordination_id: coordinationId,
    actor_user_id: Number(input.actor_user_id || 0),
    recipient_user_id: recipientUserId,
    event_type: String(input.event_type || ''),
    status: DELIVERY_STATUS.PENDING,
    payload: input.payload || {},
    create_time: deps.now(),
    update_time: deps.now(),
    projected_at: null,
    read_at: null,
    last_error: ''
  }, 'coordination_event_outbox')
}

async function projectCoordinationEventOutbox(outboxOrId, overrides) {
  const deps = overrides || defaultDeps()
  const outbox = typeof outboxOrId === 'object' && outboxOrId
    ? outboxOrId
    : await deps.byId('coordination_event_outbox', outboxOrId)
  if (!outbox) throw new Error('协调事件投影任务不存在')
  if ([DELIVERY_STATUS.PROJECTED, DELIVERY_STATUS.READ].includes(String(outbox.status || ''))) {
    return { projected: true, outbox, delivery_status: outbox.status }
  }
  const now = deps.now()
  try {
    if (typeof deps.projectRecipient === 'function') {
      await deps.projectRecipient(outbox)
    }
    const updated = await deps.updateByDoc('coordination_event_outbox', outbox, {
      status: DELIVERY_STATUS.PROJECTED,
      projected_at: now,
      update_time: now,
      last_error: ''
    })
    return {
      projected: true,
      outbox: updated || outbox,
      delivery_status: DELIVERY_STATUS.PROJECTED
    }
  } catch (err) {
    const updated = await deps.updateByDoc('coordination_event_outbox', outbox, {
      status: DELIVERY_STATUS.PENDING,
      update_time: now,
      last_error: String(err && err.message || err || 'projection_failed').slice(0, 120)
    })
    return {
      projected: false,
      outbox: updated || outbox,
      delivery_status: DELIVERY_STATUS.PENDING,
      error: err
    }
  }
}

async function markCoordinationEventRead(input = {}, overrides) {
  const deps = overrides || defaultDeps()
  const eventId = Number(input.event_id || 0)
  const recipientUserId = Number(input.recipient_user_id || 0)
  if (!eventId || !recipientUserId) return null
  const outbox = await deps.first('coordination_event_outbox', {
    event_id: eventId,
    recipient_user_id: recipientUserId
  })
  if (!outbox) return null
  if (String(outbox.status || '') === DELIVERY_STATUS.READ) return outbox
  return deps.updateByDoc('coordination_event_outbox', outbox, {
    status: DELIVERY_STATUS.READ,
    read_at: deps.now(),
    update_time: deps.now()
  })
}

module.exports = {
  DELIVERY_STATUS,
  createCoordinationEventOutboxOnce,
  projectCoordinationEventOutbox,
  markCoordinationEventRead
}
