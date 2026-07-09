const https = require('https')
const { first } = require('./db')

const CLOUD_FUNCTION_SAFE_TIMEOUT_MS = 1800

function envValue(keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    if (process.env[key] !== undefined) return process.env[key]
  }
  return undefined
}

function isFalsy(value) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'false' || text === '0' || text === 'no' || text === 'off'
}

function isTruthy(value) {
  if (value === true || value === 1) return true
  const text = String(value || '').trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'yes' || text === 'on'
}

async function systemValue(key) {
  try {
    let row = await first('system_config', { key })
    if (!row) row = await first('system_config', { config_key: key })
    if (!row) row = await first('system_config', { name: key })
    if (!row) return undefined
    return row.value !== undefined ? row.value : (row.config_value !== undefined ? row.config_value : row.enabled)
  } catch (err) {
    return undefined
  }
}

async function getConfig() {
  const apiKey = envValue(['MINIMAX_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_API_KEY']) ||
    await systemValue('minimax_api_key') ||
    await systemValue('MINIMAX_API_KEY')
  const enabledEnv = envValue(['MINIMAX_MATCH_REPORT_ENABLED', 'LLM_MATCH_REPORT_ENABLED', 'MINIMAX_ENABLED', 'LLM_ENABLED'])
  const enabledDb = enabledEnv === undefined
    ? await systemValue('minimax_match_report_enabled')
    : undefined
  const enabledValue = enabledEnv !== undefined ? enabledEnv : enabledDb
  const enabled = enabledValue === undefined ? Boolean(apiKey) : (isTruthy(enabledValue) && !isFalsy(enabledValue))
  const baseURL = String(
    envValue(['MINIMAX_BASE_URL', 'ANTHROPIC_BASE_URL', 'LLM_BASE_URL']) ||
      await systemValue('minimax_base_url') ||
      'https://api.minimaxi.com/anthropic'
  ).replace(/\/+$/, '')
  const model = String(
    envValue(['MINIMAX_MODEL', 'ANTHROPIC_MODEL', 'LLM_MODEL']) ||
      await systemValue('minimax_model') ||
      'MiniMax-M3'
  )
  const configuredTimeoutMs = Number(
    envValue(['MINIMAX_TIMEOUT_MS', 'LLM_TIMEOUT_MS']) ||
      await systemValue('minimax_timeout_ms') ||
      CLOUD_FUNCTION_SAFE_TIMEOUT_MS
  )
  const timeoutMs = Math.min(
    Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : CLOUD_FUNCTION_SAFE_TIMEOUT_MS,
    CLOUD_FUNCTION_SAFE_TIMEOUT_MS
  )
  return {
    enabled,
    apiKey,
    baseURL,
    model,
    timeoutMs
  }
}

function endpointFor(baseURL) {
  if (/\/v1\/messages$/.test(baseURL)) return baseURL
  return `${baseURL}/v1/messages`
}

