const https = require('https')
const { sanitizeOutput } = require('./safety')

const PROVIDERS = Object.freeze({
  minimax: {
    protocol: 'anthropic',
    key: 'MINIMAX_API_KEY',
    baseURL: 'https://api.minimaxi.com/anthropic',
    model: 'MiniMax-M3'
  },
  deepseek: {
    protocol: 'openai',
    key: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat'
  }
})

function envText(env, key) {
  return env && env[key] !== undefined ? String(env[key]).trim() : ''
}

function getProviderConfig(env) {
  const source = env || process.env
  const selected = envText(source, 'AGENT_PROVIDER').toLowerCase()
  const provider = selected === 'deepseek' ? 'deepseek' : 'minimax'
  const defaults = PROVIDERS[provider]
  const prefix = provider.toUpperCase()
  const apiKey = envText(source, defaults.key) || (provider === 'deepseek' ? envText(source, 'LLM_API_KEY') : '')
  const enabledValue = envText(source, 'AGENT_LLM_ENABLED').toLowerCase()
  return {
    provider,
    protocol: defaults.protocol,
    apiKey,
    baseURL: (envText(source, `${prefix}_BASE_URL`) || defaults.baseURL).replace(/\/+$/, ''),
    model: envText(source, `${prefix}_MODEL`) || defaults.model,
    timeoutMs: Math.min(Math.max(Number(envText(source, `${prefix}_TIMEOUT_MS`)) || 10000, 1000), 12000),
    enabled: Boolean(apiKey) && !['false', '0', 'off', 'no'].includes(enabledValue)
  }
}

function requestBody(config, input) {
  const prompt = String(input && input.prompt || '').slice(0, 6000)
  if (config.protocol === 'anthropic') {
    return {
      model: config.model,
      system: 'Return JSON with intent, reply_draft, requested_tools, risk_level and suggested_actions only. Never expose private data or model reasoning.',
      max_tokens: 600,
      temperature: 0.2,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    }
  }
  return {
    model: config.model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Return JSON with intent, reply_draft, requested_tools, risk_level and suggested_actions only. Never expose private data or model reasoning.' },
      { role: 'user', content: prompt }
    ]
  }
}

function providerEndpoint(config) {
  return config.protocol === 'anthropic'
    ? `${config.baseURL}/v1/messages`
    : `${config.baseURL}/chat/completions`
}

function requestProvider({ config, input }) {
  return new Promise((resolve, reject) => {
    const target = new URL(providerEndpoint(config))
    const payload = JSON.stringify(requestBody(config, input))
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      method: 'POST',
      path: `${target.pathname}${target.search}`,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`provider HTTP ${response.statusCode}`))
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(new Error('provider returned invalid JSON'))
        }
      })
    })
    request.on('error', reject)
    request.setTimeout(config.timeoutMs, () => request.destroy(new Error('provider timeout')))
    request.write(payload)
    request.end()
  })
}

function contentFromResponse(response) {
  if (response && response.decision) return response.decision
  const anthropic = response && Array.isArray(response.content)
    ? response.content.filter((item) => item && item.type === 'text').map((item) => item.text).join('\n')
    : ''
  if (anthropic) return anthropic
  return response && response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : ''
}

function normalizeDecision(content, provider) {
  let decision = content
  if (typeof content === 'string') {
    try {
      decision = JSON.parse(content)
    } catch (err) {
      decision = { intent: 'general', reply_draft: content }
    }
  }
  const safe = sanitizeOutput(decision && typeof decision === 'object' ? decision : {})
  return {
    intent: String(safe.intent || safe.action || 'general').slice(0, 64),
    replyDraft: String(safe.reply_draft || safe.message || '').slice(0, 1200),
    requestedTools: Array.isArray(safe.requested_tools) ? safe.requested_tools.map((item) => String(item).slice(0, 80)).slice(0, 5) : [],
    riskLevel: String(safe.risk_level || 'safe').slice(0, 40),
    suggestedActions: Array.isArray(safe.suggested_actions) ? safe.suggested_actions.map((item) => String(item).slice(0, 120)).slice(0, 5) : [],
    provider,
    fallback: false
  }
}

async function generateDecision(input, dependencies) {
  const deps = dependencies || {}
  const config = deps.config || getProviderConfig(deps.env)
  const fallback = async () => {
    if (typeof deps.fallback === 'function') return sanitizeOutput(await deps.fallback({ input, config }))
    return {
      intent: 'provider_unavailable',
      replyDraft: '我暂时无法生成建议，请稍后再试或联系人工客服。',
      requestedTools: [],
      riskLevel: 'safe',
      suggestedActions: ['contact_human_service'],
      provider: 'fallback',
      fallback: true
    }
  }
  if (!config.enabled || !config.apiKey) return fallback()
  try {
    const response = await (deps.request || requestProvider)({ config, input: input || {} })
    return normalizeDecision(contentFromResponse(response), config.provider)
  } catch (err) {
    return fallback()
  }
}

module.exports = {
  PROVIDERS,
  generateDecision,
  getProviderConfig,
  requestBody
}
