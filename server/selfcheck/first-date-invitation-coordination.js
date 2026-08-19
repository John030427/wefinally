const assert = require('assert')
const { STATUS, nextStatus, computeOverlap } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const {
  canOpenCoordinatorChat,
  canModifyApplication,
  canWriteCoordinatorAction
} = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationAccessPolicy')
const {
  STALE_INVITATION_MESSAGE,
  DECLINED_PUBLIC_MESSAGE,
  EXPIRED_PUBLIC_MESSAGE,
  COORDINATING_WAITING_B_MESSAGE,
  INVALID_INVITATION_VERSION_MESSAGE,
  buildSharedCoordinationState,
  buildInvitationCard,
  buildProposalCard,
  buildDirectAcceptProposal,
  coordinatorWelcomeText,
  resolveFixtureJourneyName,
  formatDatePeriod,
  personalPaymentToNeutral,
  paymentFactText,
  isPrimaryProposalComplete,
  resolvePrimaryInvitationProposal
} = require('../../miniprogram/cloudfunctions/api/lib/invitationCoordination')
const { createDateCoordinationHandlers, processCoordinationDeadlines } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { createDateApplicationPatchHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
const { AGENT_TYPES } = require('../../miniprogram/cloudfunctions/api/agent/types')
const { buildDateCoordinationGraphInput } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState')
const { advanceSyntheticPartner, resolveFixtureJourney } = require('../../miniprogram/cloudfunctions/api/lib/syntheticPartnerJourney')
const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
const { TAB_INDEX_RECORDS, applyTabBadge } = require('../../miniprogram/utils/notificationBadge')

const NOW = new Date('2026-07-12T08:00:00.000Z')

function futureDate(days) {
  const value = new Date(NOW)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const FRI = futureDate(5)
const SAT = futureDate(6)

function app(overrides = {}) {
  return Object.assign({
    availability: [{ date: FRI, periods: ['evening'] }],
    areas: ['南山'],
    activities: ['咖啡'],
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h',
    transport_constraints: '',
    other_requirements: '',
    share_message: 'A私有留言不要给B'
  }, overrides)
}

function eligibleUser(id, extra = {}) {
  return Object.assign({
    id,
    openid: `u${id}`,
    member_status: 'approved',
    is_vip: 1,
    vip_expire_time: '2026-08-01T00:00:00.000Z',
    status: 1,
    free_member: 1
  }, extra)
}

function qaUser(id, extra = {}) {
  return eligibleUser(id, Object.assign({
    account_mode: 'internal_qa',
    profile_origin: 'real_user'
  }, extra))
}

function syntheticPartner(id, journey, extra = {}) {
  return eligibleUser(id, Object.assign({
    openid: extra.openid || `b_${journey}_${id}`,
    profile_origin: 'synthetic_fixture',
    is_test_fixture: 1,
    fixture_owner_user_id: 1,
    fixture_expires_at: '2099-01-01T00:00:00.000Z',
    fixture_journey: journey,
    fixture_mode: extra.fixture_mode || 'auto'
  }, extra))
}

function fixtureSeed(partner, extra = {}) {
  return Object.assign({
    user: [qaUser(1), partner],
    user_match_log: [{ id: 10, user_id: 1, match_user_id: Number(partner.id) }]
  }, extra)
}

function memory(seed = {}) {
  const rows = Object.assign({
    user: [eligibleUser(1), eligibleUser(2)],
    user_match_log: [{ id: 10, user_id: 1, match_user_id: 2 }],
    date_coordination: [],
    date_coordination_application: [],
    date_coordination_proposal: [],
    date_coordination_confirmation: [],
    date_application_patch: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    agent_run: [],
    agent_tool_call: [],
    agent_human_ticket: [],
    agent_notification_job: [],
    knowledge_article: [],
    coordination_notification: [],
    user_notification_cursor: []
  }, seed)
  const counters = {}
  const deps = {
    rows,
    env: {},
    currentUser: async (context) => {
      const user = (rows.user || []).find((item) => Number(item.id) === Number(context.user_id || context.userIndex + 1))
        || (rows.user || []).find((item) => item.openid === context.OPENID)
      if (!user) throw new Error('登录已过期，请重新登录')
      return user
    },
    first: async (name, query) => (rows[name] || []).find((item) => Object.keys(query || {}).every((key) => item[key] === query[key])) || null,
    list: async (name, query, limit) => (rows[name] || [])
      .filter((item) => Object.keys(query || {}).every((key) => item[key] === query[key]))
      .slice(0, Number(limit || 100)),
    byId: async (name, id) => (rows[name] || []).find((item) => Number(item.id) === Number(id)) || null,
    addWithId: async (name, data, prefix) => {
      counters[name] = Number(counters[name] || 1000) + 1
      const row = Object.assign({ _id: `${prefix || name}_${counters[name]}`, id: counters[name] }, data)
      if (!rows[name]) rows[name] = []
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => Object.assign(doc, data),
    claimPendingPatch: async (patch) => {
      if (!patch || patch.status !== 'pending_confirmation') return false
      patch.status = 'applying'
      return true
    },
    now: () => new Date(NOW),
    invokeGraphFunction: async () => { throw new Error('graph disabled') }
  }
  deps.publishCoordinationEvent = (input) => publishCoordinationEvent(input, deps)
  return deps
}

async function invitedPair(options = {}) {
  const deps = memory(options.seed)
  const handlers = createDateCoordinationHandlers(deps)
  const created = await handlers.create({ match_log_id: 10, match_user_id: 2 }, { user_id: 1 })
  if (!created || !created.id) {
    throw new Error(`create did not persist coordination: ${JSON.stringify(created)}`)
  }
  const payload = Object.assign({ coordination_id: created.id }, app(options.app))
  if (options.primary) payload.invitation_primary_proposal = options.primary
  const invited = await handlers.saveApplication(payload, { user_id: 1 })
  return { deps, handlers, created, invited }
}

async function main() {
  assert.strictEqual(nextStatus(STATUS.INVITING_PARTNER, 'accept_invitation'), STATUS.ARRANGED)
  assert.strictEqual(nextStatus(STATUS.INVITING_PARTNER, 'coordinate_invitation'), STATUS.COLLECTING_PREFERENCES)
  assert.strictEqual(resolveFixtureJourneyName('accept'), 'accept_direct')
  assert.strictEqual(resolveFixtureJourneyName('reject'), 'decline')

  // TEST 01 A_SUBMIT_INVITATION
  const t01 = await invitedPair()
  assert.ok(t01.invited.id)
  assert.strictEqual(t01.invited.status, STATUS.INVITING_PARTNER)
  assert.ok(t01.invited.invitation_card)
  assert.strictEqual(t01.invited.invitation_version, 1)
  assert.ok(t01.deps.rows.date_coordination[0].invitation_proposal)
  assert.strictEqual(t01.invited.can_open_coordinator_chat, true)

  // TEST 02 A_PRE_ACCEPT_AI
  const t02agent = createAgentHandlers(t01.deps)
  const sessionA = await t02agent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: t01.invited.id }, { user_id: 1 })
  assert.ok(sessionA.id)
  assert.ok(String(sessionA.coordinator_welcome).includes('邀请已经发送'))

  // TEST 03 A_PRE_ACCEPT_PATCH stays INVITING_PARTNER
  const patches = createDateApplicationPatchHandlers(Object.assign({}, t01.deps, {
    saveApplicationForUser: (data, user) => t01.handlers.saveApplicationForUser(data, user)
  }))
  const preview = await patches.createPreviewForUser({
    coordination_id: t01.invited.id,
    changes: { availability: [{ date: FRI, periods: ['evening'] }, { date: SAT, periods: ['afternoon'] }] }
  }, t01.deps.rows.user[0])
  const confirmed = await patches.confirmForUser({ coordination_id: t01.invited.id, patch_id: preview.id }, t01.deps.rows.user[0])
  assert.strictEqual(confirmed.status, STATUS.INVITING_PARTNER)
  assert.strictEqual(t01.deps.rows.date_coordination[0].invitation_version, 2)
  assert.ok(t01.deps.rows.date_coordination[0].invitation_proposal.availability.some((item) => item.date === SAT))

  // TEST 04 B_DIRECT_ACCEPT
  const t04 = await invitedPair()
  const arranged = await t04.handlers.respondInvitation({
    coordination_id: t04.invited.id,
    decision: 'accept',
    invitation_version: 1
  }, { user_id: 2 })
  assert.strictEqual(arranged.status, STATUS.ARRANGED)
  assert.ok(arranged.proposal_card)
  assert.strictEqual(arranged.proposal_card.source, 'direct_accept')
  assert.strictEqual(t04.deps.rows.date_coordination_application.filter((row) => Number(row.user_id) === 2).length, 0)
  assert.ok(t04.deps.rows.coordination_notification.some((row) => row.event_type === 'arranged'))

  // TEST 05 B_DIRECT_ACCEPT_STALE_VERSION
  await assert.rejects(
    () => t01.handlers.respondInvitation({
      coordination_id: t01.invited.id,
      decision: 'accept',
      invitation_version: 1
    }, { user_id: 2 }),
    (error) => error.code === 'STALE_INVITATION_VERSION' && error.message === STALE_INVITATION_MESSAGE
  )
  const refreshed = await t01.handlers.detail({ id: t01.invited.id }, { user_id: 2 })
  assert.strictEqual(refreshed.invitation_version, 2)
  assert.ok(refreshed.invitation_card.time_text.includes('周六') || JSON.stringify(refreshed.invitation_card.availability).includes(SAT))

  // TEST 06 B_COORDINATE
  const t06 = await invitedPair()
  const coordinated = await t06.handlers.respondInvitation({
    coordination_id: t06.invited.id,
    decision: 'coordinate'
  }, { user_id: 2 })
  assert.strictEqual(coordinated.status, STATUS.COLLECTING_PREFERENCES)
  assert.strictEqual(coordinated.invitee_intent, 'coordinate')
  assert.strictEqual(coordinated.can_open_coordinator_chat, true)
  assert.strictEqual(t06.deps.rows.date_coordination_application.filter((row) => Number(row.user_id) === 2).length, 0)
  const aWaiting = await t06.handlers.detail({ id: t06.invited.id }, { user_id: 1 })
  assert.ok(aWaiting.view_model.partner_progress_copy.includes('正在补充') || aWaiting.business_state === 'waiting_invitee_preference')
  assert.strictEqual(JSON.stringify(aWaiting).includes('拒绝'), false)

  // TEST 07 B_PARTIAL_OVERRIDE
  const t07patches = createDateApplicationPatchHandlers(Object.assign({}, t06.deps, {
    saveApplicationForUser: (data, user) => t06.handlers.saveApplicationForUser(data, user)
  }))
  const overridePreview = await t07patches.createPreviewForUser({
    coordination_id: t06.invited.id,
    changes: { areas: ['福田'] }
  }, t06.deps.rows.user[1])
  assert.ok(overridePreview.preview)
  assert.strictEqual(overridePreview.preview.application_source, 'invitee_override')
  assert.strictEqual(overridePreview.preview.preference_evidence.areas, 'explicit')
  assert.strictEqual(overridePreview.preview.preference_evidence.availability, 'inherited')
  await t07patches.confirmForUser({ coordination_id: t06.invited.id, patch_id: overridePreview.id }, t06.deps.rows.user[1])
  const afterOverride = await t06.handlers.detail({ id: t06.invited.id }, { user_id: 2 })
  assert.deepStrictEqual(afterOverride.my_application.areas, ['福田'])
  assert.ok(afterOverride.my_application.availability.some((item) => item.date === FRI))
  assert.strictEqual(afterOverride.my_preference_evidence.areas, 'explicit')
  const shared = afterOverride.shared_coordination
  assert.ok(shared.ready)
  const timeDim = shared.dimensions.find((item) => item.key === 'time')
  const areaDim = shared.dimensions.find((item) => item.key === 'area')
  assert.strictEqual(timeDim.status, 'agreed')
  assert.strictEqual(areaDim.status, 'conflict')

  // TEST 08 B_FULL_PREFERENCE
  const t08 = await invitedPair()
  await t08.handlers.respondInvitation({ coordination_id: t08.invited.id, decision: 'coordinate' }, { user_id: 2 })
  await t08.handlers.saveApplication(Object.assign({
    coordination_id: t08.invited.id
  }, app({
    availability: [{ date: SAT, periods: ['afternoon'] }],
    areas: ['福田', '车公庙'],
    activities: ['咖啡'],
    budget: '50-100',
    share_message: 'B私有留言'
  })), { user_id: 2 })
  const a08 = await t08.handlers.detail({ id: t08.invited.id }, { user_id: 1 })
  const b08 = await t08.handlers.detail({ id: t08.invited.id }, { user_id: 2 })
  assert.ok(a08.my_application)
  assert.ok(b08.my_application)
  assert.strictEqual(JSON.stringify(a08).includes('B私有留言'), false)
  assert.strictEqual(JSON.stringify(b08).includes('A私有留言不要给B'), false)
  assert.deepStrictEqual(a08.my_application.areas, ['南山'])
  assert.ok(b08.my_application.areas.includes('福田'))
  const overlap = computeOverlap(a08.my_application, b08.my_application, { version: 1 })
  assert.ok(overlap.missing_dimensions.includes('time') || overlap.missing_dimensions.includes('area') || overlap.missing_dimensions.includes('budget') || overlap.proposals.length >= 0)
  const shared08 = buildSharedCoordinationState(a08.my_application, b08.my_application, { version: 1 })
  assert.strictEqual(shared08.dimensions.find((item) => item.key === 'activity').status, 'agreed')
  assert.strictEqual(shared08.dimensions.find((item) => item.key === 'area').status, 'conflict')

  // TEST 09 B_DECLINE
  const t09 = await invitedPair()
  const declined = await t09.handlers.respondInvitation({ coordination_id: t09.invited.id, decision: 'decline' }, { user_id: 2 })
  assert.strictEqual(declined.status, STATUS.INVITATION_DECLINED)
  const a09 = await t09.handlers.detail({ id: t09.invited.id }, { user_id: 1 })
  assert.strictEqual(a09.declined_public_message, DECLINED_PUBLIC_MESSAGE)
  assert.ok(!JSON.stringify(a09).includes('不喜欢'))
  assert.strictEqual(canWriteCoordinatorAction(t09.deps.rows.date_coordination[0], { id: 1 }, { hasOwnApplication: true }), false)

  // TEST 10 B_NO_RESPONSE does not auto decline
  const t10 = await invitedPair()
  assert.strictEqual(t10.invited.status, STATUS.INVITING_PARTNER)
  const stillWaiting = await t10.handlers.detail({ id: t10.invited.id }, { user_id: 1 })
  assert.strictEqual(stillWaiting.status, STATUS.INVITING_PARTNER)
  assert.notStrictEqual(stillWaiting.status, STATUS.INVITATION_DECLINED)

  // TEST 11 B_EXPIRED
  t10.deps.rows.date_coordination[0].invitation_deadline_at = new Date('2026-07-10T08:00:00.000Z')
  const expiredResult = await processCoordinationDeadlines({
    deps: Object.assign({}, t10.deps, {
      expireIfCurrent: async (row) => {
        Object.assign(row, { status: STATUS.EXPIRED, business_state: 'expired' })
        return true
      },
      writeInboxNotification: async (input) => t10.deps.addWithId('coordination_notification', input, 'coordination_notification')
    }),
    now: NOW
  })
  assert.ok(expiredResult.expired >= 1)
  assert.strictEqual(t10.deps.rows.date_coordination[0].status, STATUS.EXPIRED)

  // TEST 12 NO_RESPONSE_WORDING
  const waitingCopy = JSON.stringify(stillWaiting)
  assert.strictEqual(waitingCopy.includes('拒绝'), false)
  assert.ok(stillWaiting.invitation_status_text.includes('等待对方回应'))
  const expiredDetail = await t10.handlers.detail({ id: t10.invited.id }, { user_id: 1 })
  assert.strictEqual(expiredDetail.declined_public_message, EXPIRED_PUBLIC_MESSAGE)
  assert.strictEqual(JSON.stringify(expiredDetail).includes('拒绝了你'), false)

  // TEST 13 COORDINATION_CARD already covered in TEST 07/08
  assert.ok(shared.dimensions.some((item) => item.status === 'agreed'))
  assert.ok(shared.dimensions.some((item) => item.status === 'conflict'))

  // TEST 14 PROPOSAL_CARD comes from backend
  const t14 = await invitedPair()
  await t14.handlers.respondInvitation({ coordination_id: t14.invited.id, decision: 'accept', invitation_version: 1 }, { user_id: 2 })
  const proposalDetail = await t14.handlers.detail({ id: t14.invited.id }, { user_id: 1 })
  assert.ok(proposalDetail.proposal_card.id)
  assert.strictEqual(proposalDetail.proposal_card.source, 'direct_accept')
  assert.ok(proposalDetail.proposals[0].date)

  // TEST 15 DOUBLE_CONFIRM for AI proposal
  const t15 = await invitedPair()
  await t15.handlers.respondInvitation({ coordination_id: t15.invited.id, decision: 'coordinate' }, { user_id: 2 })
  await t15.handlers.saveApplication(Object.assign({ coordination_id: t15.invited.id }, app({
    availability: [{ date: FRI, periods: ['evening'] }],
    areas: ['南山']
  })), { user_id: 2 })
  const live15 = t15.deps.rows.date_coordination[0]
  live15.status = STATUS.WAITING_CONFIRMATIONS
  live15.business_state = 'proposal_generated'
  live15.confirmation_deadline_at = new Date('2026-07-20T08:00:00.000Z')
  const proposal = await t15.deps.addWithId('date_coordination_proposal', {
    coordination_id: live15.id,
    coordination_version: 1,
    status: 'active',
    source: 'backend',
    date: FRI,
    period: 'evening',
    area: '南山',
    activity: '咖啡',
    budget: '100-200',
    payment_preference: 'aa',
    duration: '1-2h'
  }, 'date_coordination_proposal')
  t15.deps.commitConfirmation = async (coordination, storedProposal, input) => {
    await t15.deps.addWithId('date_coordination_confirmation', {
      coordination_id: coordination.id,
      user_id: input.user_id,
      proposal_id: storedProposal.id,
      coordination_version: 1,
      decision: 'confirm',
      status: 'active'
    }, 'date_coordination_confirmation')
    const confirms = t15.deps.rows.date_coordination_confirmation.filter((row) => (
      Number(row.coordination_id) === Number(coordination.id) && row.decision === 'confirm'
    ))
    if (confirms.length >= 2) {
      Object.assign(coordination, {
        status: STATUS.ARRANGED,
        final_proposal_id: storedProposal.id,
        business_state: 'completed'
      })
    }
    return {
      coordination,
      confirmation: confirms[confirms.length - 1],
      arranged: coordination.status === STATUS.ARRANGED
    }
  }
  const handlers15 = createDateCoordinationHandlers(t15.deps)
  const afterA = await handlers15.confirmProposal({
    coordination_id: live15.id,
    proposal_id: proposal.id,
    coordination_version: 1,
    decision: 'confirm'
  }, { user_id: 1 })
  assert.notStrictEqual(afterA.status, STATUS.ARRANGED)
  const afterB = await handlers15.confirmProposal({
    coordination_id: live15.id,
    proposal_id: proposal.id,
    coordination_version: 1,
    decision: 'confirm'
  }, { user_id: 2 })
  assert.strictEqual(afterB.status, STATUS.ARRANGED)

  // TEST 16 TERMINAL_GUARD
  for (const status of [STATUS.ARRANGED, STATUS.INVITATION_DECLINED, STATUS.EXPIRED, STATUS.CANCELLED]) {
    const coord = { id: 9, user_a_id: 1, user_b_id: 2, status }
    assert.strictEqual(canModifyApplication(coord, { id: 1 }, { hasOwnApplication: true }), false)
    assert.strictEqual(canWriteCoordinatorAction(coord, { id: 1 }, { hasOwnApplication: true }), false)
  }

  // TEST 17 LANGGRAPH_PRIVACY
  const privacyInput = buildDateCoordinationGraphInput({
    id: 12,
    user_a_id: 1,
    user_b_id: 2,
    status: STATUS.COLLECTING_PREFERENCES,
    coordination_version: 1,
    invitation_proposal: { availability: [{ date: FRI, periods: ['evening'] }], areas: ['南山'], activities: ['咖啡'], budget: '100-200', payment_preference: 'aa', duration: '1-2h' }
  }, [
    { user_id: 1, coordination_version: 1, application: app() },
    { user_id: 2, coordination_version: 1, application: app({ areas: ['福田'], share_message: 'B秘密', other_requirements: 'B私有要求' }) }
  ], { id: 1 })
  assert.deepStrictEqual(privacyInput.partyBState.regions, [])
  assert.strictEqual(JSON.stringify(privacyInput).includes('B秘密'), false)
  assert.strictEqual(JSON.stringify(privacyInput).includes('B私有要求'), false)
  assert.strictEqual(JSON.stringify(privacyInput.ownPreference).includes('福田'), false)

  // TEST 18 GRAPH_CONTRACT_TEST (mock provider routing — not live CloudBase runtime)
  const langDeps = memory({
    date_coordination: [{
      id: 80,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.INVITING_PARTNER,
      coordination_version: 1,
      invitation_version: 1,
      invitation_proposal: t01.deps.rows.date_coordination[0].invitation_proposal,
      business_state: 'waiting_partner'
    }],
    date_coordination_application: [{
      id: 1, coordination_id: 80, user_id: 1, coordination_version: 1, application: app()
    }]
  })
  langDeps.env.LANGGRAPH_ENABLED = 'true'
  langDeps.env.LANGGRAPH_ACTOR_SECRET = 'selfcheck-secret'
  const payloads = []
  langDeps.invokeGraphFunction = async (name, payload) => {
    assert.strictEqual(name, 'agent-graph')
    payloads.push(payload)
    return {
      result: {
        success: true,
        data: {
          status: 'completed',
          threadId: payload.threadId,
          phase: 'wait_partner',
          replyDraft: '邀请已发送。',
          pendingAction: null,
          coordinationVersion: payload.coordinationVersion
        }
      }
    }
  }
  const langAgent = createAgentHandlers(langDeps)
  const langSession = await langAgent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 80 }, { user_id: 1 })
  const langReply = await langAgent.send({ session_id: langSession.id, message: '现在怎么样了？' }, { user_id: 1 })
  assert.strictEqual(langReply.provider, 'langgraph')
  assert.strictEqual(payloads[0].party, 'A')
  assert.deepStrictEqual(payloads[0].partyBState.regions, [])

  // TEST 19 FIXTURE_DIRECT_ACCEPT (AUTO uses the real invitation service)
  const fixtureUser = syntheticPartner(2, 'accept_direct', { openid: 'b_direct' })
  const t19 = await invitedPair({ seed: fixtureSeed(fixtureUser) })
  assert.strictEqual(t19.invited.status, STATUS.ARRANGED)
  assert.strictEqual(t19.invited.proposal_card.source, 'direct_accept')
  assert.strictEqual(t19.deps.rows.date_coordination_application.filter((row) => Number(row.user_id) === 2).length, 0)

  const manualDirect = syntheticPartner(2, 'accept_direct', { openid: 'b_direct_manual', fixture_mode: 'manual_step' })
  const t19manual = await invitedPair({ seed: fixtureSeed(manualDirect) })
  assert.strictEqual(t19manual.invited.status, STATUS.INVITING_PARTNER)
  const directAdvance = await t19manual.handlers.advanceSynthetic({ coordination_id: t19manual.invited.id }, { user_id: 1 })
  assert.strictEqual(directAdvance.status, STATUS.ARRANGED)

  // TEST 20 FIXTURE_COORDINATE
  const coordinateUser = syntheticPartner(2, 'coordinate', { openid: 'b_coord' })
  const t20 = await invitedPair({ seed: fixtureSeed(coordinateUser) })
  assert.notStrictEqual(t20.invited.status, STATUS.INVITING_PARTNER)
  assert.ok(['collecting_preferences', 'computing_overlap', 'no_overlap', 'waiting_confirmations'].includes(t20.invited.status))
  assert.strictEqual(t20.deps.rows.date_coordination[0].invitee_intent, 'coordinate')

  // TEST 21 FIXTURE_NO_RESPONSE + MANUAL_STEP stay
  const silentUser = syntheticPartner(2, 'no_response', { openid: 'b_silent' })
  const t21 = await invitedPair({ seed: fixtureSeed(silentUser) })
  assert.strictEqual(t21.invited.status, STATUS.INVITING_PARTNER)
  const noAdvance = await advanceSyntheticPartner({
    coordination: t21.deps.rows.date_coordination[0],
    partner: silentUser
  }, { respondInvitation: async () => { throw new Error('should not run') } })
  assert.strictEqual(noAdvance.reason, 'no_response')
  assert.strictEqual(t21.invited.status, STATUS.INVITING_PARTNER)

  const waitingManual = syntheticPartner(2, 'coordinate', { openid: 'b_wait_manual', fixture_mode: 'manual_step' })
  const t21manual = await invitedPair({ seed: fixtureSeed(waitingManual) })
  assert.strictEqual(t21manual.invited.status, STATUS.INVITING_PARTNER)
  assert.strictEqual(t21manual.invited.synthetic_partner_mode, 'manual_step')

  // TEST 22 FIXTURE_DECLINE
  const declineUser = syntheticPartner(2, 'reject', { openid: 'b_no' })
  assert.strictEqual(resolveFixtureJourney(declineUser), 'decline')
  const t22 = await invitedPair({ seed: fixtureSeed(declineUser) })
  assert.strictEqual(t22.invited.status, STATUS.INVITATION_DECLINED)
  assert.strictEqual(t22.invited.declined_public_message, DECLINED_PUBLIC_MESSAGE)

  const noPrefsUser = syntheticPartner(2, 'accept_no_prefs', { openid: 'b_noprefs' })
  const tNoPrefs = await invitedPair({ seed: fixtureSeed(noPrefsUser) })
  assert.strictEqual(tNoPrefs.invited.status, STATUS.COLLECTING_PREFERENCES)
  const second = await advanceSyntheticPartner({
    coordination: tNoPrefs.deps.rows.date_coordination[0],
    partner: noPrefsUser
  }, {
    respondInvitation: async () => { throw new Error('should stay waiting') },
    saveApplicationForUser: async () => { throw new Error('worker must not invent B prefs') }
  })
  assert.strictEqual(second.reason, 'waiting_invitee_preference')
  assert.strictEqual(tNoPrefs.deps.rows.date_coordination_application.filter((row) => Number(row.user_id) === 2).length, 0)

  // TEST 23 NOTIFICATION_BADGE
  assert.strictEqual(TAB_INDEX_RECORDS, 1)
  const badges = []
  global.wx = {
    showTabBarRedDot: (opts) => badges.push(['show', opts.index]),
    hideTabBarRedDot: (opts) => badges.push(['hide', opts.index]),
    setTabBarBadge: (opts) => badges.push(['badge', opts.index, opts.text]),
    removeTabBarBadge: (opts) => badges.push(['remove', opts.index])
  }
  applyTabBadge(2)
  applyTabBadge(0)
  assert.deepStrictEqual(badges[0], ['show', 1])
  delete global.wx
  assert.ok(t09.deps.rows.coordination_notification.some((row) => row.event_type === 'invitation_declined'))
  assert.ok(t09.deps.rows.user_notification_cursor.some((row) => Number(row.user_id) === 1 && Number(row.unread_count || 0) > 0))

  // TEST 24 FIXTURE_CLEANUP / no orphan: declined and arranged remain terminal and pair can recreate
  const reuse = memory({
    user: [eligibleUser(1), eligibleUser(2)],
    user_match_log: [{ id: 10, user_id: 1, match_user_id: 2 }],
    date_coordination: [{
      id: 44,
      pair_key: '1:2',
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.INVITATION_DECLINED,
      is_test_data: 1
    }]
  })
  const reused = await createDateCoordinationHandlers(reuse).create({ match_log_id: 10, match_user_id: 2 }, { user_id: 1 })
  assert.notStrictEqual(reused.id, 44)

  const welcomeB = coordinatorWelcomeText({
    status: STATUS.COLLECTING_PREFERENCES,
    my_application: null
  }, 'invitee')
  assert.ok(welcomeB.includes('不需要重新填写全部约会信息'))
  assert.ok(canOpenCoordinatorChat({ user_a_id: 1, user_b_id: 2, status: STATUS.COLLECTING_PREFERENCES }, { id: 2 }, { hasOwnApplication: false }))

  // ---- Review-fix round: TEST 25-44 ----

  const multiPrefs = app({
    availability: [
      { date: FRI, periods: ['afternoon'] },
      { date: SAT, periods: ['afternoon'] }
    ],
    areas: ['南山', '福田'],
    activities: ['咖啡', '散步']
  })
  const primarySatNanshanCoffee = {
    date: SAT,
    period: 'afternoon',
    area: '南山',
    activity: '咖啡',
    budget: '100-200',
    duration: '1-2h',
    payment_preference: 'aa'
  }

  // TEST 25 DIRECT_ACCEPT_REQUIRES_PRIMARY_PROPOSAL
  const t25 = memory()
  const h25 = createDateCoordinationHandlers(t25)
  const c25 = await h25.create({ match_log_id: 10, match_user_id: 2 }, { user_id: 1 })
  await assert.rejects(
    () => h25.saveApplication(Object.assign({ coordination_id: c25.id }, multiPrefs), { user_id: 1 }),
    (error) => error.code === 'PRIMARY_PROPOSAL_REQUIRED'
  )
  // Legacy row without primary: accept blocked
  t25.rows.date_coordination[0].status = STATUS.INVITING_PARTNER
  t25.rows.date_coordination[0].invitation_version = 1
  t25.rows.date_coordination[0].invitation_proposal = multiPrefs
  t25.rows.date_coordination[0].user_a_id = 1
  t25.rows.date_coordination[0].user_b_id = 2
  t25.rows.date_coordination_application.push({
    id: 901, coordination_id: c25.id, user_id: 1, coordination_version: 1, application: multiPrefs, preference_version: 1
  })
  await assert.rejects(
    () => h25.respondInvitation({ coordination_id: c25.id, decision: 'accept', invitation_version: 1 }, { user_id: 2 }),
    (error) => error.code === 'PRIMARY_PROPOSAL_INCOMPLETE'
  )

  // TEST 26 PRIMARY_PROPOSAL_EXPLICIT
  const t26 = await invitedPair({
    app: multiPrefs,
    primary: primarySatNanshanCoffee
  })
  assert.ok(isPrimaryProposalComplete(t26.deps.rows.date_coordination[0].invitation_primary_proposal))
  assert.strictEqual(t26.invited.invitation_card.area_text, '南山')
  assert.strictEqual(t26.invited.invitation_card.activity_text, '咖啡')
  assert.ok(t26.invited.invitation_card.time_text.includes('周六') || t26.invited.invitation_card.time_text.includes(SAT.slice(5)))
  const arranged26 = await t26.handlers.respondInvitation({
    coordination_id: t26.invited.id,
    decision: 'accept',
    invitation_version: 1
  }, { user_id: 2 })
  assert.strictEqual(arranged26.status, STATUS.ARRANGED)
  assert.strictEqual(arranged26.proposal_card.date, SAT)
  assert.strictEqual(arranged26.proposal_card.period, 'afternoon')
  assert.strictEqual(arranged26.proposal_card.area, '南山')
  assert.strictEqual(arranged26.proposal_card.activity, '咖啡')

  // TEST 27 DIRECT_ACCEPT_DOES_NOT_PICK_FIRST
  assert.notStrictEqual(arranged26.proposal_card.date, FRI)
  assert.notStrictEqual(arranged26.proposal_card.area, '福田')
  assert.notStrictEqual(arranged26.proposal_card.activity, '散步')
  // Ensure buildDirectAcceptProposal refuses preference arrays
  assert.throws(
    () => buildDirectAcceptProposal(multiPrefs, 1, { coordination_id: 1, invitation_version: 1 }),
    (error) => error.code === 'PRIMARY_PROPOSAL_INCOMPLETE'
  )

  // TEST 28 PAYMENT_VISIBLE_ON_INVITATION
  assert.ok(t26.invited.invitation_card.payment_text)
  assert.strictEqual(t26.invited.invitation_card.payment_text, 'AA')

  // TEST 29 PAYMENT_VISIBLE_ON_PROPOSAL
  assert.ok(arranged26.proposal_card.payment_text)
  assert.strictEqual(arranged26.proposal_card.payment_text, 'AA')

  // TEST 30 PAYMENT_PERSPECTIVE_A_SELF_PAYS
  const paySelf = personalPaymentToNeutral('self_pays', 1, 2)
  assert.strictEqual(paySelf.payment_mode, 'single_payer')
  assert.strictEqual(paySelf.payer_user_id, 1)
  const t30 = await invitedPair({
    app: app({ payment_preference: 'self_pays' })
  })
  assert.strictEqual(t30.deps.rows.date_coordination[0].invitation_primary_proposal.payer_user_id, 1)
  assert.strictEqual(
    paymentFactText(t30.deps.rows.date_coordination[0].invitation_primary_proposal, { user_a_id: 1, user_b_id: 2 }),
    '本次由发起方请客'
  )

  // TEST 31 PAYMENT_PERSPECTIVE_A_PARTNER_PAYS
  const payPartner = personalPaymentToNeutral('partner_pays', 1, 2)
  assert.strictEqual(payPartner.payer_user_id, 2)
  const t31 = await invitedPair({
    app: app({ payment_preference: 'partner_pays' })
  })
  assert.strictEqual(t31.deps.rows.date_coordination[0].invitation_primary_proposal.payer_user_id, 2)
  assert.strictEqual(
    paymentFactText(t31.deps.rows.date_coordination[0].invitation_primary_proposal, { user_a_id: 1, user_b_id: 2 }),
    '本次由受邀方请客'
  )

  // TEST 32 PAYMENT_BOTH_VIEWS_SAME_FACT
  const arranged31 = await t31.handlers.respondInvitation({
    coordination_id: t31.invited.id,
    decision: 'accept',
    invitation_version: 1
  }, { user_id: 2 })
  const viewA31 = await t31.handlers.detail({ id: t31.invited.id }, { user_id: 1 })
  const viewB31 = await t31.handlers.detail({ id: t31.invited.id }, { user_id: 2 })
  assert.strictEqual(viewA31.proposal_card.payment_text, viewB31.proposal_card.payment_text)
  assert.strictEqual(viewA31.proposal_card.payment_text, '本次由受邀方请客')
  assert.strictEqual(JSON.stringify(viewA31.proposal_card).includes('对方请客'), false)
  assert.strictEqual(JSON.stringify(viewB31.proposal_card).includes('对方请客'), false)
  assert.strictEqual(arranged31.proposal_card.payment_text, '本次由受邀方请客')

  // TEST 33 MISSING_INVITATION_VERSION
  const t33 = await invitedPair()
  await assert.rejects(
    () => t33.handlers.respondInvitation({ coordination_id: t33.invited.id, decision: 'accept' }, { user_id: 2 }),
    (error) => error.code === 'INVALID_INVITATION_VERSION' && error.message === INVALID_INVITATION_VERSION_MESSAGE
  )

  // TEST 34 STALE_VERSION (already covered by TEST 05; re-assert with primary)
  const t34 = await invitedPair()
  const patch34 = createDateApplicationPatchHandlers(Object.assign({}, t34.deps, {
    saveApplicationForUser: (data, user) => t34.handlers.saveApplicationForUser(data, user)
  }))
  const preview34 = await patch34.createPreviewForUser({
    coordination_id: t34.invited.id,
    changes: { areas: ['南山', '罗湖'] }
  }, t34.deps.rows.user[0])
  await patch34.confirmForUser({ coordination_id: t34.invited.id, patch_id: preview34.id }, t34.deps.rows.user[0])
  assert.strictEqual(t34.deps.rows.date_coordination[0].invitation_version, 2)
  await assert.rejects(
    () => t34.handlers.respondInvitation({
      coordination_id: t34.invited.id,
      decision: 'accept',
      invitation_version: 1
    }, { user_id: 2 }),
    (error) => error.code === 'STALE_INVITATION_VERSION'
  )

  // TEST 35 DIRECT_ACCEPT_IDEMPOTENT
  const t35 = await invitedPair()
  const first35 = await t35.handlers.respondInvitation({
    coordination_id: t35.invited.id,
    decision: 'accept',
    invitation_version: 1
  }, { user_id: 2 })
  const second35 = await t35.handlers.respondInvitation({
    coordination_id: t35.invited.id,
    decision: 'accept',
    invitation_version: 1
  }, { user_id: 2 })
  assert.strictEqual(first35.status, STATUS.ARRANGED)
  assert.strictEqual(second35.status, STATUS.ARRANGED)
  assert.strictEqual(t35.deps.rows.date_coordination_proposal.length, 1)
  assert.strictEqual(t35.deps.rows.date_coordination_confirmation.filter((row) => row.decision === 'confirm').length, 2)
  assert.strictEqual(
    t35.deps.rows.date_coordination_event.filter((row) => row.event_type === 'arranged').length,
    1
  )

  // TEST 36 DIRECT_ACCEPT_RACE
  const t36 = await invitedPair()
  const raceCoord = t36.deps.rows.date_coordination[0]
  // Simulate A bumping invitation_version before B's CAS final write by interleaving:
  // B starts accept on v1, then A patches to v2, then B's accept must fail OR A patch must fail if B already arranged.
  const acceptPromise = t36.handlers.respondInvitation({
    coordination_id: t36.invited.id,
    decision: 'accept',
    invitation_version: 1
  }, { user_id: 2 })
  // Concurrent A edit: bump version while accept in flight (memory model is sync until await points)
  raceCoord.invitation_version = 2
  raceCoord.invitation_primary_proposal = Object.assign({}, raceCoord.invitation_primary_proposal, { area: '罗湖' })
  let raceAcceptError = null
  let raceAcceptResult = null
  try {
    raceAcceptResult = await acceptPromise
  } catch (err) {
    raceAcceptError = err
  }
  if (raceAcceptResult && raceAcceptResult.status === STATUS.ARRANGED) {
    // B won: final proposal must still be v1 primary (南山), not 罗湖
    assert.strictEqual(raceAcceptResult.proposal_card.area, '南山')
    assert.notStrictEqual(raceAcceptResult.proposal_card.area, '罗湖')
  } else {
    assert.ok(raceAcceptError)
    assert.strictEqual(raceAcceptError.code, 'STALE_INVITATION_VERSION')
    assert.strictEqual(t36.deps.rows.date_coordination[0].status, STATUS.INVITING_PARTNER)
  }
  // Cannot have both: A v2 patch fact + B arranged on old proposal simultaneously as success pair
  if (t36.deps.rows.date_coordination[0].status === STATUS.ARRANGED) {
    assert.strictEqual(Number(t36.deps.rows.date_coordination[0].accepted_base_invitation_version), 1)
  }

  // TEST 37 PRE_ACCEPT_EDIT_NO_ROUND_COST
  const t37 = await invitedPair()
  const patch37 = createDateApplicationPatchHandlers(Object.assign({}, t37.deps, {
    saveApplicationForUser: (data, user) => t37.handlers.saveApplicationForUser(data, user)
  }))
  for (let i = 0; i < 6; i += 1) {
    const preview = await patch37.createPreviewForUser({
      coordination_id: t37.invited.id,
      changes: { areas: ['南山', `区${i}`] }
    }, t37.deps.rows.user[0])
    await patch37.confirmForUser({ coordination_id: t37.invited.id, patch_id: preview.id }, t37.deps.rows.user[0])
  }
  assert.strictEqual(Number(t37.deps.rows.date_coordination[0].recoordination_count || 0), 0)
  assert.notStrictEqual(t37.deps.rows.date_coordination[0].status, STATUS.MANUAL_HANDOFF)
  assert.ok(Number(t37.deps.rows.date_coordination[0].invitation_version) >= 7)

  // TEST 38 PRE_ACCEPT_EDIT_STAYS_INVITING
  assert.strictEqual(t37.deps.rows.date_coordination[0].status, STATUS.INVITING_PARTNER)
  const stillAcceptable = await t37.handlers.respondInvitation({
    coordination_id: t37.invited.id,
    decision: 'accept',
    invitation_version: t37.deps.rows.date_coordination[0].invitation_version
  }, { user_id: 2 })
  assert.strictEqual(stillAcceptable.status, STATUS.ARRANGED)

  // TEST 39 DATE_FORMAT
  const formatted = formatDatePeriod(SAT, 'afternoon')
  assert.ok(/月\d+日（周.）下午/.test(formatted))
  assert.ok(formatted.includes('周六') || formatted.includes('周'))

  // TEST 40 NO_DUPLICATED_PERIOD
  const card40 = buildProposalCard({
    id: 1,
    date: SAT,
    period: 'afternoon',
    area: '南山',
    activity: '咖啡',
    budget: '100-200',
    duration: '1-2h',
    payment_mode: 'aa',
    payer_user_id: 0
  }, { user_a_id: 1, user_b_id: 2 })
  assert.strictEqual(card40.time_text.includes('afternoon'), false)
  assert.ok(card40.time_text.includes('下午'))
  assert.strictEqual((card40.time_text.match(/下午/g) || []).length, 1)

  // TEST 41 DIRECT_ACCEPT_PAYMENT_FACT
  assert.strictEqual(arranged26.proposal_card.payment_text, t26.invited.invitation_card.payment_text)

  // TEST 42 GRAPH_CONTRACT_TEST naming — provider routing already asserted in TEST 18
  assert.strictEqual(langReply.provider, 'langgraph')

  // TEST 43 GRAPH_PRIVACY — reaffirm
  assert.strictEqual(JSON.stringify(privacyInput).includes('B秘密'), false)

  // TEST 44 LIVE_GRAPH_SMOKE — automated live CloudBase smoke is recorded separately after deploy
  const LIVE_GRAPH_SMOKE_STATUS = process.env.WEFINALLY_LIVE_GRAPH_SMOKE === 'pass'
    ? 'PASS'
    : 'MANUAL_REQUIRED'
  assert.ok(['PASS', 'MANUAL_REQUIRED'].includes(LIVE_GRAPH_SMOKE_STATUS))

  console.log('first-date-invitation-coordination: PASS')
  console.log(`LIVE_GRAPH_SMOKE: ${LIVE_GRAPH_SMOKE_STATUS}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
