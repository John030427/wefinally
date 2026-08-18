const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { STATUS, computeOverlap, nextStatus } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const {
  canOpenCoordinatorChat,
  canModifyApplication,
  canRespondInvitation,
  canRecoordinate,
  canWriteCoordinatorAction,
  isTerminalCoordination
} = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationAccessPolicy')
const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
const { createDateApplicationPatchHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
const { AGENT_TYPES } = require('../../miniprogram/cloudfunctions/api/agent/types')
const { buildDateCoordinationGraphInput } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationGraphState')
const { normalizeInput } = require('../../miniprogram/cloudfunctions/api/handlers/abMatchFixture')
const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
const { TAB_INDEX_RECORDS, applyTabBadge } = require('../../miniprogram/utils/notificationBadge')

const NOW = new Date('2026-07-12T08:00:00.000Z')
const ROOT = path.resolve(__dirname, '../..')

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
    share_message: ''
  }, overrides)
}

function eligibleUser(id) {
  return {
    id,
    member_status: 'approved',
    is_vip: 1,
    vip_expire_time: '2026-08-01T00:00:00.000Z',
    status: 1,
    free_member: 1
  }
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

async function main() {
  const policyUserA = { id: 1 }
  const policyUserB = { id: 2 }
  const inviting = { id: 1, user_a_id: 1, user_b_id: 2, status: STATUS.INVITING_PARTNER }
  assert.strictEqual(canOpenCoordinatorChat(inviting, policyUserA, { hasOwnApplication: true }), true)
  assert.strictEqual(canOpenCoordinatorChat(inviting, policyUserB, { hasOwnApplication: false }), false)
  assert.strictEqual(canModifyApplication(inviting, policyUserA, { hasOwnApplication: true }), true)
  assert.strictEqual(canModifyApplication(inviting, policyUserB, { hasOwnApplication: true }), false)
  assert.strictEqual(canRespondInvitation(inviting, policyUserB), true)
  assert.strictEqual(canRespondInvitation(inviting, policyUserA), false)

  const deps = memory({
    date_coordination: [{
      id: 80,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.INVITING_PARTNER,
      business_state: 'waiting_partner',
      coordination_version: 1,
      invitation_deadline_at: new Date('2026-07-14T08:00:00.000Z'),
      invitation_responded_at: null,
      recoordination_count: 0
    }],
    date_coordination_application: [{
      id: 1,
      coordination_id: 80,
      user_id: 1,
      coordination_version: 1,
      preference_version: 1,
      application: app()
    }]
  })
  const coordination = createDateCoordinationHandlers(deps)
  const patches = createDateApplicationPatchHandlers(Object.assign({}, deps, {
    saveApplicationForUser: (data, user) => coordination.saveApplicationForUser(data, user)
  }))
  const agent = createAgentHandlers(deps)
  const contextA = { user_id: 1, OPENID: 'a' }
  const contextB = { user_id: 2, OPENID: 'b' }

  const detailA = await coordination.detail({ id: 80 }, contextA)
  const detailB = await coordination.detail({ id: 80 }, contextB)
  assert.strictEqual(detailA.status, STATUS.INVITING_PARTNER)
  assert.strictEqual(detailA.can_open_coordinator_chat, true)
  assert.strictEqual(detailB.can_open_coordinator_chat, false)
  assert.strictEqual(detailB.can_respond_invitation, true)

  const preview = await patches.createPreviewForUser({
    coordination_id: 80,
    changes: { availability: [{ date: FRI, periods: ['evening'] }, { date: SAT, periods: ['afternoon'] }] }
  }, deps.rows.user[0])
  assert.strictEqual(deps.rows.date_coordination[0].status, STATUS.INVITING_PARTNER)
  assert.strictEqual(deps.rows.date_coordination[0].coordination_version, 1)
  assert.deepStrictEqual(deps.rows.date_coordination_application[0].application.availability[0].periods, ['evening'])

  const confirmed = await patches.confirmForUser({ coordination_id: 80, patch_id: preview.id }, deps.rows.user[0])
  assert.strictEqual(confirmed.status, STATUS.INVITING_PARTNER)
  assert.strictEqual(confirmed.business_state, 'waiting_partner')
  assert.strictEqual(deps.rows.date_coordination[0].status, STATUS.INVITING_PARTNER)
  assert.ok(deps.rows.date_coordination[0].invitation_deadline_at)
  assert.strictEqual(deps.rows.date_coordination[0].invitation_responded_at, null)
  const updatedApp = deps.rows.date_coordination_application.find((row) => Number(row.user_id) === 1 && Number(row.coordination_version) === 2)
  assert.ok(updatedApp)
  assert.strictEqual(Number(updatedApp.preference_version), 2)
  assert.ok(updatedApp.application.availability.some((item) => item.date === SAT))

  await assert.rejects(
    () => agent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 80 }, contextB),
    /请先接受或拒绝/
  )
  const sessionA = await agent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 80 }, contextA)
  assert.ok(sessionA.id)

  const accepted = await coordination.respondInvitation({ coordination_id: 80, decision: 'accept' }, contextB)
  assert.strictEqual(accepted.status, STATUS.COLLECTING_PREFERENCES)

  const rejectDeps = memory({
    date_coordination: [{
      id: 81,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.INVITING_PARTNER,
      business_state: 'waiting_partner',
      coordination_version: 1,
      invitation_deadline_at: new Date('2026-07-14T08:00:00.000Z'),
      recoordination_count: 0
    }],
    date_coordination_application: [{
      id: 11,
      coordination_id: 81,
      user_id: 1,
      coordination_version: 1,
      preference_version: 1,
      application: app()
    }]
  })
  const rejectCoordination = createDateCoordinationHandlers(rejectDeps)
  const rejectPatches = createDateApplicationPatchHandlers(Object.assign({}, rejectDeps, {
    saveApplicationForUser: (data, user) => rejectCoordination.saveApplicationForUser(data, user)
  }))
  const rejectPreview = await rejectPatches.createPreviewForUser({
    coordination_id: 81,
    changes: { areas: ['南山', '车公庙'] }
  }, rejectDeps.rows.user[0])
  await rejectPatches.confirmForUser({ coordination_id: 81, patch_id: rejectPreview.id }, rejectDeps.rows.user[0])
  assert.strictEqual(rejectDeps.rows.date_coordination[0].status, STATUS.INVITING_PARTNER)
  const declined = await rejectCoordination.respondInvitation({ coordination_id: 81, decision: 'decline' }, { user_id: 2 })
  assert.strictEqual(declined.status, STATUS.INVITATION_DECLINED)
  const rejectAgent = createAgentHandlers(rejectDeps)
  await assert.rejects(
    () => rejectAgent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 81 }, { user_id: 1 }),
    /对方暂未接受本次约会邀请/
  )
  await assert.rejects(
    () => rejectPatches.createPreviewForUser({ coordination_id: 81, changes: { areas: ['福田'] } }, rejectDeps.rows.user[0]),
    /不能继续修改|已经结束/
  )

  const inviteeAfterAccept = await agent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 80 }, contextB)
  assert.ok(inviteeAfterAccept.id)

  for (const status of ['arranged', 'invitation_declined', 'expired', 'cancelled', 'closed', 'manual_handoff']) {
    const terminal = memory({
      date_coordination: [{
        id: 90,
        user_a_id: 1,
        user_b_id: 2,
        status,
        coordination_version: 1
      }],
      date_coordination_application: [{
        id: 1, coordination_id: 90, user_id: 1, coordination_version: 1, application: app()
      }]
    })
    const terminalCoord = { id: 90, user_a_id: 1, user_b_id: 2, status }
    assert.strictEqual(isTerminalCoordination(status), true)
    assert.strictEqual(canModifyApplication(terminalCoord, { id: 1 }, { hasOwnApplication: true }), false)
    assert.strictEqual(canRecoordinate(terminalCoord, { id: 1 }), false)
    assert.strictEqual(canWriteCoordinatorAction(terminalCoord, { id: 1 }, { hasOwnApplication: true }), false)
    const terminalPatches = createDateApplicationPatchHandlers(terminal)
    await assert.rejects(
      () => terminalPatches.createPreviewForUser({ coordination_id: 90, changes: { areas: ['福田'] } }, terminal.rows.user[0]),
      /不能|结束|已确认/
    )
    const terminalHandlers = createDateCoordinationHandlers(terminal)
    await assert.rejects(
      () => terminalHandlers.recoordinate({ coordination_id: 90 }, { user_id: 1 }),
      /不能/
    )
  }

  const paymentA = app({ payment_preference: 'partner_pays' })
  const paymentB = app({ payment_preference: 'aa', availability: [{ date: FRI, periods: ['evening'] }] })
  const paymentOverlap = computeOverlap(paymentA, paymentB, { version: 1 })
  assert.ok(paymentOverlap.missing_dimensions.includes('payment'))
  const paymentInput = buildDateCoordinationGraphInput({
    id: 12,
    user_a_id: 1,
    user_b_id: 2,
    status: STATUS.COLLECTING_PREFERENCES,
    coordination_version: 1
  }, [
    { user_id: 1, coordination_version: 1, application: paymentA },
    { user_id: 2, coordination_version: 1, application: paymentB }
  ], { id: 1 })
  assert.strictEqual(paymentInput.canonicalOverlap.hasOverlap, false)
  assert.ok(paymentInput.canonicalOverlap.missingDimensions.includes('payment'))
  assert.deepStrictEqual(paymentInput.partyBState.dateWindows, [])
  assert.ok(!JSON.stringify(paymentInput).includes('transport_constraints'))

  const budgetOverlap = computeOverlap(
    app({ budget: '50-100' }),
    app({ budget: '100-200' }),
    { version: 1 }
  )
  assert.strictEqual(budgetOverlap.missing_dimensions.includes('budget'), false)
  const budgetInput = buildDateCoordinationGraphInput({
    id: 13,
    user_a_id: 1,
    user_b_id: 2,
    status: STATUS.NO_OVERLAP,
    coordination_version: 1
  }, [
    { user_id: 1, coordination_version: 1, application: app({ budget: '50-100' }) },
    { user_id: 2, coordination_version: 1, application: app({ budget: '100-200' }) }
  ], { id: 1 })
  assert.strictEqual(budgetInput.canonicalOverlap.hasOverlap, budgetOverlap.proposals.length > 0)
  assert.strictEqual(budgetInput.canonicalOverlap.source, 'backend')

  deps.env.LANGGRAPH_ENABLED = 'true'
  deps.env.LANGGRAPH_ACTOR_SECRET = 'selfcheck-secret'
  const payloads = []
  deps.invokeGraphFunction = async (name, payload) => {
    assert.strictEqual(name, 'agent-graph')
    payloads.push(payload)
    return {
      result: {
        success: true,
        data: {
          status: 'completed',
          threadId: payload.threadId,
          phase: payload.canonicalOverlap && payload.canonicalOverlap.missingDimensions && payload.canonicalOverlap.missingDimensions.includes('partner')
            ? 'wait_partner'
            : 'awaiting_confirmation',
          replyDraft: '现在协调还在等待对方回应。',
          pendingAction: null,
          coordinationVersion: payload.coordinationVersion
        }
      }
    }
  }
  const progressDeps = memory({
    date_coordination: [{
      id: 80,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.INVITING_PARTNER,
      coordination_version: 3,
      business_state: 'waiting_partner'
    }],
    date_coordination_application: [{
      id: 1, coordination_id: 80, user_id: 1, coordination_version: 3, application: app({
        availability: [{ date: FRI, periods: ['evening'] }, { date: SAT, periods: ['afternoon'] }]
      })
    }],
    date_coordination_event: [{
      id: 1,
      coordination_id: 80,
      coordination_version: 3,
      event_type: 'preference_changed',
      shareable_summary: { changed_dimensions: ['time'] }
    }]
  })
  progressDeps.env = deps.env
  progressDeps.invokeGraphFunction = deps.invokeGraphFunction
  const progressAgent = createAgentHandlers(progressDeps)
  const aSession = await progressAgent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 80 }, { user_id: 1 })
  const aAgain = await progressAgent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 80 }, { user_id: 1 })
  assert.strictEqual(aAgain.id, aSession.id)
  const graphReply = await progressAgent.send({ session_id: aSession.id, message: '现在协调怎么样了？' }, { user_id: 1 })
  assert.strictEqual(graphReply.provider, 'langgraph')
  assert.ok(graphReply.graph_phase)
  assert.strictEqual(payloads[0].party, 'A')
  assert.ok(payloads[0].threadId)
  const threadA = payloads[0].threadId

  progressDeps.rows.date_coordination[0].status = STATUS.COLLECTING_PREFERENCES
  progressDeps.rows.date_coordination_application.push({
    id: 2, coordination_id: 80, user_id: 2, coordination_version: 3, application: app({ areas: ['福田', '车公庙'] })
  })
  const bSession = await progressAgent.createSession({ agent_type: AGENT_TYPES.DATE_COORDINATOR, coordination_id: 80 }, { user_id: 2 })
  await progressAgent.send({ session_id: bSession.id, message: '现在协调怎么样了？' }, { user_id: 2 })
  assert.notStrictEqual(payloads[1].threadId, threadA)
  assert.strictEqual(payloads[1].party, 'B')
  const aResume = await progressAgent.send({ session_id: aSession.id, message: '我离开后现在怎么样了？' }, { user_id: 1 })
  assert.strictEqual(aResume.provider, 'langgraph')
  assert.strictEqual(payloads[2].threadId, threadA)
  assert.deepStrictEqual(payloads[2].partyBState.regions, [])
  assert.ok(!JSON.stringify(payloads[2]).includes('车公庙') || JSON.stringify(payloads[2].sharedState || {}).includes('车公庙'))

  const route = fs.readFileSync(path.join(ROOT, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
  const constants = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/constants.js'), 'utf8')
  const notifications = fs.readFileSync(path.join(ROOT, 'miniprogram/cloudfunctions/api/handlers/notifications.js'), 'utf8')
  const commonJs = fs.readFileSync(path.join(ROOT, 'miniprogram/cloudfunctions/api/handlers/common.js'), 'utf8')
  const notifyPage = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/notifications/notifications.js'), 'utf8')
  assert(route.includes("'GET /api/notifications'"))
  assert(route.includes("'GET /api/notifications/unread'"))
  assert(route.includes("'POST /api/notifications/read'"))
  assert(constants.includes("NOTIFICATIONS: '/api/notifications'"))
  assert(constants.includes("NOTIFICATIONS_UNREAD: '/api/notifications/unread'"))
  assert(constants.includes("NOTIFICATIONS_READ: '/api/notifications/read'"))
  assert(notifications.includes('getList'))
  assert(notifications.includes('unread'))
  assert(commonJs.includes('notifications: true'))
  assert(commonJs.includes('date_coordinator_pre_accept_chat: true'))
  assert(notifyPage.includes('当前 CloudBase 后端版本尚未包含消息服务'))
  assert.strictEqual(TAB_INDEX_RECORDS, 1)
  const badges = []
  global.wx = {
    showTabBarRedDot: (opts) => badges.push(['show', opts.index]),
    hideTabBarRedDot: (opts) => badges.push(['hide', opts.index]),
    setTabBarBadge: (opts) => badges.push(['badge', opts.index, opts.text]),
    removeTabBarBadge: (opts) => badges.push(['remove', opts.index])
  }
  applyTabBadge(3)
  applyTabBadge(0)
  assert.deepStrictEqual(badges[0], ['show', 1])
  assert.strictEqual(badges.some((item) => item[0] === 'hide' && item[1] === 1), true)
  delete global.wx

  const rejectJourney = normalizeInput({
    action: 'prepare',
    ownerUserId: 8,
    reason: 'route-level reject',
    requestId: 'ab_prepare_route_1784889000000',
    fixture_journey: 'reject'
  })
  assert.strictEqual(rejectJourney.fixture_journey, 'reject')

  const declinedReuse = memory({
    user: [eligibleUser(1), eligibleUser(2)],
    user_match_log: [{ id: 10, user_id: 1, match_user_id: 2 }],
    date_coordination: [{
      id: 44,
      pair_key: '1:2',
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.INVITATION_DECLINED,
      is_test_data: 1,
      ab_test_run_id: 'old_run'
    }]
  })
  const reused = await createDateCoordinationHandlers(declinedReuse).create({ match_log_id: 10, match_user_id: 2 }, { user_id: 1 })
  assert.notStrictEqual(reused.id, 44)
  assert.strictEqual(reused.status, STATUS.COLLECTING_INITIATOR)

  const manualDeps = memory({
    user: [
      Object.assign(eligibleUser(1), { account_mode: 'internal_qa' }),
      Object.assign(eligibleUser(2), {
        profile_origin: 'synthetic_fixture',
        is_test_fixture: 1,
        fixture_owner_user_id: 1,
        fixture_expires_at: '2099-01-01T00:00:00.000Z',
        fixture_journey: 'accept',
        fixture_mode: 'manual_step',
        ab_test_run_id: 'manual_run'
      })
    ],
    user_match_log: [{ id: 10, user_id: 1, match_user_id: 2 }],
    date_coordination: [{
      id: 70,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.COLLECTING_INITIATOR,
      coordination_version: 1,
      is_test_data: 1,
      synthetic_partner_journey: 'accept',
      synthetic_partner_mode: 'manual_step',
      application_deadline_at: new Date('2026-07-15T08:00:00.000Z')
    }]
  })
  const manualHandlers = createDateCoordinationHandlers(manualDeps)
  const afterInvite = await manualHandlers.saveApplication(Object.assign({ coordination_id: 70 }, app()), { user_id: 1 })
  assert.strictEqual(afterInvite.status, STATUS.INVITING_PARTNER)
  const advanced = await manualHandlers.advanceSynthetic({ coordination_id: 70 }, { user_id: 1 })
  assert.notStrictEqual(advanced.status, STATUS.INVITING_PARTNER)

  assert.strictEqual(nextStatus(STATUS.INVITING_PARTNER, 'accept_invitation'), STATUS.COLLECTING_PREFERENCES)
  assert.throws(() => nextStatus(STATUS.COLLECTING_PREFERENCES, 'accept_invitation'), /当前状态不能执行该协调操作/)

  console.log('PASS date coordination logic audit matrix')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
