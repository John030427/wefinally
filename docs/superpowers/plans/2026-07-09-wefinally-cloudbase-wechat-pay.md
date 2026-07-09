# WeFinally CloudBase WeChat Pay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the smallest real WeChat Pay API v3 JSAPI payment loop for the 188 yuan / 30 day VIP product on the current CloudBase mini program path.

**Architecture:** Keep mini program authenticated calls on the existing `wx.cloud.callFunction -> cloudfunctions/api -> CloudBase database` path. Add one HTTP-accessible notify route on the same `api` cloud function so WeChat Pay can call `notify_url`. Put WeChat Pay signing/decryption in `lib/wechatpay.js` and order/VIP state in `lib/vipOrder.js` so a later Tencent Cloud server migration can reuse the core and replace only adapters.

**Tech Stack:** WeChat Mini Program, CloudBase cloud functions, CloudBase database, Node.js built-in `crypto` and `https`, WeChat Pay API v3 JSAPI.

## Global Constraints

- Do not store or print real MiniMax keys, WeChat Pay APIv3 keys, merchant private keys, payment signatures, decrypted callback payloads, or merchant certificate contents.
- Do not add a third-party payment dependency; use Node.js standard library for signing, verification, AES-GCM, and HTTPS.
- Production VIP amount is fixed server-side at `18800` fen, product price `188` yuan, VIP duration `30` days.
- `PAYMENT_TEST_AMOUNT_FEN` is honored only when `PAYMENT_STAGE=test`.
- Demo VIP grant can run only when real WeChat Pay is not enabled.
- Client-side `wx.requestPayment` success is not enough to show final VIP success; backend order status must confirm paid.
- Keep existing unrelated worktree changes untouched.
- Use test-first changes for payment utilities, handlers, and frontend behavior checks.

---

## File Structure

- Create `miniprogram/cloudfunctions/api/lib/wechatpay.js`: read payment env, sign API v3 requests, sign mini program pay params, verify WeChat Pay callback signatures, decrypt callback resources, post JSAPI order requests.
- Create `miniprogram/cloudfunctions/api/lib/vipOrder.js`: create pending VIP orders, save `prepay_id`, validate paid transactions, idempotently grant VIP, and expose order status.
- Modify `miniprogram/cloudfunctions/api/handlers/vip.js`: keep `info`, replace demo-only `purchase`, add `status`, expose injectable handler factory for tests.
- Create `miniprogram/cloudfunctions/api/handlers/paymentNotify.js`: handle WeChat Pay API v3 callback HTTP events.
- Modify `miniprogram/cloudfunctions/api/handlers/route.js`: add `GET /api/order/status`.
- Modify `miniprogram/cloudfunctions/api/index.js`: dispatch HTTP callback events before normal `action` events.
- Modify `miniprogram/utils/constants.js`: add `ORDER_STATUS`.
- Modify `miniprogram/pages/vip/vip.js`: call `wx.requestPayment`, poll backend status, and show processing state.
- Modify `miniprogram/pages/vip/vip.wxml`: show a short payment confirmation state.
- Modify `miniprogram/pages/vip/vip.wxss`: add one minimal style for the processing text.
- Create `server/selfcheck/cloudbase-wechatpay.js`: pure utility selfcheck.
- Create `server/selfcheck/cloudbase-vip-payment.js`: order service and handler selfcheck with fake dependencies.
- Create `server/selfcheck/cloudbase-wxpay-notify.js`: callback handler selfcheck with generated RSA keys and encrypted fixture.
- Create `server/selfcheck/miniprogram-vip-payment.js`: source-level mini program behavior check.
- Modify `server/package.json`: add `selfcheck:cloudpay`.
- Modify `project-docs/USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md`: replace "payment not ready" wording with real-payment setup steps and a credential warning.

---

### Task 1: WeChat Pay API v3 Utility

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/wechatpay.js`
- Create: `server/selfcheck/cloudbase-wechatpay.js`
- Modify: `server/package.json`

**Interfaces:**
- Produces:
  - `readWechatPayConfig(env = process.env): object`
  - `vipAmountFen(env = process.env): number`
  - `buildAuthorization(input): { header, signatureMessage }`
  - `buildMiniProgramPayParams(input): object`
  - `verifyWechatPaySignature(input): boolean`
  - `decryptResource(resource, apiV3Key): object`
  - `requestJsapiPrepay(input): Promise<object>`
  - `postJson(urlPath, body, config): Promise<object>`
- Consumes: only Node.js `crypto` and `https`.

- [ ] **Step 1: Write the failing utility selfcheck**

Create `server/selfcheck/cloudbase-wechatpay.js`:

```js
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
  const signature = signCallback(privatePem, timestamp, nonce, notifyBody)
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

  console.log('PASS - cloudbase wechatpay utility')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the selfcheck and verify it fails for the missing module**

