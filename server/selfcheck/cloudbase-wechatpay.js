const assert = require('assert')
const crypto = require('crypto')

const wechatpay = require('../../miniprogram/cloudfunctions/api/lib/wechatpay')

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64')
}

function encryptResource(plain, apiV3Key, nonce, associatedData) {
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce))
  cipher.setAAD(Buffer.from(associatedData))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()])
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64')
}

function verifyRsa(publicKey, message, signature) {
  return crypto.verify('RSA-SHA256', Buffer.from(message), publicKey, Buffer.from(signature, 'base64'))
}

function signCallback(privateKey, timestamp, nonce, body) {
  const message = `${timestamp}\n${nonce}\n${body}\n`
  return crypto.sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64')
}

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' })
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const apiV3Key = 'A1234567890123456789012345678901'

  const config = wechatpay.readWechatPayConfig({
    WXPAY_ENABLED: 'true',
    WXPAY_APP_ID: 'wx91c6559ea4490a29',
    WXPAY_MCH_ID: '1747991634',
    WXPAY_NOTIFY_URL: 'https://example.com/wxpay/notify',
    WXPAY_MERCHANT_SERIAL_NO: 'MERCHANT_SERIAL',
    WXPAY_MERCHANT_PRIVATE_KEY_BASE64: b64(privatePem),
    WXPAY_API_V3_KEY: apiV3Key,
    WXPAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_TEST',
    WXPAY_PUBLIC_KEY_BASE64: b64(publicPem),
    PAYMENT_STAGE: 'production',
    PAYMENT_TEST_AMOUNT_FEN: '1'
  })

  assert.strictEqual(config.enabled, true)
  assert.strictEqual(config.ready, true)
  assert.strictEqual(config.appId, 'wx91c6559ea4490a29')
  assert.strictEqual(config.mchId, '1747991634')
  assert.strictEqual(wechatpay.vipAmountFen({ PAYMENT_STAGE: 'production', PAYMENT_TEST_AMOUNT_FEN: '1' }), 18800)
  assert.strictEqual(wechatpay.vipAmountFen({ PAYMENT_STAGE: 'test', PAYMENT_TEST_AMOUNT_FEN: '1' }), 1)

  const body = JSON.stringify({ appid: config.appId, mchid: config.mchId })
  const auth = wechatpay.buildAuthorization({
    method: 'POST',
    urlPath: '/v3/pay/transactions/jsapi',
    timestamp: '1234567890',
    nonce: 'nonce123',
    body,
    mchId: config.mchId,
    serialNo: config.merchantSerialNo,
    privateKeyPem: config.merchantPrivateKeyPem
  })

  assert(auth.header.includes('WECHATPAY2-SHA256-RSA2048'))
  assert(auth.header.includes('mchid="1747991634"'))
  assert(auth.header.includes('serial_no="MERCHANT_SERIAL"'))
  assert.strictEqual(verifyRsa(publicPem, auth.signatureMessage, auth.signature), true)

  const apiRequest = wechatpay.buildWechatPayRequest({
    method: 'POST',
    urlPath: '/v3/pay/transactions/jsapi',
    body: { appid: config.appId, mchid: config.mchId },
    config,
    timestamp: '1234567890',
    nonce: 'request-nonce'
  })
  assert.strictEqual(apiRequest.options.headers['Wechatpay-Serial'], 'PUB_KEY_ID_TEST')
  assert.strictEqual(apiRequest.options.headers['User-Agent'], 'WeFinally-WeChatMiniProgram/1.0')
  assert.strictEqual(apiRequest.options.method, 'POST')

  const miniPay = wechatpay.buildMiniProgramPayParams({
    appId: config.appId,
    prepayId: 'wx_pre_pay_id',
    privateKeyPem: config.merchantPrivateKeyPem,
    nowSeconds: () => 1234567890,
    nonce: () => 'paynonce'
  })

  assert.strictEqual(miniPay.timeStamp, '1234567890')
  assert.strictEqual(miniPay.nonceStr, 'paynonce')
  assert.strictEqual(miniPay.package, 'prepay_id=wx_pre_pay_id')
  assert.strictEqual(miniPay.signType, 'RSA')
  assert.strictEqual(verifyRsa(publicPem, 'wx91c6559ea4490a29\n1234567890\npaynonce\nprepay_id=wx_pre_pay_id\n', miniPay.paySign), true)

  const transaction = {
    appid: config.appId,
    mchid: config.mchId,
    out_trade_no: 'WF_TEST_1',
    transaction_id: 'TX_TEST_1',
    trade_state: 'SUCCESS',
    amount: { total: 18800, currency: 'CNY' }
  }
  const resource = {
    algorithm: 'AEAD_AES_256_GCM',
    nonce: 'nonce-for-aes',
    associated_data: 'transaction',
    ciphertext: encryptResource(transaction, apiV3Key, 'nonce-for-aes', 'transaction')
  }
  assert.deepStrictEqual(wechatpay.decryptResource(resource, apiV3Key), transaction)
  assert.throws(() => wechatpay.decryptResource(resource, 'B1234567890123456789012345678901'))

  const notifyBody = JSON.stringify({ id: 'notify-id', resource })
  const timestamp = '1234567890'
  const nonce = 'notify-nonce'
  const signature = signCallback(privateKey, timestamp, nonce, notifyBody)
  assert.strictEqual(wechatpay.verifyWechatPaySignature({
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'PUB_KEY_ID_TEST'
    },
    body: notifyBody,
    publicKeyPem: config.wechatPayPublicKeyPem,
    expectedSerial: 'PUB_KEY_ID_TEST'
  }), true)

  assert.strictEqual(wechatpay.verifyWechatPaySignature({
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'PUB_KEY_ID_TEST'
    },
    body: `${notifyBody} `,
    publicKeyPem: config.wechatPayPublicKeyPem,
    expectedSerial: 'PUB_KEY_ID_TEST'
  }), false)

  assert.strictEqual(wechatpay.verifyWechatPaySignature({
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature
    },
    body: notifyBody,
    publicKeyPem: config.wechatPayPublicKeyPem,
    expectedSerial: 'PUB_KEY_ID_TEST'
  }), false)

  const queryBody = JSON.stringify(transaction)
  const queryHeaders = {
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': nonce,
    'wechatpay-signature': signCallback(privateKey, timestamp, nonce, queryBody),
    'wechatpay-serial': 'PUB_KEY_ID_TEST'
  }
  assert.strictEqual(wechatpay.assertWechatPayResponseSignature({
    headers: queryHeaders,
    body: queryBody,
    config
  }), true)
  assert.throws(() => wechatpay.assertWechatPayResponseSignature({
    headers: queryHeaders,
    body: `${queryBody} `,
    config
  }), /签名/)

  let queryRequest = null
  const queried = await wechatpay.requestTransactionByOrderNo({
    config,
    orderNo: 'WF_TEST_1',
    request: async (input) => {
      queryRequest = input
      return transaction
    }
  })
  assert.strictEqual(queryRequest.method, 'GET')
  assert.strictEqual(queryRequest.urlPath, '/v3/pay/transactions/out-trade-no/WF_TEST_1?mchid=1747991634')
  assert.strictEqual(queried.trade_state, 'SUCCESS')

  console.log('PASS - cloudbase wechatpay utility')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
