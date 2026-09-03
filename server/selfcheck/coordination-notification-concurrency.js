const assert = require('assert')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  buildInAppNotification,
  isNotificationStale,
  coalesceNotifications,
  sendWechatSubscribeAdapter,
  applyUnreadCursor,
  markNotificationsRead,
  notifyConfig
} = require('../../miniprogram/cloudfunctions/api/lib/coordinationNotification')
const {
  applyPreferencePatch,
  mergeConcurrentPreferencePatches,
  buildResumeSummary,
  chooseAdjustmentParty
} = require('../../miniprogram/cloudfunctions/api/lib/coordinationConcurrency')
const { notifyInbox } = require('../../miniprogram/cloudfunctions/api/lib/coordinationInbox')

function createBarrier(size) {
  let count = 0
  let release
  const ready = new Promise((resolve) => { release = resolve })
  return async function enter() {
    count += 1
    if (count >= size) release()
    await ready
  }
}

async function main() {
  const note = buildInAppNotification({
    coordination_id: 12,
    user_id: 3,
    event_type: 'PROPOSAL_READY',
    coordination_version: 10,
    body: '有新方案待确认'
  })
  assert.strictEqual(note.channel, 'in_app')
  assert.strictEqual(note.expected_coordination_version, 10)
  assert.strictEqual(isNotificationStale(note, 10), false)
  assert.strictEqual(isNotificationStale(note, 11), true)

  const merged = coalesceNotifications([
    { ...note, merge_key: '12:3:PROPOSAL_READY', create_time_ms: Date.now() - 1000 },
    { ...note, coordination_version: 11, expected_coordination_version: 11, merge_key: '12:3:PROPOSAL_READY', create_time_ms: Date.now() }
  ], Date.now(), { mergeWindowMs: 120000 })
  assert.ok(merged.length === 1)
  assert.ok(merged[0].merged_from === 2)

  const skip = await sendWechatSubscribeAdapter({ event_type: 'PROPOSAL_READY' }, {
    config: notifyConfig({ WECHAT_SUBSCRIBE_ENABLED: 'true', WECHAT_SUBSCRIBE_TEMPLATE_IDS: '' })
  })
  assert.strictEqual(skip.skipped, true)
  assert.strictEqual(skip.reason, 'template_ids_unconfigured')

  const cursor = applyUnreadCursor({ unread_count: 0 }, note)
  assert.strictEqual(cursor.unread_count, 1)
  assert.strictEqual(markNotificationsRead(cursor, 11).unread_count, 0)

  const base = {
    preference_version: 1,
    coordination_version: 5,
    availability: [{ date: '2026-08-20', periods: ['evening'] }],
    areas: ['南山'],
    activities: ['咖啡']
  }
  const concurrent = mergeConcurrentPreferencePatches(
    base,
    { availability_add: [{ date: '2026-08-21', periods: ['afternoon'] }] },
    { availability_add: [{ date: '2026-08-22', periods: ['evening'] }], areas_add: ['福田'] }
  )
  assert.strictEqual(concurrent.ok, true)
  assert.ok(concurrent.application.availability.length >= 3)
  assert.ok(concurrent.application.areas.includes('南山'))
  assert.ok(concurrent.application.areas.includes('福田'))

  const stale = applyPreferencePatch(base, { areas_add: ['宝安'] }, 99)
  assert.strictEqual(stale.conflict, true)

  const resume = buildResumeSummary([
    { coordination_version: 14, event_type: 'preference_updated' },
    { coordination_version: 15, event_type: 'new_overlap_found', safe_summary: { stage: 'overlap' } }
  ], 13)
  assert.strictEqual(resume.has_updates, true)
  assert.ok(resume.lines.some((line) => line.includes('共同')))
  assert.ok(!JSON.stringify(resume).includes('对方说'))
  assert.ok(!JSON.stringify(resume).includes('原话：'))

  assert.strictEqual(chooseAdjustmentParty({ last_adjustment_requested_party: 'A', a_has_flexibility: true, b_has_flexibility: true }), 'B')

  const chatJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/chat/chat.js'), 'utf8')
  assert(chatJs.includes('我是你的 AI 约会协调员'))
  assert(chatJs.includes('修改预览'))

  const dateWxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/date-coordination/date-coordination.wxml'), 'utf8')
  assert(dateWxml.includes('和 AI 约会协调员沟通'))
  assert(dateWxml.includes('showCoordinatorCta'))

  const reportWxss = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/match-detail/match-detail.wxss'), 'utf8')
  assert(/\.report-item[\s\S]*font-size:\s*28rpx/.test(reportWxss))
  assert(/\.report-section-title[\s\S]*font-size:\s*30rpx/.test(reportWxss))
  const reportWxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/match-detail/match-detail.wxml'), 'utf8')
  assert(reportWxml.includes('AI 生成内容，仅供参考'))
  assert(reportWxml.includes('reportPresentation'))

  const tables = {
    coordination_notification: [],
    user_notification_cursor: [],
    coordination_notification_dedupe: []
  }
  let nextId = 1
  const now = () => new Date('2026-09-03T12:00:00.000Z')
  const barrier = createBarrier(2)
  const input = {
    coordination: { id: 12, coordination_version: 10 },
    user_id: 3,
    event_type: 'PROPOSAL_READY',
    coordination_version: 10,
    title: '有新方案待确认',
    body: '请打开约会协调页确认方案'
  }

  // Race-prone check-then-insert must fail under a shared barrier.
  const raceDeps = {
    first: async (name, query) => {
      await barrier()
      return (tables[name] || []).find((row) => Object.keys(query).every((key) => row[key] === query[key])) || null
    },
    addWithId: async (name, data) => {
      const row = Object.assign({ id: nextId++, _id: `${name}_${nextId}` }, data)
      tables[name].push(row)
      return row
    },
    updateByDoc: async (_name, row, data) => Object.assign(row, data),
    now,
    config: { wechatEnabled: false, templateIds: [] },
    sendSubscribeMessage: async () => ({ sent: false, reason: 'disabled' })
  }
  const raced = await Promise.all([
    notifyInbox(input, raceDeps),
    notifyInbox(input, raceDeps)
  ])
  assert.strictEqual(
    tables.coordination_notification.length,
    1,
    `concurrent notifyInbox must keep one notification, got ${tables.coordination_notification.length}`
  )
  assert.strictEqual(raced.filter((item) => item.duplicate).length, 1)

  // Atomic helper path: shared sync claim + barrier still yields one row.
  tables.coordination_notification.length = 0
  tables.user_notification_cursor.length = 0
  tables.coordination_notification_dedupe.length = 0
  nextId = 1
  const barrier2 = createBarrier(2)
  const claims = new Map()
  const atomicDeps = {
    first: async (name, query) => (tables[name] || []).find((row) => Object.keys(query).every((key) => row[key] === query[key])) || null,
    addWithId: async (name, data) => {
      const row = Object.assign({ id: nextId++, _id: `${name}_${nextId}` }, data)
      tables[name].push(row)
      return row
    },
    updateByDoc: async (_name, row, data) => Object.assign(row, data),
    now,
    config: { wechatEnabled: false, templateIds: [] },
    sendSubscribeMessage: async () => ({ sent: false, reason: 'disabled' }),
    createCoordinationNotificationOnce: async (notification) => {
      await barrier2()
      const key = String(notification.idempotency_key || '')
      const digest = crypto.createHash('sha256').update(key).digest('hex')
      const existingClaim = claims.get(digest)
      if (existingClaim) {
        const stored = await Promise.resolve(existingClaim)
        return { created: false, notification: stored }
      }
      let resolveClaim
      const claimPromise = new Promise((resolve) => { resolveClaim = resolve })
      claims.set(digest, claimPromise)
      const row = Object.assign({ id: nextId++, _id: `coordination_notification_${nextId}` }, notification, { read_at: null })
      tables.coordination_notification.push(row)
      tables.coordination_notification_dedupe.push({
        _id: digest,
        idempotency_key: key,
        notification_id: row.id
      })
      resolveClaim(row)
      claims.set(digest, row)
      return { created: true, notification: row }
    }
  }
  const [left, right] = await Promise.all([
    notifyInbox(input, atomicDeps),
    notifyInbox(input, atomicDeps)
  ])
  assert.strictEqual(tables.coordination_notification.length, 1)
  assert.strictEqual([left, right].filter((item) => item.duplicate).length, 1)
  assert.strictEqual(tables.coordination_notification_dedupe.length, 1)

  const inboxSource = fs.readFileSync(path.join(__dirname, '../../miniprogram/cloudfunctions/api/lib/coordinationInbox.js'), 'utf8')
  assert(inboxSource.includes('createCoordinationNotificationOnce'))
  assert(!/idempotency_key && typeof deps\.first === 'function'/.test(inboxSource))
  const dbSource = fs.readFileSync(path.join(__dirname, '../../miniprogram/cloudfunctions/api/lib/db.js'), 'utf8')
  assert(dbSource.includes('async function createCoordinationNotificationOnce'))
  assert(dbSource.includes('coordination_notification_dedupe'))

  console.log('PASS coordination concurrency + notification + UI contracts')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
