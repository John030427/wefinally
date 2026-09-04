const crypto = require('crypto')
const { STATUS } = require('./dateCoordinationPolicy')
const { normalizeArrivalHint, normalizeArrivalPosition } = require('./meetingPlanPolicy')
const {
  DELIVERY_STATUS,
  createCoordinationEventOutboxOnce,
  projectCoordinationEventOutbox
} = require('./coordinationEventOutbox')

const ACTIONS = Object.freeze(['set_arrival_hint', 'arrived', 'met', 'not_found', 'mismatch'])

function participantSide(coordination, userId) {
  if (Number(coordination && coordination.user_a_id) === Number(userId)) return 'a'
  if (Number(coordination && coordination.user_b_id) === Number(userId)) return 'b'
  return ''
}

function latestForUser(rows, userId) {
  return (rows || [])
    .filter((row) => Number(row.user_id) === Number(userId))
    .sort((a, b) => Number(b.coordination_version || 0) - Number(a.coordination_version || 0))[0] || null
}

function publicState(coordination, applications, userId, env = {}) {
  const side = participantSide(coordination, userId)
  if (!side || ![STATUS.WAITING_CONFIRMATIONS, STATUS.ARRANGED].includes(coordination.status)) return null
  const partnerSide = side === 'a' ? 'b' : 'a'
  const partnerId = partnerSide === 'a' ? Number(coordination.user_a_id) : Number(coordination.user_b_id)
  const mine = latestForUser(applications, userId)
  const partner = latestForUser(applications, partnerId)
  const secret = String(env.MEETING_CODE_SECRET || '')
  const meetingCode = secret
    ? crypto.createHmac('sha256', secret)
      .update(`meeting:${Number(coordination.id)}:v${Number(coordination.coordination_version || 1)}`)
      .digest('hex').slice(0, 6).toUpperCase()
    : ''
  return {
    enabled: coordination.status === STATUS.ARRANGED,
    my_arrived: Boolean(coordination[`arrival_${side}_at`]),
    partner_arrived: Boolean(coordination[`arrival_${partnerSide}_at`]),
    my_met_confirmed: Boolean(coordination[`met_${side}_at`]),
    partner_met_confirmed: Boolean(coordination[`met_${partnerSide}_at`]),
    meeting_confirmed: Boolean(
      coordination.met_a_at
      && coordination.met_b_at
      && String(coordination.meeting_status || '') !== 'paused'
      && !coordination.mismatch_a_at
      && !coordination.mismatch_b_at
    ),
    partner_arrival_hint: String(partner && partner.application && partner.application.arrival_hint || ''),
    my_arrival_hint: String(mine && mine.application && mine.application.arrival_hint || ''),
    partner_arrival_position: String(coordination[`arrival_position_${partnerSide}`] || ''),
    my_arrival_position: String(coordination[`arrival_position_${side}`] || ''),
    meeting_code: meetingCode,
    safety_alert: Boolean(coordination.mismatch_a_at || coordination.mismatch_b_at),
    meeting_paused: String(coordination.meeting_status || '') === 'paused'
      || Boolean(coordination.mismatch_a_at || coordination.mismatch_b_at),
    can_confirm_met: Boolean(
      coordination.arrival_a_at
      && coordination.arrival_b_at
      && String(coordination.meeting_status || '') !== 'paused'
      && !coordination.mismatch_a_at
      && !coordination.mismatch_b_at
    )
  }
}

function checkInEvent(action, hint, arrivalPosition) {
  if (action === 'set_arrival_hint') return { event_type: 'arrival_hint_updated', arrival_hint: hint }
  if (action === 'arrived') return { event_type: 'participant_arrived', arrival_position: arrivalPosition }
  if (action === 'met') return { event_type: 'participant_met_confirmed' }
  if (action === 'not_found') return { event_type: 'participant_not_found' }
  return { event_type: 'participant_mismatch' }
}

function safeDigest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
}

