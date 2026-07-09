const crypto = require('crypto')
const https = require('https')

const PROD_AMOUNT_FEN = 18800
const DEFAULT_APP_ID = 'wx91c6559ea4490a29'
const DEFAULT_MCH_ID = '1747991634'

function truthy(value) {
  const text = String(value || '').trim().toLowerCase()
  return value === true || value === 1 || text === 'true' || text === '1' || text === 'yes' || text === 'on'
}

function decodeBase64Text(value) {
  if (!value) return ''
  return Buffer.from(String(value).trim(), 'base64').toString('utf8')
}

function vipAmountFen(env = process.env) {
  if (String(env.PAYMENT_STAGE || '').toLowerCase() === 'test') {
    const amount = Number(env.PAYMENT_TEST_AMOUNT_FEN || 1)
    return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 1
  }
  return PROD_AMOUNT_FEN
}

function readWechatPayConfig(env = process.env) {
  const enabled = truthy(env.WXPAY_ENABLED)
  const config = {
    enabled,
    appId: env.WXPAY_APP_ID || DEFAULT_APP_ID,
    mchId: env.WXPAY_MCH_ID || DEFAULT_MCH_ID,
    notifyUrl: env.WXPAY_NOTIFY_URL || '',
    merchantSerialNo: env.WXPAY_MERCHANT_SERIAL_NO || '',
    merchantPrivateKeyPem: decodeBase64Text(env.WXPAY_MERCHANT_PRIVATE_KEY_BASE64),
    apiV3Key: env.WXPAY_API_V3_KEY || '',
    wechatPayPublicKeyId: env.WXPAY_PUBLIC_KEY_ID || '',
    wechatPayPublicKeyPem: decodeBase64Text(env.WXPAY_PUBLIC_KEY_BASE64),
    amountTotal: vipAmountFen(env),
    stage: env.PAYMENT_STAGE || 'production'
  }
  const required = [
    ['WXPAY_NOTIFY_URL', config.notifyUrl],
    ['WXPAY_MERCHANT_SERIAL_NO', config.merchantSerialNo],
    ['WXPAY_MERCHANT_PRIVATE_KEY_BASE64', config.merchantPrivateKeyPem],
    ['WXPAY_API_V3_KEY', config.apiV3Key],
    ['WXPAY_PUBLIC_KEY_ID', config.wechatPayPublicKeyId],
    ['WXPAY_PUBLIC_KEY_BASE64', config.wechatPayPublicKeyPem]
  ]
  config.missing = enabled ? required.filter((item) => !item[1]).map((item) => item[0]) : []
  config.ready = enabled && config.missing.length === 0
  return config
}

function nonce(size = 32) {
  return crypto.randomBytes(size).toString('hex').slice(0, size)
}

function signRsaSha256(privateKeyPem, message) {
  return crypto.sign('RSA-SHA256', Buffer.from(message), privateKeyPem).toString('base64')
}

function buildAuthorization({ method, urlPath, timestamp, nonce: nonceStr, body, mchId, serialNo, privateKeyPem }) {
  const signatureMessage = `${String(method).toUpperCase()}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body || ''}\n`
  const signature = signRsaSha256(privateKeyPem, signatureMessage)
  return {
    signature,
    signatureMessage,
    header: `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`
  }
}

function buildMiniProgramPayParams({ appId, prepayId, privateKeyPem, nowSeconds = () => Math.floor(Date.now() / 1000), nonce: nonceFn = nonce }) {
  const timeStamp = String(nowSeconds())
  const nonceStr = nonceFn(32)
  const pkg = `prepay_id=${prepayId}`
  const paySign = signRsaSha256(privateKeyPem, `${appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`)
  return { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign }
}

function headerValue(headers, name) {
  const target = String(name).toLowerCase()
  const found = Object.keys(headers || {}).find((key) => key.toLowerCase() === target)
  return found ? headers[found] : ''
}

function verifyWechatPaySignature({ headers, body, publicKeyPem, expectedSerial }) {
  const timestamp = headerValue(headers, 'wechatpay-timestamp')
  const nonceStr = headerValue(headers, 'wechatpay-nonce')
  const signature = headerValue(headers, 'wechatpay-signature')
  const serial = headerValue(headers, 'wechatpay-serial')
  if (!timestamp || !nonceStr || !signature || !publicKeyPem) return false
  if (expectedSerial && serial && serial !== expectedSerial) return false
  const message = `${timestamp}\n${nonceStr}\n${body || ''}\n`
  try {
    return crypto.verify('RSA-SHA256', Buffer.from(message), publicKeyPem, Buffer.from(signature, 'base64'))
  } catch (err) {
    return false
  }
}

function decryptResource(resource, apiV3Key) {
  if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') throw new Error('不支持的微信支付加密算法')
  if (!apiV3Key || Buffer.byteLength(apiV3Key) !== 32) throw new Error('微信支付 APIv3 密钥长度错误')
  const raw = Buffer.from(resource.ciphertext, 'base64')
  const data = raw.slice(0, raw.length - 16)
  const authTag = raw.slice(raw.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(resource.nonce))
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data))
  decipher.setAuthTag(authTag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  return JSON.parse(plain)
}

function postJson(urlPath, body, config) {
  const payload = JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = nonce(32)
  const auth = buildAuthorization({
    method: 'POST',
    urlPath,
    timestamp,
    nonce: nonceStr,
    body: payload,
    mchId: config.mchId,
    serialNo: config.merchantSerialNo,
    privateKeyPem: config.merchantPrivateKeyPem
  })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.mch.weixin.qq.com',
      path: urlPath,
      method: 'POST',
      headers: {
        Authorization: auth.header,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => {
        let json = {}
        try {
          json = text ? JSON.parse(text) : {}
        } catch (err) {
          return reject(new Error(`微信支付返回非 JSON: ${text.slice(0, 80)}`))
        }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(json.message || `微信支付下单失败 ${res.statusCode}`))
        resolve(json)
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function requestJsapiPrepay({ config, openid, orderNo, amountTotal, description = 'WeFinally VIP会员', post = postJson }) {
  const body = {
    appid: config.appId,
    mchid: config.mchId,
    description,
    out_trade_no: orderNo,
    notify_url: config.notifyUrl,
    amount: { total: amountTotal, currency: 'CNY' },
    payer: { openid }
  }
  return post('/v3/pay/transactions/jsapi', body, config)
}

module.exports = {
  readWechatPayConfig,
  vipAmountFen,
  buildAuthorization,
  buildMiniProgramPayParams,
  verifyWechatPaySignature,
  decryptResource,
  requestJsapiPrepay,
  postJson
}
