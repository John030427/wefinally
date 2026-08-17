import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ModelBoundaryError,
  createDecisionModel
} from '../../cloudfunctions/agent-graph/src/model.js'

test('sends only sanitized bounded input and parses structured decision JSON', async () => {
  let requestBody = ''
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = String(init?.body || '')
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            intent: 'platform_question',
            reply_draft: '我来帮你核对平台状态。',
            risk_level: 'safe',
            route: 'faq',
            tool_request: null,
            suggested_actions: []
          })
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const model = createDecisionModel({
    apiKey: 'sk-test-only-not-a-real-secret',
    fetchImpl
  })

  const decision = await model.decide({
    mode: 'customer_service',
    phase: 'frontline',
    userText: '联系我13800138000，OPENID=oAbCdEfGhIjKlMnOpQrStUvWxYz123',
    safeSummary: ''
  })

  assert.equal(decision.route, 'faq')
  assert.equal(decision.intent, 'platform_question')
  assert.doesNotMatch(requestBody, /13800138000|oAbCdEf/)
  const parsedBody = JSON.parse(requestBody) as {
    response_format?: { type?: string }
    model?: string
    messages?: Array<{ content?: string }>
  }
  assert.equal(parsedBody.model, 'deepseek-chat')
  assert.equal(parsedBody.response_format?.type, 'json_object')
  assert.ok((parsedBody.messages?.[1]?.content || '').length <= 3000)
})

test('maps malformed provider content to a stable boundary error', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'not-json' } }]
  }), { status: 200 })
  const model = createDecisionModel({ apiKey: 'sk-test-only-not-a-real-secret', fetchImpl })

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

test('rejects a missing API key without starting a provider request', async () => {
  const model = createDecisionModel({ apiKey: '' })
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