Run:

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
node server/selfcheck/cloudbase-wechatpay.js
```

Expected: FAIL with `Cannot find module '../../miniprogram/cloudfunctions/api/lib/wechatpay'`.

- [ ] **Step 3: Implement the utility with Node standard library only**

Create `miniprogram/cloudfunctions/api/lib/wechatpay.js` with these exports and behavior:

```js
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
        try { json = text ? JSON.parse(text) : {} } catch (err) { return reject(new Error(`微信支付返回非 JSON: ${text.slice(0, 80)}`)) }
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
```

- [ ] **Step 4: Run the utility selfcheck and verify it passes**

Run:

```bash
node server/selfcheck/cloudbase-wechatpay.js
```

Expected: `PASS - cloudbase wechatpay utility`.

- [ ] **Step 5: Add a package script for the payment checks**

Modify `server/package.json` scripts:

```json
"selfcheck:cloudpay": "node selfcheck/cloudbase-wechatpay.js && node selfcheck/cloudbase-vip-payment.js && node selfcheck/cloudbase-wxpay-notify.js && node selfcheck/miniprogram-vip-payment.js"
```

Expected after this step: the new script exists, though later files are created in following tasks.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add miniprogram/cloudfunctions/api/lib/wechatpay.js server/selfcheck/cloudbase-wechatpay.js server/package.json
git commit -m "feat(pay): add wechat pay v3 utility"
```

---

### Task 2: VIP Order State Service

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/vipOrder.js`
- Create: `server/selfcheck/cloudbase-vip-payment.js`

**Interfaces:**
- Consumes:
  - `db.first`, `db.addWithId`, `db.updateByDoc`, `db.col`, `db._`, `db.now`
  - payment config object from `wechatpay.readWechatPayConfig`
- Produces:
  - `createVipOrderService(deps).createPendingVipOrder(user, options)`
  - `createVipOrderService(deps).savePrepay(order, prepay)`
  - `createVipOrderService(deps).grantDemoVip(user)`
  - `createVipOrderService(deps).getStatusForUser(user, orderNo)`
  - `createVipOrderService(deps).finalizePaidVipOrder(transaction, config)`
  - `validatePaidTransaction(order, transaction, config)`
  - `nextVipExpire(currentExpire, paidAt, days)`

- [ ] **Step 1: Write the failing VIP order selfcheck**

Create `server/selfcheck/cloudbase-vip-payment.js`:

```js
const assert = require('assert')

const {
  createVipOrderService,
  nextVipExpire,
  validatePaidTransaction
} = require('../../miniprogram/cloudfunctions/api/lib/vipOrder')

function makeFakeDeps() {
  const state = {
    orders: [],
    users: [{
      _id: 'user_1',
      id: 1,
      openid: 'openid_1',
      is_vip: 0,
      vip_expire_time: null,
      status: 1
    }],
    now: new Date('2026-07-09T00:00:00.000Z')
  }
  const collections = {
    user_order: state.orders,
    user: state.users
  }
  function matches(row, query) {
    return Object.keys(query || {}).every((key) => {
      const expected = query[key]
      if (expected && expected.__op === 'neq') return row[key] !== expected.value
      return row[key] === expected
    })
  }
  return {
    state,
    now: () => new Date(state.now),
    _: {
      neq: (value) => ({ __op: 'neq', value })
    },
    first: async (name, query) => (collections[name] || []).find((row) => matches(row, query)) || null,
    addWithId: async (name, data, prefix) => {
      const row = Object.assign({}, data, {
        _id: `${prefix || name}_${collections[name].length + 1}`,
        id: collections[name].length + 1,
        create_time: new Date(state.now),
        update_time: new Date(state.now)
      })
      collections[name].push(row)
      return row
    },
    updateByDoc: async (name, doc, data) => {
      const rows = collections[name] || []
      const row = rows.find((item) => item._id === doc._id)
      if (!row) throw new Error('missing doc')
      Object.assign(row, data, { update_time: new Date(state.now) })
      return row
    },
    col: (name) => ({
      where: (query) => ({
        update: async ({ data }) => {
          let updated = 0
          ;(collections[name] || []).forEach((row) => {
            if (matches(row, query)) {
              Object.assign(row, data, { update_time: new Date(state.now) })
              updated += 1
            }
          })
          return { stats: { updated } }
        }
      })
    })
  }
}

