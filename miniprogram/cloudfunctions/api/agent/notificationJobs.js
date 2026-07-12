const REMINDER_HOURS = {
  invitation: 24,
  application: 48,
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

module.exports = { REMINDER_HOURS, createReminderJob, classifyJob }
