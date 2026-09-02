const MAX_COORDINATION_ROUNDS = 5

const PROCESSING_STATUS = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
})

function dateValue(value, fallback = new Date()) {
  const parsed = new Date(value || fallback)
  if (Number.isNaN(parsed.getTime())) throw new Error('协调处理时间无效')
  return parsed
}

function nextProcessingStatus(current, event) {
  const transitions = {
    [PROCESSING_STATUS.QUEUED]: {
      claim: PROCESSING_STATUS.PROCESSING
    },
    [PROCESSING_STATUS.PROCESSING]: {
      complete: PROCESSING_STATUS.COMPLETED,
      fail: PROCESSING_STATUS.FAILED,
      lease_expired: PROCESSING_STATUS.QUEUED
    },
    [PROCESSING_STATUS.FAILED]: {
      retry: PROCESSING_STATUS.QUEUED
    }
  }
  const next = transitions[current] && transitions[current][event]
  if (!next) throw new Error('当前处理状态不能执行该操作')
  return next
}

function roundNumber(coordination = {}) {
  const count = Math.max(0, Number(coordination.recoordination_count || 0))
  return Math.min(MAX_COORDINATION_ROUNDS, count + 1)
}

function canStartAnotherRound(coordination = {}) {
  return roundNumber(coordination) < MAX_COORDINATION_ROUNDS
}

function enqueueProcessing(coordination = {}, input = {}) {
  const version = Number(input.version || coordination.coordination_version || 0)
  if (!Number.isSafeInteger(version) || version <= 0) throw new Error('协调版本无效')
  const now = dateValue(input.now)
  return Object.assign({}, coordination, {
    status: 'computing_overlap',
    business_state: 'processing',
    processing_status: PROCESSING_STATUS.QUEUED,
    processing_version: version,
    processing_token: '',
    processing_attempts: 0,
    processing_started_at: null,
    processing_completed_at: null,
    processing_error_code: '',
    last_event_at: now
  })
}

function claimProcessingVersion(coordination = {}, input = {}) {
  const token = String(input.token || '').trim()
  if (!token) throw new Error('协调处理凭证无效')
  const version = Number(coordination.coordination_version || 0)
  if (coordination.status !== 'computing_overlap'
    || coordination.processing_status !== PROCESSING_STATUS.QUEUED
    || Number(coordination.processing_version || 0) !== version) {
    throw new Error('协调任务当前不可领取')
  }
  const now = dateValue(input.now)
  return Object.assign({}, coordination, {
    processing_status: nextProcessingStatus(coordination.processing_status, 'claim'),
    processing_token: token,
    processing_attempts: Number(coordination.processing_attempts || 0) + 1,
    processing_started_at: now,
    processing_error_code: '',
    last_event_at: now
  })
}

function completeProcessingVersion(coordination = {}, input = {}) {
  const version = Number(input.version || 0)
  const token = String(input.token || '').trim()
  if (version !== Number(coordination.coordination_version || 0)
    || version !== Number(coordination.processing_version || 0)) {
    return { applied: false, reason: 'stale_processing_version', coordination: Object.assign({}, coordination) }
  }
  if (coordination.processing_status !== PROCESSING_STATUS.PROCESSING
    || !token
    || token !== String(coordination.processing_token || '')) {
    return { applied: false, reason: 'stale_processing_lease', coordination: Object.assign({}, coordination) }
  }
  const now = dateValue(input.now)
  return {
    applied: true,
    reason: '',
    coordination: Object.assign({}, coordination, {
      processing_status: nextProcessingStatus(coordination.processing_status, 'complete'),
      processing_token: '',
      processing_completed_at: now,
      processing_error_code: '',
      last_event_at: now
    })
  }
}

function proposalSummary(proposal = {}) {
  const period = { morning: '上午', afternoon: '下午', evening: '晚上', night: '夜间' }[proposal.period] || proposal.period || ''
  return [proposal.date, period, proposal.area, proposal.activity, proposal.duration]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('、')
}

