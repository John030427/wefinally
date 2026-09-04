const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  normalizeStartTime,
  exactTimeFromText,
  periodForStartTime,
  venueResolution,
  activityVenueConflict,
  planReadiness
} = require('../../miniprogram/cloudfunctions/api/lib/meetingPlanPolicy')
const { normalizeApplication, computeOverlap } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const {
  buildProposalCard,
  mergeInvitationWithOverrides
} = require('../../miniprogram/cloudfunctions/api/lib/invitationCoordination')
const { safeCard } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
const { applyMeetingCheckIn, publicState } = require('../../miniprogram/cloudfunctions/api/lib/meetingCheckInService')

function application(hint) {
  return {
    contract_version: 2,
    availability: [{ date: '2026-09-06', periods: ['night'] }],
    areas: ['南山区'],
    activities: ['电影'],
    budget: '50-100',
    payment_preference: 'aa',
    duration: 'about-1h',
    start_time: '20:00',
    activity_venue: '万象天地百老汇影城',
    meet_point: '影城一楼售票处',
    arrival_hint: hint
  }
}

async function main() {
  assert.strictEqual(normalizeStartTime('8:00'), '08:00')
  assert.strictEqual(exactTimeFromText('周日上午10点'), '10:00')
  assert.strictEqual(periodForStartTime(exactTimeFromText('周日上午10点')), 'morning')
  assert.strictEqual(exactTimeFromText('周日晚上8点'), '20:00')
  assert.strictEqual(periodForStartTime('20:00'), 'night')
  assert(activityVenueConflict('电影', '星巴克'))
  assert.strictEqual(activityVenueConflict('电影', '万象天地百老汇影城'), null)
  assert.deepStrictEqual(venueResolution('吃饭', '大运中心'), {
    status: 'resolved',
    area_hint: '大运中心',
    activity_detail: '吃饭',
    activity_venue: '大运中心',
    missing_fields: [],
    location_precision: 'area',
    venue_choice_mode: 'named_location',
    clarification: '当前地点比较宽泛，可以到场后再选店；若你已有具体店名也可以继续补充。'
  })
  assert.deepStrictEqual(venueResolution('吃饭', '椰子鸡'), {
    status: 'needs_specific_venue',
    area_hint: '',
    activity_detail: '椰子鸡',
    activity_venue: '',
    missing_fields: ['activity_venue'],
    location_precision: 'unspecified',
    venue_choice_mode: '',
    clarification: '“椰子鸡”更像活动说明。想在哪里见面？商场、商圈或具体店名都可以'
  })
  assert.deepStrictEqual(venueResolution('电影', '深圳仁恒梦中心英皇电影城'), {
    status: 'resolved',
    area_hint: '',
    activity_detail: '电影',
    activity_venue: '深圳仁恒梦中心英皇电影城',
    missing_fields: [],
    location_precision: 'venue',
    venue_choice_mode: 'named_location',
    clarification: ''
  })
  assert.strictEqual(planReadiness(application('深色上衣，手持一本书')).ready, true)
  assert.strictEqual(planReadiness(Object.assign(application('深色上衣'), { meet_point: '' })).ready, true)
  assert.strictEqual(planReadiness(Object.assign(application('深色上衣'), { activity_venue: '星巴克' })).ready, false)

  const changedDayWithoutExactTime = mergeInvitationWithOverrides(application('深色上衣'), {
    availability: [{ date: '2026-09-10', periods: ['night'] }]
  })
  assert.strictEqual(changedDayWithoutExactTime.start_time, '')
  assert.strictEqual(changedDayWithoutExactTime.activity_venue, '万象天地百老汇影城')
  assert.throws(
    () => normalizeApplication(changedDayWithoutExactTime, new Date('2026-09-02T00:00:00.000Z')),
    /请再选择一个具体开始时间/
  )

  const legacy = normalizeApplication({
    availability: [{ date: '2026-09-06', periods: ['night'] }],
    areas: ['南山区'], activities: ['电影'], budget: '50-100',
    payment_preference: 'aa', duration: 'about-1h'
  }, new Date('2026-09-02T00:00:00.000Z'))
  assert.strictEqual(Object.prototype.hasOwnProperty.call(legacy, 'contract_version'), false)

  const overlap = computeOverlap(application('深色上衣'), application('浅色外套'), {
    version: 3,
    user_a_id: 1,
    user_b_id: 2
  })
  assert.strictEqual(overlap.proposals.length, 1)
  assert.strictEqual(overlap.proposals[0].start_time, '20:00')
  assert.strictEqual(overlap.proposals[0].activity_venue, '万象天地百老汇影城')
  const withoutFixedMeetingPoint = computeOverlap(
    Object.assign(application('深色上衣'), { meet_point: '' }),
    Object.assign(application('浅色外套'), { meet_point: '影城一楼' }),
    { version: 4, user_a_id: 1, user_b_id: 2 }
  )
  assert.strictEqual(withoutFixedMeetingPoint.proposals.length, 1)
  assert.strictEqual(withoutFixedMeetingPoint.proposals[0].meet_point, '')
  assert.throws(
    () => normalizeApplication(Object.assign(application('深色上衣'), { activities: ['咖啡', '电影'] }), new Date('2026-09-02T00:00:00.000Z')),
    /只能选择一个日期、时间段、区域和活动/
  )
  const mixedContract = computeOverlap(application('深色上衣'), legacy, { version: 3, user_a_id: 1, user_b_id: 2 })
  assert.strictEqual(mixedContract.proposals[0].contract_version, undefined)
  assert.strictEqual(mixedContract.proposals[0].start_time, undefined)
  assert.strictEqual(buildProposalCard(mixedContract.proposals[0]).meeting_ready, true)
  const card = buildProposalCard(overlap.proposals[0])
  assert(card.time_text.includes('20:00'))
  assert.strictEqual(card.meeting_ready, true)

  const sanitized = safeCard({
    title: '对方更新了约会方案',
    private_phone: '13800000000',
    proposal: Object.assign({}, overlap.proposals[0], { private_address: '不可见地址' })
  })
  assert.strictEqual(JSON.stringify(sanitized).includes('13800000000'), false)
  assert.strictEqual(JSON.stringify(sanitized).includes('不可见地址'), false)

  const tables = {
    date_coordination: [{ id: 9, user_a_id: 1, user_b_id: 2, coordination_version: 3, status: 'arranged' }],
    date_coordination_application: [
      { id: 10, coordination_id: 9, coordination_version: 3, user_id: 1, application: application('深色上衣') },
      { id: 11, coordination_id: 9, coordination_version: 3, user_id: 2, application: application('浅色外套') }
    ]
  }
  const events = []
  let tick = 0
  const deps = {
    env: { MEETING_CODE_SECRET: 'selfcheck-secret' },
    now: () => new Date(1760000000000 + (++tick * 1000)),
    byId: async (name, id) => tables[name].find((row) => Number(row.id) === Number(id)),
    list: async (name, query) => tables[name].filter((row) => Object.keys(query).every((key) => row[key] === query[key])),
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    publishCoordinationEvent: async (input) => { events.push(input.event); return { messages: [] } }
  }
  await applyMeetingCheckIn({ coordination_id: 9, user_id: 1, action: 'set_arrival_hint', arrival_hint: '蓝色衬衫，手持一本书' }, deps)
  assert.strictEqual(tables.date_coordination[0].coordination_version, 3)
  assert.strictEqual(publicState(tables.date_coordination[0], tables.date_coordination_application, 2, deps.env).partner_arrival_hint, '蓝色衬衫，手持一本书')
  assert.strictEqual(publicState(tables.date_coordination[0], tables.date_coordination_application, 2, { LANGGRAPH_ACTOR_SECRET: 'do-not-reuse' }).meeting_code, '')
  await assert.rejects(
    () => applyMeetingCheckIn({ coordination_id: 9, user_id: 1, action: 'set_arrival_hint', arrival_hint: '加我微信13800000000' }, deps),
    /只能填写穿搭颜色或手持物/
  )
  await assert.rejects(
    () => applyMeetingCheckIn({ coordination_id: 9, user_id: 1, action: 'set_arrival_hint', arrival_hint: '我在南方科技大学，穿蓝色衬衫' }, deps),
    /只能填写穿搭颜色或手持物/
  )
  await applyMeetingCheckIn({ coordination_id: 9, user_id: 1, action: 'arrived', arrival_position: '星巴克吧台旁' }, deps)
  const partnerArrivalState = publicState(tables.date_coordination[0], tables.date_coordination_application, 2, deps.env)
  assert.strictEqual(partnerArrivalState.partner_arrival_position, '星巴克吧台旁')
  await applyMeetingCheckIn({ coordination_id: 9, user_id: 2, action: 'arrived' }, deps)
  const met = await applyMeetingCheckIn({ coordination_id: 9, user_id: 1, action: 'met' }, deps)
  assert.strictEqual(met.my_met_confirmed, true)
  const paused = await applyMeetingCheckIn({ coordination_id: 9, user_id: 2, action: 'mismatch' }, deps)
  assert.strictEqual(paused.meeting_paused, true)
  assert.strictEqual(paused.can_confirm_met, false)
  assert.strictEqual(publicState(tables.date_coordination[0], tables.date_coordination_application, 1, deps.env).safety_alert, true)
  await assert.rejects(
    () => applyMeetingCheckIn({ coordination_id: 9, user_id: 1, action: 'met' }, deps),
    /会合已暂停/
  )
  assert.strictEqual(events.some((event) => event.event_type === 'arrival_hint_updated'), true)
  assert.strictEqual(events.some((event) => event.event_type === 'participant_arrived' && event.arrival_position === '星巴克吧台旁'), true)

  // Same coordination version: position update must notify again; identical position stays idempotent.
  const positionTables = {
    date_coordination: [{ id: 19, user_a_id: 1, user_b_id: 2, coordination_version: 4, status: 'arranged' }],
    date_coordination_application: [
      { id: 20, coordination_id: 19, coordination_version: 4, user_id: 1, application: application('深色上衣') },
      { id: 21, coordination_id: 19, coordination_version: 4, user_id: 2, application: application('浅色外套') }
    ]
  }
  const positionEvents = []
  const partnerNotifications = []
  const positionDeps = {
    env: { MEETING_CODE_SECRET: 'selfcheck-secret' },
    now: () => new Date('2026-09-03T12:00:00.000Z'),
    byId: async (name, id) => positionTables[name].find((row) => Number(row.id) === Number(id)),
    list: async (name, query) => positionTables[name].filter((row) => Object.keys(query).every((key) => row[key] === query[key])),
    updateByDoc: async (_name, row, patch) => Object.assign(row, patch),
    publishCoordinationEvent: async (input) => {
      const existing = positionEvents.find((event) => (
        event.event_type === input.event.event_type
        && event.idempotency_suffix === input.event.idempotency_suffix
        && Number(event.actor_user_id) === Number(input.event.actor_user_id)
      ))
      if (existing) return { messages: [], duplicate: true, created: false, event: existing }
      positionEvents.push(input.event)
      return { messages: [], duplicate: false, created: true, event: input.event }
    },
    writeInboxNotification: async (input) => {
      partnerNotifications.push(input)
      return { queued: true }
    }
  }
  await applyMeetingCheckIn({ coordination_id: 19, user_id: 1, action: 'arrived', arrival_position: '星巴克吧台旁' }, positionDeps)
  await applyMeetingCheckIn({ coordination_id: 19, user_id: 1, action: 'arrived', arrival_position: '星巴克靠窗位置' }, positionDeps)
  assert.strictEqual(partnerNotifications.length, 2)
  assert.ok(String(partnerNotifications[1].body || '').includes('靠窗'))
  assert.notStrictEqual(
    positionEvents[0].idempotency_suffix,
    positionEvents[1].idempotency_suffix,
    'updated arrival positions must use distinct event identities'
  )
  assert.ok(!String(positionEvents[1].idempotency_suffix || '').includes('靠窗'))
  await applyMeetingCheckIn({ coordination_id: 19, user_id: 1, action: 'arrived', arrival_position: '星巴克靠窗位置' }, positionDeps)
  assert.strictEqual(partnerNotifications.length, 2, 'identical arrival position must stay idempotent')
  assert.strictEqual(positionEvents.length, 2)

  const root = path.resolve(__dirname, '../..')
  const dateWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/date-coordination/date-coordination.wxml'), 'utf8')
  const chatWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.wxml'), 'utf8')
  const route = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
  assert(dateWxml.includes('AI 协调方案'))
  assert(dateWxml.includes('到场会合'))
  assert(dateWxml.includes('现场位置（选填）'))
  assert(dateWxml.includes('初步会合范围（选填）'))
  assert(chatWxml.includes('coordinationUpdateCard'))
  assert(route.includes('/meeting-check-in'))
  console.log('PASS exact meeting plan + chat update cards + safe arrival coordination')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
