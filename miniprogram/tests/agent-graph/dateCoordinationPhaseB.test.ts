import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { requireFromAgentGraph } from './agentGraphRequire.js'
const { MemorySaver } = requireFromAgentGraph('@langchain/langgraph') as typeof import('@langchain/langgraph')
import {
  buildDateCoordinationGraph,
  type DateCoordinationState
} from '../../cloudfunctions/agent-graph/src/graphs/dateCoordination.js'
import { GraphRunInputSchema } from '../../cloudfunctions/agent-graph/src/contracts.js'
import type { CoordinationCommand, CoordinationCanonicalState } from '../../cloudfunctions/agent-graph/src/contracts.js'
import type { DecisionInput, DecisionModel } from '../../cloudfunctions/agent-graph/src/model.js'

const require = createRequire(import.meta.url)
const apiGraphState = require('../../cloudfunctions/api/agent/dateCoordinationGraphState.js') as {
  buildDateCoordinationGraphInput: (coordination: Record<string, unknown>, applications: Array<Record<string, unknown>>, user: Record<string, unknown>, options: Record<string, unknown>) => {
    canonicalState: CoordinationCanonicalState
    pendingPreview?: Record<string, unknown> | null
  }
}

const preference = {
  dateWindows: ['2026-08-16T14:00+08:00'],
  regions: ['福田区'],
  venueTypes: ['咖啡']
}

function canonical(overrides: Partial<CoordinationCanonicalState> = {}): CoordinationCanonicalState {
  return {
    coordination_id: 716,
    coordination_version: 3,
    status: 'waiting_confirmations',
    business_state: 'coordinating',
    party: 'A',
    current_plan: {
      date: '2026-08-16',
      period: 'afternoon',
      start_time: '14:00',
      activity: '咖啡',
      activity_detail: '手冲咖啡',
      area: '福田区',
      venue: '公共咖啡馆',
      budget: '50-100',
      payment: 'aa',
      duration: 'about-1h'
    },
    canonical_overlap: {
      source: 'backend',
      hasOverlap: true,
      missingDimensions: [],
      conflictDimensions: [],
      proposal: { proposal_id: 99 }
    },
    shared_state: { actionRequired: 'confirm_or_adjust' },
    own_preference: preference,
    partner_progress: 'submitted',
    confirmation_snapshot: {
      myConfirmed: false,
      partnerConfirmed: false,
      proposalStatus: 'awaiting_confirmation',
      source: 'database'
    },
    invitation_version: 7,
    current_proposal_id: 99,
    ...overrides
  }
}

function state(canonicalState: CoordinationCanonicalState, overrides: Partial<DateCoordinationState> = {}): DateCoordinationState {
  return {
    operation: 'run',
    threadId: 'wf_thread_coordination_phase_b',
    actorRef: 'usr_4f52c3d8a9b071ce',
    mode: 'date_coordination',
    userText: '请处理协调请求',
    safeSummary: '',
    phase: 'start',
    riskLevel: 'safe',
    replyDraft: '',
    pendingAction: null,
    pendingTool: null,
    pendingPreview: null,
    lastResult: undefined,
    resumeToolResult: undefined,
    confirmationA: false,
    confirmationB: false,
    confirmationVersionA: undefined,
    confirmationVersionB: undefined,
    proposal: null,
    coordinationId: canonicalState.coordination_id,
    coordinationVersion: canonicalState.coordination_version,
    baseVersion: canonicalState.coordination_version,
    party: 'A',
    partyAState: preference,
    partyBState: preference,
    ownPreference: preference,
    canonicalOverlap: undefined,
    sharedState: undefined,
    partnerProgress: undefined,
    confirmationSnapshot: undefined,
    canonicalState,
    candidatePlan: null,
    candidateChanges: {},
    contextRef: undefined,
    coordinationCommand: null,
    errorCode: undefined,
    ...overrides
  }
}

function command(value: CoordinationCommand): DecisionModel {
  return {
    decide: async (_input: DecisionInput) => ({
      intent: 'date_coordination',
      replyDraft: '我会按当前协调状态处理。',
      riskLevel: 'safe' as const,
      route: 'date_coordination' as const,
      toolRequest: null,
      suggestedActions: [],
      coordinationCommand: value
    })
  }
}

