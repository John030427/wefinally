import test from 'node:test'
import assert from 'node:assert/strict'
import { requireFromAgentGraph } from './agentGraphRequire.js'
const { MemorySaver } = requireFromAgentGraph('@langchain/langgraph') as typeof import('@langchain/langgraph')
import {
  applyConfirmation,
  applyPreferenceChange,
  buildDateCoordinationGraph,
  computeSafeOverlap,
  resolveOverlap,
  type DateCoordinationState
} from '../../cloudfunctions/agent-graph/src/graphs/dateCoordination.js'

const a = {
  dateWindows: ['2026-08-16T14:00+08:00', '2026-08-17T19:00+08:00'],
  regions: ['福田区', '南山区'],
  venueTypes: ['咖啡', '公园'],
  durationMinutes: 90,
  budgetBand: 'medium' as const,
  notes: '安静一点'
}

const b = {
  dateWindows: ['2026-08-16T14:00+08:00'],
  regions: ['福田区'],
  venueTypes: ['咖啡'],
  durationMinutes: 90,
  budgetBand: 'medium' as const,
  notes: '靠近地铁'
}

function state(overrides: Partial<DateCoordinationState> = {}): DateCoordinationState {
  return {
    operation: 'run',
    threadId: 'wf_thread_coordination_001',
    actorRef: 'usr_4f52c3d8a9b071ce',
    mode: 'date_coordination',
    userText: '确认约会安排',
    safeSummary: '',
    phase: 'compute_overlap',
    riskLevel: 'safe',
    replyDraft: '',
    pendingAction: null,
    confirmationA: false,
    confirmationB: false,
    confirmationVersionA: undefined,
    confirmationVersionB: undefined,
    proposal: null,
    coordinationId: 716,
    coordinationVersion: 3,
    party: 'A',
    partyAState: a,
    partyBState: b,
    ownPreference: undefined,
    canonicalOverlap: undefined,
    sharedState: undefined,
    partnerProgress: undefined,
    confirmationSnapshot: undefined,
    lastResult: undefined,
    errorCode: undefined,
    ...overrides
  }
}

test('computes a deterministic first overlap without combining private notes', () => {
  const overlap = computeSafeOverlap(a, b)
  assert.equal(overlap.hasOverlap, true)
  assert.deepEqual(overlap.proposal, {
    dateWindow: '2026-08-16T14:00+08:00',
    region: '福田区',
    venueType: '咖啡',
    durationMinutes: 90,
    budgetBand: 'medium'
  })
  assert.equal(JSON.stringify(overlap).includes('安静一点'), false)
  assert.equal(JSON.stringify(overlap).includes('靠近地铁'), false)
})

test('reports no overlap and missing required fields deterministically', () => {
  const noOverlap = computeSafeOverlap(a, { ...b, dateWindows: ['2026-08-20T19:00+08:00'] })
  assert.equal(noOverlap.hasOverlap, false)
  assert.deepEqual(noOverlap.missingFields, [])

  const missing = computeSafeOverlap(a, { ...b, regions: [] })
  assert.equal(missing.hasOverlap, false)
  assert.deepEqual(missing.missingFields, ['regions'])
})

test('B changing time increments version and invalidates proposal and both confirmations', () => {
  const current = state({
    confirmationA: true,
    confirmationB: true,
    confirmationVersionA: 3,
    confirmationVersionB: 3,
    proposal: { dateWindow: '2026-08-16T14:00+08:00' }
  })
  const next = applyPreferenceChange(current, 'B', {
    ...b,
    dateWindows: ['2026-08-17T19:00+08:00']
  })
  assert.equal(next.coordinationVersion, 4)
  assert.equal(next.confirmationA, false)
  assert.equal(next.confirmationB, false)
  assert.equal(next.proposal, null)
})

test('A changing region has the same invalidation behavior while preserving B state', () => {
  const current = state({ confirmationA: true, confirmationB: true })
  const next = applyPreferenceChange(current, 'A', { ...a, regions: ['罗湖区'] })
  assert.equal(next.coordinationVersion, 4)
  assert.deepEqual(next.partyBState, b)
  assert.deepEqual(next.partyAState.regions, ['罗湖区'])
})

test('duplicate current confirmation is idempotent and stale confirmation is rejected', () => {
  const once = applyConfirmation(state(), 'A', 3)
  const duplicate = applyConfirmation(once, 'A', 3)
  assert.equal(duplicate.confirmationA, true)
  assert.equal(duplicate.coordinationVersion, 3)

  const stale = applyConfirmation(state({ coordinationVersion: 4 }), 'B', 3)
  assert.equal(stale.confirmationB, false)
  assert.equal(stale.errorCode, 'stale_coordination_version')
})

test('graph never submits when confirmations refer to an older version', async () => {
  const graph = buildDateCoordinationGraph({ checkpointer: new MemorySaver() })
  const result = await graph.invoke(state({
    coordinationVersion: 4,
    confirmationA: true,
    confirmationB: true,
    confirmationVersionA: 3,
    confirmationVersionB: 3
  }), { configurable: { thread_id: 'wf_thread_coordination_stale' } })
  assert.equal(result.phase, 'awaiting_confirmation')
  assert.equal(result.pendingAction, null)
})

