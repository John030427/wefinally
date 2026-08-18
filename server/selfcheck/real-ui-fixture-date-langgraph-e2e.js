const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { STATUS } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { publicSafeDeclineMessage } = require('../../miniprogram/cloudfunctions/api/lib/syntheticPartnerJourney')
const { unreadCount } = require('../../miniprogram/cloudfunctions/api/lib/coordinationInbox')

/**
 * Deterministic real-UI + synthetic partner journey E2E.
 * This file keeps LANGGRAPH_ENABLED off (or unused). It is NOT a LangGraph runtime test.
 * Classification: Deterministic Coordination E2E.
 * True LangGraph provider assertions live in date-coordination-logic-audit.js and agent-chat.js.
 */

function futureDate(days) {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const SAT = futureDate(6)
const FRI = futureDate(5)

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

function memoryDb() {
  let nextId = 1000
  const tables = {
    user: [
      { id: 1, openid: 'qa_a', account_mode: 'internal_qa', profile_origin: 'real_user', member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', free_member: 1 },
      { id: 2, openid: 'b_accept', profile_origin: 'synthetic_fixture', is_test_fixture: 1, fixture_owner_user_id: 1, fixture_expires_at: '2099-01-01T00:00:00.000Z', fixture_journey: 'coordinate', member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', free_member: 1 },
      { id: 3, openid: 'b_reject', profile_origin: 'synthetic_fixture', is_test_fixture: 1, fixture_owner_user_id: 1, fixture_expires_at: '2099-01-01T00:00:00.000Z', fixture_journey: 'reject', member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', free_member: 1 }
    ],
    date_coordination: [],
    date_coordination_application: [],
    date_coordination_proposal: [],
    date_coordination_confirmation: [],
    date_application_patch: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    agent_notification_job: [],
    user_match_log: [
      { id: 5, user_id: 1, match_user_id: 2, match_type: '双向算法测试', match_date: '2026-08-17' },
      { id: 6, user_id: 1, match_user_id: 3, match_type: '双向算法测试', match_date: '2026-08-17' }
    ],
    coordination_notification: [],
    user_notification_cursor: [],
    fixture_response_job: []
  }
  const matches = (row, q) => Object.keys(q || {}).every((k) => (Array.isArray(q[k]) ? q[k].includes(row[k]) : row[k] === q[k]))
  const db = { tables, now: () => new Date() }
  db.first = async (name, q) => (tables[name] || []).find((row) => matches(row, q)) || null
  db.list = async (name, q, limit) => (tables[name] || []).filter((row) => matches(row, q)).slice(0, Number(limit) || 100)
  db.byId = async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null
  db.addWithId = async (name, data, prefix) => {
    const row = Object.assign({ id: ++nextId, _id: (prefix || name) + '_' + nextId, create_time: db.now(), update_time: db.now() }, data)
    if (!tables[name]) tables[name] = []
    tables[name].push(row)
    return row
  }
  db.updateByDoc = async (name, row, data) => {
    const updated = Object.assign({}, row, data, { update_time: db.now() })
    const idx = (tables[name] || []).indexOf(row)
    if (idx >= 0) tables[name][idx] = updated
    else {
      const byId = (tables[name] || []).findIndex((item) => Number(item.id) === Number(row.id))
      if (byId >= 0) tables[name][byId] = updated
    }
    return updated
  }
  db.claimPendingPatch = async (patch) => {
    const current = (tables.date_application_patch || []).find((r) => Number(r.id) === Number(patch.id))
    if (!current || current.status !== 'pending_confirmation') return false
    current.status = 'applying'
    return true
  }
  db.commitConfirmation = async (coordination, proposal, input) => {
    const userId = Number(input.user_id)
    const docId = 'date-confirmation-' + coordination.id + '-' + userId + '-v' + coordination.coordination_version
    if (coordination.status === STATUS.ARRANGED) {
      const existing = (tables.date_coordination_confirmation || []).find((r) => r._id === docId)
      if (existing && existing.decision === 'confirm' && Number(existing.proposal_id) === Number(proposal.id)) {
        return { coordination, confirmation: existing, arranged: true, idempotent: true }
      }
      throw new Error('当前状态不能确认约会方案')
    }
    if (coordination.status !== STATUS.WAITING_CONFIRMATIONS) throw new Error('当前状态不能确认约会方案')
    const confirmation = await db.addWithId('date_coordination_confirmation', {
      _id: docId, coordination_id: coordination.id, user_id: userId,
      proposal_id: Number(proposal.id), coordination_version: coordination.coordination_version,
      decision: 'confirm', status: 'active'
    }, 'date_coordination_confirmation')
    const ids = [
      'date-confirmation-' + coordination.id + '-' + coordination.user_a_id + '-v' + coordination.coordination_version,
      'date-confirmation-' + coordination.id + '-' + coordination.user_b_id + '-v' + coordination.coordination_version
    ]
    const arranged = ids.every((d) => {
      const item = (tables.date_coordination_confirmation || []).find((r) => r._id === d)
      return item && item.status !== 'superseded' && item.decision === 'confirm'
        && Number(item.proposal_id) === Number(proposal.id)
        && Number(item.coordination_version) === Number(coordination.coordination_version)
    })
    const updated = arranged
      ? await db.updateByDoc('date_coordination', coordination, {
        status: STATUS.ARRANGED, business_state: 'completed', final_proposal_id: Number(proposal.id)
      })
      : coordination
    return { coordination: updated, confirmation, arranged, idempotent: false }
  }
  return db
}

function chain(messages) {
  let index = 0
  return {
    next() {
      const value = messages[Math.min(index, messages.length - 1)]
      index += 1
      return value
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  const matchDetail = fs.readFileSync(path.join(root, 'miniprogram/pages/match-detail/match-detail.wxml'), 'utf8')
  const dateView = fs.readFileSync(path.join(root, 'miniprogram/pages/date-coordination/date-coordination.wxml'), 'utf8')
  const dateJs = fs.readFileSync(path.join(root, 'miniprogram/pages/date-coordination/date-coordination.js'), 'utf8')
  const matchListJs = fs.readFileSync(path.join(root, 'miniprogram/pages/match-list/match-list.js'), 'utf8')
  assert(!matchDetail.includes('虚拟体验对象'), 'Match Detail must not use virtual-experience CTA card')
  assert(matchDetail.includes('测试数据'))
  assert(dateView.includes('和 AI 约会协调员沟通'))
  assert(dateView.includes('对方暂未接受本次约会邀请'))
  assert(dateView.includes('约会邀请已发送'))
  assert(dateJs.includes('agentType=date_coordinator&coordinationId='))
  assert(dateJs.includes('can_open_coordinator_chat'))
  assert(matchListJs.includes('refreshNotificationBadge'))

  const db = memoryDb()
  const currentUser = async (wx) => Promise.resolve(db.tables.user[wx.userIndex != null ? wx.userIndex : 0])
  const publishEvent = async (input) => {
    const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
    return publishCoordinationEvent(input, { first: db.first, addWithId: db.addWithId, now: db.now })
  }
  const writeInbox = async (input) => {
    const { notifyInbox } = require('../../miniprogram/cloudfunctions/api/lib/coordinationInbox')
    const { notifyConfig } = require('../../miniprogram/cloudfunctions/api/lib/coordinationNotification')
    return notifyInbox(input, {
      first: db.first, addWithId: db.addWithId, updateByDoc: db.updateByDoc, now: db.now,
      config: notifyConfig(process.env), sendSubscribeMessage: null
    })
  }

  const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
  const { createDateApplicationPatchHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
  const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')

  const coordination = createDateCoordinationHandlers({
    currentUser, first: db.first, list: db.list, byId: db.byId, addWithId: db.addWithId, updateByDoc: db.updateByDoc,
    commitConfirmation: db.commitConfirmation, publishCoordinationEvent: publishEvent, writeInboxNotification: writeInbox, now: db.now
  })
  const patches = createDateApplicationPatchHandlers({
    currentUser, first: db.first, list: db.list, byId: db.byId, addWithId: db.addWithId, updateByDoc: db.updateByDoc,
    claimPendingPatch: db.claimPendingPatch, now: db.now, publishCoordinationEvent: publishEvent,
    writeInboxNotification: writeInbox, saveApplicationForUser: coordination.saveApplicationForUser
  })
  const agent = createAgentHandlers({
    currentUser, first: db.first, list: db.list, byId: db.byId, addWithId: db.addWithId, updateByDoc: db.updateByDoc,
    claimPendingPatch: db.claimPendingPatch, now: db.now,
    env: Object.assign({}, process.env, { LANGGRAPH_ENABLED: 'false' }),
    generateDecision: chain([{
      intent: 'modify_date_application',
      toolRequest: { tool: 'create_date_application_patch', arguments: { availability: [{ date: FRI, periods: ['evening'] }, { date: SAT, periods: ['afternoon'] }] } },
      provider: 'scripted', fallback: false
    }, {
      intent: 'modify_date_application',
      toolRequest: { tool: 'create_date_application_patch', arguments: { areas: ['车公庙'] } },
      provider: 'scripted', fallback: false
    }]).next
  })

  const runWorker = async () => {
    const { processCoordinationTasks } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationWorker')
    await processCoordinationTasks({
      now: db.now(),
      deps: {
        listTasks: async () => db.tables.date_coordination.filter((r) => r.status === STATUS.COMPUTING_OVERLAP && r.processing_status === 'queued'),
        claimTask: async (task) => db.updateByDoc('date_coordination', task, { processing_status: 'processing', processing_token: 'tok', business_state: 'processing' }),
        listApplications: async (coordId, version) => db.tables.date_coordination_application.filter((r) => Number(r.coordination_id) === Number(coordId) && Number(r.coordination_version) === Number(version)),
        completeTask: async (claim, overlap) => {
          const proposals = []
          for (const proposal of overlap.proposals || []) {
            proposals.push(await db.addWithId('date_coordination_proposal', Object.assign({}, proposal, {
              coordination_id: Number(claim.id), status: 'active', coordination_version: Number(claim.coordination_version || 1)
            }), 'date_coordination_proposal'))
          }
          const hasProposals = proposals.length > 0
          const updated = await db.updateByDoc('date_coordination', claim, {
            status: hasProposals ? STATUS.WAITING_CONFIRMATIONS : STATUS.NO_OVERLAP,
            business_state: hasProposals ? 'proposal_generated' : 'waiting_partner',
            processing_status: '', processing_token: '',
            missing_dimensions: hasProposals ? [] : (overlap.missing_dimensions || []),
            confirmation_deadline_at: hasProposals ? new Date(Date.now() + 86400000) : null
          })
          return { applied: true, reason: '', coordination: updated, proposals }
        },
        failTask: async (claim, code) => db.updateByDoc('date_coordination', claim, { processing_status: 'failed', processing_error_code: code }),
        publishCoordinationEvent: publishEvent,
        writeInboxNotification: writeInbox,
        now: db.now()
      }
    })
  }

  // ===== ACCEPT: real create (not queue simulation) =====
  const created = await coordination.create({ match_log_id: 5, match_user_id: 2 }, { userIndex: 0 })
  assert.ok(created.id, 'must mint real coordination_id')
  assert.strictEqual(created.test_simulation, undefined)
  assert.strictEqual(created.is_test_data, true)
  assert.strictEqual(created.test_data_badge, '测试 · AI协调')
  assert.strictEqual(created.status, STATUS.COLLECTING_INITIATOR)
  assert.strictEqual(created.synthetic_partner_journey, 'coordinate')
  const cid = Number(created.id)

  const afterInvite = await coordination.saveApplication({ coordination_id: cid, ...app() }, { userIndex: 0 })
  // Synthetic B accept + prefs via real services
  assert.notStrictEqual(afterInvite.status, STATUS.INVITING_PARTNER)
  assert.notStrictEqual(afterInvite.status, STATUS.INVITATION_DECLINED)
  assert.ok([STATUS.COLLECTING_PREFERENCES, STATUS.COMPUTING_OVERLAP, STATUS.NO_OVERLAP, STATUS.WAITING_CONFIRMATIONS].includes(afterInvite.status)
    || db.tables.date_coordination.find((r) => Number(r.id) === cid).status !== STATUS.INVITING_PARTNER)

  let live = db.tables.date_coordination.find((r) => Number(r.id) === cid)
  if (live.status === STATUS.COLLECTING_PREFERENCES) {
    await coordination.saveApplication({
      coordination_id: cid,
      ...app({ availability: [{ date: SAT, periods: ['afternoon'] }], areas: ['福田'], budget: '50-100' })
    }, { userIndex: 1 })
    live = db.tables.date_coordination.find((r) => Number(r.id) === cid)
  }
  if (live.status === STATUS.COMPUTING_OVERLAP) {
    await runWorker()
    live = db.tables.date_coordination.find((r) => Number(r.id) === cid)
  }
  assert.strictEqual(live.status, STATUS.NO_OVERLAP, 'Fri evening vs Sat afternoon => NO_OVERLAP')

  // NL patch preview then confirm
  const session = await agent.createSession({ agent_type: 'date_coordinator', coordination_id: cid }, { userIndex: 0 })
  const resumed = await agent.createSession({ agent_type: 'date_coordinator', coordination_id: cid }, { userIndex: 0 })
  assert.strictEqual(Number(resumed.id), Number(session.id), 'same coordinationId must resume the same thread')
  const first = await agent.send({ session_id: session.id, message: '周六下午也可以' }, { userIndex: 0 })
  assert.ok(first.patch_preview, 'NL must produce patch preview')
  assert.strictEqual(first.patch_preview.status, 'pending_confirmation')
  assert.strictEqual(db.tables.date_coordination.find((r) => Number(r.id) === cid).coordination_version, 1, 'no write before confirm')
  await agent.send({ session_id: session.id, message: '确认修改' }, { userIndex: 0 })
  assert.ok(db.tables.date_coordination.find((r) => Number(r.id) === cid).coordination_version >= 2)

  await runWorker()
  live = db.tables.date_coordination.find((r) => Number(r.id) === cid)
  assert.strictEqual(live.status, STATUS.NO_OVERLAP, 'time overlap but area still conflicts')

  const second = await agent.send({ session_id: session.id, message: '区域也可以换成车公庙' }, { userIndex: 0 })
  assert.ok(second.patch_preview)
  await patches.confirmForUser({ coordination_id: cid, patch_id: second.patch_preview.id }, db.tables.user[0])
  live = db.tables.date_coordination.find((r) => Number(r.id) === cid)
  if (live.status === STATUS.COMPUTING_OVERLAP) await runWorker()
  await coordination.detail({ id: cid, coordination_id: cid }, { userIndex: 0 })
  live = db.tables.date_coordination.find((r) => Number(r.id) === cid)
  if (live.status === STATUS.COMPUTING_OVERLAP) await runWorker()
  live = db.tables.date_coordination.find((r) => Number(r.id) === cid)
  assert.strictEqual(live.status, STATUS.WAITING_CONFIRMATIONS)
  const proposals = db.tables.date_coordination_proposal.filter((r) => r.status === 'active' && Number(r.coordination_id) === cid)
  assert.ok(proposals.length >= 1)

  const detailA = await coordination.detail({ id: cid, coordination_id: cid }, { userIndex: 0 })
  const proposalId = detailA.proposals[0].id
  const afterA = await coordination.confirmProposal({
    coordination_id: cid, proposal_id: proposalId, coordination_version: Number(live.coordination_version), decision: 'confirm'
  }, { userIndex: 0 })
  assert.notStrictEqual(afterA.status, STATUS.ARRANGED, 'A alone cannot arrange')
  assert.strictEqual(afterA.confirmed_by_me, true)
  const afterRefresh = await coordination.detail({ id: cid, coordination_id: cid }, { userIndex: 0 })
  assert.strictEqual(afterRefresh.status, STATUS.ARRANGED, 'synthetic B confirm on detail refresh arranges')

  // Privacy: B never sees A raw NL
  const partnerBlob = JSON.stringify(db.tables.coordination_notification.filter((r) => Number(r.user_id) === 2))
  assert.strictEqual(partnerBlob.includes('周六下午也可以'), false)

  // ===== REJECT =====
  const rejected = await coordination.create({ match_log_id: 6, match_user_id: 3 }, { userIndex: 0 })
  assert.ok(rejected.id)
  assert.strictEqual(rejected.synthetic_partner_journey, 'decline')
  const declined = await coordination.saveApplication({ coordination_id: rejected.id, ...app() }, { userIndex: 0 })
  assert.strictEqual(declined.status, STATUS.INVITATION_DECLINED)
  assert.strictEqual(declined.declined_public_message, publicSafeDeclineMessage())
  assert.ok(!declined.declined_public_message.includes('不喜欢'))
  const unread = await unreadCount({ first: db.first, list: db.list, now: db.now }, 1)
  assert.ok(unread >= 1, 'reject must bump unread for Records tab')
  await assert.rejects(
    () => coordination.saveApplication({ coordination_id: rejected.id, ...app() }, { userIndex: 0 }),
    /当前状态不能提交日期申请/
  )
  const declinedSession = await agent.createSession({ agent_type: 'date_coordinator', coordination_id: rejected.id }, { userIndex: 0 })
  assert.strictEqual(declinedSession.coordinator_read_only, true)
  assert.ok(String(declinedSession.coordinator_welcome).includes('对方暂未接受'))
  const declinedReply = await agent.send({ session_id: declinedSession.id, message: '改成周日吧' }, { userIndex: 0 })
  assert.strictEqual(declinedReply.read_only, true)
  assert.ok(!declinedReply.patch_preview)
  assert.ok(String(declinedReply.reply).includes('对方暂未接受'))

  const profileJs = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.js'), 'utf8')
  assert(profileJs.includes('AI 对你的理解'))
  assert(profileJs.includes('focus=ai-profile'))

  console.log('PASS real-ui fixture ACCEPT/REJECT LangGraph date E2E')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
