import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ModelBoundaryError,
  createDecisionModel,
  resolveCloudbaseInitOptions,
  resolveCloudbaseSdkModule,
  runCloudbaseProviderSmoke
} from '../../cloudfunctions/agent-graph/src/model.js'

const sampleDecision = {
  intent: 'platform_question',
  reply_draft: '我来帮你核对平台状态。',
  risk_level: 'safe',
  route: 'faq',
  tool_request: null,
  suggested_actions: []
}

test('sends only sanitized bounded input and parses structured decision JSON via CloudBase hy3', async () => {
  let requestPayload = ''
  const model = createDecisionModel({
    provider: 'cloudbase',
    model: 'hy3',
    group: 'cloudbase',
    generateTextImpl: async (input) => {
      requestPayload = JSON.stringify(input.messages)
      return { text: JSON.stringify(sampleDecision) }
    }
  })

  const decision = await model.decide({
    mode: 'customer_service',
    phase: 'frontline',
    userText: '联系我13800138000，OPENID=oAbCdEfGhIjKlMnOpQrStUvWxYz123',
    safeSummary: ''
  })

  assert.equal(decision.route, 'faq')
  assert.equal(decision.intent, 'platform_question')
  assert.doesNotMatch(requestPayload, /13800138000|oAbCdEf/)
  assert.ok(requestPayload.length <= 3000)
})

test('maps malformed provider content to a stable boundary error', async () => {
  const model = createDecisionModel({
    provider: 'cloudbase',
    generateTextImpl: async () => ({ text: 'not-json' })
  })

  await assert.rejects(
    () => model.decide({
      mode: 'customer_service',
      phase: 'frontline',
      userText: '帮助',
      safeSummary: ''
    }),
    (error: unknown) => error instanceof ModelBoundaryError
      && error.code === 'invalid_model_output'
      && error.modelErrorCode === 'invalid_model_output'
      && error.rawModelOutput === 'not-json'
  )
})

test('rejects legacy deepseek mode without API key without starting a provider request', async () => {
  const model = createDecisionModel({ provider: 'deepseek', apiKey: '' })
  await assert.rejects(
    () => model.decide({
      mode: 'customer_service',
      phase: 'frontline',
      userText: '帮助',
      safeSummary: ''
    }),
    (error: unknown) => error instanceof ModelBoundaryError && error.code === 'provider_disabled'
  )
})

test('legacy deepseek fetch path still works when explicitly configured', async () => {
  let requestBody = ''
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = String(init?.body || '')
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(sampleDecision) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const model = createDecisionModel({
    provider: 'deepseek',
    apiKey: 'sk-test-only-not-a-real-secret',
    fetchImpl
  })
  const decision = await model.decide({
    mode: 'customer_service',
    phase: 'frontline',
    userText: '帮助',
    safeSummary: ''
  })
  assert.equal(decision.route, 'faq')
  const parsedBody = JSON.parse(requestBody) as { model?: string; response_format?: { type?: string } }
  assert.equal(parsedBody.model, 'deepseek-chat')
  assert.equal(parsedBody.response_format?.type, 'json_object')
})

test('CloudBase provider uses the current function environment when no env id is configured', () => {
  assert.deepEqual(resolveCloudbaseInitOptions(''), {})
  assert.deepEqual(resolveCloudbaseInitOptions('  '), {})
  const currentEnv = Symbol.for('SYMBOL_CURRENT_ENV')
  assert.deepEqual(resolveCloudbaseInitOptions('', currentEnv), { env: currentEnv })
  assert.deepEqual(resolveCloudbaseInitOptions('cloud1-d4gy8l52g08bba326'), {
    env: 'cloud1-d4gy8l52g08bba326'
  })
})

test('normalizes the CloudBase Node SDK default export used by deployed ESM interop', () => {
  const init = () => undefined
  assert.equal(resolveCloudbaseSdkModule({ default: { init } }).init, init)
  assert.equal(resolveCloudbaseSdkModule({ init }).init, init)
})

test('preserves the provider error code for internal QA diagnostics', async () => {
  const providerError = Object.assign(new Error('CloudBase provider rejected the request'), {
    code: 'INVALID_ENV'
  })
  const model = createDecisionModel({
    provider: 'cloudbase',
    generateTextImpl: async () => { throw providerError }
  })

  await assert.rejects(
    () => model.decide({
      mode: 'customer_service',
      phase: 'frontline',
      userText: '帮助',
      safeSummary: ''
    }),
    (error: unknown) => error instanceof ModelBoundaryError
      && error.code === 'provider_request_error'
      && error.modelErrorCode === 'INVALID_ENV'
  )
})

