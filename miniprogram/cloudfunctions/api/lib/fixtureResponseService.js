const crypto = require('crypto')
const { isInternalQaAccount, isSyntheticFixture, fixtureOwnerId, fixtureNotExpired, resolveTestIdentity } = require('./testIdentityPolicy')

const MIN_HOURS = 2
const MAX_HOURS = 6
const TEMPLATE_VERSION = 'polite_decline_v1'
const HMAC_SECRET = 'fixture-response-delay'

function politeDeclineMessage() {
  return '谢谢你的邀请。这次不太方便见面，祝你后续匹配顺利。'
}

function delayHours(interactionId, fixtureRunId, secret = HMAC_SECRET) {
  const digest = crypto.createHmac('sha256', String(secret))
    .update(`${interactionId}:${fixtureRunId || ''}`)
    .digest()
  const unit = digest.readUInt32BE(0) / 0xffffffff
  return Math.round((MIN_HOURS + unit * (MAX_HOURS - MIN_HOURS)) * 1000) / 1000
}

function canScheduleFixtureDecline(actor, target, now = new Date()) {
  const actorId = resolveTestIdentity(actor)
  const targetId = resolveTestIdentity(target)
  return actorId.profile_origin === 'real_user'
    && isInternalQaAccount(actor)
    && isSyntheticFixture(target)
    && fixtureOwnerId(target) === Number(actor && actor.id)
    && targetId.allow_date_coordination === false
    && fixtureNotExpired(target, now)
}

function publicJob(job) {
  if (!job) return null
  return {
    id: job.id,
    interaction_id: job.interaction_id,
    status: job.status,
    scheduled_at: job.scheduled_at,
    response_type: job.response_type,
    delay_hours: job.delay_hours,
    message_template_version: job.message_template_version
  }
}

async function scheduleFixtureDecline(input, deps) {
  const actor = input.actor
  const target = input.target
  const now = deps.now()
  if (!canScheduleFixtureDecline(actor, target, now)) {
    const error = new Error('不能为该对象创建测试拒绝任务')
    error.code = 403
    throw error
  }
  const interactionId = String(input.interaction_id || input.interactionId || '').slice(0, 120)
  if (!interactionId) throw new Error('互动编号无效')
  const runId = String(target.fixture_run_id || target.ab_test_run_id || '')
  const hours = delayHours(interactionId, runId, deps.hmacSecret || HMAC_SECRET)
  const acquired = await deps.acquireJob({
    interaction_id: interactionId,
    actor_user_id: Number(actor.id),
    fixture_user_id: Number(target.id),
    fixture_run_id: runId,
    response_type: 'polite_decline',
    status: 'scheduled',
    scheduled_at: new Date(now.getTime() + hours * 3600 * 1000),
    delay_hours: hours,
    message_template_version: TEMPLATE_VERSION
  })
  return acquired.job
}

async function processFixtureResponseJobs(deps, { now = deps.now(), limit = 20 } = {}) {
  const due = await deps.listDue(now, limit)
  let delivered = 0
  let failed = 0
  for (const job of due) {
    const claimed = await deps.claimJob(job, now)
    if (!claimed || claimed.status !== 'processing') continue
    try {
      await deps.completeJob(claimed, {
        source_type: 'fixture_simulation',
        event_type: 'polite_decline',
        interaction_id: job.interaction_id,
        actor_user_id: job.actor_user_id,
        fixture_user_id: job.fixture_user_id,
        job_id: job.id,
        message_template_version: TEMPLATE_VERSION,
        message_text: politeDeclineMessage(),
        notify_sms: false,
        notify_subscribe: false,
        create_human_ticket: false
      }, now)
      delivered += 1
    } catch (err) {
      await deps.retryJob(claimed, err, now)
      failed += 1
    }
  }
  return { scanned: due.length, delivered, failed }
}

module.exports = {
  delayHours,
  canScheduleFixtureDecline,
  scheduleFixtureDecline,
  processFixtureResponseJobs,
  publicJob,
  politeDeclineMessage
}