async function invoke(commandValue: CoordinationCommand, overrides: Partial<CoordinationCanonicalState> = {}) {
  const graph = buildDateCoordinationGraph({ checkpointer: new MemorySaver(), model: command(commandValue) })
  return graph.invoke(state(canonical(overrides)), { configurable: { thread_id: 'wf_thread_phase_b_' + commandValue.type.toLowerCase() } })
}

test('reloads sanitized canonical state on every graph round instead of trusting checkpoint fields', async () => {
  let observedVersions: number[] = []
  const model: DecisionModel = {
    decide: async (input) => {
      const context = input.context || {}
      observedVersions.push(Number(context.coordinationVersion))
      return {
        intent: 'date_coordination',
        replyDraft: '当前方案以数据库状态为准。',
        riskLevel: 'safe',
        route: 'date_coordination',
        toolRequest: null,
        suggestedActions: [],
        coordinationCommand: { type: 'QUERY_STATUS', confidence: 1 }
      }
    }
  }
  const saver = new MemorySaver()
  const graph = buildDateCoordinationGraph({ checkpointer: saver, model })
  const first = await graph.invoke(state(canonical()), { configurable: { thread_id: 'wf_thread_phase_b_reload' } })
  const second = await graph.invoke(
    state(canonical({ coordination_version: 4, status: 'arranged' }), { coordinationVersion: 3, phase: 'stale_checkpoint' }),
    { configurable: { thread_id: 'wf_thread_phase_b_reload' } }
  )
  assert.equal(first.coordinationVersion, 3)
  assert.equal(second.coordinationVersion, 4)
  assert.deepEqual(observedVersions, [3, 4])
  assert.equal(second.phase, 'query_status')
})

test('query returns canonical status without a business write request', async () => {
  const result = await invoke({ type: 'QUERY_STATUS', confidence: 1 })
  assert.equal(result.phase, 'query_status')
  assert.equal(result.coordinationCommand?.type, 'QUERY_STATUS')
  assert.equal(result.pendingTool, null)
  assert.equal(result.pendingAction, null)
  assert.match(result.replyDraft, /当前协调状态：waiting_confirmations/)
})

test('plan changes create a version-bound candidate and preview tool only', async () => {
  const result = await invoke({
    type: 'PROPOSE_CHANGE',
    target_version: 3,
    changes: { venue: '公共餐厅', payment: 'flexible' },
    preserve: ['date', 'start_time', 'activity'],
    confidence: 0.96,
    context_ref: { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 }
  })
  assert.equal(result.phase, 'awaiting_tool')
  assert.equal(result.baseVersion, 3)
  assert.deepEqual(result.candidateChanges, { venue: '公共餐厅', payment: 'flexible' })
  assert.equal(result.candidatePlan?.venue, '公共餐厅')
  assert.equal(result.candidatePlan?.payment, 'flexible')
  assert.equal(result.pendingTool?.type, 'create_date_application_patch')
  assert.equal(result.pendingAction?.arguments.coordinationVersion, 3)
  assert.equal(result.pendingAction?.requiresConfirmation, true)
  assert.equal(result.pendingPreview?.baseVersion, 3)
})

test('combined change and partner question shares one candidate and remains version-bound', async () => {
  const result = await invoke({
    type: 'PROPOSE_CHANGE_AND_ASK_PARTNER',
    target_version: 3,
    changes: { start_time: '20:00', activity_detail: '酸菜鱼' },
    partner_request: { type: 'ASK_ACCEPTANCE', topic: '周六晚上八点吃酸菜鱼可以吗？' },
    context_ref: { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 }
  })
  assert.equal(result.pendingTool?.type, 'create_date_application_patch')
  assert.equal(result.pendingTool?.arguments.partnerRequest?.type, 'ASK_ACCEPTANCE')
  assert.equal(result.pendingTool?.arguments.coordinationVersion, 3)
  assert.equal(result.candidatePlan?.start_time, '20:00')
  assert.equal(result.candidatePlan?.activity_detail, '酸菜鱼')
  assert.deepEqual(result.pendingPreview?.partnerRequest, {
    type: 'ASK_ACCEPTANCE',
    topic: '周六晚上八点吃酸菜鱼可以吗？'
  })
})

