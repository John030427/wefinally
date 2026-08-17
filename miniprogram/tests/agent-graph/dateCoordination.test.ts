import test from 'node:test'
import assert from 'node:assert/strict'
import { requireFromAgentGraph } from './agentGraphRequire.js'
const { MemorySaver } = requireFromAgentGraph('@langchain/langgraph') as typeof import('@langchain/langgraph')
import {
  applyConfirmation,
  applyPreferenceChange,
  buildDateCoordinationGraph,
  computeSafeOverlap,
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
