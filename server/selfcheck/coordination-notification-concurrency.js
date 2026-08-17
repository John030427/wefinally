const assert = require('assert')
const fs = require('fs')
const path = require('path')
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

  console.log('PASS coordination concurrency + notification + UI contracts')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
