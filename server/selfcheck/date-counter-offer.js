const assert = require('assert')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const { buildTimeCounterOffer, mergeAcceptedTime } = require('../../miniprogram/cloudfunctions/api/lib/dateCounterOfferPolicy')
const { buildDateCoordinationGraphInput } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState')
const { projectParticipantEvent } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationProcessingPolicy')

const coordination = {
  id: 88,
  user_a_id: 1,
  user_b_id: 2,
  status: 'no_overlap',
  coordination_version: 2,
  last_changed_by_user_id: 2,
  missing_dimensions: ['time']
}
const male = {
  availability: [{ date: '2026-09-04', periods: ['afternoon'] }],
  areas: ['南山'], activities: ['咖啡'], budget: 'under-50', payment_preference: 'aa', duration: 'about-1h'
}
const female = {
  availability: [{ date: '2026-09-06', periods: ['afternoon'] }],
  areas: ['南山'], activities: ['咖啡'], budget: 'under-50', payment_preference: 'aa', duration: 'about-1h'
}

const offer = buildTimeCounterOffer({ coordination, applicationA: male, applicationB: female, viewerUserId: 1 })
assert.ok(offer)
assert.strictEqual(offer.time_text, '2026-09-06 下午')
assert.strictEqual(buildTimeCounterOffer({ coordination, applicationA: male, applicationB: female, viewerUserId: 2 }), null)
assert.deepStrictEqual(mergeAcceptedTime(male.availability, offer), [
  { date: '2026-09-04', periods: ['afternoon'] },
  { date: '2026-09-06', periods: ['afternoon'] }
])

const applications = [
  { user_id: 1, coordination_version: 2, application: male },
  { user_id: 2, coordination_version: 2, application: female }
]
const graphInput = buildDateCoordinationGraphInput(coordination, applications, { id: 1 }, { confirmations: [] })
assert.strictEqual(graphInput.sharedState.actionRequired, 'review_counter_offer')
assert.strictEqual(graphInput.sharedState.counterOffer.time_text, '2026-09-06 下午')

const partnerMessage = projectParticipantEvent({
  event_type: 'no_overlap', actor_user_id: 2, counter_offer: offer
}, { viewer_user_id: 1 })
assert.ok(partnerMessage.content.includes('2026-09-06 下午'))
assert.ok(partnerMessage.content.includes('候选时间'))

const routeSource = fs.readFileSync(path.join(ROOT, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
const pageSource = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/date-coordination/date-coordination.js'), 'utf8')
const viewSource = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/date-coordination/date-coordination.wxml'), 'utf8')
assert.ok(routeSource.includes('/counter-offer\\/accept'))
assert.ok(pageSource.includes('async acceptCounterOffer()'))
assert.ok(viewSource.includes('接受这个时间'))

console.log('PASS date counter offer: privacy-safe candidate, graph action, event feedback and UI accept route')
