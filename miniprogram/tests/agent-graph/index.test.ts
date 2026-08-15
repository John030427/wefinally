import test from 'node:test'
import assert from 'node:assert/strict'
const { MemorySaver } = requireFromAgentGraph('@langchain/langgraph') as typeof import('@langchain/langgraph')
import type { DecisionInput, DecisionModel } from '../../cloudfunctions/agent-graph/src/model.js'
import { createAgentGraphMain } from '../../cloudfunctions/agent-graph/src/index.js'

function customerInput(text: string) {
  return {
    operation: 'run',
    threadId: 'wf_thread_entrypoint_001',
    actorRef: 'usr_4f52c3d8a9b071ce',
    mode: 'customer_service',
    userText: text,
    safeSummary: ''
  }
}

test('health is explicit and unknown event fields are rejected', async () => {
  const main = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: { decide: async () => { throw new Error('not_called') } }
  })
  assert.deepEqual(await main({ operation: 'health' }), {
    success: true,
    data: { status: 'ok', runtime: 'langgraph' }
  })
  const invalid = await main({ ...customerInput('你好'), database: 'all' })
  assert.equal(invalid.success, false)
  assert.equal(invalid.code, 'invalid_request')
  assert.equal(invalid.details, 'unknown:database')
})

test('entrypoint ignores only CloudBase injected userInfo metadata', async () => {
  const main = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: {
      decide: async () => ({
        intent: 'faq', replyDraft: '已核对。', riskLevel: 'safe', route: 'faq',
        toolRequest: null, suggestedActions: []
      })
    }
  })
  const result = await main({
    ...customerInput('介绍平台规则'),
    userInfo: { appId: 'cloudbase-injected', openId: 'cloudbase-injected' },
    tcbContext: { requestId: 'cloudbase-injected' }
  })
  assert.equal(result.success, true)
  assert.equal(result.data?.status, 'completed')
})

test('entrypoint sanitizes model input and returns a bounded graph result', async () => {
  let observed: DecisionInput | undefined
  const model: DecisionModel = {
    decide: async (input) => {
      observed = input
      return {
        intent: 'faq',
        replyDraft: '已核对。',
        riskLevel: 'safe',
        route: 'faq',
        toolRequest: null,
        suggestedActions: []
      }
    }
  }
  const main = createAgentGraphMain({ checkpointer: new MemorySaver(), model })
  const result = await main(customerInput('手机号 13800138000 怎么修改'))
  assert.equal(result.success, true)
  assert.equal(result.data?.status, 'completed')
  assert.equal(observed?.userText.includes('13800138000'), false)
})

test('resume rejects a different actor even with a valid thread id', async () => {
  const model: DecisionModel = {
    decide: async () => ({
      intent: 'payment_dispute',
      replyDraft: '转人工。',
      riskLevel: 'high',
      route: 'complaint',
      toolRequest: null,
      suggestedActions: []
    })
  }
  const main = createAgentGraphMain({ checkpointer: new MemorySaver(), model })
  const first = await main(customerInput('支付成功但没到账'))
  assert.equal(first.data?.status, 'awaiting_tool')

  const takeover = await main({
    operation: 'resume_tool',
    threadId: 'wf_thread_entrypoint_001',
    actorRef: 'usr_aaaaaaaaaaaaaaaa',
    toolResult: { ok: true, data: { ticketId: 'unsafe_takeover' } }
  })
  assert.equal(takeover.success, false)
  assert.equal(takeover.code, 'actor_mismatch')
})

test('date coordination returns awaiting confirmation until both current-version confirmations exist', async () => {
  const main = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: { decide: async () => { throw new Error('not_called') } }
  })
  const preference = {
    dateWindows: ['2026-08-16T14:00+08:00'],
    regions: ['福田区'],
    venueTypes: ['咖啡']
  }
  const result = await main({
    operation: 'run',
    threadId: 'wf_thread_entrypoint_date',
    actorRef: 'usr_4f52c3d8a9b071ce',
    mode: 'date_coordination',
    userText: '都可以',
    safeSummary: '',
    coordinationId: 716,
    coordinationVersion: 1,
    party: 'A',
    partyAState: preference,
    partyBState: preference
  })
  assert.equal(result.success, true)
  assert.equal(result.data?.status, 'awaiting_confirmation')
})

test('malformed checkpoint storage returns a stable error without exposing the storage exception', async () => {
  class CorruptSaver extends MemorySaver {
    override async getTuple(): Promise<never> {
      throw new Error('raw corrupted document with secret internals')
    }
  }
  const main = createAgentGraphMain({
    checkpointer: new CorruptSaver(),
    model: { decide: async () => { throw new Error('not_called') } }
  })
  const result = await main({
    operation: 'resume_tool',
    threadId: 'wf_thread_corrupt_001',
    actorRef: 'usr_4f52c3d8a9b071ce',
    toolResult: { ok: true }
  })
  assert.deepEqual(result, { success: false, code: 'invalid_checkpoint' })
})
