/**
 * In-app coordination inbox.
 * Writes real notification records (coordination_notifications) + unread cursor
 * (user_notification_cursors) from coordination events; safe summary only.
 * WeChat subscribe remains an adapter: it no-ops (with a recorded reason) when
 * templates are unconfigured, so missing template IDs never break the flow.
 */

const {
  notifyConfig,
  buildInAppNotification,
  isNotificationStale,
  sendWechatSubscribeAdapter,
  applyUnreadCursor,
  markNotificationsRead
} = require('./coordinationNotification')

function defaultDeps() {
  const db = require('./db')
  return {
    first: db.first,
    list: db.list,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc,
    createCoordinationNotificationOnce: db.createCoordinationNotificationOnce,
    now: db.now,
    config: notifyConfig(process.env),
    sendSubscribeMessage: async (payload) => {
      const cloud = require('wx-server-sdk')
      return cloud.openapi.subscribeMessage.send({
        touser: payload.touser,
        templateId: payload.template_id,
        page: payload.page || 'pages/date-coordination/date-coordination',
        data: payload.data || {}
      })
    }
  }
}

function memoryCreateCoordinationNotificationOnce(deps) {
  if (!deps.__coordNotificationClaims) deps.__coordNotificationClaims = new Map()
  return async function createOnce(notification) {
    const key = String(notification.idempotency_key || '')
    if (!key) {
      const record = await deps.addWithId('coordination_notification', Object.assign({}, notification, {
        read_at: notification.read_at === undefined ? null : notification.read_at
      }), 'coordination_notification')
      return { created: true, notification: record }
    }
    const claims = deps.__coordNotificationClaims
    if (claims.has(key)) {
      const stored = await Promise.resolve(claims.get(key))
      return { created: false, notification: stored }
    }
    let resolveClaim
    const pending = new Promise((resolve) => { resolveClaim = resolve })
    claims.set(key, pending)
    try {
      const record = await deps.addWithId('coordination_notification', Object.assign({}, notification, {
        read_at: notification.read_at === undefined ? null : notification.read_at
      }), 'coordination_notification')
      claims.set(key, record)
      resolveClaim(record)
      return { created: true, notification: record }
    } catch (err) {
      claims.delete(key)
      resolveClaim(null)
      throw err
    }
  }
}

function resolveCreateOnce(deps) {
  if (typeof deps.createCoordinationNotificationOnce === 'function') {
    return deps.createCoordinationNotificationOnce.bind(deps)
  }
  if (typeof deps.addWithId === 'function') {
    return memoryCreateCoordinationNotificationOnce(deps)
  }
  throw new Error('站内通知缺少原子创建依赖')
}

function safeSummary(input) {
  return {
    changed_dimensions: Array.isArray(input.changed_dimensions) ? input.changed_dimensions.slice(0, 8) : [],
    stage: String(input.stage || '').slice(0, 80)
  }
}

