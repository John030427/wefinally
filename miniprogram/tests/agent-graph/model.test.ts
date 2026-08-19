import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ModelBoundaryError,
  createDecisionModel
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
    (error: unknown) => error instanceof ModelBoundaryError && error.code === 'invalid_model_output'
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
