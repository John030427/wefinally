const PROVIDERS = new Set(['internal', 'wechat_kf', 'wecom'])

function readHumanServiceConfig(env = process.env) {
  const requested = String(env.HUMAN_SERVICE_PROVIDER || 'internal').trim().toLowerCase()
  return {
    provider: PROVIDERS.has(requested) ? requested : 'internal',
    corpId: String(env.HUMAN_SERVICE_CORP_ID || '').trim(),
    serviceUrl: String(env.HUMAN_SERVICE_URL || '').trim()
  }
}

function buildHumanServiceHandoff(config = readHumanServiceConfig()) {
  if (config.provider === 'wechat_kf') {
    return { provider: 'wechat_kf', available: true }
  }
  if (config.provider === 'wecom' && config.corpId && config.serviceUrl) {
    return {
      provider: 'wecom',
      available: true,
      corp_id: config.corpId,
      service_url: config.serviceUrl
    }
  }
  return { provider: 'internal', available: false }
}

module.exports = { readHumanServiceConfig, buildHumanServiceHandoff }