test('partner inquiry and relay emit structured event tool requests without changing plan version', async () => {
  const inquiry = await invoke({
    type: 'ASK_PARTNER',
    partner_request: { type: 'ASK_PREFERENCE', topic: '对方周六晚上方便吗？' },
    context_ref: { type: 'partner_inquiry', coordination_id: 716, coordination_version: 3, event_id: 501 }
  })
  assert.equal(inquiry.pendingTool?.type, 'notify_coordination_partner')
  assert.equal(inquiry.pendingTool?.arguments.eventType, 'PARTNER_QUESTION')
  assert.equal(inquiry.coordinationVersion, 3)

  const relay = await invoke({
    type: 'DELAY_NOTICE',
    relay: { type: 'DELAY_NOTICE', text: '我大约晚到十分钟。' },
    context_ref: { type: 'meeting_status', coordination_id: 716, coordination_version: 3 }
  })
  assert.equal(relay.pendingTool?.type, 'publish_coordination_event')
  assert.equal(relay.pendingTool?.arguments.eventType, 'DELAY_NOTICE')
  assert.equal(relay.pendingTool?.arguments.coordinationVersion, 3)
})

test('combined arrival records self arrival before asking partner status in one tool request', async () => {
  const result = await invoke({
    type: 'ARRIVAL_AND_ASK_PARTNER_STATUS',
    partner_request: { type: 'ASK_ARRIVAL', topic: '我已到达，请告知你的到达状态和公共集合点。' },
    context_ref: { type: 'meeting_status', coordination_id: 716, coordination_version: 3 },
    confidence: 0.99
  } as unknown as CoordinationCommand)
  assert.equal(result.phase, 'awaiting_tool')
  assert.equal(result.pendingTool?.type, 'record_arrival_and_request_partner_status')
  assert.equal(result.pendingTool?.arguments.coordinationVersion, 3)
  assert.equal(result.pendingTool?.arguments.contextRef?.type, 'meeting_status')
  assert.equal(result.coordinationVersion, 3)
})

test('invitation, confirmation, arrival and clarification commands all route structurally', async () => {
  const invitation = await invoke({
    type: 'ACCEPT_INVITATION',
    target_version: 3,
    context_ref: { type: 'invitation', coordination_id: 716, coordination_version: 3, invitation_version: 7 }
  })
  assert.equal(invitation.pendingTool?.type, 'respond_date_invitation')
  assert.equal(invitation.pendingTool?.arguments.invitationVersion, 7)

  const confirmation = await invoke({
    type: 'CONFIRM_CURRENT_PLAN',
    target_version: 3,
    context_ref: { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 }
  })
  assert.equal(confirmation.pendingTool?.type, 'confirm_date_application')
  assert.equal(confirmation.pendingTool?.arguments.coordinationVersion, 3)

  const arrival = await invoke({
    type: 'ARRIVAL_STATUS',
    relay: { type: 'ARRIVAL_STATUS', text: '我到了。' },
    context_ref: { type: 'meeting_status', coordination_id: 716, coordination_version: 3 }
  })
  assert.equal(arrival.pendingTool?.type, 'publish_coordination_event')
  assert.equal(arrival.pendingTool?.arguments.eventType, 'ARRIVED')

  const clarify = await invoke({
    type: 'CLARIFY',
    needs_clarification: true,
    clarification: '你想调整时间、活动，还是区域？'
  })
  assert.equal(clarify.phase, 'clarify')
  assert.equal(clarify.pendingTool, null)
  assert.equal(clarify.replyDraft, '你想调整时间、活动，还是区域？')
})

test('invitation and proposal context refs must still point at the current database version', async () => {
  const staleInvitation = await invoke({
    type: 'ACCEPT_INVITATION',
    target_version: 3,
    context_ref: { type: 'invitation', coordination_id: 716, coordination_version: 3, invitation_version: 6 }
  })
  assert.equal(staleInvitation.pendingTool, null)
  assert.equal(staleInvitation.errorCode, 'stale_coordination_version')

  const ambiguousConfirmation = await invoke({
    type: 'CONFIRM_CURRENT_PLAN',
    target_version: 3
  } as CoordinationCommand)
  assert.equal(ambiguousConfirmation.pendingTool, null)
  assert.equal(ambiguousConfirmation.errorCode, 'invalid_command')
})

