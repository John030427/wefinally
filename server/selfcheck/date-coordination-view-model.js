const assert = require('assert')

const { buildCoordinationViewModel } = require('../../miniprogram/cloudfunctions/api/lib/invitationCoordination')
const { buildCoordinationEventCard } = require('../../miniprogram/cloudfunctions/api/lib/coordinationProjection')

function main() {
  const viewModel = buildCoordinationViewModel({
    id: 123,
    status: 'waiting_confirmations',
    role: 'initiator',
    coordination_version: 8,
    current_plan: {
      date: '2026-09-06',
      start_time: '20:00',
      period: 'night',
      activity: '吃饭',
      activity_venue: '太二 COCO Park',
      area: '福田',
      payment_preference: 'flexible',
      duration: 'flexible'
    },
    confirmed_by_me: true,
    participant_progress: [{ side: 'partner', proposal_confirmed: false }],
    meeting: { me_arrived: false, partner_arrived: true },
    can_open_coordinator_chat: true,
    show_application_form: false,
    show_optional_full_form: false,
    event_cards: [{ event_id: 8, event_type: 'ARRIVED', changed_dimensions: [] }]
  })

  assert.strictEqual(viewModel.coordination_id, 123)
  assert.strictEqual(viewModel.coordination_version, 8)
  assert.deepStrictEqual(viewModel.current_plan, {
    date: '2026-09-06',
    start_time: '20:00',
    period: 'night',
    activity: '吃饭',
    venue: '太二 COCO Park',
    area: '福田',
    payment: 'flexible',
    duration: 'flexible'
  })
  assert.strictEqual(viewModel.plan_state.core_ready, true)
  assert.deepStrictEqual(viewModel.plan_state.missing_core, [])
  assert.deepStrictEqual(viewModel.plan_state.flexible_fields, ['payment', 'duration'])
  assert.deepStrictEqual(viewModel.plan_state.deferred_fields, ['meet_point'])
  assert.deepStrictEqual(viewModel.confirmation, { me: true, partner: false })
  assert.deepStrictEqual(viewModel.meeting, { me_arrived: false, partner_arrived: true })
  assert.deepStrictEqual(viewModel.event_cards, [{ event_id: 8, event_type: 'ARRIVED', changed_dimensions: [] }])
  assert.strictEqual(viewModel.form_policy.entry, 'chat')
  assert.strictEqual(viewModel.form_policy.initial_creation_only, true)

  const eventCard = buildCoordinationEventCard({
    event: {
      id: 9,
      event_type: 'plan_change_committed',
      coordination_id: 123,
      coordination_version: 8,
      shareable_summary: { changed_dimensions: ['activity', 'payment'] },
      safe_summary: { proposal_key: 'proposal-8' }
    },
    content: '协调方案有新的版本，请在协调页查看最新共同状态。'
  })
  assert.strictEqual(eventCard.event_id, 9)
  assert.strictEqual(eventCard.event_type, 'PLAN_CHANGE_COMMITTED')
  assert.strictEqual(eventCard.runtime_event_type, 'plan_change_committed')
  assert.deepStrictEqual(eventCard.changed_dimensions, ['activity', 'payment'])
  assert.strictEqual(eventCard.proposal_key, 'proposal-8')
  assert.strictEqual(eventCard.summary, '协调方案有新的版本，请在协调页查看最新共同状态。')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(eventCard, 'current_plan'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(eventCard, 'before'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(eventCard, 'after'), false)

  console.log('PASS date coordination canonical view model')
}

main()
