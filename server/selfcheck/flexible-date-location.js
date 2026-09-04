'use strict'

const assert = require('assert')
const {
  venueResolution,
  normalizeFlexibleLocation,
  planReadiness,
  canSendInvitation,
  canFinalizePlan
} = require('../../miniprogram/cloudfunctions/api/lib/meetingPlanPolicy')
const { normalizeApplication } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const {
  resolvePrimaryInvitationProposal
} = require('../../miniprogram/cloudfunctions/api/lib/invitationCoordination')
const { reconcileDerivedFields } = require('../../miniprogram/cloudfunctions/api/lib/dateApplicationDerivedFields')

const NOW = new Date('2026-09-02T00:00:00.000Z')

function baseInput(venue) {
  return {
    contract_version: 2,
    availability: [{ date: '2026-09-06', periods: ['night'] }],
    areas: ['南山区'],
    activities: ['吃饭'],
    budget: '50-100',
    payment_preference: 'aa',
    duration: 'about-1h',
    start_time: '20:00',
    activity_venue: venue
  }
}

function assertStable(value) {
  const once = normalizeFlexibleLocation('吃饭', value)
  const twice = normalizeFlexibleLocation('吃饭', once.activity_venue || once.activity_detail || value, {
    activity_detail: once.activity_detail,
    location_precision: once.location_precision,
    venue_choice_mode: once.venue_choice_mode
  })
  assert.deepStrictEqual({
    activity_venue: twice.activity_venue,
    activity_detail: twice.activity_detail,
    location_precision: twice.location_precision,
    status: twice.status
  }, {
    activity_venue: once.activity_venue,
    activity_detail: once.activity_detail,
    location_precision: once.location_precision,
    status: once.status
  })
}

function main() {
  for (const place of ['大运中心', '万象城', '大运中心四季椰林', '大运中心椰子鸡餐厅']) {
    const resolved = normalizeFlexibleLocation('吃饭', place)
    assert.strictEqual(resolved.activity_venue, place, place)
    assert.ok(['area', 'venue'].includes(resolved.location_precision), place)
    assert.ok(resolved.status === 'resolved' || resolved.status === 'accepted_location', place)
    assert.ok(!resolved.missing_fields || resolved.missing_fields.length === 0, place)
    assertStable(place)

    const prefs = normalizeApplication(baseInput(place), NOW)
    assert.strictEqual(prefs.activity_venue, place)
    const primary = resolvePrimaryInvitationProposal({
      invitation_primary_proposal: {
        date: '2026-09-06',
        period: 'night',
        area: '南山区',
        activity: '吃饭',
        budget: '50-100',
        duration: 'about-1h',
        contract_version: 2,
        start_time: '20:00',
        activity_venue: place,
        payment_mode: 'aa'
      }
    }, prefs, { user_a_id: 1, user_b_id: 2 })
    assert.strictEqual(primary.activity_venue, place)
    assert.strictEqual(planReadiness(primary).ready, true)
  }

  const dish = normalizeFlexibleLocation('吃饭', '椰子鸡')
  assert.strictEqual(dish.activity_venue, '')
  assert.strictEqual(dish.activity_detail, '椰子鸡')
  assert.strictEqual(dish.location_precision, 'unspecified')
  assert.ok(dish.status === 'location_required' || (dish.missing_fields || []).includes('activity_venue'))
  assert.ok(String(dish.clarification || '').includes('哪里') || String(dish.clarification || '').includes('地点'))
  assertStable('椰子鸡')

  assert.throws(
    () => normalizeApplication(baseInput('椰子鸡'), NOW),
    (error) => /哪里|地点/.test(String(error && error.message || '')) || error.publicCode === 'LOCATION_REQUIRED'
  )

  // Changing activity must not clear an already chosen location (R2).
  const kept = reconcileDerivedFields(
    {
      activities: ['吃饭'],
      areas: ['南山区'],
      activity_venue: '万象城',
      availability: [{ date: '2026-09-06', periods: ['night'] }],
      start_time: '20:00'
    },
    {
      activities: ['散步'],
      areas: ['南山区'],
      activity_venue: '万象城',
      availability: [{ date: '2026-09-06', periods: ['night'] }],
      start_time: '20:00'
    },
    { venueSupplied: false, exactTimeSupplied: true }
  )
  assert.strictEqual(kept.activity_venue, '万象城')

  // venueResolution stays compatible for callers that still use it.
  const mall = venueResolution('吃饭', '大运中心')
  assert.strictEqual(mall.activity_venue, '大运中心')

  const arrivalPlan = {
    date: '2026-09-06',
    period: 'night',
    start_time: '20:00',
    area: '南山',
    activity: '吃饭',
    activity_venue: '万象城',
    budget: '50-100',
    payment: 'aa',
    duration: 'about-1h',
    venue_choice_mode: 'choose_on_arrival',
    open_items: [{ key: 'store_on_arrival', label: '门店到场后商量', accepted_by: [] }]
  }
  const sendable = canSendInvitation(arrivalPlan)
  assert.strictEqual(sendable.ok, true)
  const blockedFinal = canFinalizePlan(arrivalPlan, { accepter_user_ids: [1, 2] })
  assert.strictEqual(blockedFinal.ok, false)
  const acceptedFinal = canFinalizePlan(Object.assign({}, arrivalPlan, {
    open_items: [{ key: 'store_on_arrival', label: '门店到场后商量', accepted_by: [1, 2] }]
  }), { accepter_user_ids: [1, 2] })
  assert.strictEqual(acceptedFinal.ok, true)

  console.log('PASS flexible date location normalize + invitation range')
}

main()
