const assert = require('assert')
const { STATUS } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { computeOverlap } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')

/**
 * Deterministic bilateral coordination E2E (in-memory):
 * NL patch -> preview -> confirm -> version+1 -> recompute -> safe partner event
 * -> area continuation -> proposal -> two-party confirmation -> arranged,
 * plus concurrent A/B updates and a stale-notification guard.
 * The model response is scripted at the Graph boundary; preview creation, CAS commit
 * and projections use the real agent handler runtime.
 */

// ------------------------------------------------------------------ harness
function futureDate(days) {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const SAT = futureDate(6)
const OFF = futureDate(7)
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

function scriptedDateGraph(name, payload) {
  assert.strictEqual(name, 'agent-graph')
  const base = {
    threadId: payload.threadId,
    pendingAction: null,
    coordinationVersion: Number(payload.coordinationVersion || 1)
  }
  if (payload.operation === 'resume_tool') {
    const result = payload.toolResult || {}
    const data = result.data || {}
    if (result.ok === true && data.status === 'pending_confirmation' && Number(data.patchId || 0) > 0) {
      const patchId = Number(data.patchId)
      const version = Number(data.coordinationVersion || payload.coordinationVersion || 1)
      return {
        result: {
          success: true,
          data: Object.assign({}, base, {
            status: 'awaiting_confirmation',
            phase: 'awaiting_confirmation',
            replyDraft: '修改预览已经生成，确认后才会写入协调状态。',
            coordinationVersion: version,
            pendingPreview: {
              patchId,
              baseVersion: Number(payload.coordinationVersion || 1),
              candidatePlan: payload.canonicalState && payload.canonicalState.current_plan || {},
              candidateChanges: {},
              contextRef: {
                type: 'patch_preview',
                coordination_id: Number(payload.coordinationId),
                coordination_version: Number(payload.coordinationVersion || 1),
                patch_id: patchId
              }
            }
          })
        }
      }
    }
    return { result: { success: true, data: Object.assign({}, base, { status: 'completed', phase: 'completed', replyDraft: '协调事实已更新。' }) } }
  }
  if (payload.userText === '确认修改' && payload.pendingPreview) {
    return {
      result: {
        success: true,
        data: Object.assign({}, base, {
          status: 'awaiting_tool',
          phase: 'awaiting_tool',
          replyDraft: '正在提交你确认的修改。',
          pendingAction: {
            type: 'confirm_date_application_patch',
            arguments: {
              coordinationId: Number(payload.coordinationId),
              coordinationVersion: Number(payload.coordinationVersion),
              patchId: Number(payload.pendingPreview.patchId),
              contextRef: payload.pendingPreview.contextRef
            },
            requiresConfirmation: false
          }
        })
      }
    }
  }
  const changes = payload.userText === '周六下午也可以'
    ? { date: SAT, period: 'afternoon' }
    : (payload.userText === '区域也可以换成车公庙' ? { area: '车公庙' } : null)
  if (changes) {
    return {
      result: {
        success: true,
        data: Object.assign({}, base, {
          status: 'awaiting_tool',
          phase: 'awaiting_tool',
          replyDraft: '我整理了一份修改预览，请确认后再生效。',
          pendingAction: {
            type: 'create_date_application_patch',
            arguments: {
              coordinationId: Number(payload.coordinationId),
              coordinationVersion: Number(payload.coordinationVersion),
              changes,
              preserve: []
            },
            requiresConfirmation: true
          }
        })
      }
    }
  }
  return { result: { success: true, data: Object.assign({}, base, { status: 'completed', phase: 'completed', replyDraft: '当前协调状态已重新加载。' }) } }
}

function memoryDb(seedCoordination) {
  let nextId = 1000
  const tables = {
    user: [{ id: 1, member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', free_member: 0 },
             { id: 2, member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', free_member: 0 },
             { id: 3, member_status: 'approved', is_vip: 1, vip_expire_time: '2099-01-01T00:00:00.000Z', free_member: 0 }],
    date_coordination: seedCoordination ? [seedCoordination] : [],
    date_coordination_application: [],
    date_coordination_proposal: [],
    date_coordination_confirmation: [],
    date_application_patch: [],
    date_coordination_event: [],
    agent_session: [],
    agent_message: [],
    agent_notification_job: [],
    user_match_log: [{ id: 5, user_id: 1, match_user_id: 2, match_type: '双向算法测试', match_date: '2026-08-14' }],
    coordination_notification: [],
    user_notification_cursor: []
  }
  const matches = (row, q) => Object.keys(q || {}).every((k) => (Array.isArray(q[k]) ? q[k].includes(row[k]) : row[k] === q[k]))
  const db = {
    tables,
    reset() { for (const k of Object.keys(tables)) tables[k].length = 0; nextId = 1000 },
    now: () => new Date()
  }
  db.first = async (name, q) => (tables[name] || []).find((row) => matches(row, q)) || null
  db.list = async (name, q, limit) => (tables[name] || []).filter((row) => matches(row, q)).slice(0, Number(limit) || 100)
  db.byId = async (name, id) => (tables[name] || []).find((row) => Number(row.id) === Number(id)) || null
  db.addWithId = async (name, data, prefix) => {
    const row = Object.assign({ id: ++nextId, _id: (prefix || name) + '_' + (nextId + 1), create_time: db.now(), update_time: db.now() }, data)
    if (!row._id) row._id = (prefix || name) + '_' + row.id
    if (!tables[name]) tables[name] = []
    tables[name].push(row)
    return row
  }
  db.updateByDoc = async (name, row, data) => {
    const updated = Object.assign({}, row, data, { update_time: db.now() })
    const idx = (tables[name] || []).indexOf(row)
    if (idx >= 0) tables[name][idx] = updated
    return updated
  }
  db.claimPendingPatch = async (patch) => {
    const current = (tables.date_application_patch || []).find((r) => Number(r.id) === Number(patch.id))
    if (!current || current.status !== 'pending_confirmation') return false
    current.status = 'applying'
    return true
  }
  // confirmation transaction (mirrors db.commitCoordinationConfirmation)
  db.commitConfirmation = async (coordination, proposal, input, timestamp) => {
    const userId = Number(input.user_id)
    const docId = (pid) => 'date-confirmation-' + coordination.id + '-' + pid + '-v' + coordination.coordination_version
    if (coordination.status === STATUS.ARRANGED) {
      const existing = (tables.date_coordination_confirmation || []).find((r) => r._id === docId(userId))
      if (existing && existing.decision === 'confirm' && Number(existing.proposal_id) === Number(proposal.id) && Number(coordination.final_proposal_id) === Number(proposal.id)) {
        return { coordination, confirmation: existing, arranged: true, idempotent: true }
      }
      throw new Error('当前状态不能确认约会方案')
    }
    if (coordination.status !== STATUS.WAITING_CONFIRMATIONS) throw new Error('当前状态不能确认约会方案')
    const existing = (tables.date_coordination_confirmation || []).find((r) => r._id === docId(userId))
    const confirmation = await db.addWithId('date_coordination_confirmation', {
      _id: docId(userId), coordination_id: coordination.id, user_id: userId,
      proposal_id: Number(proposal.id), coordination_version: coordination.coordination_version,
      decision: 'confirm', status: 'active'
    }, 'date_coordination_confirmation')
    if (existing) Object.assign(confirmation, existing)
    const arr = [docId(Number(coordination.user_a_id)), docId(Number(coordination.user_b_id))].map((d) => (tables.date_coordination_confirmation || []).find((r) => r._id === d))
    const arranged = arr.every((item) => item && item.status !== 'superseded' && item.decision === 'confirm' && Number(item.proposal_id) === Number(proposal.id) && Number(item.coordination_version) === Number(coordination.coordination_version))
    const updated = arranged
      ? await db.updateByDoc('date_coordination', coordination, { status: STATUS.ARRANGED, business_state: 'completed', final_proposal_id: Number(proposal.id) })
      : coordination
    return { coordination: updated, confirmation, arranged, idempotent: false }
  }
  return db
}

function coordinationRow({ id = 50, status = STATUS.COLLECTING_INITIATOR, version = 1, recoordination = 0 } = {}) {
  return {
    _id: 'date_coordination_' + id, id, pair_key: '1:2', user_a_id: 1, user_b_id: 2,
    status, business_state: 'created', coordination_version: version, recoordination_count: recoordination,
    invitation_deadline_at: null, application_deadline_at: null, confirmation_deadline_at: null,
    final_proposal_id: 0, processing_status: '', processing_version: 0, processing_token: '', missing_dimensions: []
  }
}

async function main() {
  const db = memoryDb(coordinationRow({ id: 50, status: STATUS.COLLECTING_INITIATOR }))
  const now = () => db.now()
  const currentUser = async (wx) => Promise.resolve(db.tables.user[wx.userIndex != null ? wx.userIndex : 0])
  const publishEvent = async (input) => {
    const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
    return publishCoordinationEvent(input, { first: db.first, addWithId: db.addWithId, now })
  }
  const inboxDeps = {
    first: db.first, addWithId: db.addWithId, updateByDoc: db.updateByDoc, now,
    config: require('../../miniprogram/cloudfunctions/api/lib/coordinationNotification').notifyConfig(process.env),
    sendSubscribeMessage: null
  }
  const writeInbox = async (input) => require('../../miniprogram/cloudfunctions/api/lib/coordinationInbox').notifyInbox(input, inboxDeps)

  const coordinationDeps = {
    currentUser, first: db.first, list: db.list, byId: db.byId, addWithId: db.addWithId, updateByDoc: db.updateByDoc,
    acquireFixtureResponseJob: async () => { throw new Error('not used') },
    upsertConfirmation: null, updateConfirmationState: null,
    commitConfirmation: db.commitConfirmation,
    expireIfCurrent: async () => false,
    publishCoordinationEvent: publishEvent,
    writeInboxNotification: writeInbox,
    now
  }
  const { createDateCoordinationHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordination')
  const { createDateApplicationPatchHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/dateApplicationPatch')
  const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')
  const coordination = createDateCoordinationHandlers(coordinationDeps)
  const patches = createDateApplicationPatchHandlers({
    currentUser, first: db.first, list: db.list, byId: db.byId, addWithId: db.addWithId, updateByDoc: db.updateByDoc,
    claimPendingPatch: db.claimPendingPatch, now,
    publishCoordinationEvent: publishEvent,
    writeInboxNotification: writeInbox,
    saveApplicationForUser: coordination.saveApplicationForUser
  })
  const agent = createAgentHandlers({
    currentUser, first: db.first, list: db.list, byId: db.byId, addWithId: db.addWithId, updateByDoc: db.updateByDoc,
    claimPendingPatch: db.claimPendingPatch, now,
    env: Object.assign({}, process.env, { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'phase-c-secret' }),
    invokeGraphFunction: scriptedDateGraph
  })

  // worker bridge
  const runWorker = async () => {
    const { processCoordinationTasks } = require('../../miniprogram/cloudfunctions/api/handlers/dateCoordinationWorker')
    let lastUpdated = null
    const result = await processCoordinationTasks({ now: now(), deps: {
      listTasks: async () => db.tables.date_coordination.filter((r) => r.status === STATUS.COMPUTING_OVERLAP && r.processing_status === 'queued'),
      claimTask: async (task) => {
        const updated = await db.updateByDoc('date_coordination', task, { processing_status: 'processing', processing_token: 'tok', business_state: 'processing' })
        return updated
      },
      listApplications: async (coordId, version) => db.tables.date_coordination_application.filter((r) => Number(r.coordination_id) === Number(coordId) && Number(r.coordination_version) === Number(version)),
      completeTask: async (claim, overlap, ts) => {
        const proposals = []
        for (const proposal of overlap.proposals || []) {
          proposals.push(await db.addWithId('date_coordination_proposal', Object.assign({}, proposal, { coordination_id: Number(claim.id), status: 'active' }), 'date_coordination_proposal'))
        }
        const hasProposals = proposals.length > 0
        lastUpdated = await db.updateByDoc('date_coordination', claim, {
          status: hasProposals ? STATUS.WAITING_CONFIRMATIONS : STATUS.NO_OVERLAP,
          business_state: hasProposals ? 'proposal_generated' : 'waiting_partner',
          processing_status: '', processing_token: '', processing_error_code: '',
          missing_dimensions: hasProposals ? [] : (overlap.missing_dimensions || []),
          confirmation_deadline_at: hasProposals ? new Date(Date.now() + 24 * 3600 * 1000) : null
        })
        return { applied: true, reason: '', coordination: lastUpdated, proposals }
      },
      failTask: async (claim, code) => db.updateByDoc('date_coordination', claim, { processing_status: 'failed', processing_error_code: code }),
      publishCoordinationEvent: publishEvent,
      writeInboxNotification: writeInbox,
      now: now()
    } })
    return { result, lastUpdated }
  }

  // ======== Scenario: A initial 周五晚 / B 周六下午 ========
  await coordination.create({ match_user_id: 2 }, { userIndex: 0 })
  await coordination.saveApplication({ coordination_id: 50, ...app() }, { userIndex: 0 })
  assert.strictEqual(db.tables.date_coordination[0].status, STATUS.INVITING_PARTNER, 'initiator submit invites partner')
  assert.strictEqual(db.tables.user_notification_cursor.length, 1, 'invitee got inbox cursor')
  await coordination.respondInvitation({
    coordination_id: 50,
    decision: 'coordinate',
    invitation_version: Number(db.tables.date_coordination[0].invitation_version || 1)
  }, { userIndex: 1 })
  assert.strictEqual(db.tables.date_coordination[0].status, STATUS.COLLECTING_PREFERENCES)
  await coordination.saveApplication({ coordination_id: 50, ...app({ availability: [{ date: SAT, periods: ['afternoon'] }], areas: ['福田', '车公庙'] }) }, { userIndex: 1 })
  assert.strictEqual(db.tables.date_coordination[0].status, STATUS.COMPUTING_OVERLAP)
  assert.strictEqual(db.tables.date_coordination[0].processing_status, 'queued')
  await runWorker()
  assert.strictEqual(db.tables.date_coordination[0].status, STATUS.NO_OVERLAP, '周五晚 vs 周六下午 => NO_OVERLAP')

  // ======== A: NL 周六下午也可以 -> preview -> confirm ========
  const session = await agent.createSession({ agent_type: 'date_coordinator', coordination_id: 50 }, { userIndex: 0 })
  const first = await agent.send({ session_id: session.id, message: '周六下午也可以' }, { userIndex: 0 })
  assert.ok(first.pending_preview, 'A got a pending patch preview from Graph')
  assert.ok(first.pending_preview.patchId > 0)
  assert.strictEqual(first.pending_preview.baseVersion, 1)
  assert.strictEqual(db.tables.date_coordination[0].coordination_version, 1, 'nothing written before confirm')
  assert.strictEqual(db.tables.coordination_notification.filter((r) => r.event_type !== 'invitation_created' && r.event_type !== 'invitation_accepted').length, 0, 'no partner notify before confirm')
  const confirmReply = await agent.send({ session_id: session.id, message: '确认修改' }, { userIndex: 0 })
  assert.strictEqual(confirmReply.provider, 'langgraph', 'patch applied via Graph confirm command')
  assert.strictEqual(String(confirmReply.reply).includes('协调事实已更新'), true, 'patch applied via agent confirm')
  assert.strictEqual(db.tables.date_coordination[0].coordination_version, 2, 'coordination version bumped after confirm')
  assert.strictEqual(db.tables.date_coordination[0].status, STATUS.COMPUTING_OVERLAP)
  const partnerRelay = db.tables.agent_message.find((row) => Number(row.user_id) === 2 && row.event_type === 'preference_changed' && Number(row.coordination_version) === 2)
  assert.ok(partnerRelay, 'partner must receive an assistant relay for the committed patch')
  assert.ok(String(partnerRelay.content).includes('时间'), 'partner relay must name the changed dimension')
  const committedEvent = db.tables.date_coordination_event.find((row) => row.event_type === 'preference_changed' && Number(row.coordination_version) === 2)
  assert.ok(committedEvent, 'committed patch must have one canonical coordination event')
  assert.strictEqual(Number(committedEvent.safe_payload.patch_id), Number(first.pending_preview.patchId))
  assert.deepStrictEqual(committedEvent.safe_payload.changed_dimensions, ['time'])
  assert.strictEqual(Object.prototype.hasOwnProperty.call(committedEvent.safe_payload, 'activity'), false, 'event payload must keep plan truth in DB')
  const aAppV2 = db.tables.date_coordination_application.filter((r) => r.user_id === 1 && r.coordination_version === 2)[0].application
  assert.ok(JSON.stringify(aAppV2).includes(SAT), 'A updated availability persisted')
  const aRowV2 = db.tables.date_coordination_application.filter((r) => r.user_id === 1 && r.coordination_version === 2)[0]
  assert.strictEqual(aRowV2.preference_version, 2, 'A preference version +1 after patch confirm')
  const bRowV2 = db.tables.date_coordination_application.filter((r) => r.user_id === 2 && r.coordination_version === 2)[0]
  assert.strictEqual(bRowV2.preference_version, 1, 'partner snapshot keeps its own preference version')

  await runWorker()
  assert.strictEqual(db.tables.date_coordination[0].status, STATUS.NO_OVERLAP, 'time aligned, area still 南山 vs 福田/车公庙 => area conflict keeps coordinating')

  // ======== A: 区域改成车公庙 ========
  const second = await agent.send({ session_id: session.id, message: '区域也可以换成车公庙' }, { userIndex: 0 })
  assert.ok(second.pending_preview, 'area patch preview created')
  await patches.confirmForUser({ coordination_id: 50, patch_id: second.pending_preview.patchId }, db.tables.user[0])
  assert.strictEqual(db.tables.date_coordination[0].coordination_version, 3)
  await runWorker()
  assert.strictEqual(db.tables.date_coordination[0].status, STATUS.WAITING_CONFIRMATIONS, 'all dimensions aligned => proposal ready')
  const proposals = db.tables.date_coordination_proposal.filter((r) => r.status === 'active')
  assert.ok(proposals.length >= 1, 'proposal generated')
  assert.strictEqual(proposals[0].area, '车公庙')

  // two-party confirmation
  const detailA = await coordination.detail({ id: 50, coordination_id: 50 }, { userIndex: 0 })
  const proposalId = detailA.proposals[0].id
  const afterA = await coordination.confirmProposal({ coordination_id: 50, proposal_id: proposalId, coordination_version: 3, decision: 'confirm' }, { userIndex: 0 })
  assert.notStrictEqual(afterA.status, STATUS.ARRANGED, 'A alone cannot arrange')
  const partnerSession = await agent.createSession({ agent_type: 'date_coordinator', coordination_id: 50 }, { userIndex: 1 })
  const partnerHistory = await agent.messages({ id: partnerSession.id }, { userIndex: 1 })
  assert.ok(partnerHistory.messages.some((row) => row.event_card && row.event_card.patch_id === Number(first.pending_preview.patchId)), 'B AI session must expose the committed patch event card')
  const afterB = await coordination.confirmProposal({ coordination_id: 50, proposal_id: proposalId, coordination_version: 3, decision: 'confirm' }, { userIndex: 1 })
  assert.strictEqual(afterB.status, STATUS.ARRANGED, 'B confirm => arranged')
  assert.strictEqual(db.tables.date_coordination[0].final_proposal_id, Number(proposalId))
  assert.ok(db.tables.agent_message.some((row) => Number(row.user_id) === 1 && row.event_type === 'proposal_confirmed' && String(row.content).includes('对方已确认')), 'A AI session must receive B confirmation')

  // ======== B: counter proposal is projected back to A ========
  const counterCoordination = coordinationRow({ id: 60, status: STATUS.WAITING_CONFIRMATIONS, version: 3 })
  db.tables.date_coordination.push(counterCoordination)
  db.tables.date_coordination_application.push(
    { id: 601, coordination_id: 60, user_id: 1, coordination_version: 3, application: app({ activities: ['吃饭'] }) },
    { id: 602, coordination_id: 60, user_id: 2, coordination_version: 3, application: app({ activities: ['吃饭'] }) }
  )
  const counterPreview = await patches.createPreviewForUser({
    coordination_id: 60,
    changes: { activities: ['看展'] }
  }, db.tables.user[1])
  const counterApplied = await patches.confirmForUser({ coordination_id: 60, patch_id: counterPreview.id }, db.tables.user[1])
  assert.strictEqual(counterApplied.coordination_version, 4, 'B counter confirmation must create a new canonical version')
  const counterRelay = db.tables.agent_message.find((row) => Number(row.user_id) === 1 && Number(row.coordination_id) === 60 && row.event_type === 'preference_changed')
  assert.ok(counterRelay && String(counterRelay.content).includes('看展'), 'A AI must receive the concrete B counter relay')
  assert.strictEqual(String(counterRelay.content).includes('吃饭'), false, 'counter relay must not copy the old private source text')

  // ======== privacy ========
  const bMessages = db.tables.agent_message.filter((r) => r.user_id === 2)
  const bText = JSON.stringify(bMessages.map((r) => r.content)) + JSON.stringify(db.tables.coordination_notification.map((r) => ({ body: r.body, payload: r.payload_json })))
  assert.strictEqual(bText.includes('周六下午也可以'), false, 'partner never sees A raw message')
  assert.strictEqual(bText.includes('南山'), false, 'partner never sees A raw area')
  const detailB = await coordination.detail({ id: 50, coordination_id: 50 }, { userIndex: 1 })
  assert.strictEqual(JSON.stringify(detailB.my_application).includes(FRI), false, 'B detail does not expose A availability')
  assert.ok(detailB.participant_progress.length === 2)
  assert.ok(db.tables.coordination_notification.some((r) => r.user_id === 2 && r.event_type === 'preference_changed'), 'B got in-app preference notification')
  assert.ok(db.tables.coordination_notification.some((r) => r.user_id === 2 && r.event_type === 'proposal_generated'))

  db.tables.user_match_log.push({ id: 6, user_id: 1, match_user_id: 3, match_type: '双向算法测试', match_date: '2026-08-14' })
  await coordination.create({ match_user_id: 3 }, { userIndex: 0 })

  const coord2 = db.tables.date_coordination.find((r) => Number(r.user_a_id) === 1 && Number(r.user_b_id) === 3)
  const cid = Number(coord2.id)
  // 双方先各自提交第一版偏好（v1）
  await coordination.saveApplication({ coordination_id: cid, ...app({ availability: [{ date: FRI, periods: ['afternoon'] }] }) }, { userIndex: 0 })
  await coordination.respondInvitation({
    coordination_id: cid,
    decision: 'coordinate',
    invitation_version: Number((db.tables.date_coordination.find((r) => Number(r.id) === cid) || {}).invitation_version || 1)
  }, { userIndex: 2 })
  await coordination.saveApplication({ coordination_id: cid, ...app({ availability: [{ date: SAT, periods: ['evening'] }], areas: ['车公庙'] }) }, { userIndex: 2 })
  assert.strictEqual(db.tables.date_coordination.find((r) => Number(r.id) === cid).status, STATUS.COMPUTING_OVERLAP)
  // A 在同一版本上先创建“周六下午”的修改预览；B 创建“周五下午”的修改预览（并发意图）
  const aPreview = await patches.createPreviewForUser({
    coordination_id: cid,
    changes: { availability: [{ date: FRI, periods: ['afternoon'] }, { date: SAT, periods: ['afternoon'] }] },
  }, db.tables.user[0])
  const bPreview = await patches.createPreviewForUser({
    coordination_id: cid,
    changes: { availability: [{ date: SAT, periods: ['evening'] }, { date: FRI, periods: ['evening'] }] },
  }, db.tables.user[2])
  assert.strictEqual(aPreview.base_version, 1)
  assert.strictEqual(bPreview.base_version, 1)
  const aApplied = await patches.confirmForUser({ coordination_id: cid, patch_id: aPreview.id }, db.tables.user[0])
  assert.strictEqual(aApplied.coordination_version, 2)
  await assert.rejects(
    () => patches.confirmForUser({ coordination_id: cid, patch_id: bPreview.id }, db.tables.user[2]),
    /已更新.*重新生成/
  )
  const bRepreview = await patches.createPreviewForUser({
    coordination_id: cid,
    changes: { availability: [{ date: SAT, periods: ['evening'] }, { date: FRI, periods: ['evening'] }] },
  }, db.tables.user[2])
  const bApplied = await patches.confirmForUser({ coordination_id: cid, patch_id: bRepreview.id }, db.tables.user[2])
  assert.strictEqual(bApplied.coordination_version, 3)
  const aAppFinal = db.tables.date_coordination_application.find((r) => r.coordination_id === cid && r.user_id === 1 && r.coordination_version === 3).application
  const bAppFinal = db.tables.date_coordination_application.find((r) => r.coordination_id === cid && r.user_id === 3 && r.coordination_version === 3).application
  assert.ok(JSON.stringify(aAppFinal).includes(SAT), 'A 的周六下午保留')
  assert.ok(JSON.stringify(bAppFinal).includes(FRI), 'B 的周五下午保留（并发双更新不丢）')
  assert.ok(JSON.stringify(aAppFinal).includes(FRI), 'A 的先前周五也保留')

  // ======== stale notification guard ========
  const beforeUnread = Number(db.tables.user_notification_cursor.find((r) => r.user_id === 1).unread_count || 0)
  const staleResult = await writeInbox({
    coordination: { id: cid, coordination_version: 5 },
    event_coordination_version: 3,
    current_coordination_version: 5,
    event_type: 'proposal_generated',
    user_id: 1
  })
  assert.strictEqual(staleResult.stale, true, 'stale notification (v3) must not be delivered at v5')
  const staleRecords = db.tables.coordination_notification.filter((r) => r.status === 'stale')
  assert.ok(staleRecords.length >= 1)
  const afterUnread = Number(db.tables.user_notification_cursor.find((r) => r.user_id === 1).unread_count || 0)
  assert.strictEqual(afterUnread, beforeUnread, 'stale notification must not increment unread')

  console.log('PASS synthetic coordination bilateral E2E: no-overlap NL patch confirm recompute area proposal double-confirm arranged privacy + concurrent A/B + stale guard')
}

main().then(() => process.exitCode = 0).catch((err) => { console.error(err.stack || err); process.exitCode = 1 })