function projectParticipantEvent(event = {}, context = {}) {
  const viewerId = Number(context.viewer_user_id || 0)
  const actorId = Number(event.actor_user_id || 0)
  const mine = actorId > 0 && actorId === viewerId
  const proposal = proposalSummary(event.proposal)
  const counterSummary = event.counter_offer && Array.isArray(event.counter_offer.changes)
    ? event.counter_offer.changes
      .map((item) => `${String(item.label || '')}改为${String(item.after_text || '')}`)
      .filter((item) => item !== '改为')
      .join('；')
    : ''
  const definitions = {
    application_submitted: {
      stage: mine ? 'my_application_submitted' : 'partner_application_submitted',
      content: mine ? '你的约会偏好已提交。系统只会向对方说明进度，不会展示你的原始回答。' : '对方已提交约会偏好。对方的原始回答不会向你展示。'
    },
    invitation_accepted: {
      stage: mine ? 'invitation_accepted' : 'partner_joined',
      content: mine ? '你已选择和 AI 协调这次第一次约会。' : '对方已接受约会邀请，目前正在补充自己的安排。'
    },
    invitation_declined: {
      stage: mine ? 'invitation_declined' : 'partner_declined',
      content: mine ? '你已选择这次暂不方便，本次协调已结束。' : '对方暂未接受本次约会邀请，本次协调已结束。'
    },
    processing_queued: {
      stage: 'processing_queued',
      content: '双方偏好已收齐，协调方案正在排队处理。完成后会在这里同步进度。'
    },
    preference_changed: {
      stage: mine ? 'my_preference_changed' : 'partner_preference_changed',
      content: mine
        ? '你确认的偏好修改已记录，系统会按新版本重新协调。'
        : (event.has_proposal
            ? '对方的约会条件发生调整，系统已生成新的候选方案，请在协调页查看。'
            : '对方的约会条件发生调整，系统正在按新版本重新协调。')
    },
    proposal_generated: {
      stage: 'proposal_generated',
      content: proposal ? `已找到双方都有交集的候选方案：${proposal}。请在协调页确认。` : '已找到双方都有交集的候选方案，请在协调页确认。'
    },
    no_overlap: {
      stage: 'no_overlap',
      content: event.counter_offer && !mine
        ? `对方提出了一份明确的调整方案：${counterSummary || String(event.counter_offer.body || '')}。请在协调页核对完整方案后选择接受，或继续提出其他调整。`
        : '本轮暂未找到双方都合适的时间、区域和活动组合。你可以继续告诉我可调整范围。'
    },
    proposal_confirmed: {
      stage: mine ? 'my_proposal_confirmed' : 'partner_proposal_confirmed',
      content: mine ? '你已确认当前方案，正在等待对方确认。' : '对方已确认当前方案，请在协调页查看并决定。'
    },
    proposal_rejected: {
      stage: mine ? 'my_proposal_rejected' : 'partner_proposal_rejected',
      content: '当前方案未被接受，系统将进入下一轮协调；这不等于拒绝继续约会。'
    },
    arranged: {
      stage: 'arranged',
      content: proposal ? `双方已确认同一方案：${proposal}。请继续按安全流程准备见面。` : '双方已确认同一方案，请继续按安全流程准备见面。'
    },
    recoordination_started: {
      stage: 'recoordination_started',
      content: `已进入第 ${Number(event.round_number || 1)} 轮协调，请补充或调整你的可接受范围。`
    },
    manual_handoff: {
      stage: 'manual_handoff',
      content: '自动协调轮次已用完，当前已转人工客服继续协助。'
    },
    processing_failed: {
      stage: 'processing_failed',
      content: '协调方案暂时生成失败，系统会安全重试；如持续失败可联系人工客服。'
    }
  }
  const selected = definitions[event.event_type] || {
    stage: 'coordination_updated',
    content: '约会协调状态有更新，请打开协调页查看。'
  }
  return {
    event_type: String(event.event_type || 'coordination_updated'),
    stage: selected.stage,
    content: selected.content,
    coordination_version: Number(event.coordination_version || 0),
    round_number: Number(event.round_number || 1)
  }
}

module.exports = {
  MAX_COORDINATION_ROUNDS,
  PROCESSING_STATUS,
  nextProcessingStatus,
  roundNumber,
  canStartAnotherRound,
  enqueueProcessing,
  claimProcessingVersion,
  completeProcessingVersion,
  projectParticipantEvent
}