async function main() {
  const deps = makeFakeDeps()
  const service = createVipOrderService(deps)
  const user = deps.state.users[0]
  const config = {
    appId: 'wx91c6559ea4490a29',
    mchId: '1747991634',
    amountTotal: 18800
  }

  assert.strictEqual(nextVipExpire(null, new Date('2026-07-09T00:00:00.000Z'), 30).toISOString(), '2026-08-08T00:00:00.000Z')
  assert.strictEqual(nextVipExpire('2026-08-01T00:00:00.000Z', new Date('2026-07-09T00:00:00.000Z'), 30).toISOString(), '2026-08-31T00:00:00.000Z')

  const order = await service.createPendingVipOrder(user, {
    orderNo: 'WF_TEST_ORDER_1',
    amountTotal: 18800
  })
  assert.strictEqual(order.order_no, 'WF_TEST_ORDER_1')
  assert.strictEqual(order.price, 188)
  assert.strictEqual(order.amount_total, 18800)
  assert.strictEqual(order.pay_status, 0)
  assert.strictEqual(order.vip_granted, 0)

  await service.savePrepay(order, { prepay_id: 'wx_pre_pay_id' })
  assert.strictEqual(deps.state.orders[0].prepay_id, 'wx_pre_pay_id')

  assert.throws(() => validatePaidTransaction(order, {
    appid: config.appId,
    mchid: config.mchId,
    out_trade_no: order.order_no,
    trade_state: 'SUCCESS',
    amount: { total: 1, currency: 'CNY' }
  }, config), /金额/)

  const paid = await service.finalizePaidVipOrder({
    appid: config.appId,
    mchid: config.mchId,
    out_trade_no: order.order_no,
    transaction_id: 'TX_TEST_1',
    trade_state: 'SUCCESS',
    success_time: '2026-07-09T00:00:00+08:00',
    amount: { total: 18800, currency: 'CNY' }
  }, config)

  assert.strictEqual(paid.paid, true)
  assert.strictEqual(deps.state.orders[0].pay_status, 1)
  assert.strictEqual(deps.state.orders[0].vip_granted, 1)
  assert.strictEqual(deps.state.users[0].is_vip, 1)
  const firstExpire = String(deps.state.users[0].vip_expire_time)

  const duplicate = await service.finalizePaidVipOrder({
    appid: config.appId,
    mchid: config.mchId,
    out_trade_no: order.order_no,
    transaction_id: 'TX_TEST_1',
    trade_state: 'SUCCESS',
    success_time: '2026-07-09T00:00:00+08:00',
    amount: { total: 18800, currency: 'CNY' }
  }, config)

  assert.strictEqual(duplicate.idempotent, true)
  assert.strictEqual(String(deps.state.users[0].vip_expire_time), firstExpire)

  const status = await service.getStatusForUser(user, order.order_no)
  assert.strictEqual(status.order_no, order.order_no)
  assert.strictEqual(status.pay_status, 1)
  assert.strictEqual(status.is_paid, true)

  console.log('PASS - cloudbase vip payment order service')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the selfcheck and verify it fails for the missing module**

Run:

```bash
node server/selfcheck/cloudbase-vip-payment.js
```

Expected: FAIL with `Cannot find module '../../miniprogram/cloudfunctions/api/lib/vipOrder'`.

- [ ] **Step 3: Implement the VIP order service**

Create `miniprogram/cloudfunctions/api/lib/vipOrder.js` with this structure:

```js
const VIP_PRICE_YUAN = 188
const VIP_DAYS = 30
const PARTNER_COMMISSION = 94
const PLATFORM_INCOME = 94

function cloudDeps() {
  return require('./db')
}

function orderNo() {
  return `WF${Date.now()}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
}

