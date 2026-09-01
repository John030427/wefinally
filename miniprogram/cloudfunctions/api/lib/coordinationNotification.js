/**
 * Coordination notification infrastructure.
 * Event-first: create notification records from coordination events.
 * WeChat subscribe is an adapter that no-ops without template IDs.
 */

const NOTIFY_MERGE_WINDOW_MS = Number(process.env.COORDINATION_NOTIFY_MERGE_WINDOW_MS || 120000)

const WECHAT_WORTHY_EVENTS = new Set([
  'INVITATION_CREATED',
  'invitation_created',
  'INVITATION_ACCEPTED',
  'invitation_accepted',
  'ACTION_REQUIRED',
  'action_required',
  'NEW_OVERLAP_FOUND',
  'new_overlap_found',
  'PROPOSAL_READY',
  'proposal_generated',
  'PROPOSAL_CONFIRMED',
  'proposal_confirmed',
  'ARRANGED',
  'arranged',
  'PREFERENCE_UPDATED',
  'preference_updated',
  'COUNTER_OFFER_READY',
  'counter_offer_ready'
])

function notifyConfig(env = process.env) {
  return {
    mergeWindowMs: Number(env.COORDINATION_NOTIFY_MERGE_WINDOW_MS || NOTIFY_MERGE_WINDOW_MS),
    wechatEnabled: String(env.WECHAT_SUBSCRIBE_ENABLED || '').toLowerCase() === 'true',
    templateIds: String(env.WECHAT_SUBSCRIBE_TEMPLATE_IDS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

function buildInAppNotification(input = {}) {
  const eventType = String(input.event_type || 'coordination_updated')
  const version = Number(input.coordination_version || 1)
  return {
    coordination_id: Number(input.coordination_id || 0),
    user_id: Number(input.user_id || 0),
    event_type: eventType,
    coordination_version: version,
    expected_coordination_version: version,
    channel: 'in_app',
    status: 'queued',
    title: input.title || '约会协调有新进展',
    body: input.body || '请进入查看最新安排。',
    payload_json: {
      safe_summary: input.safe_summary || {},
      changed_dimensions: input.changed_dimensions || []
    },
    merge_key: `${input.coordination_id}:${input.user_id}:${eventType}`
  }
}

function shouldSendWechat(eventType, config = notifyConfig()) {
  if (!config.wechatEnabled) return false
  if (!config.templateIds.length) return false
  return WECHAT_WORTHY_EVENTS.has(String(eventType || ''))
}

/**
 * Stale guard: notification prepared for version V must not send if current is newer.
 */
function isNotificationStale(notification, currentCoordinationVersion) {
  const expected = Number(
    notification.expected_coordination_version != null
      ? notification.expected_coordination_version
      : notification.coordination_version
  )
  const current = Number(currentCoordinationVersion)
  if (!Number.isFinite(expected) || !Number.isFinite(current)) return false
  return current > expected
}

function coalesceNotifications(pending = [], nowMs = Date.now(), config = notifyConfig()) {
  const groups = new Map()
  for (const item of pending) {
    const key = String(item.merge_key || `${item.user_id}:${item.coordination_id}`)
    const list = groups.get(key) || []
    list.push(item)
    groups.set(key, list)
  }
  const result = []
  for (const list of groups.values()) {
    list.sort((a, b) => Number(a.coordination_version || 0) - Number(b.coordination_version || 0))
    const latest = list[list.length - 1]
    const created = Number(latest.create_time_ms || nowMs)
    if (list.length > 1 && nowMs - created <= config.mergeWindowMs) {
      result.push({
        ...latest,
        status: 'queued',
        title: '约会协调有新的进展',
        body: '请进入查看最新安排。',
        merged_from: list.length,
        channel: latest.channel || 'in_app'
      })
    } else {
      result.push(...list)
    }
  }
  return result
}

/**
 * Adapter: never throws; returns skip reason when templates missing.
 */
async function sendWechatSubscribeAdapter(payload = {}, deps = {}) {
  const config = deps.config || notifyConfig(deps.env || process.env)
  if (!shouldSendWechat(payload.event_type, config)) {
    return {
      sent: false,
      skipped: true,
      reason: !config.templateIds.length
        ? 'template_ids_unconfigured'
        : (!config.wechatEnabled ? 'wechat_disabled' : 'event_not_worthy')
    }
  }
  if (typeof deps.sendSubscribeMessage === 'function') {
    await deps.sendSubscribeMessage({
      touser: payload.openid,
      template_id: config.templateIds[0],
      page: payload.page || 'pages/date-coordination/date-coordination',
      data: payload.data || {}
    })
    return { sent: true, skipped: false }
  }
  return { sent: false, skipped: true, reason: 'sender_not_wired' }
}

function applyUnreadCursor(cursor = {}, notification) {
  const unread = Math.max(0, Number(cursor.unread_count || 0)) + 1
  return {
    user_id: Number(notification.user_id || cursor.user_id || 0),
    last_seen_coordination_event_id: Number(cursor.last_seen_coordination_event_id || 0),
    last_seen_coordination_version: Number(cursor.last_seen_coordination_version || 0),
    unread_count: unread
  }
}

function markNotificationsRead(cursor = {}, coordinationVersion) {
  return {
    ...cursor,
    last_seen_coordination_version: Number(coordinationVersion || cursor.last_seen_coordination_version || 0),
    unread_count: 0
  }
}

module.exports = {
  NOTIFY_MERGE_WINDOW_MS,
  WECHAT_WORTHY_EVENTS,
  notifyConfig,
  buildInAppNotification,
  shouldSendWechat,
  isNotificationStale,
  coalesceNotifications,
  sendWechatSubscribeAdapter,
  applyUnreadCursor,
  markNotificationsRead
}
