const assert = require('assert')
const {
  createEmptyDateCoordinationForm,
  mergeCoordinationForm
} = require('../../miniprogram/pages/date-coordination/formState')

const stale = Object.assign(createEmptyDateCoordinationForm(), {
  availability: [{ date: '2026-09-06', periods: ['afternoon'] }],
  areas: ['南山区'],
  start_time: '15:00',
  activity_venue: '旧场地'
})

const nextRound = mergeCoordinationForm(stale, null, true)
assert.deepStrictEqual(nextRound.availability, [])
assert.strictEqual(nextRound.start_time, '')
assert.strictEqual(nextRound.activity_venue, '')

const sameRound = mergeCoordinationForm(stale, {
  availability: [{ date: '2026-09-07', periods: ['night'] }],
  start_time: '20:00'
}, false)
assert.strictEqual(sameRound.start_time, '20:00')
assert.deepStrictEqual(sameRound.areas, ['南山区'])

console.log('PASS date coordination form state isolates rounds')
