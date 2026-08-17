const wechatpay = require('../lib/wechatpay')
const { createVipOrderService } = require('../lib/vipOrder')
const { httpMethod, httpPath } = require('../lib/httpEvent')

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }
}

function rawBody(event) {
  if (event.isBase64Encoded) return Buffer.from(event.body || '', 'base64').toString('utf8')
  return typeof event.body === 'string' ? event.body : JSON.stringify(event.body || {})
}

async function handleWechatPayNotify(event = {}, deps = {}) {
  const logError = deps.logError || console.error
  try {
    const config = deps.config || wechatpay.readWechatPayConfig()
    if (!config.ready) throw new Error('微信支付配置未完成')
    const body = rawBody(event)
    const signatureOk = wechatpay.verifyWechatPaySignature({
      headers: event.headers || {},
      body,
      publicKeyPem: config.wechatPayPublicKeyPem,
      expectedSerial: config.wechatPayPublicKeyId
    })
    if (!signatureOk) throw new Error('微信支付回调签名错误')
    const payload = JSON.parse(body)
    const transaction = wechatpay.decryptResource(payload.resource, config.apiV3Key)
    const orderService = deps.orderService || createVipOrderService()
    await orderService.finalizePaidVipOrder(transaction, config)
    return json(200, { code: 'SUCCESS', message: '成功' })
  } catch (err) {
    logError('[wxpay notify]', (err && err.message) || err)
    return json(500, { code: 'FAIL', message: '失败' })
  }
}

async function handleHttp(event = {}) {
  const method = httpMethod(event)
  const path = httpPath(event)
  if (method === 'POST' && /\/wxpay\/notify$/.test(path)) {
    return handleWechatPayNotify(event)
  }
  return require('./backoffice').handleBackofficeHttp(event)
}

module.exports = {
  handleWechatPayNotify,
  handleHttp
}
