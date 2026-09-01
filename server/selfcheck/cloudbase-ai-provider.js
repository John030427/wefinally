const assert = require('assert')
const fs = require('fs')
const path = require('path')

const cloud = require('../../miniprogram/cloudfunctions/api/node_modules/wx-server-sdk')
cloud.init({ env: process.env.TCB_ENV || 'cloud1-d4gy8l52g08bba326' })

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const cloudbaseAi = require('../../miniprogram/cloudfunctions/api/lib/cloudbaseAi')
const { getProviderConfig, generateDecision } = require('../../miniprogram/cloudfunctions/api/agent/provider')
const { generateStructuredMatchReports } = require('../../miniprogram/cloudfunctions/api/lib/deepseek')
const { canOpenCoordinatorChat } = require('../../miniprogram/cloudfunctions/api/lib/dateCoordinationAccessPolicy')

async function main() {
  // AI PROVIDER TEST 01
  const runtime = cloudbaseAi.getAiRuntimeConfig({})
  assert.strictEqual(runtime.provider, 'cloudbase')
  assert.strictEqual(getProviderConfig({}).provider, 'cloudbase')

  // AI PROVIDER TEST 02
  assert.strictEqual(runtime.model, 'hy3')
  assert.strictEqual(getProviderConfig({}).model, 'hy3')

  // AI PROVIDER TEST 03
  const noKeyConfig = getProviderConfig({})
  assert.strictEqual(noKeyConfig.enabled, true)
  assert.strictEqual('apiKey' in noKeyConfig, false)

  // AI PROVIDER TEST 04
  assert.doesNotThrow(() => getProviderConfig({}))

  // AI PROVIDER TEST 05
  const failed = await generateDecision({ prompt: 'test' }, {
    env: {},
    requestCloudbase: async () => { throw new Error('cloudbase down') }
  })
  assert.strictEqual(failed.fallback, true)
  assert.strictEqual(failed.provider, 'fallback')
  assert.notStrictEqual(failed.provider, 'deepseek')

  // AI PROVIDER TEST 06 / 07 / 08 / 09 / 10 route through unified provider modules
  const providerSource = read('miniprogram/cloudfunctions/api/agent/provider.js')
  assert(providerSource.includes("require('../lib/cloudbaseAi')"))
  assert(providerSource.includes('requestCloudbaseProvider'))
  const deepseekSource = read('miniprogram/cloudfunctions/api/lib/deepseek.js')
  assert(deepseekSource.includes("require('./cloudbaseAi')"))
  assert(deepseekSource.includes('invokeChatCompletion'))
  const modelSource = read('miniprogram/cloudfunctions/agent-graph/src/model.ts')
  assert(modelSource.includes('createCloudbaseDecisionModel'))
  assert(modelSource.includes("'cloudbase'"))

  // AI PROVIDER TEST 11 structured output validation still enforced in agent-graph model
  assert(modelSource.includes('RawDecisionSchema'))
  assert(modelSource.includes('invalid_model_output'))

  // AI PROVIDER TEST 12 invalid AI JSON cannot write DB remains policy-level in patch handlers
  const patchSource = read('miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js')
  assert(patchSource.includes('confirmForUser'))
  assert(modelSource.includes('ModelBoundaryError'))

  // AI PROVIDER TEST 13 privacy boundary unchanged in context builder
  const contextSource = read('miniprogram/cloudfunctions/api/agent/context.js')
  assert(contextSource.includes('coordinationState'))
  assert(contextSource.includes('businessState'))
  const graphSanitize = read('miniprogram/cloudfunctions/agent-graph/src/sanitize.ts')
  assert(graphSanitize.includes('sanitizeGraphText'))

  // AI PROVIDER TEST 14 disclosure on user-facing AI surfaces
  assert(read('miniprogram/pages/chat/chat.wxml').includes('AI 生成'))
  assert(read('miniprogram/pages/love-advisor/love-advisor.wxml').includes('AI 生成内容'))
  assert(read('miniprogram/pages/match-detail/match-detail.wxml').includes('AI 生成内容，仅供参考'))
  assert(read('miniprogram/pages/match-setting/match-setting.wxml').includes('AI 生成内容，仅供参考'))
  assert(read('miniprogram/pages/date-coordination/date-coordination.wxml').includes('AI生成内容，仅供参考'))

  // AI PROVIDER TEST 15
  const collecting = {
    status: 'collecting_initiator',
    user_a_id: 1,
    user_b_id: 2
  }
  assert.strictEqual(canOpenCoordinatorChat(collecting, { id: 1 }, { hasOwnApplication: false }), false)
  const dateJs = read('miniprogram/pages/date-coordination/date-coordination.js')
  assert(dateJs.includes("status === 'collecting_initiator'"))
  assert(dateJs.includes('showPreSubmitCoordinatorCard'))
  assert(read('miniprogram/pages/date-coordination/date-coordination.wxml').includes('showPreSubmitCoordinatorCard'))

  // AI PROVIDER TEST 16
  const inviting = {
    status: 'inviting_partner',
    user_a_id: 1,
    user_b_id: 2
  }
  assert.strictEqual(canOpenCoordinatorChat(inviting, { id: 1 }, { hasOwnApplication: true }), true)
  assert(dateJs.includes('showCoordinatorCta'))

  const commonSource = read('miniprogram/cloudfunctions/api/handlers/common.js')
  assert(commonSource.includes("provider: 'cloudbase'"))
  assert(commonSource.includes("model: 'hy3'"))
  assert(commonSource.includes('ai_provider_contract_version'))

  const agentSource = read('miniprogram/cloudfunctions/api/handlers/agent.js')
  assert(agentSource.includes("require('../agent/provider')"))
  assert(agentSource.includes('generateDecision'))

  const rerankCfg = cloudbaseAi.getAiRuntimeConfig({ AI_PROVIDER: 'cloudbase' })
  assert.strictEqual(rerankCfg.provider, 'cloudbase')

  // AI PROVIDER TEST 17 CloudBase generateText contract does not accept the
  // OpenAI-only response_format/responseFormat option. JSON is still enforced
  // by the prompt and the existing strict local response validators.
  const cloudbaseRequest = cloudbaseAi.buildGenerateTextRequest({
    messages: [{ role: 'user', content: 'JSON only' }],
    responseFormat: { type: 'json_object' },
    maxTokens: 32,
    temperature: 0
  }, { model: 'hy3' })
  assert.strictEqual(cloudbaseRequest.model, 'hy3')
  assert.strictEqual(cloudbaseRequest.maxTokens, 32)
  assert.strictEqual(cloudbaseRequest.temperature, 0)
  assert.strictEqual('responseFormat' in cloudbaseRequest, false)
  assert.strictEqual('response_format' in cloudbaseRequest, false)

  console.log('cloudbase-ai-provider selfcheck passed (AI PROVIDER TEST 01-17)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