function paidAtFrom(transaction, now) {
  if (transaction && transaction.success_time) {
    const parsed = new Date(transaction.success_time)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return now()
}

function nextVipExpire(currentExpire, paidAt, days = VIP_DAYS) {
  const current = currentExpire ? new Date(currentExpire) : null
  const base = current && current.getTime() > paidAt.getTime() ? current : paidAt
  return new Date(base.getTime() + days * 86400000)
}

function validatePaidTransaction(order, transaction, config) {
  if (!order) throw new Error('订单不存在')
  if (!transaction) throw new Error('支付通知为空')
  if (transaction.appid !== config.appId) throw new Error('微信支付 appid 不匹配')
  if (transaction.mchid !== config.mchId) throw new Error('微信支付商户号不匹配')
  if (transaction.out_trade_no !== order.order_no) throw new Error('微信支付订单号不匹配')
  if (transaction.trade_state !== 'SUCCESS') throw new Error('微信支付状态不是成功')
  const amount = transaction.amount || {}
  if (Number(amount.total) !== Number(order.amount_total || config.amountTotal)) throw new Error('微信支付金额不匹配')
  if ((amount.currency || 'CNY') !== 'CNY') throw new Error('微信支付币种不匹配')
}

function isUpdated(res) {
  return Number(res && res.stats && res.stats.updated) > 0
}

function createVipOrderService(deps = cloudDeps()) {
  const { first, addWithId, updateByDoc, col, _, now } = deps

  async function createPendingVipOrder(user, options = {}) {
    return addWithId('user_order', {
      user_id: user.id,
      openid: user.openid,
      order_no: options.orderNo || orderNo(),
      price: VIP_PRICE_YUAN,
      amount_total: Number(options.amountTotal),
      currency: 'CNY',
      vip_days: VIP_DAYS,
      partner_commission: PARTNER_COMMISSION,
      platform_income: PLATFORM_INCOME,
      circle_id: user.circle_id || 0,
      partner_id: user.promote_partner_id || 0,
      pay_status: 0,
      trade_state: 'NOTPAY',
      prepay_id: '',
      transaction_id: '',
      pay_time: null,
      notify_received_at: null,
      pay_error: '',
      vip_granted: 0,
      settle_status: 0
    }, 'order')
  }

  async function savePrepay(order, prepay) {
    return updateByDoc('user_order', order, {
      prepay_id: prepay.prepay_id || '',
      trade_state: 'PREPAY_CREATED',
      pay_error: ''
    })
  }

  async function grantDemoVip(user) {
    return updateByDoc('user', user, {
      is_vip: 1,
      vip_expire_time: nextVipExpire(user.vip_expire_time, now(), VIP_DAYS),
      status: 1
    })
  }

  async function getStatusForUser(user, orderNoValue) {
    const order = await first('user_order', { order_no: orderNoValue, user_id: user.id })
    if (!order) throw new Error('订单不存在')
    return {
      order_no: order.order_no,
      pay_status: Number(order.pay_status || 0),
      is_paid: Number(order.pay_status || 0) === 1,
      trade_state: order.trade_state || '',
      transaction_id: order.transaction_id || '',
      pay_time: order.pay_time || null,
      vip_expire_time: order.vip_expire_time || null
    }
  }

  async function finalizePaidVipOrder(transaction, config) {
    const order = await first('user_order', { order_no: transaction.out_trade_no })
    validatePaidTransaction(order, transaction, config)
    const paidAt = paidAtFrom(transaction, now)

    if (Number(order.pay_status || 0) !== 1) {
      await col('user_order').where({ _id: order._id, pay_status: 0 }).update({
        data: {
          pay_status: 1,
          trade_state: 'SUCCESS',
          transaction_id: transaction.transaction_id || '',
          pay_time: paidAt,
          notify_received_at: now(),
          pay_error: ''
        }
      })
    }

    const latestOrder = await first('user_order', { order_no: transaction.out_trade_no })
    if (Number(latestOrder.vip_granted || 0) === 1) {
      return { paid: true, idempotent: true, order: latestOrder }
    }

    const user = await first('user', { id: latestOrder.user_id })
    if (!user) throw new Error('订单用户不存在')
    const expire = nextVipExpire(user.vip_expire_time, paidAt, Number(latestOrder.vip_days || VIP_DAYS))
    const userUpdate = await col('user').where({
      _id: user._id,
      last_vip_order_no: _.neq(latestOrder.order_no)
    }).update({
      data: {
        is_vip: 1,
        vip_expire_time: expire,
        last_vip_order_no: latestOrder.order_no,
        status: 1
      }
    })

    await updateByDoc('user_order', latestOrder, {
      vip_granted: 1,
      vip_expire_time: expire,
      vip_grant_skipped: isUpdated(userUpdate) ? 0 : 1
    })

    return { paid: true, idempotent: !isUpdated(userUpdate), order: latestOrder, vip_expire_time: expire }
  }

  return {
    createPendingVipOrder,
    savePrepay,
    grantDemoVip,
    getStatusForUser,
    finalizePaidVipOrder
  }
}

module.exports = {
  createVipOrderService,
  nextVipExpire,
  validatePaidTransaction
}
```

- [ ] **Step 4: Run the VIP order selfcheck and verify it passes**

Run:

```bash
node server/selfcheck/cloudbase-vip-payment.js
```

Expected: `PASS - cloudbase vip payment order service`.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add miniprogram/cloudfunctions/api/lib/vipOrder.js server/selfcheck/cloudbase-vip-payment.js
git commit -m "feat(pay): add vip order state service"
```

---

### Task 3: VIP Purchase And Order Status Routes

**Files:**
- Modify: `miniprogram/cloudfunctions/api/handlers/vip.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/route.js`
- Modify: `miniprogram/utils/constants.js`
- Modify: `server/selfcheck/cloudbase-vip-payment.js`

**Interfaces:**
- Consumes:
  - `wechatpay.readWechatPayConfig`
  - `wechatpay.requestJsapiPrepay`
  - `wechatpay.buildMiniProgramPayParams`
  - `vipOrder.createVipOrderService`
  - `flagEnabled('cloud_demo_vip_grant_enabled')`
  - `currentUser(wxContext)`
- Produces:
  - `GET /api/order/status` with `order_no`
  - `vip.purchase` returns `payment` only for real configured WeChat Pay or `demo_granted` only for isolated demo mode.

- [ ] **Step 1: Extend the selfcheck before changing handlers**

Append these assertions to `server/selfcheck/cloudbase-vip-payment.js` after the order service assertions:

```js
  const { createVipHandlers } = require('../../miniprogram/cloudfunctions/api/handlers/vip')
  const fakeUser = Object.assign({}, user, { is_vip: 0, vip_expire_time: null })
  let createdOrder = null
  const handlers = createVipHandlers({
    currentUser: async () => fakeUser,
    flagEnabled: async () => false,
    readWechatPayConfig: () => Object.assign({}, config, {
      enabled: true,
      ready: true,
      merchantPrivateKeyPem: 'PRIVATE_KEY'
    }),
    requestJsapiPrepay: async ({ orderNo, amountTotal }) => {
      assert.strictEqual(orderNo, 'WF_TEST_ORDER_2')
      assert.strictEqual(amountTotal, 18800)
      return { prepay_id: 'wx_prepay_2' }
    },
    buildMiniProgramPayParams: () => ({
      timeStamp: '123',
      nonceStr: 'nonce',
      package: 'prepay_id=wx_prepay_2',
      signType: 'RSA',
      paySign: 'pay-sign'
    }),
    orderService: {
      createPendingVipOrder: async () => {
        createdOrder = {
          order_no: 'WF_TEST_ORDER_2',
          price: 188,
          amount_total: 18800,
          pay_status: 0
        }
        return createdOrder
      },
      savePrepay: async (order, prepay) => Object.assign(order, { prepay_id: prepay.prepay_id }),
      getStatusForUser: async () => ({ order_no: 'WF_TEST_ORDER_2', pay_status: 1, is_paid: true })
    }
  })
  const purchase = await handlers.purchase({}, {})
  assert.strictEqual(createdOrder.order_no, 'WF_TEST_ORDER_2')
  assert.strictEqual(purchase.order_no, 'WF_TEST_ORDER_2')
  assert.strictEqual(purchase.payment.package, 'prepay_id=wx_prepay_2')
  assert.strictEqual(purchase.demo_granted, false)
  const routeStatus = await handlers.status({ order_no: 'WF_TEST_ORDER_2' }, {})
  assert.strictEqual(routeStatus.is_paid, true)
```

- [ ] **Step 2: Run the selfcheck and verify it fails because `createVipHandlers` is not exported**

Run:

```bash
node server/selfcheck/cloudbase-vip-payment.js
```

Expected: FAIL with `createVipHandlers is not a function` or equivalent.

- [ ] **Step 3: Refactor `handlers/vip.js` into an injectable factory and wire real purchase**

Replace `miniprogram/cloudfunctions/api/handlers/vip.js` with:

```js
const defaultWechatPay = require('../lib/wechatpay')
const { createVipOrderService } = require('../lib/vipOrder')
const defaultUser = require('./user')
const { isVipActive } = require('../lib/format')
const defaultFlags = require('../lib/flags')

function createVipHandlers(deps = {}) {
  const currentUser = deps.currentUser || defaultUser.currentUser
  const flagEnabled = deps.flagEnabled || defaultFlags.flagEnabled
  const readWechatPayConfig = deps.readWechatPayConfig || defaultWechatPay.readWechatPayConfig
  const requestJsapiPrepay = deps.requestJsapiPrepay || defaultWechatPay.requestJsapiPrepay
  const buildMiniProgramPayParams = deps.buildMiniProgramPayParams || defaultWechatPay.buildMiniProgramPayParams
  const orderService = deps.orderService || createVipOrderService()

  async function info(data, wxContext) {
    const user = await currentUser(wxContext)
    const active = isVipActive(user)
    const demoGrant = await flagEnabled('cloud_demo_vip_grant_enabled')
    return {
      is_vip: active ? 1 : 0,
      isVip: active,
      free_member: Number(user.free_member || 0),
      free_source: user.free_source || '',
      vip_expire_time: user.vip_expire_time,
      expireDate: user.vip_expire_time,
      demo_vip_grant_enabled: demoGrant
    }
  }

  async function purchase(data, wxContext) {
    const user = await currentUser(wxContext)
    const config = readWechatPayConfig()
    const demoGrant = await flagEnabled('cloud_demo_vip_grant_enabled')

    if (!config.ready) {
      if (demoGrant && !config.enabled) {
        await orderService.grantDemoVip(user)
        return {
          order_no: '',
          price: 188,
          pay_status: 1,
          payment: null,
          demo_granted: true,
          message: '演示环境已开通 VIP'
        }
      }
      if (config.enabled) throw new Error(`微信支付配置未完成：${config.missing.join(', ')}`)
      return {
        order_no: '',
        price: 188,
        pay_status: 0,
        payment: null,
        demo_granted: false,
        message: '微信支付暂未开启'
      }
    }

    const order = await orderService.createPendingVipOrder(user, {
      amountTotal: config.amountTotal
    })
    const prepay = await requestJsapiPrepay({
      config,
      openid: user.openid,
      orderNo: order.order_no,
      amountTotal: order.amount_total
    })
    await orderService.savePrepay(order, prepay)
    return {
      order_no: order.order_no,
      price: order.price,
      amount_total: order.amount_total,
      pay_status: 0,
      payment: buildMiniProgramPayParams({
        appId: config.appId,
        prepayId: prepay.prepay_id,
        privateKeyPem: config.merchantPrivateKeyPem
      }),
      demo_granted: false,
      message: '订单已创建'
    }
  }

  async function status(data, wxContext) {
    const user = await currentUser(wxContext)
    const orderNo = String(data.order_no || data.orderNo || '').trim()
    if (!orderNo) throw new Error('缺少订单号')
    return orderService.getStatusForUser(user, orderNo)
  }

  return { info, purchase, status }
}

module.exports = Object.assign(createVipHandlers(), {
  createVipHandlers
})
```

- [ ] **Step 4: Add the status route and mini program constant**

In `miniprogram/cloudfunctions/api/handlers/route.js`, add to the `map` object:

```js
'GET /api/order/status': vip.status,
```

In `miniprogram/utils/constants.js`, add to `API_PATHS`:

```js
ORDER_STATUS: '/api/order/status',
```

- [ ] **Step 5: Run the VIP payment selfcheck**

Run:

```bash
node server/selfcheck/cloudbase-vip-payment.js
```

Expected: `PASS - cloudbase vip payment order service`.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add miniprogram/cloudfunctions/api/handlers/vip.js miniprogram/cloudfunctions/api/handlers/route.js miniprogram/utils/constants.js server/selfcheck/cloudbase-vip-payment.js
git commit -m "feat(pay): create vip purchase route"
```

---

### Task 4: WeChat Pay HTTP Notify Route

**Files:**
- Create: `miniprogram/cloudfunctions/api/handlers/paymentNotify.js`
- Modify: `miniprogram/cloudfunctions/api/index.js`
- Create: `server/selfcheck/cloudbase-wxpay-notify.js`

**Interfaces:**
- Consumes:
  - raw HTTP event body and headers from CloudBase HTTP access.
  - `wechatpay.readWechatPayConfig`
  - `wechatpay.verifyWechatPaySignature`
  - `wechatpay.decryptResource`
  - `vipOrder.createVipOrderService().finalizePaidVipOrder`
- Produces:
  - `handleWechatPayNotify(event, deps): Promise<{ statusCode, headers, body }>`
  - HTTP callback path `/wxpay/notify`.

- [ ] **Step 1: Write the failing notify selfcheck**

Create `server/selfcheck/cloudbase-wxpay-notify.js`:

```js
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
    }
  })
  assert.strictEqual(rejected.statusCode, 500)
  assert.strictEqual(JSON.parse(rejected.body).code, 'FAIL')

  console.log('PASS - cloudbase wxpay notify handler')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the notify selfcheck and verify it fails for the missing module**

