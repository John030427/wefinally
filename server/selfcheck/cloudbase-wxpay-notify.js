const assert = require('assert')
const crypto = require('crypto')

const { handleWechatPayNotify } = require('../../miniprogram/cloudfunctions/api/handlers/paymentNotify')

function encryptResource(plain, apiV3Key, nonce, associatedData) {
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce))
  cipher.setAAD(Buffer.from(associatedData))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()])
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64')
}

function sign(privateKey, timestamp, nonce, body) {
  return crypto.sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), privateKey).toString('base64')
}

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' })
  const apiV3Key = 'A1234567890123456789012345678901'
  const transaction = {
    appid: 'wx91c6559ea4490a29',
    mchid: '1747991634',
    out_trade_no: 'WF_NOTIFY_1',
    transaction_id: 'TX_NOTIFY_1',
    trade_state: 'SUCCESS',
    amount: { total: 18800, currency: 'CNY' }
  }
  const body = JSON.stringify({
    id: 'notify-id',
    resource: {
      algorithm: 'AEAD_AES_256_GCM',
      nonce: 'nonce-for-aes',
      associated_data: 'transaction',
      ciphertext: encryptResource(transaction, apiV3Key, 'nonce-for-aes', 'transaction')
    }
  })
  const timestamp = '1234567890'
  const nonce = 'notify-nonce'
  let finalized = null
  const result = await handleWechatPayNotify({
    httpMethod: 'POST',
    path: '/wxpay/notify',
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': sign(privateKey, timestamp, nonce, body),
      'wechatpay-serial': 'PUB_KEY_ID_TEST'
    },
    body
  }, {
    config: {
      ready: true,
      appId: 'wx91c6559ea4490a29',
      mchId: '1747991634',
      amountTotal: 18800,
      apiV3Key,
      wechatPayPublicKeyPem: publicPem,
      wechatPayPublicKeyId: 'PUB_KEY_ID_TEST'
    },
    orderService: {
      finalizePaidVipOrder: async (payload) => {
        finalized = payload
        return { paid: true }
      }
    }
  })

  assert.strictEqual(result.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(result.body), { code: 'SUCCESS', message: '成功' })
  assert.strictEqual(finalized.out_trade_no, 'WF_NOTIFY_1')

  const rejected = await handleWechatPayNotify({
    httpMethod: 'POST',
    path: '/wxpay/notify',
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': 'bad-signature',
      'wechatpay-serial': 'PUB_KEY_ID_TEST'
    },
    body
  }, {
    config: {
      ready: true,
      appId: 'wx91c6559ea4490a29',
      mchId: '1747991634',
      amountTotal: 18800,
      apiV3Key,
      wechatPayPublicKeyPem: publicPem,
      wechatPayPublicKeyId: 'PUB_KEY_ID_TEST'
    },
    orderService: {
      finalizePaidVipOrder: async () => {
        throw new Error('must not finalize invalid signature')
      }
    },
    logError: () => {}
  })
  assert.strictEqual(rejected.statusCode, 500)
  assert.strictEqual(JSON.parse(rejected.body).code, 'FAIL')

  console.log('PASS - cloudbase wxpay notify handler')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
