const https = require('https')
const { sanitizeOutput } = require('./safety')

const PROVIDERS = Object.freeze({
  deepseek: {
    protocol: 'openai',
    key: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat'
  }
})

const DECISION_SYSTEM_PROMPT = 'Return valid JSON with intent, reply_draft, requested_tools, tool_request, risk_level and suggested_actions only. tool_request must contain one allowlisted tool and JSON arguments, or null. Keep reply_draft within 350 Chinese characters. Never expose private data or model reasoning. Never claim an application was sent, submitted, created, modified, confirmed or notified; only the backend may report successful execution.'

function envText(env, key) {
  return env && env[key] !== undefined ? String(env[key]).trim() : ''
}

function getProviderConfig(env) {
  const source = env || process.env
  const provider = 'deepseek'
  const defaults = PROVIDERS[provider]
  const prefix = provider.toUpperCase()
  const apiKey = envText(source, defaults.key) || envText(source, 'LLM_API_KEY')
  const enabledValue = envText(source, 'AGENT_LLM_ENABLED').toLowerCase()
  return {
    provider,
    protocol: defaults.protocol,
    apiKey,
    baseURL: (envText(source, `${prefix}_BASE_URL`) || envText(source, 'LLM_BASE_URL') || defaults.baseURL).replace(/\/+$/, ''),
    model: envText(source, `${prefix}_MODEL`) || envText(source, 'LLM_MODEL') || defaults.model,
    timeoutMs: Math.min(Math.max(Number(envText(source, `${prefix}_TIMEOUT_MS`) || envText(source, 'LLM_TIMEOUT_MS')) || 20000, 1000), 30000),
    enabled: Boolean(apiKey) && !['false', '0', 'off', 'no'].includes(enabledValue)
  }
}

function requestBody(config, input) {
  const prompt = String(input && input.prompt || '').slice(0, 6000)
  return {
    model: config.model,
    max_tokens: 900,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: DECISION_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  }
}

function providerEndpoint(config) {
  return /\/chat\/completions$/.test(config.baseURL)
    ? config.baseURL
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
  return response && response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : ''
}

function extractJsonStringField(raw, field) {
  const match = new RegExp(`"${field}"\\s*:\\s*"`, 'i').exec(raw)
  if (!match) return ''
  let escaped = ''
  for (let index = match.index + match[0].length; index < raw.length; index += 1) {
    const char = raw[index]
    if (char === '\\' && index + 1 < raw.length) {
      escaped += char + raw[index + 1]
      index += 1
      continue
    }
    if (char === '"') break
    escaped += char
  }
  const normalized = escaped.replace(/[\u0000-\u001f]/g, (char) => JSON.stringify(char).slice(1, -1))
  try {
    return JSON.parse(`"${normalized}"`)
  } catch (err) {
    return ''
  }
}

function parseDecisionContent(content) {
  if (typeof content !== 'string') return content
  const raw = content.trim()
  const candidates = [raw]
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch (err) {
      // Try the next supported wrapper before treating the response as plain text.
    }
  }
  const replyDraft = extractJsonStringField(raw, 'reply_draft')
  if (replyDraft) {
    return {
      intent: extractJsonStringField(raw, 'intent') || 'general',
      reply_draft: replyDraft
    }
  }
  throw new Error('provider returned invalid decision JSON')
}

function normalizeDecision(content, provider) {
  const decision = parseDecisionContent(content)
  const safe = sanitizeOutput(decision && typeof decision === 'object' ? decision : {})
  return {
    intent: String(safe.intent || safe.action || 'general').slice(0, 64),
    replyDraft: String(safe.reply_draft || safe.message || '').slice(0, 1200),
    requestedTools: Array.isArray(safe.requested_tools) ? safe.requested_tools.map((item) => String(item).slice(0, 80)).slice(0, 5) : [],
    toolRequest: safe.tool_request && typeof safe.tool_request === 'object' && !Array.isArray(safe.tool_request)
      ? {
          tool: String(safe.tool_request.tool || '').slice(0, 80),
          arguments: safe.tool_request.arguments && typeof safe.tool_request.arguments === 'object' && !Array.isArray(safe.tool_request.arguments)
            ? safe.tool_request.arguments
            : {}
        }
      : null,
    riskLevel: String(safe.risk_level || 'safe').slice(0, 40),
    suggestedActions: Array.isArray(safe.suggested_actions) ? safe.suggested_actions.map((item) => String(item).slice(0, 120)).slice(0, 5) : [],
    provider,
    fallback: false
  }
}

function providerErrorCode(error) {
  const message = String(error && error.message || '').toLowerCase()
  if (message.includes('timeout')) return 'timeout'
  if (message.includes('invalid decision json')) return 'invalid_decision_json'
  if (message.includes('invalid json')) return 'invalid_provider_json'
  if (message.includes('provider http')) return 'provider_http_error'
  return 'request_error'
}

async function generateDecision(input, dependencies) {
  const deps = dependencies || {}
  const config = deps.config || getProviderConfig(deps.env)
  const fallback = async (errorCode) => {
    if (typeof deps.fallback === 'function') {
      return Object.assign({ errorCode }, sanitizeOutput(await deps.fallback({ input, config })))
    }
    return {
      intent: 'provider_unavailable',
      replyDraft: '我暂时无法生成建议，请稍后再试或联系人工客服。',
      requestedTools: [],
      toolRequest: null,
      riskLevel: 'safe',
      suggestedActions: ['contact_human_service'],
      provider: 'fallback',
      fallback: true,
      errorCode
    }
  }
  if (!config.enabled || !config.apiKey) return fallback('provider_disabled')
  try {
    const response = await (deps.request || requestProvider)({ config, input: input || {} })
    return normalizeDecision(contentFromResponse(response), config.provider)
  } catch (err) {
    return fallback(providerErrorCode(err))
  }
}

module.exports = {
  PROVIDERS,
  generateDecision,
  getProviderConfig,
  requestBody
}
