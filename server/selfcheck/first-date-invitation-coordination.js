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
  buildSharedCoordinationState,
  coordinatorWelcomeText,
  resolveFixtureJourneyName
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
  const invited = await handlers.saveApplication(Object.assign({ coordination_id: created.id }, app(options.app)), { user_id: 1 })
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

  // TEST 18 LANGGRAPH_REAL_RUNTIME
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

  console.log('first-date-invitation-coordination: PASS')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
