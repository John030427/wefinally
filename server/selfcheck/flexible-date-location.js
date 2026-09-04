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
  resolvePrimaryInvitationProposal, publicPrimaryProposal, buildInvitationCard, buildProposalCard, buildDirectAcceptProposal, mergeInvitationWithOverrides
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
  }), { accepter_user_ids: [1, 2], confirmed_user_ids: [1, 2] })
  assert.strictEqual(acceptedFinal.ok, true)

  const untrusted = Object.assign({}, arrivalPlan, { contract_version: 2, payment_mode: 'aa',
    open_items: [{ key: 'store_on_arrival', label: '门店到场后商量', accepted_by: [1, 2] }] })
  const stored = publicPrimaryProposal(untrusted, { user_a_id: 1, user_b_id: 2 })
  assert.strictEqual(stored.venue_choice_mode, 'choose_on_arrival')
  assert.strictEqual(stored.open_items.length, 1)
  assert.deepStrictEqual(stored.open_items[0].accepted_by, [])
  assert.strictEqual(canFinalizePlan(stored, { accepter_user_ids: [1, 2] }).ok, false)
  assert.strictEqual(canFinalizePlan({ ...stored, open_items: [] }, { accepter_user_ids: [1, 2] }).ok, false)
  assert.strictEqual(canFinalizePlan(stored, { accepter_user_ids: [1, 2], confirmed_user_ids: [1] }).ok, false)
  const card = buildInvitationCard(stored, 1, { user_a_id: 1, user_b_id: 2 })
  assert.strictEqual(card.final_ready, false)
  assert.ok(card.open_items_text.includes('门店到场后商量'))
  assert.ok(!card.venue_guidance.includes('双方已确认'))
  const mealCard = buildProposalCard(Object.assign({}, arrivalPlan, { activity_detail: '酸菜鱼' }))
  assert.strictEqual(mealCard.activity_text, '吃饭')
  assert.strictEqual(mealCard.activity_detail_text, '酸菜鱼')
  assert.strictEqual(buildDirectAcceptProposal(stored, 1).open_items.length, 1)
  const prefs = normalizeApplication({ ...baseInput('万象城'), venue_choice_mode: 'choose_on_arrival' }, NOW)
  assert.strictEqual(mergeInvitationWithOverrides(prefs, {}).venue_choice_mode, 'choose_on_arrival')
  const { computeOverlap } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
  const overlap = computeOverlap(prefs, prefs, { version: 2, user_a_id: 1, user_b_id: 2 })
  assert.strictEqual(overlap.proposals[0].open_items.length, 1)
  assert.ok(computeOverlap(prefs, { ...prefs, venue_choice_mode: 'named_location' }, { version: 2, user_a_id: 1, user_b_id: 2 }).missing_dimensions.length)
  const movie = normalizeApplication({ ...baseInput('星巴克'), activities: ['电影'] }, NOW)
  assert.strictEqual(movie.activity_venue, '星巴克')
  assert.strictEqual(movie.open_items[0].key, 'location_role')
  const moviePrimary = publicPrimaryProposal({ ...untrusted, activity: '电影', activity_venue: '星巴克', venue_choice_mode: 'named_location' })
  assert.strictEqual(canSendInvitation(moviePrimary).ok, true)
  assert.strictEqual(canFinalizePlan(moviePrimary, { accepter_user_ids: [1, 2], confirmed_user_ids: [1, 2] }).ok, false)
  const clarified = { ...moviePrimary, venue_choice_mode: 'meet_first' }
  assert.strictEqual(canFinalizePlan(clarified, { accepter_user_ids: [1, 2], confirmed_user_ids: [1, 2] }).ok, true)
  const { applyStructuredPlanIntent, interpretNlPlanUtterance } = require('../../miniprogram/cloudfunctions/api/lib/datePlanContract')
  const activityChange = applyStructuredPlanIntent(interpretNlPlanUtterance('时间不变只改活动成咖啡', arrivalPlan), arrivalPlan)
  assert.strictEqual(activityChange.plan.activity_venue, '万象城')
  const directActivityChange = interpretNlPlanUtterance('改为吃饭', arrivalPlan)
  assert.strictEqual(directActivityChange.candidate_values.activity, '吃饭')
  assert.strictEqual(interpretNlPlanUtterance('不想看电影了，帮我改成咖啡', arrivalPlan).candidate_values.activity, '咖啡')
  const meetingFirst = applyStructuredPlanIntent(interpretNlPlanUtterance('先在星巴克碰面', moviePrimary), moviePrimary)
  assert.strictEqual(meetingFirst.plan.venue_choice_mode, 'meet_first')
  assert.strictEqual(meetingFirst.needs_clarification, false)
  const { validateDatePlan } = require('../../miniprogram/cloudfunctions/api/lib/datePlanContract')
  assert.strictEqual(validateDatePlan(meetingFirst.plan, 'draft').valid, true)
  assert.strictEqual(validateDatePlan(meetingFirst.plan, 'final').clarification, '')
  const { previewApplicationChange } = require('../../miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy')
  const preview = previewApplicationChange(movie, { venue_choice_mode: 'meet_first' }, { now: NOW })
  assert.strictEqual(preview.after.venue_choice_mode, 'meet_first')

  console.log('PASS flexible date location normalize + invitation range')
}

main()
