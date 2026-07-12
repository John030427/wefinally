const assert = require('assert')

const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')

const NOW = new Date('2026-07-12T08:00:00.000Z')

function memoryDeps(seed = {}) {
  const rows = Object.assign({}, seed)
  const counters = {}
  function collection(name) {
    if (!rows[name]) rows[name] = []
    return rows[name]
  }
  return {
    rows,
    currentUser: async (context) => {
      const user = collection('user').find((item) => Number(item.id) === Number(context.user_id))
      if (!user) throw new Error('登录已过期，请重新登录')
      return user
    },
    first: async (name, query) => collection(name).find((item) => Object.keys(query || {}).every((key) => item[key] === query[key])) || null,
    list: async (name, query) => collection(name).filter((item) => Object.keys(query || {}).every((key) => item[key] === query[key])),
    byId: async (name, id) => collection(name).find((item) => Number(item.id) === Number(id)) || null,
    addWithId: async (name, data, prefix) => {
      counters[name] = Number(counters[name] || 0) + 1
      const row = Object.assign({ _id: `${prefix || name}_${counters[name]}`, id: counters[name] }, data)
      collection(name).push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    now: () => new Date(NOW)
  }
}

async function main() {
  const deps = memoryDeps({
    user: [
      { _id: 'user_1', id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { _id: 'user_2', id: 2, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { _id: 'user_3', id: 3, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' }
    ],
    user_match_log: [{ _id: 'match_10', id: 10, user_id: 1, match_user_id: 2 }]
  })
  const handlers = createDateCoordinationHandlers(deps)

  const first = await handlers.create({ match_user_id: 2 }, { user_id: 1 })
  assert.strictEqual(first.status, 'inviting_partner')
  assert.strictEqual(first.role, 'initiator')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(first, 'user_a_id'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(first, 'user_b_id'), false)
  assert.strictEqual(first.invitation_deadline_at.toISOString(), '2026-07-14T08:00:00.000Z')
  assert.strictEqual(deps.rows.date_coordination.length, 1)

  const second = await handlers.create({ match_user_id: 1 }, { user_id: 2 })
  assert.strictEqual(second.id, first.id)
  assert.strictEqual(second.role, 'invitee')
  assert.strictEqual(deps.rows.date_coordination.length, 1)

  const denied = createDateCoordinationHandlers(memoryDeps({
    user: [{ _id: 'user_3', id: 3, member_status: 'pending_review', is_vip: 1 }],
    user_match_log: [{ _id: 'match_11', id: 11, user_id: 3, match_user_id: 2 }]
  }))
  await assert.rejects(() => denied.create({ match_user_id: 2 }, { user_id: 3 }), /审核通过.*VIP/)

  const accepted = await handlers.respondInvitation({ coordination_id: first.id, decision: 'accept' }, { user_id: 2 })
  assert.strictEqual(accepted.status, 'collecting_preferences')
  assert.strictEqual(accepted.application_deadline_at.toISOString(), '2026-07-15T08:00:00.000Z')
  await assert.rejects(
    () => handlers.respondInvitation({ coordination_id: first.id, decision: 'decline' }, { user_id: 1 }),
    /仅受邀参与者/
  )

  const declinedDeps = memoryDeps({
    user: [
      { _id: 'user_1', id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { _id: 'user_2', id: 2, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' }
    ],
    date_coordination: [{ _id: 'date_coordination_9', id: 9, user_a_id: 1, user_b_id: 2, status: 'inviting_partner' }]
  })
  const declined = await createDateCoordinationHandlers(declinedDeps)
    .respondInvitation({ coordination_id: 9, decision: 'decline' }, { user_id: 2 })
  assert.strictEqual(declined.status, 'invitation_declined')

  const applicationA = {
    availability: [{ date: '2026-07-15', periods: ['afternoon', 'evening'] }],
    areas: ['南山区', '福田区'],
    activities: ['咖啡', '看展'],
    budget: '100-200',
    payment_preference: 'flexible',
    duration: '1-2h',
    share_message: '我只想把这句话留给对方'
  }
  const applicationB = {
    availability: [{ date: '2026-07-15', periods: ['afternoon'] }],
    areas: ['福田区'],
    activities: ['咖啡'],
    budget: '50-100',
    payment_preference: 'aa',
    duration: '1-2h',
    share_message: '这条也不能给对方看'
  }
  const firstApplication = await handlers.saveApplication({ coordination_id: first.id, ...applicationA }, { user_id: 1 })
  assert.strictEqual(firstApplication.status, 'collecting_preferences')
  const computed = await handlers.saveApplication({ coordination_id: first.id, ...applicationB }, { user_id: 2 })
  assert.strictEqual(computed.status, 'waiting_confirmations')
  assert.strictEqual(deps.rows.date_coordination_application.length, 2)
  assert.strictEqual(deps.rows.date_coordination_proposal.length, 1)
  assert.strictEqual(deps.rows.date_coordination_proposal[0].status, 'active')
  assert.strictEqual(computed.confirmation_deadline_at.toISOString(), '2026-07-13T08:00:00.000Z')
  await assert.rejects(() => handlers.saveApplication({ coordination_id: 999, ...applicationA }, { user_id: 1 }), /日期协调不存在/)
  await assert.rejects(() => handlers.saveApplication({ coordination_id: first.id, ...applicationA }, { user_id: 3 }), /无权操作该日期协调/)

  const detail = await handlers.detail({ coordination_id: first.id }, { user_id: 1 })
  assert.strictEqual(detail.id, first.id)
  assert.strictEqual(detail.my_application.share_message, applicationA.share_message)
  assert.strictEqual(detail.participant_progress.length, 2)
  assert.deepStrictEqual(detail.participant_progress.map((item) => item.side), ['mine', 'partner'])
  assert.strictEqual(JSON.stringify(detail).includes('user_id'), false)
  assert.strictEqual(detail.participant_progress.every((item) => item.application_submitted), true)
  assert.strictEqual(detail.proposals.length, 1)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(detail, 'applications'), false)
  assert.strictEqual(JSON.stringify(detail).includes(applicationB.share_message), false)
  await assert.rejects(() => handlers.detail({ coordination_id: first.id }, { user_id: 3 }), /无权查看该日期协调/)

  const proposal = deps.rows.date_coordination_proposal[0]
  await assert.rejects(
    () => handlers.confirmProposal({ coordination_id: first.id, proposal_id: proposal.id, coordination_version: 2, decision: 'confirm' }, { user_id: 1 }),
    /方案已失效/
  )
  const firstConfirmation = await handlers.confirmProposal({
    coordination_id: first.id,
    proposal_id: proposal.id,
    coordination_version: 1,
    decision: 'confirm'
  }, { user_id: 1 })
  assert.strictEqual(firstConfirmation.status, 'waiting_confirmations')
  const arranged = await handlers.confirmProposal({
    coordination_id: first.id,
    proposal_id: proposal.id,
    coordination_version: 1,
    decision: 'confirm'
  }, { user_id: 2 })
  assert.strictEqual(arranged.status, 'arranged')
  assert.strictEqual(arranged.final_proposal_id, proposal.id)

  const recoordinationDeps = memoryDeps({
    user: [
      { _id: 'user_1', id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { _id: 'user_2', id: 2, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' }
    ],
    date_coordination: [{
      _id: 'date_coordination_77', id: 77, user_a_id: 1, user_b_id: 2,
      status: 'no_overlap', coordination_version: 1, recoordination_count: 1
    }]
  })
  const recoordinationHandlers = createDateCoordinationHandlers(recoordinationDeps)
  const secondRound = await recoordinationHandlers.recoordinate({ coordination_id: 77 }, { user_id: 1 })
  assert.strictEqual(secondRound.status, 'replanning')
  assert.strictEqual(secondRound.coordination_version, 2)
  assert.strictEqual(secondRound.recoordination_count, 2)
  assert.strictEqual(secondRound.application_deadline_at.toISOString(), '2026-07-15T08:00:00.000Z')
  const handoff = await recoordinationHandlers.recoordinate({ coordination_id: 77 }, { user_id: 1 })
  assert.strictEqual(handoff.status, 'manual_handoff')

  const expiredDeps = memoryDeps({
    user: [
      { id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { id: 2, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' }
    ],
    date_coordination: [{
      id: 90,
      user_a_id: 1,
      user_b_id: 2,
      status: 'inviting_partner',
      coordination_version: 1,
      invitation_deadline_at: '2026-07-12T07:59:59.000Z'
    }]
  })
  await assert.rejects(
    () => createDateCoordinationHandlers(expiredDeps).respondInvitation({ coordination_id: 90, decision: 'accept' }, { user_id: 2 }),
    /邀请已过期/
  )

  console.log('PASS date coordination cloud')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exitCode = 1
})