test('stale and unversioned plan mutation commands never produce a plan tool request', async () => {
  const stale = await invoke({
    type: 'PROPOSE_CHANGE',
    target_version: 2,
    changes: { venue: '公共餐厅' },
    context_ref: { type: 'proposal', coordination_id: 716, coordination_version: 2, proposal_id: 99 }
  })
  assert.equal(stale.pendingTool, null)
  assert.equal(stale.errorCode, 'stale_coordination_version')

  const unversioned = await invoke({
    type: 'PROPOSE_CHANGE',
    changes: { venue: '公共餐厅' }
  } as CoordinationCommand)
  assert.equal(unversioned.pendingTool, null)
  assert.equal(unversioned.errorCode, 'invalid_command')
})

test('a client supplied context_ref is checked against the freshly loaded database version', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({ type: 'QUERY_STATUS' })
  })
  const result = await graph.invoke(state(canonical(), {
    contextRef: {
      type: 'meeting_status',
      coordination_id: 716,
      coordination_version: 2
    }
  }), { configurable: { thread_id: 'wf_thread_phase_b_inbound_stale_context' } })
  assert.equal(result.pendingTool, null)
  assert.equal(result.errorCode, 'stale_context')
})

test('tool continuation reloads canonical state and keeps preview facts separate from plan truth', async () => {
  const saver = new MemorySaver()
  const graph = buildDateCoordinationGraph({
    checkpointer: saver,
    model: command({
      type: 'PROPOSE_CHANGE',
      target_version: 3,
      changes: { payment: 'flexible' },
      context_ref: { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 }
    })
  })
  const threadId = 'wf_thread_phase_b_tool_resume'
  const first = await graph.invoke(state(canonical()), { configurable: { thread_id: threadId } })
  const second = await graph.invoke({
    ...state(canonical({ coordination_version: 3, status: 'waiting_confirmations' })),
    pendingAction: first.pendingAction,
    pendingTool: first.pendingTool,
    pendingPreview: first.pendingPreview,
    candidatePlan: first.candidatePlan,
    candidateChanges: first.candidateChanges,
    baseVersion: first.baseVersion,
    contextRef: first.contextRef,
    coordinationCommand: first.coordinationCommand,
    resumeToolResult: { ok: true, data: { patchId: 456, status: 'pending_confirmation', coordinationVersion: 3 } }
  }, { configurable: { thread_id: threadId } })
  assert.equal(second.phase, 'awaiting_confirmation')
  assert.equal(second.pendingTool, null)
  assert.equal(second.pendingPreview?.patchId, 456)
  assert.equal(second.pendingPreview?.baseVersion, 3)
  assert.match(second.replyDraft, /确认后我会更新约会方案/)
})

test('preview resume reply names changed fields and preserves unchanged plan facts', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({
      type: 'PROPOSE_CHANGE_AND_ASK_PARTNER',
      target_version: 3,
      changes: { activity: '吃饭', activity_detail: '大鱼' },
      preserve: ['date', 'period', 'start_time', 'area', 'payment', 'duration'],
      partner_request: { type: 'ASK_ACCEPTANCE', topic: '吃饭·大鱼可以吗？' },
      context_ref: { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 }
    })
  })
  const first = await graph.invoke(state(canonical()), { configurable: { thread_id: 'wf_thread_phase_b_dynamic_preview_copy' } })
  const second = await graph.invoke({
    ...state(canonical()),
    pendingAction: first.pendingAction,
    pendingTool: first.pendingTool,
    pendingPreview: first.pendingPreview,
    candidatePlan: first.candidatePlan,
    candidateChanges: first.candidateChanges,
    baseVersion: first.baseVersion,
    contextRef: first.contextRef,
    coordinationCommand: first.coordinationCommand,
    resumeToolResult: { ok: true, data: { patchId: 456, status: 'pending_confirmation', coordinationVersion: 3 } }
  }, { configurable: { thread_id: 'wf_thread_phase_b_dynamic_preview_copy' } })

  assert.equal(second.phase, 'awaiting_confirmation')
  assert.match(second.replyDraft, /活动.*咖啡.*手冲咖啡.*吃饭.*大鱼/)
  assert.match(second.replyDraft, /区域、费用方式、时长保持当前安排/)
  assert.match(second.replyDraft, /确认后.*询问对方/)
})

