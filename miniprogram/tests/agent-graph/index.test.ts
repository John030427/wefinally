import test from 'node:test'
import assert from 'node:assert/strict'
import { requireFromAgentGraph } from './agentGraphRequire.js'
const { MemorySaver } = requireFromAgentGraph('@langchain/langgraph') as typeof import('@langchain/langgraph')
import type { DecisionInput, DecisionModel } from '../../cloudfunctions/agent-graph/src/model.js'
import { ModelBoundaryError } from '../../cloudfunctions/agent-graph/src/model.js'
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
    model: {
      decide: async () => ({
        intent: 'date_coordination', replyDraft: '', riskLevel: 'safe', route: 'date_coordination',
        toolRequest: null, suggestedActions: [], coordinationCommand: { type: 'QUERY_STATUS', confidence: 1 }
      })
    }
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
    partyBState: preference,
    canonicalState: {
      coordination_id: 716,
      coordination_version: 1,
      status: 'waiting_confirmations',
      business_state: 'coordinating',
      party: 'A',
      current_plan: null
    }
  })
  assert.equal(result.success, true)
  assert.equal(result.data?.status, 'completed')
  assert.equal(result.data?.phase, 'query_status')
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

test('provider fallback exposes separate graph and model diagnostic codes', async () => {
  const main = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: {
      decide: async () => {
        throw new ModelBoundaryError('provider_request_error', { modelErrorCode: 'INVALID_ENV' })
      }
    }
  })
  const result = await main(customerInput('帮助'))
  assert.equal(result.success, true)
  assert.equal(result.data?.status, 'fallback')
  assert.equal(result.data?.errorCode, 'provider_request_error')
  assert.equal(result.data?.graph_fallback_code, 'provider_request_error')
  assert.equal(result.data?.model_error_code, 'INVALID_ENV')
})

test('internal provider and decision diagnostics do not route through LangGraph', async () => {
  const main = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: {
      decide: async () => ({
        intent: 'date_coordination',
        replyDraft: '请确认调整预览。',
        riskLevel: 'safe',
        route: 'date_coordination',
        toolRequest: null,
        suggestedActions: [],
        rawModelOutput: '{"coordination_command":{"type":"PROPOSE_CHANGE"}}',
        coordinationCommand: {
          type: 'PROPOSE_CHANGE',
          target_version: 1,
          changes: { activity: '吃饭' },
          confidence: 0.99
        }
      })
    },
    providerSmoke: async () => ({
      status: 'provider_smoke', ok: true, provider: 'cloudbase', group: 'cloudbase', model: 'hy3',
      rawResponse: '{"ok":true}'
    })
  })

  const provider = await main({ operation: 'provider_smoke' })
  assert.deepEqual(provider, {
    success: true,
    data: {
      status: 'provider_smoke', ok: true, provider: 'cloudbase', group: 'cloudbase', model: 'hy3',
      rawResponse: '{"ok":true}'
    }
  })

  const decision = await main({ operation: 'decision_smoke', userText: '奶茶改成吃饭' })
  assert.equal(decision.success, true)
  assert.equal(decision.data?.status, 'decision_smoke')
  assert.equal(decision.data?.coordinationCommandSchemaValid, true)
  assert.equal(decision.data?.decision?.coordinationCommand?.type, 'PROPOSE_CHANGE')
  assert.equal(decision.data?.rawModelOutput, '{"coordination_command":{"type":"PROPOSE_CHANGE"}}')
})

test('decision diagnostics retain bounded invalid model output for schema inspection', async () => {
  const main = createAgentGraphMain({
    checkpointer: new MemorySaver(),
    model: {
      decide: async () => {
        throw new ModelBoundaryError('invalid_model_output', {
          modelErrorCode: 'invalid_model_output',
          rawModelOutput: '{"unexpected":true}'
        })
      }
    }
  })
  const result = await main({ operation: 'decision_smoke', userText: '奶茶改成吃饭' })
  assert.deepEqual(result.data, {
    status: 'decision_smoke',
    ok: false,
    coordinationCommandSchemaValid: false,
    graph_fallback_code: 'invalid_model_output',
    model_error_code: 'invalid_model_output',
    rawModelOutput: '{"unexpected":true}'
  })
})