function requestJson(url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const payload = JSON.stringify(body)
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      method: 'POST',
      path: `${target.pathname}${target.search}`,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }, headers || {})
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`MiniMax HTTP ${res.statusCode}: ${text.slice(0, 300)}`))
          return
        }
        try {
          resolve(JSON.parse(text))
        } catch (err) {
          reject(new Error(`MiniMax JSON parse failed: ${err.message}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('MiniMax request timeout'))
    })
    req.write(payload)
    req.end()
  })
}

function textFromAnthropicResponse(data) {
  const content = data && Array.isArray(data.content) ? data.content : []
  return content
    .filter((item) => item && item.type === 'text')
    .map((item) => item.text || '')
    .join('\n')
    .trim()
}

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced ? fenced[1] : raw
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(source.slice(start, end + 1))
  } catch (err) {
    return null
  }
}

function compactUser(user) {
  return {
    gender: Number(user.gender) === 1 ? '男' : '女',
    birth_year: user.birth_year,
    height_range: user.height_range,
    education: user.education,
    city: user.city,
    baby_plan: user.baby_plan,
    circle_name: user.circle_name || '',
    has_appearance_description: Boolean(user.appearance_description || user.appearance_tags),
    has_appearance_expectation: Boolean(user.appearance_want || user.appearance_want_tags)
  }
}

function compactScore(scoreDetail) {
  if (!scoreDetail || typeof scoreDetail !== 'object') return null
  const side = scoreDetail.side || {}
  const nested = side.dimensions || {}
  const dimensionKeys = ['baby', 'view', 'psych', 'appearance', 'age', 'height', 'education', 'circle', 'city']
  const sideDimensions = dimensionKeys
    .filter((key) => side[key] !== undefined || nested[key])
    .map((key) => {
      const dim = nested[key] || {}
      return {
        key,
        score: side[key] !== undefined ? side[key] : dim.raw_score,
        max: dim.max_score || dim.max || null,
        compatibility_score: dim.compatibility_score || null
      }
    })
  return {
    version: scoreDetail.version || '',
    total: scoreDetail.total || scoreDetail.normalizedTotal || null,
    quality_gate: scoreDetail.quality_gate || null,
    dimensions: Array.isArray(scoreDetail.dimensions)
      ? scoreDetail.dimensions.map((item) => ({
        key: item.key,
        label: item.label,
        score: item.score,
        max: item.max,
        explain: item.explain
      })).slice(0, 12)
      : sideDimensions
  }
}

async function generateMutualMatchReports(userA, userB, scoreDetailA, scoreDetailB) {
  const cfg = await getConfig()
  if (!cfg.enabled) {
    return {
      status: 3,
      a: { text: null, error: 'disabled' },
      b: { text: null, error: 'disabled' },
      provider: 'minimax',
      model: cfg.model
    }
  }
  if (!cfg.apiKey) {
    return {
      status: 2,
      a: { text: null, error: 'missing MINIMAX_API_KEY' },
      b: { text: null, error: 'missing MINIMAX_API_KEY' },
      provider: 'minimax',
      model: cfg.model
    }
  }

  const payload = {
    userA: compactUser(userA),
    userB: compactUser(userB),
    scoreA: compactScore(scoreDetailA),
    scoreB: compactScore(scoreDetailB)
  }
  const prompt = [
    '你是 WeFinally 严肃婚恋平台的匹配报告助手。请基于脱敏资料分别给 A、B 写面向本人的中文匹配报告。',
    '约束：不做心理诊断，不承诺成功率，不写具体分数，不泄露收入/职位/单位/联系方式，不复述双方三观原文，不做颜值评价。',
    '每份报告三段：第一段讲现实基础和为什么值得由客服推进见面；第二段讲三观/婚育/城市/学历/外貌期待等契合或需要磨合处；第三段给 2-3 个见面前应由客服协助确认的话题。',
    '语气像婚恋顾问，具体、克制、可信。每份 180-260 字。',
    '只输出 JSON：{"a":"给A看的报告","b":"给B看的报告"}',
    `资料JSON：${JSON.stringify(payload).slice(0, 5000)}`
  ].join('\n')

  try {
    const data = await requestJson(endpointFor(cfg.baseURL), {
      model: cfg.model,
      system: '你只输出合法 JSON，不输出 Markdown。',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }],
      max_tokens: 700,
      temperature: 0.2,
      service_tier: 'priority',
      thinking: { type: 'disabled' },
      stream: false
    }, {
      Authorization: `Bearer ${cfg.apiKey}`
    }, cfg.timeoutMs)
    const parsed = extractJsonObject(textFromAnthropicResponse(data))
    const a = parsed && parsed.a ? String(parsed.a).trim() : ''
    const b = parsed && parsed.b ? String(parsed.b).trim() : ''
    if (!a || !b) throw new Error('MiniMax response missing report JSON')
    return {
      status: 1,
      a: { text: a.slice(0, 1000), error: '' },
      b: { text: b.slice(0, 1000), error: '' },
      provider: 'minimax',
      model: cfg.model,
      usage: data.usage || null
    }
  } catch (err) {
    console.error('[minimax] generateMutualMatchReports failed:', err.message)
    return {
      status: 2,
      a: { text: null, error: err.message },
      b: { text: null, error: err.message },
      provider: 'minimax',
      model: cfg.model
    }
  }
}

module.exports = {
  generateMutualMatchReports
}
