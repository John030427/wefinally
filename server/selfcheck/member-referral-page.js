const assert = require('assert')

const requestPath = require.resolve('../../miniprogram/utils/request')
const calls = []
let nextReferralResult = {
  member_status: 'pending_review', auto_approved: false,
  promote_code: 'WFP0007', partner_id: 7
}
require.cache[requestPath] = {
  id: requestPath,
  filename: requestPath,
  loaded: true,
  exports: {
    get: async () => ({ member_status: 'pending_review', invitation_bound: false }),
    post: async (path, data) => {
      calls.push({ path, data })
      return nextReferralResult
    }
  }
}

const storage = new Map([['wf_token', 'selfcheck-token']])
let pageDefinition = null
let modal = null
global.Page = (definition) => { pageDefinition = definition }
global.getApp = () => ({ globalData: { launchScene: '', launchQuery: {} } })
global.wx = {
  getStorageSync: (key) => storage.get(key) || '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  redirectTo() {},
  showToast() {},
  showModal: (options) => { modal = options },
  switchTab() {}
}

require('../../miniprogram/pages/member-application/member-application')
const page = Object.assign({}, pageDefinition, { data: JSON.parse(JSON.stringify(pageDefinition.data)) })
page.setData = (patch) => Object.assign(page.data, patch)

function freshPage() {
  const instance = Object.assign({}, pageDefinition, { data: JSON.parse(JSON.stringify(pageDefinition.data)) })
  instance.setData = (patch) => Object.assign(instance.data, patch)
  return instance
}

async function main() {
  page.onLoad({ promote_code: 'wfp0007' })
  assert.strictEqual(page.data.referralInput, 'WFP0007')
  assert.strictEqual(storage.get('wf_promote_code'), 'WFP0007')

  storage.set('wf_promote_code', 'WFP0007')
  const resumed = freshPage()
  resumed.onLoad({})
  assert.strictEqual(resumed.data.referralInput, 'WFP0007')

  await page.bindReferral()
  assert.strictEqual(calls[0].path, '/api/member/application/referral')
  assert.deepStrictEqual(calls[0].data, { referral: 'WFP0007' })
  assert.strictEqual(page.data.referralMessage, '邀请关系已绑定，请等待该合伙人审核')

  nextReferralResult = { member_status: 'approved', auto_approved: true, partner_id: 7 }
  page.onReferralInput({ detail: { value: 'wf1.7.9999999999999.signature' } })
  await page.bindReferral()
  assert.strictEqual(modal.title, '邀请已确认')
  assert.strictEqual(modal.showCancel, false)

  console.log('PASS pending member page accepts code and signed WeChat referral confirmation')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
