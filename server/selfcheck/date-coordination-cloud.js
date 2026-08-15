const assert = require('assert')

const { createDateCoordinationHandlers, processCoordinationDeadlines } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { processCoordinationTasks } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationWorker')
const { claimProcessingVersion, completeProcessingVersion } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationProcessingPolicy')
const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')

const NOW = new Date('2026-07-12T08:00:00.000Z')

function memoryDeps(seed = {}) {
  const rows = Object.assign({}, seed)
  const counters = {}
  function collection(name) {
    if (!rows[name]) rows[name] = []
    return rows[name]
  }
  const deps = {
    rows,
    currentUser: async (context) => {
      const user = collection('user').find((item) => Number(item.id) === Number(context.user_id))
      if (!user) throw new Error('登录已过期，请重新登录')
      return user
    },
    first: async (name, query) => collection(name).find((item) => Object.keys(query || {}).every((key) => item[key] === query[key])) || null,
    list: async (name, query, limit) => collection(name)
      .filter((item) => Object.keys(query || {}).every((key) => item[key] === query[key]))
      .slice(0, Number(limit || 100)),
    byId: async (name, id) => collection(name).find((item) => Number(item.id) === Number(id)) || null,
    addWithId: async (name, data, prefix) => {
      counters[name] = Number(counters[name] || 0) + 1
      const row = Object.assign({ _id: `${prefix || name}_${counters[name]}`, id: counters[name] }, data)
      collection(name).push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    expireIfCurrent: async (doc) => {
      if (!['collecting_initiator', 'inviting_partner', 'collecting_preferences', 'waiting_confirmations'].includes(doc.status)) return false
      Object.assign(doc, { status: 'expired', business_state: 'expired' })
      return true
    },
    upsertConfirmation: async (existing, data) => {
      if (existing) return Object.assign(existing, data)
      const id = `date-confirmation-${data.coordination_id}-${data.user_id}-v${data.coordination_version}`
      const current = collection('date_coordination_confirmation').find((item) => item._id === id)
      if (current) return Object.assign(current, data)
      const row = Object.assign({ _id: id }, data)
      collection('date_coordination_confirmation').push(row)
      return row
    },
    updateConfirmationState: async (coordination, result) => {
      if (coordination.status === 'arranged' && result.coordination.status !== 'arranged') return coordination
      return Object.assign(coordination, {
        status: result.coordination.status,
        business_state: result.coordination.status === 'arranged' ? 'completed' : 'waiting_confirm',
        final_proposal_id: Number(result.coordination.final_proposal_id || 0)
      })
    },
    now: () => new Date(NOW)
  }
  deps.publishCoordinationEvent = (input) => publishCoordinationEvent(input, deps)
  return deps
}

function memoryWorkerDeps(deps) {
  return {
    now: deps.now,
    listTasks: async () => (deps.rows.date_coordination || [])
      .filter((row) => row.status === 'computing_overlap' && row.processing_status === 'queued'),
    claimTask: async (task, timestamp) => {
      if (task.processing_status !== 'queued') return null
      const claimed = claimProcessingVersion(task, { token: `lease-${task.id}-${task.processing_attempts || 0}`, now: timestamp })
      Object.assign(task, claimed)
      return Object.assign({}, task)
    },
    listApplications: (coordinationId, version) => deps.list('date_coordination_application', {
      coordination_id: Number(coordinationId),
      coordination_version: Number(version)
    }, 10),
    completeTask: async (claim, overlap, timestamp) => {
      const current = (deps.rows.date_coordination || []).find((row) => Number(row.id) === Number(claim.id))
      const completed = completeProcessingVersion(current, {
        version: claim.processing_version,
        token: claim.processing_token,
        now: timestamp
      })
      if (!completed.applied) return completed
      const proposals = []
      for (const proposal of overlap.proposals || []) {
        proposals.push(await deps.addWithId('date_coordination_proposal', Object.assign({}, proposal, {
          coordination_id: Number(current.id),
          status: 'active'
        }), 'date_coordination_proposal'))
      }
      Object.assign(current, completed.coordination, {
        status: proposals.length ? 'waiting_confirmations' : 'no_overlap',
        business_state: proposals.length ? 'proposal_generated' : 'waiting_partner',
        missing_dimensions: proposals.length ? [] : overlap.missing_dimensions,
        confirmation_deadline_at: proposals.length ? new Date(timestamp.getTime() + 86400000) : null
      })
      return { applied: true, coordination: current, proposals }
    },
    failTask: async (claim, code) => {
      const current = (deps.rows.date_coordination || []).find((row) => Number(row.id) === Number(claim.id))
      if (current && current.processing_token === claim.processing_token) {
        Object.assign(current, { processing_status: 'queued', processing_token: '', processing_error_code: code })
      }
      return current
    },
    publishCoordinationEvent: deps.publishCoordinationEvent
  }
}

async function main() {
  assert.strictEqual(typeof processCoordinationDeadlines, 'function')
  const lifecycleDeps = memoryDeps({
    date_coordination: [
      { id: 201, status: 'collecting_initiator', application_deadline_at: new Date('2026-07-11T00:00:00Z') },
      { id: 202, status: 'inviting_partner', invitation_deadline_at: new Date('2026-07-11T00:00:00Z') },
      { id: 203, status: 'waiting_confirmations', confirmation_deadline_at: new Date('2026-07-13T00:00:00Z') }
    ]
  })
  const lifecycle = await processCoordinationDeadlines({ deps: lifecycleDeps, now: NOW, limit: 10 })
  assert.deepStrictEqual(lifecycle, { scanned: 3, expired: 2 })
  assert.strictEqual(lifecycleDeps.rows.date_coordination[0].status, 'expired')
  assert.strictEqual(lifecycleDeps.rows.date_coordination[1].status, 'expired')
  assert.strictEqual(lifecycleDeps.rows.date_coordination[2].status, 'waiting_confirmations')

  const starvationDeps = memoryDeps({
    date_coordination: Array.from({ length: 100 }, (_, index) => ({
      id: 300 + index,
      status: 'arranged'
    })).concat([{
      id: 499,
      status: 'inviting_partner',
      invitation_deadline_at: new Date('2026-07-11T00:00:00Z')
    }])
  })
  const starvation = await processCoordinationDeadlines({ deps: starvationDeps, now: NOW, limit: 4 })
  assert.strictEqual(starvation.expired, 1)
  assert.strictEqual(starvationDeps.rows.date_coordination[100].status, 'expired')

  const raceDeps = memoryDeps({
    date_coordination: [{
      id: 500,
      status: 'waiting_confirmations',
      confirmation_deadline_at: new Date('2026-07-11T00:00:00Z')
    }]
  })
  raceDeps.expireIfCurrent = async (doc) => {
    doc.status = 'arranged'
    doc.business_state = 'completed'
    return false
  }
  raceDeps.updateByDoc = async () => {
    throw new Error('deadline processor must not perform an unconditional state update')
  }
  const race = await processCoordinationDeadlines({ deps: raceDeps, now: NOW, limit: 4 })
  assert.deepStrictEqual(race, { scanned: 1, expired: 0 })
  assert.strictEqual(raceDeps.rows.date_coordination[0].status, 'arranged')

  const deps = memoryDeps({
    user: [
      { _id: 'user_1', id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { _id: 'user_2', id: 2, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { _id: 'user_3', id: 3, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' }
    ],
    user_match_log: [{ _id: 'match_10', id: 10, user_id: 1, match_user_id: 2 }],
    agent_session: [{
      _id: 'agent_session_20', id: 20, user_id: 1,
      agent_type: 'date_coordinator', coordination_id: 1, status: 'active'
    }],
    agent_message: []
  })
  const handlers = createDateCoordinationHandlers(deps)

  const first = await handlers.create({ match_log_id: 10 }, { user_id: 1 })
  assert.strictEqual(first.status, 'collecting_initiator')
  assert.strictEqual(first.business_state, 'created')
  assert.strictEqual(first.role, 'initiator')
  assert.strictEqual(first.can_submit_application, true)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(first, 'user_a_id'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(first, 'user_b_id'), false)
  assert.strictEqual(first.invitation_deadline_at, null)
  assert.strictEqual(first.application_deadline_at.toISOString(), '2026-07-15T08:00:00.000Z')
  assert.strictEqual(deps.rows.date_coordination.length, 1)

  const second = await handlers.create({ match_user_id: 1 }, { user_id: 2 })
  assert.strictEqual(second.id, first.id)
  assert.strictEqual(second.role, 'invitee')
  assert.strictEqual(second.can_submit_application, false)
  assert.strictEqual(second.can_respond_invitation, false)
  assert.strictEqual(deps.rows.date_coordination.length, 1)

  const denied = createDateCoordinationHandlers(memoryDeps({
    user: [{ _id: 'user_3', id: 3, member_status: 'pending_review', is_vip: 1 }],
    user_match_log: [{ _id: 'match_11', id: 11, user_id: 3, match_user_id: 2 }]
  }))
  await assert.rejects(() => denied.create({ match_user_id: 2 }, { user_id: 3 }), /审核通过.*VIP/)

  const legacyDeps = memoryDeps({
    user: [
      { _id: 'legacy_user_1', id: 11, status: 1, free_member: 1 },
      { _id: 'legacy_user_2', id: 12, status: 1, free_member: 1 }
    ],
    user_match_log: [{ _id: 'legacy_match_1', id: 21, user_id: 11, match_user_id: 12 }]
  })
  const legacyCoordination = await createDateCoordinationHandlers(legacyDeps)
    .create({ match_log_id: 21 }, { user_id: 11 })
  assert.strictEqual(legacyCoordination.status, 'collecting_initiator')

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

  const legacyInvitationDeps = memoryDeps({
    user: [{ id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' }],
    date_coordination: [{
      _id: 'date_coordination_12', id: 12, user_a_id: 1, user_b_id: 2,
      status: 'inviting_partner', coordination_version: 1,
      invitation_deadline_at: '2026-07-14T08:00:00.000Z'
    }]
  })
  const migratedLegacyInvitation = await createDateCoordinationHandlers(legacyInvitationDeps)
    .detail({ coordination_id: 12 }, { user_id: 1 })
  assert.strictEqual(migratedLegacyInvitation.status, 'collecting_initiator')
  assert.strictEqual(migratedLegacyInvitation.can_submit_application, true)
  assert.strictEqual(migratedLegacyInvitation.invitation_deadline_at, null)
  assert.strictEqual(migratedLegacyInvitation.application_deadline_at.toISOString(), '2026-07-15T08:00:00.000Z')

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
  await assert.rejects(
    () => handlers.saveApplication({ coordination_id: first.id, ...applicationB }, { user_id: 2 }),
    /等待发起方填写/
  )
  const firstApplication = await handlers.saveApplication({ coordination_id: first.id, ...applicationA }, { user_id: 1 })
  assert.strictEqual(firstApplication.status, 'inviting_partner')
  assert.strictEqual(firstApplication.business_state, 'waiting_partner')
  assert.strictEqual(firstApplication.can_submit_application, false)
  assert.strictEqual(firstApplication.invitation_deadline_at.toISOString(), '2026-07-14T08:00:00.000Z')
  assert.strictEqual(deps.rows.date_coordination_application.length, 1)
  assert.strictEqual(deps.rows.agent_notification_job.length, 1)
  assert.strictEqual(deps.rows.agent_notification_job[0].user_id, 2)
  assert.strictEqual(deps.rows.agent_notification_job[0].stage, 'invitation_created')
  assert.strictEqual(deps.rows.agent_notification_job[0].scheduled_at.toISOString(), NOW.toISOString())

  const invitedDetail = await handlers.detail({ coordination_id: first.id }, { user_id: 2 })
  assert.strictEqual(invitedDetail.can_respond_invitation, true)
  assert.strictEqual(invitedDetail.my_application, null)
  assert.strictEqual(JSON.stringify(invitedDetail).includes(applicationA.share_message), false)

  const accepted = await handlers.respondInvitation({ coordination_id: first.id, decision: 'accept' }, { user_id: 2 })
  assert.strictEqual(accepted.status, 'collecting_preferences')
  assert.strictEqual(accepted.business_state, 'coordinating')
  assert.strictEqual(accepted.application_deadline_at.toISOString(), '2026-07-15T08:00:00.000Z')
  await assert.rejects(
    () => handlers.respondInvitation({ coordination_id: first.id, decision: 'decline' }, { user_id: 1 }),
    /仅受邀参与者/
  )

  const queuedCoordination = await handlers.saveApplication({ coordination_id: first.id, ...applicationB }, { user_id: 2 })
  assert.strictEqual(queuedCoordination.status, 'computing_overlap')
  assert.strictEqual(queuedCoordination.processing_status, 'queued')
  assert.strictEqual(deps.rows.date_coordination_proposal.length, 0)
  assert.strictEqual(deps.rows.agent_notification_job.length, 1)
  const workerResult = await processCoordinationTasks({ deps: memoryWorkerDeps(deps), now: NOW, limit: 10 })
  assert.deepStrictEqual(workerResult, { scanned: 1, claimed: 1, completed: 1, stale: 0, failed: 0 })
  const computed = await handlers.detail({ coordination_id: first.id }, { user_id: 2 })
  assert.strictEqual(computed.status, 'waiting_confirmations')
  assert.strictEqual(computed.business_state, 'proposal_generated')
  assert.strictEqual(computed.processing_status, 'completed')
  assert.strictEqual(deps.rows.date_coordination_application.length, 2)
  assert.strictEqual(deps.rows.date_coordination_proposal.length, 1)
  assert.strictEqual(deps.rows.date_coordination_proposal[0].status, 'active')
  assert.strictEqual(computed.confirmation_deadline_at.toISOString(), '2026-07-13T08:00:00.000Z')
  assert.strictEqual(deps.rows.agent_notification_job.length, 1)
  assert(deps.rows.agent_message.length >= 8)
  assert.strictEqual(deps.rows.agent_session.filter((row) => row.agent_type === 'date_coordinator').length, 2)
  const coordinationMessages = JSON.stringify(deps.rows.agent_message)
  assert.strictEqual(coordinationMessages.includes(applicationA.share_message), false)
  assert.strictEqual(coordinationMessages.includes(applicationB.share_message), false)
  assert(coordinationMessages.includes('双方偏好已收齐'))
  assert(coordinationMessages.includes('候选方案'))
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
  const confirmations = await Promise.all([
    handlers.confirmProposal({
      coordination_id: first.id,
      proposal_id: proposal.id,
      coordination_version: 1,
      decision: 'confirm'
    }, { user_id: 1 }),
    handlers.confirmProposal({
      coordination_id: first.id,
      proposal_id: proposal.id,
      coordination_version: 1,
      decision: 'confirm'
    }, { user_id: 1 }),
    handlers.confirmProposal({
      coordination_id: first.id,
      proposal_id: proposal.id,
      coordination_version: 1,
      decision: 'confirm'
    }, { user_id: 2 })
  ])
  assert.strictEqual(deps.rows.date_coordination_confirmation.filter((row) => row.user_id === 1).length, 1)
  assert.strictEqual(deps.rows.date_coordination_confirmation.filter((row) => row.user_id === 2).length, 1)
  const arranged = confirmations[2]
  assert.strictEqual(arranged.status, 'arranged')
  assert.strictEqual(arranged.business_state, 'completed')
  assert.strictEqual(arranged.final_proposal_id, proposal.id)
  const repeatedAfterArranged = await handlers.confirmProposal({
    coordination_id: first.id,
    proposal_id: proposal.id,
    coordination_version: 1,
    decision: 'confirm'
  }, { user_id: 1 })
  assert.strictEqual(repeatedAfterArranged.status, 'arranged')

  const recoordinationDeps = memoryDeps({
    user: [
      { _id: 'user_1', id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' },
      { _id: 'user_2', id: 2, member_status: 'approved', is_vip: 1, vip_expire_time: '2026-08-01T00:00:00.000Z' }
    ],
    date_coordination: [{
      _id: 'date_coordination_77', id: 77, user_a_id: 1, user_b_id: 2,
      status: 'no_overlap', coordination_version: 4, recoordination_count: 3
    }]
  })
  const recoordinationHandlers = createDateCoordinationHandlers(recoordinationDeps)
  const secondRound = await recoordinationHandlers.recoordinate({ coordination_id: 77 }, { user_id: 1 })
  assert.strictEqual(secondRound.status, 'replanning')
  assert.strictEqual(secondRound.coordination_version, 5)
  assert.strictEqual(secondRound.recoordination_count, 4)
  assert.strictEqual(secondRound.round_number, 5)
  assert.strictEqual(secondRound.max_rounds, 5)
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

  const concurrentWorkerDeps = memoryDeps({
    date_coordination: [{
      _id: 'date_coordination_101', id: 101, user_a_id: 1, user_b_id: 2,
      status: 'computing_overlap', coordination_version: 1,
      processing_status: 'queued', processing_version: 1, processing_attempts: 0
    }],
    date_coordination_application: [
      { id: 1, coordination_id: 101, user_id: 1, coordination_version: 1, application: applicationA },
      { id: 2, coordination_id: 101, user_id: 2, coordination_version: 1, application: applicationB }
    ]
  })
  const concurrentWorkerStore = memoryWorkerDeps(concurrentWorkerDeps)
  const concurrentWorkers = await Promise.all([
    processCoordinationTasks({ deps: concurrentWorkerStore, now: NOW, limit: 10 }),
    processCoordinationTasks({ deps: concurrentWorkerStore, now: NOW, limit: 10 })
  ])
  assert.strictEqual(concurrentWorkers.reduce((sum, item) => sum + item.completed, 0), 1)
  assert.strictEqual(concurrentWorkerDeps.rows.date_coordination_proposal.length, 1)

  const staleWorkerDeps = memoryDeps({
    date_coordination: [{
      _id: 'date_coordination_102', id: 102, user_a_id: 1, user_b_id: 2,
      status: 'computing_overlap', coordination_version: 1,
      processing_status: 'queued', processing_version: 1, processing_attempts: 0
    }],
    date_coordination_application: [
      { id: 1, coordination_id: 102, user_id: 1, coordination_version: 1, application: applicationA },
      { id: 2, coordination_id: 102, user_id: 2, coordination_version: 1, application: applicationB }
    ],
    date_coordination_proposal: []
  })
  const staleWorkerStore = memoryWorkerDeps(staleWorkerDeps)
  const listStaleApplications = staleWorkerStore.listApplications
  staleWorkerStore.listApplications = async (coordinationId, version) => {
    const applications = await listStaleApplications(coordinationId, version)
    Object.assign(staleWorkerDeps.rows.date_coordination[0], {
      coordination_version: 2,
      processing_version: 2,
      processing_status: 'queued',
      processing_token: ''
    })
    return applications
  }
  const staleWorker = await processCoordinationTasks({ deps: staleWorkerStore, now: NOW, limit: 10 })
  assert.deepStrictEqual(staleWorker, { scanned: 1, claimed: 1, completed: 0, stale: 1, failed: 0 })
  assert.strictEqual(staleWorkerDeps.rows.date_coordination_proposal.length, 0)
  assert.strictEqual(staleWorkerDeps.rows.date_coordination[0].coordination_version, 2)

  const feedbackFailureDeps = memoryDeps({
    date_coordination: [{
      _id: 'date_coordination_103', id: 103, user_a_id: 1, user_b_id: 2,
      status: 'computing_overlap', coordination_version: 1,
      processing_status: 'queued', processing_version: 1, processing_attempts: 0
    }],
    date_coordination_application: [
      { id: 1, coordination_id: 103, user_id: 1, coordination_version: 1, application: applicationA },
      { id: 2, coordination_id: 103, user_id: 2, coordination_version: 1, application: applicationB }
    ]
  })
  const feedbackFailureStore = memoryWorkerDeps(feedbackFailureDeps)
  let reportedEventError = false
  feedbackFailureStore.publishCoordinationEvent = async () => { throw new Error('event unavailable') }
  feedbackFailureStore.onEventError = async () => { reportedEventError = true }
  const feedbackFailure = await processCoordinationTasks({ deps: feedbackFailureStore, now: NOW, limit: 10 })
  assert.deepStrictEqual(feedbackFailure, { scanned: 1, claimed: 1, completed: 1, stale: 0, failed: 0 })
  assert.strictEqual(feedbackFailureDeps.rows.date_coordination[0].processing_status, 'completed')
  assert.strictEqual(reportedEventError, true)

  console.log('PASS date coordination cloud')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exitCode = 1
})
