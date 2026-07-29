const assert = require('assert')
const fs = require('fs')
const path = require('path')

assert(fs.existsSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/agent/humanService.js')), 'human service adapter must exist')
const { readHumanServiceConfig, buildHumanServiceHandoff } = require('../../miniprogram/cloudfunctions/api/agent/humanService')

const internal = readHumanServiceConfig({})
assert.deepStrictEqual(internal, {
  provider: 'internal',
  corpId: '',
  serviceUrl: ''
})
assert.deepStrictEqual(buildHumanServiceHandoff(internal), {
  provider: 'internal',
  available: false
})

const wecom = readHumanServiceConfig({
  HUMAN_SERVICE_PROVIDER: 'wecom',
  HUMAN_SERVICE_CORP_ID: 'ww123',
  HUMAN_SERVICE_URL: 'https://work.weixin.qq.com/kfid/test'
})
assert.deepStrictEqual(buildHumanServiceHandoff(wecom), {
  provider: 'wecom',
  available: true,
  corp_id: 'ww123',
  service_url: 'https://work.weixin.qq.com/kfid/test'
})

const incomplete = readHumanServiceConfig({ HUMAN_SERVICE_PROVIDER: 'wecom' })
assert.deepStrictEqual(buildHumanServiceHandoff(incomplete), {
  provider: 'internal',
  available: false
})

const root = path.resolve(__dirname, '../..')
const chatJs = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.js'), 'utf8')
const chatWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/chat/chat.wxml'), 'utf8')
assert(chatJs.includes('wx.openCustomerServiceChat'), 'chat page must support configured WeCom customer service')
assert(chatWxml.includes('open-type="contact"'), 'chat page must reserve the native WeChat customer service button')

console.log('PASS human service handoff adapter contract')