async function notifyInbox(input = {}, overrides) {
  const deps = overrides || defaultDeps()
  const coordination = input.coordination || {}
  const coordinationId = Number(coordination.id || input.coordination_id || 0)
  const user_id = Number(input.user_id || 0)
  if (!coordinationId || !user_id) throw new Error('站内通知缺少协调或用户')
  const expectedVersion = Number(input.event_coordination_version || input.coordination_version || coordination.coordination_version || 1)
  const currentVersion = Number(input.current_coordination_version || coordination.coordination_version || expectedVersion)
  const eventType = String(input.event_type || 'coordination_updated')
  const notification = buildInAppNotification({
    coordination_id: coordinationId,
    user_id,
    event_type: eventType,
    coordination_version: expectedVersion,
    title: input.title || '约会协调有新进展',
    body: input.body || '请进入查看最新安排。',
    safe_summary: safeSummary(input),
    changed_dimensions: input.changed_dimensions || []
  })
  if (isNotificationStale(notification, currentVersion) && currentVersion > expectedVersion) {
    try {
      await deps.addWithId('coordination_notification', Object.assign({}, notification, {
        status: 'stale',
        sent_at: deps.now()
      }), 'coordination_notification')
    } catch (err) {
      console.warn('stale notification record skipped:', err.message || err)
    }
    return { queued: false, stale: true, expected_version: notification.expected_coordination_version, current_version: currentVersion }
  }
  const createOnce = resolveCreateOnce(deps)
  const created = await createOnce(Object.assign({}, notification, { read_at: null }))
  const record = created.notification
  if (!created.created) {
    const cursor = typeof deps.first === 'function'
      ? await deps.first('user_notification_cursor', { user_id })
      : null
    return {
      queued: false,
      stale: false,
      duplicate: true,
      notification_id: Number((record && record.id) || 0),
      unread_count: Number((cursor && cursor.unread_count) || 0)
    }
  }
  let cursor = await deps.first('user_notification_cursor', { user_id })
  const nextCursor = applyUnreadCursor(cursor || { user_id }, record)
  if (cursor) {
    await deps.updateByDoc('user_notification_cursor', cursor, nextCursor)
  } else {
    await deps.addWithId('user_notification_cursor', nextCursor, 'user_notification_cursor')
  }
  const wechat = await sendWechatSubscribeAdapter({
    event_type: eventType,
    coordination_id: coordinationId,
    coordination_version: expectedVersion,
    page: 'pages/date-coordination/date-coordination'
  }, {
    config: deps.config,
    sendSubscribeMessage: deps.sendSubscribeMessage
  })
  await deps.updateByDoc('coordination_notification', record, {
    status: wechat.sent ? 'sent' : 'skipped',
    wechat_reason: wechat.sent ? '' : String(wechat.reason || 'skipped'),
    sent_at: deps.now()
  })
  return {
    queued: true,
    stale: false,
    notification_id: Number(record.id || 0),
    unread_count: nextCursor.unread_count,
    wechat: wechat
  }
}

async function listInbox(deps, user_id, limit = 50) {
  const rows = await deps.list('coordination_notification', { user_id: Number(user_id) }, Math.max(1, Math.min(Number(limit || 50), 100)))
  return rows
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    .slice(0, limit)
    .map((row) => ({
      id: Number(row.id || 0),
      coordination_id: Number(row.coordination_id || 0),
      coordination_version: Number(row.coordination_version || 1),
      event_type: String(row.event_type || 'coordination_updated'),
      title: String(row.title || '').slice(0, 120),
      body: String(row.body || '').slice(0, 400),
      status: String(row.status || 'queued'),
      read_at: row.read_at || null,
      create_time: row.create_time || null,
      changed_dimensions: (row.payload_json && row.payload_json.changed_dimensions) || []
    }))
}

async function unreadCount(deps, user_id) {
  const cursor = await deps.first('user_notification_cursor', { user_id: Number(user_id) })
  return Number((cursor && cursor.unread_count) || 0)
}

async function markSeen(deps, user_id, options = {}) {
  const userId = Number(user_id)
  const cursor = await deps.first('user_notification_cursor', { user_id: userId })
  const coordinationId = Number(options.coordination_id || 0)
  const coordinationVersion = Number(options.coordination_version || 0)
  let updated = 0
  if (coordinationId) {
    const pending = await deps.list('coordination_notification', {
      user_id: userId,
      coordination_id: coordinationId
    }, 100)
    for (const row of pending) {
      if (row.read_at) continue
      if (coordinationVersion && Number(row.coordination_version || 0) > coordinationVersion) continue
      await deps.updateByDoc('coordination_notification', row, { read_at: deps.now() })
      updated += 1
    }
  } else {
    const pending = await deps.list('coordination_notification', { user_id: userId }, 200)
    for (const row of pending) {
      if (row.read_at) continue
      await deps.updateByDoc('coordination_notification', row, { read_at: deps.now() })
      updated += 1
    }
  }
  if (!cursor) {
    return { updated }
  }
  const unread = Math.max(0, Number(cursor.unread_count || 0) - updated)
  await deps.updateByDoc('user_notification_cursor', cursor, {
    unread_count: unread,
    last_seen_coordination_version: coordinationVersion || Number(cursor.last_seen_coordination_version || 0)
  })
  return { updated, unread }
}

module.exports = {
  notifyInbox,
  listInbox,
  unreadCount,
  markSeen,
  safeSummary,
  defaultDeps
}
