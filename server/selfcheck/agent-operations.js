const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { createReminderJob, classifyJob, processNotificationJobs } = require('../../miniprogram/cloudfunctions/api/agent/notificationJobs')
const { retentionDays, cutoffDates, isExpiredMemory } = require('../../miniprogram/cloudfunctions/api/agent/retentionPolicy')

const now = new Date('2026-07-12T00:00:00Z')
const job = createReminderJob({ coordinationId: 9, userId: 2, stage: 'invitation', deadlineAt: '2026-07-14T00:00:00Z', now })
assert.equal(job.idempotency_key, 'date:9:2:invitation')
assert.equal(job.scheduled_at.toISOString(), '2026-07-13T00:00:00.000Z')
assert.equal(classifyJob(job, new Date('2026-07-13T01:00:00Z')), 'send')
assert.equal(classifyJob(job, new Date('2026-07-14T00:00:00Z')), 'expired')

const createdInvitation = createReminderJob({
  coordinationId: 10,
  userId: 3,
  stage: 'invitation_created',
  deadlineAt: '2026-07-14T00:00:00Z',
  now
})
assert.equal(createdInvitation.idempotency_key, 'date:10:3:invitation_created')
assert.equal(createdInvitation.scheduled_at.toISOString(), now.toISOString())

assert.equal(typeof processNotificationJobs, 'function')

async function notificationProcessorChecks() {
  const tables = {
    agent_notification_job: [
      {
        id: 1,
        coordination_id: 10,
        user_id: 3,
        stage: 'invitation_created',
        status: 'pending',
        attempts: 0,
        scheduled_at: new Date('2026-07-12T00:00:00Z'),
        deadline_at: new Date('2026-07-14T00:00:00Z')
      },
      {
        id: 2,
        coordination_id: 11,
        user_id: 4,
        stage: 'confirmation',
        status: 'pending',
        attempts: 0,
        scheduled_at: new Date('2026-07-10T00:00:00Z'),
        deadline_at: new Date('2026-07-11T00:00:00Z')
      }
    ],
    agent_session: [],
    agent_message: []
  }
  let id = 10
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    list: async (name, query) => (tables[name] || []).filter((row) => matches(row, query)),
    first: async (name, query) => (tables[name] || []).find((row) => matches(row, query)) || null,
    addWithId: async (name, data) => {
      const row = Object.assign({ id: ++id }, data)
      tables[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => Object.assign(row, data)
  }
  const result = await processNotificationJobs({ deps, limit: 10, now: new Date('2026-07-13T00:00:00Z') })
  assert.deepEqual(result, { processed: 2, sent: 1, expired: 1, waiting: 0, failed: 0 })
  assert.equal(tables.agent_notification_job[0].status, 'sent')
  assert.equal(tables.agent_notification_job[1].status, 'expired')
  assert.equal(tables.agent_session.length, 1)
  assert.equal(tables.agent_session[0].user_id, 3)
  assert.equal(tables.agent_message.length, 1)
  assert.equal(tables.agent_message[0].notification_job_id, 1)
  assert(!tables.agent_message[0].content.includes('对方原话'))

  const root = path.resolve(__dirname, '../..')
  const apiIndex = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/index.js'), 'utf8')
  const worker = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/report-worker/index.js'), 'utf8')
  assert(apiIndex.includes("case 'processWorkerTasks':"))
  assert(worker.includes("action: 'processWorkerTasks'"))
}

assert.deepEqual(retentionDays({ AGENT_MESSAGE_RETENTION_DAYS: '30' }), { messages: 30, toolCalls: 365, memories: 365 })
assert.equal(cutoffDates(now, { AGENT_MEMORY_RETENTION_DAYS: '10' }).user_agent_memory.toISOString(), '2026-07-02T00:00:00.000Z')
assert.equal(isExpiredMemory({ expires_at: '2026-07-11T00:00:00Z' }, now), true)

notificationProcessorChecks().then(() => {
  console.log('PASS agent notification and retention policies')
}).catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
