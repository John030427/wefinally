const crypto = require('crypto')
const { STATUS } = require('./dateCoordinationPolicy')
const { normalizeArrivalHint } = require('./meetingPlanPolicy')

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

function checkInEvent(action, hint) {
  if (action === 'set_arrival_hint') return { event_type: 'arrival_hint_updated', arrival_hint: hint }
  if (action === 'arrived') return { event_type: 'participant_arrived' }
  if (action === 'met') return { event_type: 'participant_met_confirmed' }
  if (action === 'not_found') return { event_type: 'participant_not_found' }
  return { event_type: 'participant_mismatch' }
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
    const update = action === 'mismatch'
      ? { [field]: now, meeting_status: 'paused', meeting_paused_at: now, meeting_pause_reason: 'participant_mismatch' }
      : { [field]: now }
    updated = await deps.updateByDoc('date_coordination', coordination, update)
  }
  await deps.publishCoordinationEvent({
    coordination: updated,
    event: Object.assign(checkInEvent(action, hint), {
      actor_user_id: userId,
      coordination_version: Number(updated.coordination_version || 1),
      idempotency_suffix: action === 'set_arrival_hint' ? hint : String(new Date(now).getTime())
    })
  })
  const applications = await deps.list('date_coordination_application', {
    coordination_id: Number(coordination.id)
  }, 50)
  return publicState(updated, applications, userId, deps.env || {})
}

module.exports = {
  ACTIONS,
  participantSide,
  publicState,
  applyMeetingCheckIn
}