Run:

```bash
node server/selfcheck/cloudbase-wxpay-notify.js
```

Expected: FAIL with `Cannot find module '../../miniprogram/cloudfunctions/api/handlers/paymentNotify'`.

- [ ] **Step 3: Implement the notify handler**

Create `miniprogram/cloudfunctions/api/handlers/paymentNotify.js`:

```js
const wechatpay = require('../lib/wechatpay')
const { createVipOrderService } = require('../lib/vipOrder')

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
    console.error('[wxpay notify]', (err && err.message) || err)
    return json(500, { code: 'FAIL', message: '失败' })
  }
}

async function handleHttp(event = {}) {
  const method = String(event.httpMethod || '').toUpperCase()
  const path = String(event.path || (event.requestContext && event.requestContext.path) || '')
  if (method === 'POST' && /\/wxpay\/notify$/.test(path)) {
    return handleWechatPayNotify(event)
  }
  return json(404, { code: 'NOT_FOUND', message: 'not found' })
}

module.exports = {
  handleWechatPayNotify,
  handleHttp
}
```

- [ ] **Step 4: Wire HTTP events in the cloud function entry**

Modify `miniprogram/cloudfunctions/api/index.js`:

```js
const { handleHttp } = require('./handlers/paymentNotify')
```

Then at the start of `exports.main`:

