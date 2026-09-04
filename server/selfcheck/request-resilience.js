const assert = require('assert')

let cleared = 0
let hidden = 0
let networkAvailable = false

global.getApp = () => ({
  globalData: { token: 'test-token' },
  checkNetwork: async () => networkAvailable,
  clearLoginState: () => { cleared += 1 }
})

global.wx = {
  getStorageSync: () => '',
  getNetworkType: () => {},
  showLoading: () => {},
  hideLoading: () => { hidden += 1 },
  showToast: () => {},
  cloud: {
    callFunction: async () => ({ result: { success: false, code: 401, error: '登录已过期，请重新登录' } })
  }
}

const { request } = require('../../miniprogram/utils/request')

async function expectSettled(promise) {
  return Promise.race([
    promise.then(() => ({ resolved: true }), (error) => ({ error })),
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 50))
  ])
}

async function main() {
  const offline = await expectSettled(request({ url: '/offline', showLoading: true, showError: false }))
  assert.strictEqual(offline.timeout, undefined)
  assert.strictEqual(offline.error.type, 'network')
  assert.strictEqual(hidden, 1)

  networkAvailable = true
  const expired = await expectSettled(request({ url: '/expired', showError: false }))
  assert.strictEqual(expired.timeout, undefined)
  assert.strictEqual(expired.error.type, 'auth')
  assert.strictEqual(cleared, 1)

  global.wx.cloud.callFunction = async () => ({ result: {
    success: false,
    errorCode: 'DATE_COORDINATION_STATE_INVALID',
    httpCode: 409,
    error: '当前状态不能提交日期申请'
  } })
  const businessError = await expectSettled(request({ url: '/business-error', showError: false }))
  assert.strictEqual(businessError.timeout, undefined)
  assert.strictEqual(businessError.error.errorCode, 'DATE_COORDINATION_STATE_INVALID')
  assert.strictEqual(businessError.error.httpCode, 409)
  assert.strictEqual(businessError.error.code, 'DATE_COORDINATION_STATE_INVALID')

  console.log('PASS request weak-network and expired-login recovery')
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
