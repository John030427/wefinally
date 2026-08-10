const REMINDER_HOURS = {
  invitation_created: 48,
  invitation: 24,
  application: 48,
  proposal_generated: 24,
  confirmation: 12
}

function createReminderJob({ coordinationId, userId, stage, deadlineAt, now = new Date() }) {
  if (!REMINDER_HOURS[stage]) throw new Error('unsupported reminder stage')
  const deadline = new Date(deadlineAt)
  const scheduled = new Date(deadline.getTime() - REMINDER_HOURS[stage] * 60 * 60 * 1000)
  return {
    coordination_id: Number(coordinationId),
    user_id: Number(userId),
    stage,
    idempotency_key: `date:${coordinationId}:${userId}:${stage}`,
    scheduled_at: scheduled > now ? scheduled : now,
    deadline_at: deadline,
    status: 'pending',
    attempts: 0
  }
}

function classifyJob(job, now = new Date()) {
  if (!job || job.status !== 'pending') return 'skip'
  if (new Date(job.deadline_at) <= now) return 'expired'
  if (new Date(job.scheduled_at) <= now) return 'send'
  return 'wait'
}

function proposalNotificationText(proposal = {}) {
  const period = {
    morning: '上午',
    afternoon: '下午',
    evening: '晚上',
    night: '夜间'
  }[proposal.period] || proposal.period || ''
  const payment = {
    aa: 'AA',
    one_pays: '一方请客',
    partner_pays: '对方请客',
    self_pays: '您请客',
    flexible: '费用方式灵活'
  }[proposal.payment_preference] || proposal.payment_preference || ''
  const duration = {
    'about-1h': '约1小时',
    '1-2h': '1-2小时',
    '2-3h': '2-3小时',
    flexible: '时长灵活'
  }[proposal.duration] || proposal.duration || ''
  const summary = [proposal.date, period, proposal.area, proposal.activity, payment, duration]
    .filter(Boolean)
    .join('、')
  return `对方已确认参与并提交了约会偏好。已找到双方都合适的方案：${summary}。请打开约会协调页确认方案。`
}

function reminderNotificationText(stage) {
  return {
    invitation_created: '你收到一条约会协调邀请，请打开约会协调页查看并决定是否参与。',
    invitation: '约会协调邀请仍在等待你的回应，请在截止时间前打开协调页处理。',
    application: '约会协调正在等待你提交偏好，请在截止时间前打开协调页填写。',
    proposal_generated: '新的约会候选方案已生成，请打开约会协调页查看并确认。',
    confirmation: '候选方案正在等待你的确认，请在截止时间前打开协调页处理。'
  }[stage] || '约会协调状态有更新，请打开协调页查看。'
}

function notificationDeps() {
  const db = require('../lib/db')
  return {
    first: db.first,
    list: db.list,
    addWithId: db.addWithId,
    updateByDoc: db.updateByDoc
  }
}

async function processNotificationJobs({ deps = notificationDeps(), limit = 10, now = new Date() } = {}) {
  const jobs = await deps.list('agent_notification_job', { status: 'pending' }, Math.max(1, Math.min(Number(limit || 10), 20)))
  const result = { processed: jobs.length, sent: 0, expired: 0, waiting: 0, failed: 0 }
  for (const job of jobs) {
    const action = classifyJob(job, now)
    if (action === 'wait') {
      result.waiting += 1
      continue
    }
    if (action === 'expired') {
      await deps.updateByDoc('agent_notification_job', job, { status: 'expired' })
      result.expired += 1
      continue
    }
    try {
      let session = await deps.first('agent_session', {
        user_id: Number(job.user_id),
        agent_type: 'date_coordinator',
        coordination_id: Number(job.coordination_id),
        status: 'active'
      })
      if (!session) {
        session = await deps.addWithId('agent_session', {
          user_id: Number(job.user_id),
          agent_type: 'date_coordinator',
          coordination_id: Number(job.coordination_id),
          status: 'active',
          summary: ''
        }, 'agent_session')
      }
      const existing = await deps.first('agent_message', { notification_job_id: Number(job.id) })
      if (!existing) {
        await deps.addWithId('agent_message', {
          session_id: Number(session.id),
          user_id: Number(job.user_id),
          agent_type: 'date_coordinator',
          coordination_id: Number(job.coordination_id),
          notification_job_id: Number(job.id),
          role: 'assistant',
          sender_type: 'assistant',
          content: reminderNotificationText(job.stage)
        }, 'agent_message')
      }
      await deps.updateByDoc('agent_notification_job', job, { status: 'sent', sent_at: now })
      result.sent += 1
    } catch (err) {
      const attempts = Number(job.attempts || 0) + 1
      await deps.updateByDoc('agent_notification_job', job, {
        status: attempts >= 3 ? 'failed' : 'pending',
        attempts,
        last_error_code: 'notification_delivery_failed'
      })
      result.failed += 1
    }
  }
  return result
}

async function deliverProposalNotification({ deps, job, proposal, now = new Date() }) {
  if (!deps || !job || !proposal) return false
  const session = await deps.first('agent_session', {
    user_id: Number(job.user_id),
    agent_type: 'date_coordinator',
    coordination_id: Number(job.coordination_id),
    status: 'active'
  })
  if (!session) return false
  const existing = await deps.first('agent_message', { notification_job_id: Number(job.id) })
  if (!existing) {
    await deps.addWithId('agent_message', {
      session_id: Number(session.id),
      user_id: Number(job.user_id),
      agent_type: 'date_coordinator',
      coordination_id: Number(job.coordination_id),
      notification_job_id: Number(job.id),
      role: 'assistant',
      sender_type: 'assistant',
      content: proposalNotificationText(proposal)
    }, 'agent_message')
  }
  await deps.updateByDoc('agent_notification_job', job, {
    status: 'sent',
    sent_at: now
  })
  return true
}

module.exports = {
  REMINDER_HOURS,
  createReminderJob,
  classifyJob,
  proposalNotificationText,
  reminderNotificationText,
  deliverProposalNotification,
  processNotificationJobs
}