test('preview confirmation uses the DB-loaded pending preview instead of checkpoint-only context', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({
      type: 'CONFIRM_PREVIEW',
      target_version: 3,
      context_ref: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
    })
  })
  const result = await graph.invoke(state(canonical(), {
    pendingPreview: {
      patchId: 456,
      baseVersion: 3,
      candidatePlan: canonical().current_plan,
      candidateChanges: { payment: 'flexible' },
      contextRef: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
    }
  }), { configurable: { thread_id: 'wf_thread_phase_b_preview_confirm' } })
  assert.equal(result.pendingTool?.type, 'confirm_date_application_patch')
  assert.equal(result.pendingTool?.arguments.patchId, 456)
})

test('completed plan resolution clears the consumed actionable context', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({
      type: 'CONFIRM_PREVIEW',
      target_version: 3,
      context_ref: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
    })
  })
  const preview = {
    patchId: 456,
    baseVersion: 3,
    candidatePlan: canonical().current_plan,
    candidateChanges: { payment: 'flexible' },
    contextRef: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
  }
  const action = {
    type: 'confirm_date_application_patch',
    arguments: { coordinationId: 716, coordinationVersion: 3, patchId: 456 },
    requiresConfirmation: false
  } as const
  const result = await graph.invoke(state(canonical(), {
    pendingAction: action,
    pendingTool: action,
    pendingPreview: preview,
    contextRef: preview.contextRef,
    resumeToolResult: { ok: true, data: { patchId: 456, status: 'applied', coordinationVersion: 4 } }
  }), { configurable: { thread_id: 'wf_thread_phase_b_context_consumed' } })
  assert.equal(result.contextRef, undefined)
})

test('preview confirmation reply is grounded in backend projection status', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({
      type: 'CONFIRM_PREVIEW',
      target_version: 3,
      context_ref: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
    })
  })
  const action = {
    type: 'confirm_date_application_patch',
    arguments: { coordinationId: 716, coordinationVersion: 3, patchId: 456 },
    requiresConfirmation: false
  } as const
  const projected = await graph.invoke(state(canonical(), {
    pendingAction: action,
    pendingTool: action,
    contextRef: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 },
    resumeToolResult: { ok: true, data: { patchId: 456, status: 'waiting_partner', applied: true, partnerNotified: true, coordinationVersion: 4 } }
  }), { configurable: { thread_id: 'wf_thread_phase_b_grounded_confirm' } })
  assert.match(projected.replyDraft, /已确认这次调整，并已同步给对方/)

  const pending = await graph.invoke(state(canonical(), {
    pendingAction: action,
    pendingTool: action,
    contextRef: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 },
    resumeToolResult: { ok: true, data: { patchId: 456, status: 'waiting_partner', applied: true, projection_pending: true, partnerNotified: false, coordinationVersion: 4 } }
  }), { configurable: { thread_id: 'wf_thread_phase_b_grounded_confirm_pending' } })
  assert.match(pending.replyDraft, /已确认这次调整，正在向对方同步/)
})

test('current plan confirmation reply is grounded only when backend returns applied=true', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({
      type: 'CONFIRM_CURRENT_PLAN',
      target_version: 3,
      context_ref: { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 }
    })
  })
  const action = {
    type: 'confirm_date_application',
    arguments: { coordinationId: 716, coordinationVersion: 3, proposalId: 99 },
    requiresConfirmation: false
  } as const
  const result = await graph.invoke(state(canonical(), {
    pendingAction: action,
    pendingTool: action,
    contextRef: { type: 'proposal', coordination_id: 716, coordination_version: 3, proposal_id: 99 },
    resumeToolResult: {
      ok: true,
      data: {
        status: 'arranged',
        applied: true,
        partnerNotified: true,
        coordinationVersion: 3
      }
    }
  }), { configurable: { thread_id: 'wf_thread_current_plan_grounded_confirm' } })
  assert.match(result.replyDraft, /已确认这次调整/)
  assert.doesNotMatch(result.replyDraft, /还没有生效/)
})

