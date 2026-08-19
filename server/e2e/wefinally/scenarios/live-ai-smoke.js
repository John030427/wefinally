'use strict'

const { createLiveAiProvider, hasCloudbaseCredentials } = require('../harness/aiProvider')

function liveSmokeEnabled() {
  return process.env.E2E_LIVE_SMOKE === 'true' || process.env.E2E_AI_MODE === 'live'
}

async function run() {
  const name = 'LIVE-AI-SMOKE'
  if (!liveSmokeEnabled()) {
    return {
      name,
      pass: true,
      skipped: true,
      actual: 'skipped (set E2E_LIVE_SMOKE=true or E2E_AI_MODE=live)'
    }
  }
  if (!hasCloudbaseCredentials(process.env)) {
    return {
      name,
      pass: true,
      blocked: true,
      expected: 'cloudbase hy3 live smoke',
      actual: 'BLOCKED_BY_EXTERNAL_MANUAL_ACTION (missing TCB/TencentCloud credentials)'
    }
  }
  try {
    const live = createLiveAiProvider(process.env)
    const result = await live.generateDecision({ message: 'Reply with OK for synthetic E2E smoke.' })
    if (!result || result.provider !== 'cloudbase') {
      throw new Error(`expected cloudbase provider, got ${result && result.provider}`)
    }
    return {
      name,
      pass: true,
      expected: 'cloudbase hy3 live smoke',
      actual: `provider=${result.provider}`
    }
  } catch (error) {
    const blocked = /secretId|secretKey|credential|INVALID_PARAM|cloudbase|init/i.test(String(error.message || error))
    return {
      name,
      pass: blocked,
      blocked,
      error: error.message,
      actual: blocked
        ? 'BLOCKED_BY_EXTERNAL_MANUAL_ACTION (CloudBase AI unavailable)'
        : error.message
    }
  }
}

module.exports = { run, id: 'live-ai-smoke' }