```js
exports.main = async (event = {}) => {
  if (event.httpMethod || event.requestContext) {
    return handleHttp(event)
  }
  const action = event.action
  const payload = event.payload || {}
  // existing switch stays below
}
```

- [ ] **Step 5: Run the notify selfcheck and utility checks**

Run:

```bash
node server/selfcheck/cloudbase-wxpay-notify.js
node server/selfcheck/cloudbase-wechatpay.js
node server/selfcheck/cloudbase-vip-payment.js
```

Expected:

```text
PASS - cloudbase wxpay notify handler
PASS - cloudbase wechatpay utility
PASS - cloudbase vip payment order service
```

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add miniprogram/cloudfunctions/api/handlers/paymentNotify.js miniprogram/cloudfunctions/api/index.js server/selfcheck/cloudbase-wxpay-notify.js
git commit -m "feat(pay): handle wechat pay notify"
```

---

### Task 5: Mini Program Payment Confirmation UX

**Files:**
- Modify: `miniprogram/pages/vip/vip.js`
- Modify: `miniprogram/pages/vip/vip.wxml`
- Modify: `miniprogram/pages/vip/vip.wxss`
- Create: `server/selfcheck/miniprogram-vip-payment.js`

**Interfaces:**
- Consumes:
  - `API_PATHS.VIP_PURCHASE`
  - `API_PATHS.ORDER_STATUS`
  - `wx.requestPayment`
- Produces:
  - `pollOrderStatus(orderNo, maxAttempts)`
  - user-visible processing state when callback is delayed.

- [ ] **Step 1: Write the failing mini program source selfcheck**

Create `server/selfcheck/miniprogram-vip-payment.js`:

```js
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const root = path.resolve(__dirname, '../..')
const vipJs = fs.readFileSync(path.join(root, 'miniprogram/pages/vip/vip.js'), 'utf8')
const vipWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/vip/vip.wxml'), 'utf8')
const constants = fs.readFileSync(path.join(root, 'miniprogram/utils/constants.js'), 'utf8')

