const { publishCoordinationEvent } = require('../agent/dateCoordinationEvents')
const { notifyInbox } = require('../lib/coordinationInbox')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    list: db.list,
    first: db.first,
    byId: db.byId,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    claim: db.claimIfStatus,
    now: db.now,
    publishCoordinationEvent,
    writeInboxNotification: notifyInbox
  }
}

async function processCoordinationProjectionOutbox({ deps = defaultDeps(), limit = 20 } = {}) {
  const rows = await deps.list('coordination_projection_outbox', { status: 'pending' }, Math.max(1, Math.min(Number(limit || 20), 100)))
  const report = { scanned: rows.length, completed: 0, failed: 0 }
  for (const row of rows) {
    const claimed = typeof deps.claim === 'function'
      ? await deps.claim('coordination_projection_outbox', row, 'pending', {
        status: 'processing',
        attempts: Number(row.attempts || 0) + 1,
        last_attempt_at: deps.now()
      })
      : await deps.updateByDoc('coordination_projection_outbox', row, {
        status: 'processing',
        attempts: Number(row.attempts || 0) + 1,
        last_attempt_at: deps.now()
      })
    if (!claimed) continue
    try {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      if (row.operation === 'publish_coordination_event') {
        const coordination = await deps.byId('date_coordination', Number(row.coordination_id))
        if (!coordination) throw new Error('DATE_COORDINATION_NOT_FOUND')
        await deps.publishCoordinationEvent({ coordination, event: payload })
      } else if (row.operation === 'write_inbox_notification') {
        await deps.writeInboxNotification(payload)
      } else if (row.operation === 'queue_reminder') {
        const existing = await deps.first('agent_notification_job', { idempotency_key: payload.idempotency_key })
        if (!existing) await deps.addWithId('agent_notification_job', payload, 'agent_notification_job')
      } else {
        throw new Error('unknown_coordination_projection')
      }
      await deps.updateByDoc('coordination_projection_outbox', claimed, {
        status: 'completed',
        completed_at: deps.now(),
        last_error_code: ''
      })
      report.completed += 1
    } catch (error) {
      await deps.updateByDoc('coordination_projection_outbox', claimed, {
        status: 'pending',
        last_error_code: String(error && (error.code || error.message) || 'projection_failed').slice(0, 120)
      }).catch(() => null)
      report.failed += 1
    }
  }
  return report
}

module.exports = { processCoordinationProjectionOutbox }