test('combined preview confirmation carries the partner request into the commit tool', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({
      type: 'CONFIRM_PREVIEW',
      target_version: 3,
      context_ref: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
    })
  })
  const result = await graph.invoke(state(canonical(), {
    pendingPreview: {
      patchId: 456,
      baseVersion: 3,
      candidatePlan: canonical().current_plan,
      candidateChanges: { activity_detail: '酸菜鱼' },
      partnerRequest: { type: 'ASK_ACCEPTANCE', topic: '周六晚上吃酸菜鱼可以吗？' },
      contextRef: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
    }
  }), { configurable: { thread_id: 'wf_thread_phase_b_combined_confirm' } })
  assert.equal(result.pendingTool?.type, 'confirm_date_application_patch')
  assert.deepEqual(result.pendingTool?.arguments.partnerRequest, {
    type: 'ASK_ACCEPTANCE',
    topic: '周六晚上吃酸菜鱼可以吗？'
  })
})

test('a fresh API round can invalidate a checkpoint-only preview', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: command({
      type: 'CONFIRM_PREVIEW',
      target_version: 3,
      context_ref: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
    })
  })
  const threadId = 'wf_thread_phase_b_preview_checkpoint'
  const preview = {
    patchId: 456,
    baseVersion: 3,
    candidatePlan: canonical().current_plan,
    candidateChanges: { payment: 'flexible' },
    contextRef: { type: 'patch_preview', coordination_id: 716, coordination_version: 3, patch_id: 456 }
  }
  const first = await graph.invoke(state(canonical(), { pendingPreview: preview }), { configurable: { thread_id: threadId } })
  assert.equal(first.pendingTool?.type, 'confirm_date_application_patch')
  const second = await graph.invoke(state(canonical(), { pendingPreview: null }), { configurable: { thread_id: threadId } })
  assert.equal(second.pendingTool, null)
  assert.equal(second.errorCode, 'invalid_context_ref')
})

test('API canonical graph input uses the same shared venue/payment adapter as agent-graph', () => {
  const coordination = {
    id: 716,
    user_a_id: 1,
    user_b_id: 2,
    coordination_version: 3,
    status: 'waiting_confirmations',
    business_state: 'coordinating'
  }
  const application = {
    availability: [{ date: '2026-08-16', periods: ['afternoon'] }],
    areas: ['福田区'],
    activities: ['咖啡'],
    budget: '50-100',
    payment_preference: 'aa',
    duration: 'about-1h'
  }
  const input = apiGraphState.buildDateCoordinationGraphInput(
    coordination,
    [
      { user_id: 1, coordination_version: 3, application },
      { user_id: 2, coordination_version: 3, application }
    ],
    { id: 1 },
    {
      confirmations: [],
      pendingPatch: {
        id: 456,
        base_version: 3,
        changes: { payment_preference: 'flexible' },
        preview: {
          after: { ...application, payment_preference: 'flexible' }
        }
      }
    }
  )
  assert.equal(input.canonicalState.current_plan?.payment, 'aa')
  assert.equal(input.canonicalState.current_plan?.venue, undefined)
  assert.equal(input.pendingPreview?.patchId, 456)
  assert.equal((input.pendingPreview?.candidatePlan as Record<string, unknown>).payment, 'flexible')
})

test('API graph input stays within the strict agent-graph run contract', () => {
  const coordination = {
    id: 1788501441438033,
    user_a_id: 1788246797946266,
    user_b_id: 1784818962143965,
    coordination_version: 1,
    status: 'no_overlap',
    business_state: 'waiting_partner',
    invitation_proposal: {
      date: '2026-09-10',
      period: 'afternoon',
      start_time: '13:57',
      activity: '奶茶',
      activity_venue: '万象城',
      area: '南山区',
      budget: '50-100',
      payment_preference: 'partner_pays',
      duration: '1-2h'
    },
    invitation_version: 1
  }
  const input = apiGraphState.buildDateCoordinationGraphInput(
    coordination,
    [],
    { id: 1784818962143965 },
    {
      confirmations: [],
      contextRef: {
        type: 'patch_preview',
        coordination_id: 1788501441438033,
        coordination_version: 1,
        patch_id: 1788501674554951
      }
    }
  )
  const parsed = GraphRunInputSchema.safeParse({
    operation: 'run',
    threadId: 'wf_thread_aaaaaaaaaaaaaaaa',
    actorRef: 'usr_0123456789abcdef0123456789abcdef',
    mode: 'date_coordination',
    userText: '周六晚上7点吃椰子鸡可以吗',
    safeSummary: '真实真机重放',
    ...input
  })
  assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message)
})