test('provider smoke uses CloudBase hy3 structured output and returns the raw bounded response', async () => {
  let request: Record<string, unknown> | undefined
  const result = await runCloudbaseProviderSmoke({
    provider: 'cloudbase',
    group: 'cloudbase',
    model: 'hy3',
    generateTextImpl: async (input) => {
      request = input as unknown as Record<string, unknown>
      return { text: '{"ok":true}' }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.provider, 'cloudbase')
  assert.equal(result.group, 'cloudbase')
  assert.equal(result.model, 'hy3')
  assert.equal(result.rawResponse, '{"ok":true}')
  assert.deepEqual(request?.responseFormat, { type: 'json_object' })
  assert.deepEqual(request?.messages, [
    { role: 'system', content: 'Return exactly one JSON object with a boolean ok field.' },
    { role: 'user', content: '{"ok":true}' }
  ])
})

test('parses date coordination command output as the only semantic command channel', async () => {
  let requestPayload = ''
  const model = createDecisionModel({
    provider: 'cloudbase',
    generateTextImpl: async (input) => {
      requestPayload = JSON.stringify(input.messages)
      return {
        text: JSON.stringify({
          ...sampleDecision,
          route: 'date_coordination',
          coordination_command: {
            type: 'PROPOSE_CHANGE',
            target_version: 3,
            changes: { payment: 'aa' },
            confidence: 0.95
          }
        })
      }
    }
  })
  const decision = await model.decide({
    mode: 'date_coordination',
    phase: 'parse_command',
    userText: '把费用改成AA',
    safeSummary: ''
  })
  assert.equal(decision.coordinationCommand?.type, 'PROPOSE_CHANGE')
  assert.equal(decision.coordinationCommand?.target_version, 3)
  assert.match(requestPayload, /coordination_command/)
})

test('date coordinator prompt documents the complete command contract and grounded examples', async () => {
  let systemPrompt = ''
  const model = createDecisionModel({
    provider: 'cloudbase',
    generateTextImpl: async (input) => {
      systemPrompt = input.messages.find((message) => message.role === 'system')?.content || ''
      return { text: JSON.stringify(sampleDecision) }
    }
  })

  await model.decide({
    mode: 'date_coordination',
    phase: 'parse_command',
    userText: '帮我处理当前约会协调',
    safeSummary: ''
  })

  for (const command of [
    'QUERY_STATUS', 'PROPOSE_CHANGE', 'ASK_PARTNER', 'PROPOSE_CHANGE_AND_ASK_PARTNER',
    'CONFIRM_PREVIEW', 'CANCEL_PREVIEW', 'CONFIRM_CURRENT_PLAN', 'REJECT_CURRENT_PLAN',
    'ACCEPT_INVITATION', 'DECLINE_INVITATION', 'ARRIVAL_STATUS', 'ARRIVAL_HINT',
    'ASK_PARTNER_ARRIVAL', 'ARRIVAL_AND_ASK_PARTNER_STATUS', 'DELAY_NOTICE', 'RELAY_MESSAGE', 'CANCEL_COORDINATION', 'CLARIFY'
  ]) assert.match(systemPrompt, new RegExp(command))
  for (const field of [
    'date', 'period', 'start_time', 'activity', 'activity_detail', 'venue', 'area',
    'budget', 'payment', 'duration', 'meet_point', 'arrival_status', 'arrival_hint',
    'delay_minutes', 'public_location', 'appearance_hint'
  ]) assert.match(systemPrompt, new RegExp(field))
  for (const contextType of ['proposal', 'patch_preview', 'invitation', 'partner_inquiry', 'meeting_status']) {
    assert.match(systemPrompt, new RegExp(contextType))
  }
  for (const fieldClass of ['core', 'soft', 'meeting']) assert.match(systemPrompt, new RegExp(fieldClass))
  for (const phrase of [
    '奶茶改吃饭', '酸菜鱼', '只问对方意见', '还是上一个', '我到了', '你在哪',
    '白T黑裤', '晚到10分钟', 'flexible', 'AA', '预算', '时长'
  ]) assert.match(systemPrompt, new RegExp(phrase))
  assert.match(systemPrompt, /ARRIVAL_AND_ASK_PARTNER_STATUS/)
  assert.match(systemPrompt, /先记录本人 ARRIVED，再发送 ARRIVAL_STATUS_REQUESTED/)
  assert.match(systemPrompt, /只提供 target_version 时必须完全省略 context_ref/)
  assert.match(systemPrompt, /A preview is only written after confirmation/)
  assert.match(systemPrompt, /Do not claim any business action succeeded/)
})