async function applyMeetingCheckIn(input = {}, deps) {
  const coordination = await deps.byId('date_coordination', Number(input.coordination_id || 0))
  const userId = Number(input.user_id || 0)
  const side = participantSide(coordination, userId)
  if (!side) throw new Error('无权操作该约会会合状态')
  const action = String(input.action || '')
  if (!ACTIONS.includes(action)) throw new Error('不支持的到场操作')
  const hintMayBeUpdated = action === 'set_arrival_hint'
    && [STATUS.WAITING_CONFIRMATIONS, STATUS.ARRANGED].includes(coordination.status)
  if (coordination.status !== STATUS.ARRANGED && !hintMayBeUpdated) {
    throw new Error('双方确认最终约会方案后才能使用到场会合')
  }
  const meetingPaused = String(coordination.meeting_status || '') === 'paused'
    || Boolean(coordination.mismatch_a_at || coordination.mismatch_b_at)
  if (meetingPaused && action !== 'mismatch') {
    throw new Error('现场情况不符后会合已暂停；恢复必须由平台人工审核处理')
  }
  const now = deps.now()
  let updated = coordination
  let hint = ''
  let arrivalPosition = ''
  if (action === 'set_arrival_hint') {
    hint = normalizeArrivalHint(input.arrival_hint)
    if (!hint) throw new Error('请提供简短、非敏感的到场识别提示')
    const applications = await deps.list('date_coordination_application', {
      coordination_id: Number(coordination.id)
    }, 50)
    const mine = latestForUser(applications, userId)
    if (!mine) throw new Error('未找到你的约会安排')
    await deps.updateByDoc('date_coordination_application', mine, {
      application: Object.assign({}, mine.application || {}, { arrival_hint: hint })
    })
  } else {
    const field = {
      arrived: `arrival_${side}_at`,
      met: `met_${side}_at`,
      not_found: `not_found_${side}_at`,
      mismatch: `mismatch_${side}_at`
    }[action]
    if (action === 'met' && !(coordination.arrival_a_at && coordination.arrival_b_at)) {
      throw new Error('请等待双方都确认到达后再确认已经见面')
    }
    if (action === 'arrived') arrivalPosition = normalizeArrivalPosition(input.arrival_position)
    const update = action === 'mismatch'
      ? { [field]: now, meeting_status: 'paused', meeting_paused_at: now, meeting_pause_reason: 'participant_mismatch' }
      : Object.assign({ [field]: coordination[field] || now }, arrivalPosition ? { [`arrival_position_${side}`]: arrivalPosition } : {})
    updated = await deps.updateByDoc('date_coordination', coordination, update)
  }

  const version = Number(updated.coordination_version || 1)
  const idempotencySuffix = action === 'arrived'
    ? `${action}:${version}:${safeDigest(arrivalPosition)}`
    : action === 'set_arrival_hint'
      ? `${action}:${version}:${safeDigest(hint)}`
      : `${action}:${version}`
  const eventPayload = Object.assign(checkInEvent(action, hint, arrivalPosition), {
    actor_user_id: userId,
    coordination_version: version,
    idempotency_suffix: idempotencySuffix
  })

  const partnerId = Number(userId) === Number(updated.user_a_id)
    ? Number(updated.user_b_id)
    : Number(updated.user_a_id)

  let deliveryStatus = DELIVERY_STATUS.PROJECTED
  let eventId = 0
  let outboxId = 0
  let published = null

  try {
    published = await deps.publishCoordinationEvent({
      coordination: updated,
      event: eventPayload
    })
    eventId = Number(published && published.event && published.event.id || 0)
  } catch (err) {
    deliveryStatus = DELIVERY_STATUS.PENDING
    if (typeof deps.addWithId === 'function') {
      const fallbackEvent = await deps.addWithId('date_coordination_event', {
        coordination_id: Number(updated.id),
        coordination_version: version,
        event_type: eventPayload.event_type,
        actor_user_id: userId,
        idempotency_key: `meeting:${updated.id}:${idempotencySuffix}`,
        safe_summary: { stage: eventPayload.event_type }
      }, 'date_coordination_event')
      eventId = Number(fallbackEvent.id || 0)
    }
  }

  if (partnerId > 0 && ['arrived', 'not_found', 'mismatch'].includes(action)
    && typeof deps.addWithId === 'function') {
    const outbox = await createCoordinationEventOutboxOnce({
      event_id: eventId || Number(Date.now()),
      coordination_id: Number(updated.id),
      actor_user_id: userId,
      recipient_user_id: partnerId,
      event_type: eventPayload.event_type,
      idempotency_key: `meeting:${updated.id}:${idempotencySuffix}:user:${partnerId}`,
      payload: {
        title: action === 'mismatch' ? '会合已暂停' : '到场状态更新',
        body: action === 'arrived'
          ? (arrivalPosition
            ? `对方已到达活动场地（${arrivalPosition}），请打开协调页查看现场会合信息。`
            : '对方已到达活动场地，请打开协调页查看现场会合信息。')
          : action === 'not_found'
            ? '对方暂未找到人，请留在公共集合点并核对识别提示。'
            : '对方反馈现场情况不符，会合已暂停。请停止接触并前往安全公共区域，必要时联系平台人工客服或当地紧急服务。',
        inbox_event_type: action === 'arrived'
          ? `meeting_arrived:${safeDigest(arrivalPosition)}`
          : `meeting_${action}`
      }
    }, deps)
    outboxId = Number(outbox.id || 0)

    if (published && !published.duplicate && deliveryStatus === DELIVERY_STATUS.PROJECTED) {
      const projected = await projectCoordinationEventOutbox(outbox, Object.assign({}, deps, {
        async projectRecipient(row) {
          if (typeof deps.writeInboxNotification === 'function') {
            await deps.writeInboxNotification({
              coordination: updated,
              user_id: Number(row.recipient_user_id),
              event_type: row.payload && row.payload.inbox_event_type || `meeting_${action}`,
              coordination_version: version,
              title: row.payload && row.payload.title || '到场状态更新',
              body: row.payload && row.payload.body || '到场状态有更新，请打开协调页查看。',
              stage: `meeting_${action}`
            })
          }
        }
      }))
      deliveryStatus = projected.delivery_status
      if (!projected.projected) deliveryStatus = DELIVERY_STATUS.PENDING
    } else if (deliveryStatus === DELIVERY_STATUS.PENDING || (published && published.duplicate)) {
      deliveryStatus = published && published.duplicate ? DELIVERY_STATUS.PROJECTED : DELIVERY_STATUS.PENDING
      if (published && published.duplicate && String(outbox.status || '') !== DELIVERY_STATUS.PROJECTED) {
        await deps.updateByDoc('coordination_event_outbox', outbox, {
          status: DELIVERY_STATUS.PROJECTED,
          projected_at: now,
          update_time: now
        })
      }
    } else if (!published) {
      deliveryStatus = DELIVERY_STATUS.PENDING
    }
  } else if (partnerId > 0 && ['arrived', 'not_found', 'mismatch'].includes(action)
    && published && !published.duplicate && typeof deps.writeInboxNotification === 'function') {
    // Legacy unit deps without outbox storage: keep inbox best-effort.
    try {
      const bodies = {
        arrived: arrivalPosition
          ? `对方已到达活动场地（${arrivalPosition}），请打开协调页查看现场会合信息。`
          : '对方已到达活动场地，请打开协调页查看现场会合信息。',
        not_found: '对方暂未找到人，请留在公共集合点并核对识别提示。',
        mismatch: '对方反馈现场情况不符，会合已暂停。请停止接触并前往安全公共区域，必要时联系平台人工客服或当地紧急服务。'
      }
      await deps.writeInboxNotification({
        coordination: updated,
        user_id: partnerId,
        event_type: action === 'arrived'
          ? `meeting_arrived:${safeDigest(arrivalPosition)}`
          : `meeting_${action}`,
        coordination_version: version,
        title: action === 'mismatch' ? '会合已暂停' : '到场状态更新',
        body: bodies[action],
        stage: `meeting_${action}`
      })
    } catch (err) {
      deliveryStatus = DELIVERY_STATUS.PENDING
      console.warn('inbox meeting notification skipped:', err.message || err)
    }
  }

  const applications = await deps.list('date_coordination_application', {
    coordination_id: Number(coordination.id)
  }, 50)
  const state = publicState(updated, applications, userId, deps.env || {}) || {}
  return Object.assign({}, state, {
    action_recorded: true,
    delivery_status: deliveryStatus,
    event_id: eventId,
    outbox_id: outboxId
  })
}

module.exports = {
  ACTIONS,
  participantSide,
  publicState,
  applyMeetingCheckIn,
  safeDigest,
  DELIVERY_STATUS
}