assert(constants.includes("ORDER_STATUS: '/api/order/status'"))
assert(vipJs.includes('pollOrderStatus'))
assert(vipJs.includes('API_PATHS.ORDER_STATUS'))
assert(vipJs.includes('paymentProcessing'))
assert(vipJs.includes('支付处理中'))
assert(vipJs.includes('wx.requestPayment'))
assert(vipJs.includes('result.payment'))
assert(vipWxml.includes('paymentProcessing'))

console.log('PASS - miniprogram vip payment confirmation')
```

- [ ] **Step 2: Run the selfcheck and verify it fails**

Run:

```bash
node server/selfcheck/miniprogram-vip-payment.js
```

Expected: FAIL because `pollOrderStatus` and `ORDER_STATUS` are not present yet.

- [ ] **Step 3: Add payment status fields and polling helper in `vip.js`**

In `miniprogram/pages/vip/vip.js`, add these `data` fields:

```js
paymentProcessing: false,
processingText: ''
```

Add these methods inside `Page({ ... })`:

```js
sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
},

async pollOrderStatus(orderNo, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const status = await get(API_PATHS.ORDER_STATUS, { order_no: orderNo }, { showError: false })
    if (status && status.is_paid) return status
    await this.sleep(1200)
  }
  return null
},

showProcessingModal() {
  wx.showModal({
    title: '支付处理中',
    content: '微信支付已返回，平台还在确认结果。请稍后刷新会员状态。',
    showCancel: false
  })
}
```

- [ ] **Step 4: Replace the post-payment success block in `onPurchase`**

Replace the current unconditional success section after `wx.requestPayment` with:

```js
          if (result && result.payment) {
            await new Promise((resolve, reject) => {
              wx.requestPayment({
                timeStamp: result.payment.timeStamp,
                nonceStr: result.payment.nonceStr,
                package: result.payment.package,
                signType: result.payment.signType || 'RSA',
                paySign: result.payment.paySign,
                success: resolve,
                fail: reject
              })
            })
            this.setData({
              paymentProcessing: true,
              processingText: '正在确认支付结果...'
            })
            const paid = await this.pollOrderStatus(result.order_no, 5)
            this.setData({ paymentProcessing: false, processingText: '' })
            if (paid && paid.is_paid) {
              wx.showToast({ title: '开通成功', icon: 'success' })
              this.loadVipInfo()
              return
            }
            this.showProcessingModal()
            this.loadVipInfo()
            return
          }

          if (result && result.demo_granted) {
            wx.showToast({ title: '开通成功', icon: 'success' })
            this.loadVipInfo()
            return
          }

          wx.showModal({
            title: '支付暂未开启',
            content: result && result.message ? result.message : '微信支付暂未开启，请稍后重试',
            showCancel: false
          })
          this.loadVipInfo()
          return
```

Keep the existing cancel branch:

```js
if (err && err.errMsg && err.errMsg.includes('cancel')) {
  wx.showToast({ title: '已取消支付', icon: 'none' })
}
```

- [ ] **Step 5: Add the WXML processing line**

In `miniprogram/pages/vip/vip.wxml`, above the purchase button, add:

```xml
      <view class="vip-processing" wx:if="{{paymentProcessing}}">
        {{processingText || '正在确认支付结果...'}}
      </view>
```

- [ ] **Step 6: Add minimal WXSS**

In `miniprogram/pages/vip/vip.wxss`, add:

```css
.vip-processing {
  margin-bottom: 16rpx;
  color: #666;
  font-size: 26rpx;
  text-align: center;
}
```

- [ ] **Step 7: Run the mini program source selfcheck**

Run:

```bash
node server/selfcheck/miniprogram-vip-payment.js
```

Expected: `PASS - miniprogram vip payment confirmation`.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add miniprogram/pages/vip/vip.js miniprogram/pages/vip/vip.wxml miniprogram/pages/vip/vip.wxss server/selfcheck/miniprogram-vip-payment.js
git commit -m "feat(pay): confirm vip payment status"
```

---

### Task 6: Payment Documentation And Final Verification

**Files:**
- Modify: `project-docs/USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md`
- Modify: `server/selfcheck/cloudbase-migration.js`

**Interfaces:**
- Consumes: code from Tasks 1-5.
- Produces: one operator checklist for Xiajie credentials and final selfcheck commands.

- [ ] **Step 1: Add static payment checks to CloudBase migration selfcheck**

Append to `server/selfcheck/cloudbase-migration.js` near the other cloud VIP assertions:

