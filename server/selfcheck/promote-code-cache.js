const assert = require('assert')

const storage = new Map([
  ['wf_token', 'token'],
  ['wf_promote_code', 'WFP0007']
])
let appDefinition = null
global.App = (definition) => { appDefinition = definition }
global.wx = {
  getStorageSync: (key) => storage.get(key) || '',
  removeStorageSync: (key) => storage.delete(key),
  setStorageSync: (key, value) => storage.set(key, value)
}

require('../../miniprogram/app')
appDefinition.clearLoginState.call({ globalData: { token: 'token', userInfo: {}, isLoggedIn: true } })

assert.strictEqual(storage.has('wf_token'), false)
assert.strictEqual(storage.has('wf_promote_code'), false)
console.log('PASS logout clears pending referral cache before account switching')
