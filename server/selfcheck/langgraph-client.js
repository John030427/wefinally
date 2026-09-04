const assert = require('assert')
const {
  readLangGraphConfig,
  createActorRef,
  createThreadId,
  invokeLangGraph,
  runLangGraphStep,
  normalizeResult
} = require('../../miniprogram/cloudfunctions/api/agent/langgraphClient')

async function main() {
  assert.deepStrictEqual(readLangGraphConfig({}), {
    enabled: false,
    shadowMode: false,
    timeoutMs: 8000,
    actorSecret: ''
  })
  assert.strictEqual(readLangGraphConfig({ LANGGRAPH_ENABLED: 'true', LANGGRAPH_SHADOW_MODE: 'true', LANGGRAPH_TIMEOUT_MS: '99999', LANGGRAPH_ACTOR_SECRET: 'secret' }).timeoutMs, 30000)

  const actorRef = createActorRef(716, 'test-secret')
  assert.match(actorRef, /^usr_[a-f0-9]{32}$/)
  assert.strictEqual(actorRef.includes('716'), false)
  assert.match(createThreadId(22, 'test-secret'), /^wf_thread_[a-f0-9]{32}$/)

  let invoked = 0
  const disabled = await invokeLangGraph({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '你好', safeSummary: '' }, {
    env: {},
    invokeFunction: async () => { invoked += 1 }
  })
  assert.deepStrictEqual(disabled, { kind: 'disabled', code: 'graph_disabled' })
  assert.strictEqual(invoked, 0)

  const normalized = await invokeLangGraph({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '手机号13800138000', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async (_name, payload) => {
      invoked += 1
      assert.strictEqual(JSON.stringify(payload).includes('13800138000'), false)
      return { result: { success: true, data: { status: 'completed', threadId: payload.threadId, phase: 'completed', replyDraft: 'ok', pendingAction: null, phone: 'never' } } }
    }
  })
  assert.strictEqual(normalized.kind, 'result')
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized.result, 'phone'), false)

  let tools = 0
  const shadow = await runLangGraphStep({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '投诉', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_SHADOW_MODE: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async (_name, payload) => ({ result: { success: true, data: { status: 'awaiting_tool', threadId: payload.threadId, phase: 'manual_review', replyDraft: '', pendingAction: { type: 'create_human_ticket', arguments: {}, requiresConfirmation: false } } } }),
    executeTool: async () => { tools += 1 }
  })
  assert.strictEqual(shadow.kind, 'shadow')
  assert.strictEqual(tools, 0)

  let continuationCalls = 0
  let refreshed = 0
  const continued = await runLangGraphStep({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'date_coordination', userText: '调整方案', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async (_name, payload) => {
      continuationCalls += 1
      if (continuationCalls === 1) return { result: { success: true, data: {
        status: 'awaiting_tool',
        threadId: payload.threadId,
        phase: 'awaiting_tool',
        replyDraft: '',
        pendingAction: { type: 'create_date_application_patch', arguments: { coordinationId: 716, coordinationVersion: 3 }, requiresConfirmation: true }
      } } }
      assert.strictEqual(payload.operation, 'resume_tool')
      assert.strictEqual(payload.canonicalState.coordination_version, 3)
      return { result: { success: true, data: { status: 'awaiting_confirmation', threadId: payload.threadId, phase: 'awaiting_confirmation', replyDraft: 'preview', pendingAction: null } } }
    },
    executeTool: async () => ({ ok: true, data: { patchId: 456, status: 'pending_confirmation', coordinationVersion: 3 } }),
    refreshInput: async () => {
      refreshed += 1
      return { canonicalState: { coordination_version: 3 } }
    }
  })
  assert.strictEqual(continued.kind, 'result')
  assert.strictEqual(continued.result.status, 'awaiting_confirmation')
  assert.strictEqual(refreshed, 1)

  await assert.rejects(
    () => runLangGraphStep({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'date_coordination', userText: '调整方案', safeSummary: '' }, {
      env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
      invokeFunction: async (_name, payload) => ({ result: { success: true, data: {
        status: 'awaiting_tool',
        threadId: payload.threadId,
        phase: 'awaiting_tool',
        replyDraft: '',
        pendingAction: { type: 'create_date_application_patch', arguments: { coordinationId: 716, coordinationVersion: 3 }, requiresConfirmation: true }
      } } }),
      executeTool: async () => {
        const error = new Error('patch write failed')
        error.code = 'PATCH_DB_WRITE'
        throw error
      }
    }),
    (error) => {
      assert.strictEqual(error.graphStage, 'execute_graph_tool')
      assert.strictEqual(error.toolName, 'create_date_application_patch')
      assert.strictEqual(error.toolErrorCode, 'PATCH_DB_WRITE')
      return true
    }
  )

  const timedOut = await invokeLangGraph({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '你好', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_TIMEOUT_MS: '10', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async () => new Promise(() => {})
  })
  assert.strictEqual(timedOut.kind, 'fallback')
  assert.strictEqual(timedOut.code, 'graph_timeout')

  const invalid = await invokeLangGraph({ threadId: 'wf_thread_aaaaaaaaaaaaaaaa', actorRef, mode: 'customer_service', userText: '你好', safeSummary: '' }, {
    env: { LANGGRAPH_ENABLED: 'true', LANGGRAPH_ACTOR_SECRET: 'secret' },
    invokeFunction: async () => ({ result: { success: false, code: 'invalid_request', details: 'unknown:context' } })
  })
  assert.strictEqual(invalid.kind, 'fallback')
  assert.strictEqual(invalid.code, 'invalid_request:unknown:context')

  const diagnostics = normalizeResult({
    status: 'fallback',
    threadId: 'wf_thread_aaaaaaaaaaaaaaaa',
    phase: 'fallback',
    replyDraft: '',
    pendingAction: null,
    graph_fallback_code: 'invalid_model_output',
    model_error_code: 'invalid_model_output'
  })
  assert.strictEqual(diagnostics.graph_fallback_code, 'invalid_model_output')
  assert.strictEqual(diagnostics.model_error_code, 'invalid_model_output')

  console.log('PASS langgraph client')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
