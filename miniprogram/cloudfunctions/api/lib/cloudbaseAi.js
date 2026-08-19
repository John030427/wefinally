const cloud = require('wx-server-sdk')

const PRODUCTION_PROVIDER = 'cloudbase'
const PRODUCTION_GROUP = 'cloudbase'
const PRODUCTION_MODEL = 'hy3'

let appInstance = null

function envText(env, key) {
  const source = env || process.env
  return source && source[key] !== undefined ? String(source[key]).trim() : ''
}

function isDisabledFlag(value) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'false' || text === '0' || text === 'off' || text === 'no'
}

function getApp(env) {
  if (appInstance) return appInstance
  const tcb = require('@cloudbase/node-sdk')
  const source = env || process.env
  const envId = envText(source, 'TCB_ENV')
    || envText(source, 'SCF_NAMESPACE')
    || (cloud.DYNAMIC_CURRENT_ENV ? String(cloud.DYNAMIC_CURRENT_ENV) : '')
  appInstance = tcb.init({ env: envId })
  return appInstance
}

function resolveLegacyDeepseekConfig(env) {
  const source = env || process.env
  const apiKey = envText(source, 'DEEPSEEK_API_KEY') || envText(source, 'LLM_API_KEY')
  const enabledValue = envText(source, 'AGENT_LLM_ENABLED').toLowerCase()
  return {
    provider: 'deepseek',
    protocol: 'openai',
    group: '',
    model: envText(source, 'DEEPSEEK_MODEL') || envText(source, 'LLM_MODEL') || 'deepseek-chat',
    baseURL: (envText(source, 'DEEPSEEK_BASE_URL') || envText(source, 'LLM_BASE_URL') || 'https://api.deepseek.com').replace(/\/+$/, ''),
    apiKey,
    enabled: Boolean(apiKey) && !isDisabledFlag(enabledValue),
    timeoutMs: Math.min(Math.max(Number(envText(source, 'DEEPSEEK_TIMEOUT_MS') || envText(source, 'LLM_TIMEOUT_MS')) || 20000, 1000), 30000)
  }
}

function getAiRuntimeConfig(env) {
  const source = env || process.env
  const provider = (envText(source, 'AI_PROVIDER') || 'cloudbase').toLowerCase()
  if (provider === 'deepseek' || provider === 'legacy_deepseek') {
    return resolveLegacyDeepseekConfig(source)
  }
  const enabledFlag = envText(source, 'AI_ENABLED') || envText(source, 'AGENT_LLM_ENABLED')
  return {
    provider: PRODUCTION_PROVIDER,
    protocol: 'cloudbase',
    group: envText(source, 'AI_GROUP') || PRODUCTION_GROUP,
    model: envText(source, 'AI_MODEL') || envText(source, 'LLM_MODEL') || PRODUCTION_MODEL,
    enabled: enabledFlag ? !isDisabledFlag(enabledFlag) : true,
    timeoutMs: Math.min(Math.max(Number(envText(source, 'AI_TIMEOUT_MS') || envText(source, 'LLM_TIMEOUT_MS')) || 45000, 1000), 50000)
  }
}

function buildMetadata(config, startedAt, success, extra) {
  return Object.assign({
    provider: config.provider,
    model: config.model,
    group: config.group || PRODUCTION_GROUP,
    runtime: 'cloudbase',
    success: Boolean(success),
    latencyMs: Date.now() - startedAt
  }, extra || {})
}

async function generateText(options) {
  const opts = options || {}
  const config = opts.config || getAiRuntimeConfig(opts.env)
  const startedAt = Date.now()
  if (!config.enabled) {
    const error = new Error('cloudbase_ai_disabled')
    error.code = 'provider_disabled'
    throw error
  }
  const ai = getApp(opts.env).ai()
  const model = ai.createModel(config.group || PRODUCTION_GROUP)
  const request = {
    model: config.model,
    messages: opts.messages || [],
    maxTokens: opts.maxTokens || opts.max_tokens || 900,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.2
  }
  if (opts.responseFormat || opts.response_format) {
    request.responseFormat = opts.responseFormat || opts.response_format
  }
  let result
  try {
    result = await model.generateText(request)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    error.code = error.code || 'provider_request_error'
    error.metadata = buildMetadata(config, startedAt, false)
    throw error
  }
  const text = String(result && result.text || '').trim()
  return {
    text,
    usage: result && result.usage ? result.usage : null,
    metadata: buildMetadata(config, startedAt, true, {
      usage: result && result.usage ? result.usage : null
    })
  }
}

async function smokeTest(options) {
  const result = await generateText(Object.assign({
    messages: [{ role: 'user', content: String((options && options.prompt) || '只回复：HY3_OK') }],
    maxTokens: 32,
    temperature: 0
  }, options || {}))
  return {
    ok: /HY3_OK/i.test(result.text),
    text: result.text,
    metadata: result.metadata
  }
}

module.exports = {
  PRODUCTION_PROVIDER,
  PRODUCTION_GROUP,
  PRODUCTION_MODEL,
  getAiRuntimeConfig,
  generateText,
  smokeTest,
  resetAppForTests() {
    appInstance = null
  }
}
