'use strict'

const assert = require('assert')
const { STATUS } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy')
const { publishCoordinationEvent } = require('../../miniprogram/cloudfunctions/api/agent/dateCoordinationEvents')
const { createAgentHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/agent')

function application(activity) {
  return {
    availability: [{ date: '2026-09-13', periods: ['evening'] }],
    areas: ['福田区'],
    activities: [activity],
    budget: '50-100',
    payment_preference: 'flexible',
    duration: 'flexible',
    transport_constraints: '',
    other_requirements: '',
    share_message: ''
  }
}

function graphResult(payload) {
  const base = {
    threadId: payload.threadId,
    coordinationVersion: Number(payload.coordinationVersion || 1),
    pendingAction: null
  }
  if (payload.operation === 'resume_tool') {
    const data = payload.toolResult && payload.toolResult.data || {}
    return {
      result: {
        success: true,
        data: Object.assign({}, base, {
          status: 'completed',
          phase: 'completed',
          replyDraft: data.applied === true
            ? '已确认这次调整，并已同步给对方。'
            : '这次协调请求尚未完成，请稍后重试。'
        })
      }
    }
  }
  if (payload.userText === '确认' && payload.pendingPreview) {
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
  if (payload.userText === '可以' && payload.canonicalState && payload.canonicalState.current_proposal_id) {
    return {
      result: {
        success: true,
        data: Object.assign({}, base, {
          status: 'awaiting_tool',
          phase: 'awaiting_tool',
          replyDraft: '正在提交你确认的当前方案。',
          pendingAction: {
            type: 'confirm_date_application',
            arguments: {
              coordinationId: Number(payload.coordinationId),
              coordinationVersion: Number(payload.coordinationVersion),
              proposalId: Number(payload.canonicalState.current_proposal_id),
              contextRef: payload.contextRef
            },
            requiresConfirmation: false
          }
        })
      }
    }
  }
  return {
    result: {
      success: true,
      data: Object.assign({}, base, {
        status: 'completed',
        phase: 'completed',
        replyDraft: '当前协调状态已重新加载。'
      })
    }
  }
}

function createHarness() {
  const now = () => new Date('2026-09-05T00:00:00.000Z')
  const rows = {
    user: [{ id: 1 }, { id: 2 }],
    date_coordination: [{
      _id: 'date_coordination_90',
      id: 90,
      user_a_id: 1,
      user_b_id: 2,
      status: STATUS.NO_OVERLAP,
      business_state: 'waiting_partner',
      coordination_version: 1,
      recoordination_count: 1,
      final_proposal_id: 0,
      missing_dimensions: ['activity'],
      confirmation_deadline_at: null
    }],
    date_coordination_application: [
      { _id: 'application_901', id: 901, coordination_id: 90, user_id: 1, coordination_version: 1, application: application('椰子鸡') },
      { _id: 'application_902', id: 902, coordination_id: 90, user_id: 2, coordination_version: 1, application: application('奶茶') }
    ],
    date_application_patch: [{
      _id: 'date_application_patch_901',
      id: 901,
      coordination_id: 90,
      session_id: 901,
      user_id: 1,
      source_message_id: 500,
      base_version: 1,
      operation: 'modify',
      status: 'pending_confirmation',
      changes: { activities: ['椰子鸡'] },
      preview: {
        before: { activities: ['奶茶'] },
        after: { activities: ['椰子鸡'] },
        changed_fields: ['activities']
      },
      expires_at: new Date('2026-09-06T00:00:00.000Z')
    }],
    date_coordination_proposal: [],
    date_coordination_confirmation: [],
    date_coordination_event: [{
      _id: 'date_coordination_event_500',
      id: 500,
      coordination_id: 90,
      coordination_version: 1,
      event_type: 'preference_changed',
      actor_user_id: 2,
      safe_payload: { changed_dimensions: ['activity'] },
      safe_summary: { content: '对方想把活动调整为奶茶。' }
    }],
    agent_session: [
      { _id: 'agent_session_901', id: 901, user_id: 1, agent_type: 'date_coordinator', coordination_id: 90, status: 'active', summary: '' },
      { _id: 'agent_session_902', id: 902, user_id: 2, agent_type: 'date_coordinator', coordination_id: 90, status: 'active', summary: '' }
    ],
    agent_message: [{
      _id: 'agent_message_500',
      id: 500,
      session_id: 901,
      user_id: 1,
      agent_type: 'date_coordinator',
      role: 'user',
      content: '周日可以，但不喝奶茶，吃椰子鸡吧',
      context_ref: { type: 'partner_inquiry', coordination_id: 90, coordination_version: 1, event_id: 500 }
    }],
    agent_run: [],
    agent_tool_call: [],
    agent_message_dedupe: [],
    coordination_notification: [],
    coordination_projection_outbox: []
  }
  let nextId = 10000
  const matches = (row, query) => Object.keys(query || {}).every((key) => row[key] === query[key])
  const deps = {
    now,
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'partner-inquiry-test', LANGGRAPH_TIMEOUT_MS: '5000' },
    currentUser: async (context) => rows.user[context && context.userIndex === 0 ? 0 : 1],
    first: async (name, query) => (rows[name] || []).find((row) => matches(row, query)) || null,
    list: async (name, query) => (rows[name] || []).filter((row) => matches(row, query)),
    byId: async (name, id) => (rows[name] || []).find((row) => Number(row.id) === Number(id) || row._id === String(id)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({ _id: `${prefix || name}_${++nextId}`, id: nextId, create_time: now(), update_time: now() }, data)
      if (!rows[name]) rows[name] = []
      rows[name].push(row)
      return row
    },
    updateByDoc: async (name, row, data) => {
      const updated = Object.assign({}, row, data, { update_time: now() })
      const index = (rows[name] || []).indexOf(row)
      if (index >= 0) rows[name][index] = updated
      return updated
    },
    claimPendingPatch: async (patch) => {
      const current = rows.date_application_patch.find((row) => Number(row.id) === Number(patch.id))
      if (!current || current.status !== 'pending_confirmation') return false
      current.status = 'applying'
      return true
    },
    commitConfirmation: async (coordination, proposal, input) => {
      const current = rows.date_coordination.find((row) => Number(row.id) === Number(coordination.id))
      let confirmation = rows.date_coordination_confirmation.find((row) => (
        Number(row.user_id) === Number(input.user_id)
        && Number(row.coordination_version) === Number(current.coordination_version)
      ))
      if (!confirmation) {
        confirmation = await deps.addWithId('date_coordination_confirmation', {
          coordination_id: current.id,
          user_id: Number(input.user_id),
          proposal_id: Number(proposal.id),
          coordination_version: Number(current.coordination_version),
          decision: 'confirm',
          status: 'active'
        }, 'date_confirmation')
      }
      const users = [current.user_a_id, current.user_b_id]
      const arranged = users.every((userId) => rows.date_coordination_confirmation.some((row) => (
        Number(row.user_id) === Number(userId)
        && Number(row.proposal_id) === Number(proposal.id)
        && Number(row.coordination_version) === Number(current.coordination_version)
        && row.decision === 'confirm'
      )))
      const updated = arranged
        ? await deps.updateByDoc('date_coordination', current, { status: STATUS.ARRANGED, business_state: 'completed', final_proposal_id: Number(proposal.id) })
        : current
      return { coordination: updated, confirmation, arranged, idempotent: false }
    },
    publishCoordinationEvent: (input) => publishCoordinationEvent(input, { first: deps.first, addWithId: deps.addWithId, now }),
    writeInboxNotification: async () => null,
    transaction: null,
    invokeGraphFunction: async (name, payload) => {
      assert.strictEqual(name, 'agent-graph')
      return graphResult(payload)
    }
  }
  return { rows, deps }
}

async function main() {
  const { rows, deps } = createHarness()
  const agent = createAgentHandlers(deps)
  const aReply = await agent.send({
    session_id: 901,
    message: '确认',
    context_ref: { type: 'patch_preview', coordination_id: 90, coordination_version: 1, patch_id: 901 },
    client_request_id: 'partner-inquiry-proposal-a-confirm'
  }, { userIndex: 0 })
  assert.strictEqual(aReply.provider, 'langgraph')
  assert.strictEqual(rows.date_application_patch[0].status, 'applied')
  assert.strictEqual(rows.date_coordination_proposal.length, 1, 'A partner-inquiry patch must create one active proposal')
  assert.strictEqual(rows.date_coordination[0].status, STATUS.WAITING_CONFIRMATIONS)
  assert.strictEqual(rows.date_coordination_confirmation.some((row) => Number(row.user_id) === 1), true)

  const partnerMessage = rows.agent_message.find((row) => Number(row.user_id) === 2 && row.coordination_event_id)
  assert(partnerMessage && partnerMessage.event_card && partnerMessage.event_card.context_ref)
  assert.strictEqual(rows.date_coordination_event.find((row) => Number(row.id) === Number(partnerMessage.coordination_event_id)).safe_payload.patch_id, 901)
  assert.strictEqual(partnerMessage.event_card.context_ref.type, 'proposal')

  const bReply = await agent.send({
    session_id: 902,
    message: '可以',
    context_ref: partnerMessage.event_card.context_ref,
    client_request_id: 'partner-inquiry-proposal-b-confirm'
  }, { userIndex: 1 })
  assert.strictEqual(bReply.provider, 'langgraph')
  assert.match(bReply.reply, /已确认这次调整/)
  assert.strictEqual(rows.date_coordination_confirmation.filter((row) => row.decision === 'confirm').length, 2)
  assert.strictEqual(rows.date_coordination[0].status, STATUS.ARRANGED)
  console.log('PASS - partner inquiry proposal and bilateral confirm chat E2E')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
