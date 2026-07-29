const assert = require('assert')

const {
  STATUS,
  normalizeApplication,
  computeOverlap,
  nextStatus,
  applyConfirmation
} = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')

const now = new Date('2026-07-12T08:00:00.000Z')

const applicationA = normalizeApplication({
  availability: [
    { date: '2026-07-15', periods: ['afternoon', 'evening'] },
    { date: '2026-07-18', periods: ['morning'] }
  ],
  areas: ['南山区', '福田区'],
  activities: ['咖啡', '看展'],
  budget: '100-200',
  payment_preference: 'flexible',
  duration: '1-2h',
  transport_constraints: '地铁可达即可',
  other_requirements: '',
  share_message: '期待一次轻松的见面'
}, now)

const applicationB = normalizeApplication({
  availability: [
    { date: '2026-07-15', periods: ['afternoon'] },
    { date: '2026-07-19', periods: ['evening'] }
  ],
  areas: ['福田区', '罗湖区'],
  activities: ['咖啡', '散步'],
  budget: '50-100',
  payment_preference: 'aa',
  duration: '1-2h'
}, now)

assert.strictEqual(applicationA.availability.length, 2)
assert.strictEqual(applicationA.share_message, '期待一次轻松的见面')
assert.throws(() => normalizeApplication({ ...applicationA, areas: [] }, now), /可接受区域/)
assert.throws(() => normalizeApplication({
  ...applicationA,
  availability: [{ date: '2026-08-10', periods: ['afternoon'] }]
}, now), /未来14天/)
assert.throws(() => normalizeApplication({
  ...applicationA,
  activities: ['咖啡', '吃饭', '看展', '散步']
}, now), /最多选择3项/)

const overlap = computeOverlap(applicationA, applicationB, { version: 2 })
assert.deepStrictEqual(overlap.missing_dimensions, [])
assert.strictEqual(overlap.proposals.length, 1)
assert.deepStrictEqual(overlap.proposals[0], {
  proposal_key: 'v2-2026-07-15-afternoon-福田区-咖啡',
  coordination_version: 2,
  date: '2026-07-15',
  period: 'afternoon',
  area: '福田区',
  activity: '咖啡',
  budget: '100',
  payment_preference: 'aa',
  duration: '1-2h'
})

const noOverlap = computeOverlap(applicationA, {
  ...applicationB,
  availability: [{ date: '2026-07-20', periods: ['morning'] }],
  areas: ['罗湖区'],
  activities: ['桌游']
}, { version: 3 })
assert.strictEqual(noOverlap.proposals.length, 0)
assert.deepStrictEqual(noOverlap.missing_dimensions, ['time', 'area', 'activity'])

assert.strictEqual(STATUS.COLLECTING_INITIATOR, 'collecting_initiator')
assert.strictEqual(nextStatus(STATUS.COLLECTING_INITIATOR, 'initiator_submitted'), STATUS.INVITING_PARTNER)
assert.strictEqual(nextStatus(STATUS.INVITING_PARTNER, 'accept_invitation'), STATUS.COLLECTING_PREFERENCES)
assert.strictEqual(nextStatus(STATUS.INVITING_PARTNER, 'decline_invitation'), STATUS.INVITATION_DECLINED)
assert.strictEqual(nextStatus(STATUS.COLLECTING_PREFERENCES, 'applications_complete'), STATUS.COMPUTING_OVERLAP)
assert.strictEqual(nextStatus(STATUS.COMPUTING_OVERLAP, 'proposals_created'), STATUS.WAITING_CONFIRMATIONS)
assert.strictEqual(nextStatus(STATUS.COMPUTING_OVERLAP, 'no_overlap'), STATUS.NO_OVERLAP)
assert.throws(() => nextStatus(STATUS.ARRANGED, 'recoordinate'), /当前状态不能执行/)

const coordination = {
  status: STATUS.WAITING_CONFIRMATIONS,
  coordination_version: 2,
  user_a_id: 10,
  user_b_id: 20,
  final_proposal_id: 0
}
const proposal = { id: 88, coordination_version: 2, status: 'active' }
const first = applyConfirmation(coordination, proposal, [], { user_id: 10, decision: 'confirm' })
assert.strictEqual(first.coordination.status, STATUS.WAITING_CONFIRMATIONS)
assert.strictEqual(first.confirmations.length, 1)
const second = applyConfirmation(first.coordination, proposal, first.confirmations, { user_id: 20, decision: 'confirm' })
assert.strictEqual(second.coordination.status, STATUS.ARRANGED)
assert.strictEqual(second.coordination.final_proposal_id, 88)
assert.throws(() => applyConfirmation(
  { ...coordination, coordination_version: 3 },
  proposal,
  [],
  { user_id: 10, decision: 'confirm' }
), /方案已失效/)
assert.throws(() => applyConfirmation(coordination, proposal, [], { user_id: 99, decision: 'confirm' }), /无权确认/)

console.log('PASS date coordination policy')