```js
const cloudWechatPayJs = read('miniprogram/cloudfunctions/api/lib/wechatpay.js')
const cloudVipOrderJs = read('miniprogram/cloudfunctions/api/lib/vipOrder.js')
const cloudNotifyJs = read('miniprogram/cloudfunctions/api/handlers/paymentNotify.js')
const vipPageJs = read('miniprogram/pages/vip/vip.js')

ok('cloud WeChat Pay utility uses API v3 RSA signing', cloudWechatPayJs.includes('WECHATPAY2-SHA256-RSA2048') && cloudWechatPayJs.includes('RSA-SHA256'))
ok('cloud WeChat Pay utility decrypts APIv3 callback resources', cloudWechatPayJs.includes('aes-256-gcm') && cloudWechatPayJs.includes('decryptResource'))
ok('cloud VIP order service validates paid transaction amount', cloudVipOrderJs.includes('validatePaidTransaction') && cloudVipOrderJs.includes('微信支付金额不匹配'))
ok('cloud VIP order service marks VIP grant idempotently', cloudVipOrderJs.includes('last_vip_order_no') && cloudVipOrderJs.includes('vip_granted'))
ok('cloud WeChat Pay notify handler returns v3 success response', cloudNotifyJs.includes("code: 'SUCCESS'") && cloudNotifyJs.includes('handleWechatPayNotify'))
ok('VIP page waits for backend payment confirmation', vipPageJs.includes('pollOrderStatus') && vipPageJs.includes('API_PATHS.ORDER_STATUS'))
```

- [ ] **Step 2: Update the CloudBase test guide payment section**

In `project-docs/USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md`, replace the old line saying real JSAPI payment is not migrated with this operator note:

```markdown
## 微信支付配置说明

真实支付走微信支付 API v3 JSAPI。代码只读取云函数环境变量，不把密钥写入源码、数据库或导出文件。

云函数 `api` 需要配置：

```text
WXPAY_ENABLED=true
WXPAY_APP_ID=wx91c6559ea4490a29
WXPAY_MCH_ID=1747991634
WXPAY_NOTIFY_URL=<CloudBase HTTP 访问里的 /wxpay/notify 公网 HTTPS 地址>
WXPAY_MERCHANT_SERIAL_NO=<商户 API 证书序列号>
WXPAY_MERCHANT_PRIVATE_KEY_BASE64=<apiclient_key.pem 的 base64 文本>
WXPAY_API_V3_KEY=<32 位 APIv3 密钥>
WXPAY_PUBLIC_KEY_ID=<微信支付公钥 ID>
WXPAY_PUBLIC_KEY_BASE64=<微信支付公钥 PEM 的 base64 文本>
PAYMENT_STAGE=production
PAYMENT_TEST_AMOUNT_FEN=1
```

生产环境 `PAYMENT_STAGE=production` 时固定收取 188 元。只有 `PAYMENT_STAGE=test` 才会读取 `PAYMENT_TEST_AMOUNT_FEN`。

没有补齐以上密钥前，可以完成代码部署和自检，但不能做真实收款测试。
```

- [ ] **Step 3: Run payment and CloudBase selfchecks**

Run:

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\server
npm run selfcheck:cloudpay
npm run selfcheck:cloudbase
```

Expected:

```text
PASS - cloudbase wechatpay utility
PASS - cloudbase vip payment order service
PASS - cloudbase wxpay notify handler
PASS - miniprogram vip payment confirmation
```

and `selfcheck:cloudbase` exits with code `0`.

- [ ] **Step 4: Run formatting guard**

Run:

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add project-docs/USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md server/selfcheck/cloudbase-migration.js
git commit -m "docs(pay): document cloudbase payment setup"
```

---

## Deployment Notes After Implementation

1. Upload and deploy `cloudfunctions/api` with cloud-side dependency install.
2. Enable HTTP access for `api` and route the public URL ending with `/wxpay/notify`.
3. Put the public notify URL into `WXPAY_NOTIFY_URL`.
4. Set the WeChat Pay environment variables in CloudBase.
5. Do not put any real secret in `system_configs`, `.env.example`, screenshots, or handoff docs.
6. Use a real device for payment testing; developer tools cannot prove the whole WeChat cashier and callback flow.
7. If moving to Tencent Cloud server later, reuse `wechatpay.js` rules and `vipOrder.js` state machine; replace CloudBase request/db adapters only.

## Self-Review

- Spec coverage: Tasks 1-4 cover API v3 signing, JSAPI order creation, callback verification, AES-GCM decrypt, amount validation, idempotent VIP grant, and status route. Task 5 covers frontend confirmation. Task 6 covers operator docs and final checks.
- Placeholder scan: no open implementation placeholders are required in code snippets; credential examples stay as explicit environment variable names and safe placeholder values.
- Type consistency: `order_no`, `amount_total`, `pay_status`, `vip_granted`, `prepay_id`, `transaction_id`, `is_paid`, and `WXPAY_*` names are consistent across tasks.
