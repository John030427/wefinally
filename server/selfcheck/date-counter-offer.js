const assert = require('assert')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const {
  buildStructuredCounterProposal,
  applyAcceptedCounterProposal
} = require('../../miniprogram/cloudfunctions/api/lib/dateCounterOfferPolicy')
const { buildDateCoordinationGraphInput } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState')
const { projectParticipantEvent } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationProcessingPolicy')
const { classifyChangeIntent } = require('../../miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy')

const coordination = {
  id: 88,
  user_a_id: 1,
  user_b_id: 2,
  status: 'no_overlap',
  coordination_version: 2,
  last_changed_by_user_id: 2,
  last_changed_dimensions: ['time'],
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

const invitationPrimary = {
  date: '2026-09-04', period: 'afternoon', area: '南山', activity: '咖啡',
  budget: 'under-50', duration: 'about-1h', payment_mode: 'aa', payer_user_id: 0
}
const offer = buildStructuredCounterProposal({
  coordination,
  applicationA: male,
  applicationB: female,
  applicationRowB: { preference_evidence: { availability: 'explicit', areas: 'inherited', activities: 'inherited', budget: 'inherited', payment_preference: 'inherited', duration: 'inherited' } },
  invitationPrimary,
  viewerUserId: 1
})
assert.ok(offer)
assert.strictEqual(offer.time_text, '2026-09-06 下午')
assert.strictEqual(offer.kind, 'partner_structured_counter_proposal')
assert.strictEqual(offer.action_label, '接受这份调整')
assert.deepStrictEqual(offer.changed_dimensions, ['time'])
assert.deepStrictEqual(offer.changes.map((item) => [item.dimension, item.before_text, item.after_text]), [
  ['time', '2026-09-04 下午', '2026-09-06 下午']
])
assert.strictEqual(offer.proposal_card.area_text, '南山')
assert.strictEqual(offer.proposal_card.activity_text, '咖啡')
assert.strictEqual(buildStructuredCounterProposal({ coordination, applicationA: male, applicationB: female, invitationPrimary, viewerUserId: 2 }), null)
assert.deepStrictEqual(applyAcceptedCounterProposal(male, offer).availability, [
  { date: '2026-09-06', periods: ['afternoon'] }
])
assert.deepStrictEqual(applyAcceptedCounterProposal(male, offer).areas, ['南山'])

const multiCoordination = Object.assign({}, coordination, {
  missing_dimensions: ['time', 'area'],
  last_changed_dimensions: ['time', 'area']
})
const multiOffer = buildStructuredCounterProposal({
  coordination: multiCoordination,
  applicationA: male,
  applicationB: Object.assign({}, female, { areas: ['福田'] }),
  applicationRowB: { preference_evidence: { availability: 'explicit', areas: 'explicit', activities: 'inherited', budget: 'inherited', payment_preference: 'inherited', duration: 'inherited' } },
  invitationPrimary,
  viewerUserId: 1
})
assert.deepStrictEqual(multiOffer.changed_dimensions, ['time', 'area'])
assert.strictEqual(multiOffer.proposal_card.area_text, '福田')

const ambiguousRange = buildStructuredCounterProposal({
  coordination,
  applicationA: male,
  applicationB: Object.assign({}, female, {
    availability: [
      { date: '2026-09-06', periods: ['afternoon'] },
      { date: '2026-09-07', periods: ['evening'] }
    ]
  }),
  applicationRowB: { preference_evidence: { availability: 'explicit' } },
  invitationPrimary,
  viewerUserId: 1
})
assert.strictEqual(ambiguousRange, null, '范围型偏好不能伪装成一个明确反提案')
assert.strictEqual(classifyChangeIntent('周日下午三点', { coordination: true }), 'modify_date_application')
assert.strictEqual(classifyChangeIntent('周日下午三点可以吗？', { coordination: true }), 'consultation')

const applications = [
  { user_id: 1, coordination_version: 2, application: male },
  { user_id: 2, coordination_version: 2, application: female, preference_evidence: { availability: 'explicit' } }
]
const graphInput = buildDateCoordinationGraphInput(coordination, applications, { id: 1 }, {
  confirmations: [],
  invitationPrimary
})
assert.strictEqual(graphInput.sharedState.actionRequired, 'review_counter_proposal')
assert.strictEqual(graphInput.sharedState.coordinationPath, 'structured_counter_proposal')
assert.strictEqual(graphInput.sharedState.counterOffer.time_text, '2026-09-06 下午')

const partnerMessage = projectParticipantEvent({
  event_type: 'no_overlap', actor_user_id: 2, counter_offer: offer
}, { viewer_user_id: 1 })
assert.ok(partnerMessage.content.includes('2026-09-06 下午'))
assert.ok(partnerMessage.content.includes('调整方案'))

const routeSource = fs.readFileSync(path.join(ROOT, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
const pageSource = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/date-coordination/date-coordination.js'), 'utf8')
const viewSource = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/date-coordination/date-coordination.wxml'), 'utf8')
const chatViewSource = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/chat/chat.wxml'), 'utf8')
const agentSource = fs.readFileSync(path.join(ROOT, 'miniprogram/cloudfunctions/api/handlers/agent.js'), 'utf8')
assert.ok(routeSource.includes('/counter-offer\\/accept'))
assert.ok(pageSource.includes('async acceptCounterOffer()'))
assert.ok(viewSource.includes('接受这份调整'))
assert.ok(viewSource.includes('只调整部分安排'))
assert.ok(viewSource.includes('完整填写我的安排'))
assert.ok(chatViewSource.includes('保持不变：'))
assert.ok(agentSource.includes('clarify_scope'))
assert.ok(agentSource.includes('has_complete_base_proposal'))
assert.ok(agentSource.includes("claimPendingPatch: dep('claimPendingPatch')"))
assert.ok(
  agentSource.includes("commitPost = dep('commitPostAcceptApplicationPatch')")
  || agentSource.includes("commitPostAcceptApplicationPatchDep = dep('commitPostAcceptApplicationPatch')")
)
const coordinationSource = fs.readFileSync(path.join(ROOT, 'miniprogram/cloudfunctions/api/handlers/dateCoordination.js'), 'utf8')
assert.ok(coordinationSource.includes('commitPostAcceptApplicationPatch: db.commitPostAcceptApplicationPatch'))
assert.ok(coordinationSource.includes('unitMode === true'))

console.log('PASS date counter proposal: full-plan diff, bounded acceptance, graph paths and clear UI choices')
