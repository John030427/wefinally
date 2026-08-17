import test from 'node:test'
import assert from 'node:assert/strict'
import { requireFromAgentGraph } from './agentGraphRequire.js'
const { Command } = requireFromAgentGraph('@langchain/langgraph') as typeof import('@langchain/langgraph')
import type { DecisionModel } from '../../cloudfunctions/agent-graph/src/model.js'
import { buildCustomerServiceGraph } from '../../cloudfunctions/agent-graph/src/graphs/customerService.js'
import {
  CloudBaseCheckpointSaver,
  type CheckpointCollection,
  type CheckpointDocument
} from '../../cloudfunctions/agent-graph/src/checkpoint/cloudbaseSaver.js'

class MemoryCollection implements CheckpointCollection {
  readonly documents = new Map<string, CheckpointDocument>()

  async get(id: string) {
    return this.documents.get(id)
  }

  async set(id: string, value: CheckpointDocument) {
    this.documents.set(id, structuredClone(value))
  }

  async query(threadId: string) {
    return [...this.documents.values()].filter((value) => value.threadId === threadId)
  }

  async removeByThread(threadId: string) {
    for (const [id, value] of this.documents) {
      if (value.threadId === threadId) this.documents.delete(id)
    }
  }
}

const complaintModel: DecisionModel = {
  decide: async () => ({
    intent: 'payment_dispute',
    replyDraft: '转人工核查。',
    riskLevel: 'high',
    route: 'complaint',
    toolRequest: null,
    suggestedActions: []
  })
}

function input() {
  return {
    operation: 'run' as const,
    threadId: 'wf_thread_persist_001',
    actorRef: 'usr_4f52c3d8a9b071ce',
    mode: 'customer_service' as const,
    userText: '支付争议',
    safeSummary: '',
    phase: 'start',
    riskLevel: 'safe' as const,
    replyDraft: '',
    pendingAction: null,
    confirmationA: false,
    confirmationB: false,
    proposal: null
  }
}

test('a fresh graph instance resumes an interrupted thread from the shared collection', async () => {
  const collection = new MemoryCollection()
  const config = { configurable: { thread_id: 'wf_thread_persist_001' } }
  const firstGraph = buildCustomerServiceGraph({
    model: complaintModel,
    checkpointer: new CloudBaseCheckpointSaver(collection)
  })
  const interrupted = await firstGraph.invoke(input(), config) as Record<string, unknown>
  assert.ok(interrupted.__interrupt__)

  const secondGraph = buildCustomerServiceGraph({
    model: complaintModel,
    checkpointer: new CloudBaseCheckpointSaver(collection)
  })
  const resumed = await secondGraph.invoke(new Command({ resume: { ok: true, data: { ticketId: 'safe_1' } } }), config)
  assert.equal(resumed.phase, 'manual_pending')
  assert.equal(resumed.lastResult?.ok, true)
})

test('checkpoint and pending-write documents use opaque keys and have expiry metadata', async () => {
  const collection = new MemoryCollection()
  const graph = buildCustomerServiceGraph({
    model: complaintModel,
    checkpointer: new CloudBaseCheckpointSaver(collection, { retentionDays: 7 })
  })
  await graph.invoke(input(), { configurable: { thread_id: 'wf_thread_persist_001' } })
  const documents = [...collection.documents.entries()]
  assert.ok(documents.some(([, value]) => value.kind === 'checkpoint'))
  assert.ok(documents.some(([, value]) => value.kind === 'write'))
  for (const [id, value] of documents) {
    assert.match(id, /^lg_[a-f0-9]{64}$/)
    assert.equal(value.threadId, 'wf_thread_persist_001')
    assert.ok(value.expireAt > value.createdAt)
  }
})

test('rejects unsafe thread identifiers and can delete one thread', async () => {
  const collection = new MemoryCollection()
  const saver = new CloudBaseCheckpointSaver(collection)
  await assert.rejects(() => saver.getTuple({ configurable: { thread_id: '__proto__' } }), /invalid_thread_id/)

  const graph = buildCustomerServiceGraph({ model: complaintModel, checkpointer: saver })
  await graph.invoke(input(), { configurable: { thread_id: 'wf_thread_persist_001' } })
  assert.ok(collection.documents.size > 0)
  await saver.deleteThread('wf_thread_persist_001')
  assert.equal(collection.documents.size, 0)
})

test('does not restore expired checkpoints while CloudBase TTL cleanup is pending', async () => {
  const collection = new MemoryCollection()
  let now = 1_000
  const saver = new CloudBaseCheckpointSaver(collection, { retentionDays: 1, now: () => now })
  const graph = buildCustomerServiceGraph({ model: complaintModel, checkpointer: saver })
  await graph.invoke(input(), { configurable: { thread_id: 'wf_thread_persist_001' } })
  assert.ok(await saver.getTuple({ configurable: { thread_id: 'wf_thread_persist_001' } }))

  now += 86_400_001
  assert.equal(await saver.getTuple({ configurable: { thread_id: 'wf_thread_persist_001' } }), undefined)
})
