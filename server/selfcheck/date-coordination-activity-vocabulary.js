const assert = require('assert')
const { ACTIVITIES, normalizeApplication } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')

const base = {
  availability: [{ date: '2026-09-12', periods: ['evening'] }],
  areas: ['福田区'],
  budget: 'flexible',
  payment_preference: 'flexible',
  duration: 'flexible',
  activity_venue: ''
}

for (const activity of ['椰子鸡', '火锅', '寿司郎']) {
  assert(ACTIVITIES.includes(activity), `${activity} must be an allowed activity value`)
  const normalized = normalizeApplication(Object.assign({}, base, { activities: [activity] }), new Date('2026-09-05T00:00:00.000Z'))
  assert.deepStrictEqual(normalized.activities, [activity])
  assert.strictEqual(normalized.activity_venue, undefined, `${activity} must not require a venue`)
}

assert.throws(
  () => normalizeApplication(Object.assign({}, base, { activities: ['未收录活动'] }), new Date('2026-09-05T00:00:00.000Z')),
  /活动偏好包含无效选项/
)

console.log('PASS date coordination accepts supported activity details without relaxing unknown-activity validation')