test('graph exposes only an allowlisted preview action after both parties confirm current version', async () => {
  const graph = buildDateCoordinationGraph({ checkpointer: new MemorySaver() })
  const result = await graph.invoke(state({
    confirmationA: true,
    confirmationB: true,
    confirmationVersionA: 3,
    confirmationVersionB: 3
  }), { configurable: { thread_id: 'wf_thread_coordination_submit' } })
  assert.equal(result.phase, 'awaiting_tool')
  assert.equal(result.pendingAction?.type, 'create_date_application_preview')
  assert.equal(result.pendingAction?.arguments.coordinationVersion, 3)
})


test('no-overlap graph proactively asks the current party for more time', async () => {
  const graph = buildDateCoordinationGraph({ checkpointer: new MemorySaver() })
  const result = await graph.invoke(state({
    party: 'A',
    partyAState: { ...a },
    partyBState: { ...b, dateWindows: ['2026-08-20T19:00+08:00'] }
  }), { configurable: { thread_id: 'wf_thread_coordination_no_overlap' } })
  assert.equal(result.phase, 'ask_time')
  assert.match(String(result.replyDraft), /共同时间/)
  assert.match(String(result.replyDraft), /如果方便/)
  assert.ok(!String(result.replyDraft).includes('靠近地铁'))
})

test('has overlap graph waits for bilateral confirmation without exposing partner notes', async () => {
  const graph = buildDateCoordinationGraph({ checkpointer: new MemorySaver() })
  const result = await graph.invoke(state({}), { configurable: { thread_id: 'wf_thread_coordination_wait' } })
  assert.equal(result.phase, 'awaiting_confirmation')
  assert.match(String(result.replyDraft), /等待双方确认/)
})

test('backend canonical overlap wins over graph budget-band mismatch', () => {
  const current = state({
    partyAState: { ...a, budgetBand: 'low' },
    partyBState: { ...b, budgetBand: 'medium' },
    canonicalOverlap: {
      source: 'backend',
      hasOverlap: true,
      missingDimensions: [],
      conflictDimensions: [],
      proposal: { dateWindow: '2026-08-16:afternoon', region: '福田区', venueType: '咖啡' }
    }
  })
  const overlap = resolveOverlap(current)
  assert.equal(overlap.hasOverlap, true)
  assert.equal(overlap.proposal?.region, '福田区')
})

test('backend payment conflict prevents graph from claiming a complete plan', () => {
  const overlap = resolveOverlap(state({
    canonicalOverlap: {
      source: 'backend',
      hasOverlap: false,
      missingDimensions: ['payment'],
      conflictDimensions: ['payment'],
      proposal: null
    }
  }))
  assert.equal(overlap.hasOverlap, false)
  assert.deepEqual(overlap.conflictFields, ['payment'])
})

test('ambiguous negotiation reply is clarified instead of mutating an arbitrary dimension', async () => {
  const graph = buildDateCoordinationGraph({
    checkpointer: new MemorySaver(),
    model: {
      async decide() {
        return {
          intent: 'clarify_scope',
          replyDraft: '你是想修改时间，还是接受地点和活动安排？',
          riskLevel: 'safe' as const,
          route: 'date_coordination' as const,
          toolRequest: null,
          suggestedActions: []
        }
      }
    }
  })
  const result = await graph.invoke(state({
    userText: '其他都行吧',
    canonicalOverlap: {
      source: 'backend',
      hasOverlap: false,
      missingDimensions: ['time', 'area'],
      conflictDimensions: ['time', 'area'],
      proposal: null
    }
  }), { configurable: { thread_id: 'wf_thread_coordination_clarify_scope' } })
  assert.equal(result.phase, 'clarify_scope')
  assert.match(String(result.replyDraft), /修改时间/)
  assert.equal(result.pendingAction, null)
})

test('backend structured counter proposal is surfaced with changed and unchanged scope', async () => {
  const graph = buildDateCoordinationGraph({ checkpointer: new MemorySaver() })
  const result = await graph.invoke(state({
    canonicalOverlap: {
      source: 'backend',
      hasOverlap: false,
      missingDimensions: ['time'],
      conflictDimensions: ['time'],
      proposal: null
    },
    sharedState: {
      actionRequired: 'review_counter_proposal',
      coordinationPath: 'structured_counter_proposal',
      counterOffer: {
        kind: 'partner_structured_counter_proposal',
        coordination_version: 3,
        changed_dimensions: ['time'],
        changes: [{ label: '时间', before_text: '2026-09-04 下午', after_text: '2026-09-06 下午' }],
        unchanged_text: '区域、活动、预算、费用方式、时长',
        time_text: '2026-09-06 下午',
        title: '对方调整了约会方案',
        body: '这次只调整了时间。'
      }
    }
  }), { configurable: { thread_id: 'wf_thread_coordination_counter_offer' } })
  assert.equal(result.phase, 'review_counter_proposal')
  assert.match(String(result.replyDraft), /2026-09-04 下午 → 2026-09-06 下午/)
  assert.match(String(result.replyDraft), /2026-09-06 下午/)
  assert.match(String(result.replyDraft), /区域、活动、预算、费用方式、时长保持原方案/)
  assert.equal(result.pendingAction, null)
})
