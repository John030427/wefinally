const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
assert(fs.existsSync(path.join(root, 'miniprogram/utils/meetLocation.js')), 'meet location normalizer must exist')
const { normalizeChosenLocation, hasMapLocation, shouldCreateBlankReport } = require('../../miniprogram/utils/meetLocation')

const chosen = normalizeChosenLocation({
  name: '星巴克（卓越时代广场店）',
  address: '广东省深圳市福田区福华一路卓越时代广场',
  latitude: 22.53721,
  longitude: 114.05786
})

assert.deepStrictEqual(chosen, {
  meet_place: '星巴克（卓越时代广场店）',
  meet_address: '广东省深圳市福田区福华一路卓越时代广场',
  lat: 22.53721,
  lng: 114.05786,
  location_source: 'wechat_choose_location'
})
assert.strictEqual(hasMapLocation(chosen), true)
assert.strictEqual(hasMapLocation({ meet_place: '手工输入', lat: null, lng: null }), false)
assert.strictEqual(typeof shouldCreateBlankReport, 'function', 'explicit create mode helper must exist')
assert.strictEqual(shouldCreateBlankReport({ mode: 'create' }), true)
assert.strictEqual(shouldCreateBlankReport({ id: '123' }), false)
assert.strictEqual(shouldCreateBlankReport({ matchUserId: '456' }), false)

const pageJs = read('miniprogram/pages/meet-safety/meet-safety.js')
const pageWxml = read('miniprogram/pages/meet-safety/meet-safety.wxml')
const listJs = read('miniprogram/pages/meet-safety-list/meet-safety-list.js')
const appJson = JSON.parse(read('miniprogram/app.json'))
const cloudHandler = read('miniprogram/cloudfunctions/api/handlers/meet.js')

assert(pageJs.includes('wx.chooseLocation'), 'meet safety page must open WeChat map picker')
assert(pageJs.includes('wx.openLocation'), 'meet safety page must open the saved place in WeChat map')
assert(pageJs.includes('shouldCreateBlankReport(options)'), 'meet safety page must honor explicit create mode')
assert(listJs.includes('meet-safety?mode=create'), 'new record action must request explicit create mode')
assert(pageWxml.includes('在地图中选择地点'), 'meet safety page must expose a map picker button')
assert(pageWxml.includes('form.meet_address'), 'meet safety page must display the selected address')
assert(appJson.requiredPrivateInfos.includes('chooseLocation'), 'app.json must declare chooseLocation')
for (const api of ['getLocation', 'startLocationUpdate', 'onLocationChange', 'startLocationUpdateBackground']) {
  assert(!appJson.requiredPrivateInfos.includes(api), `app.json must not declare rejected private API ${api}`)
}
for (const api of ['wx.getLocation', 'wx.startLocationUpdate', 'wx.onLocationChange', 'wx.startLocationUpdateBackground']) {
  assert(!pageJs.includes(api), `meet safety page must not call rejected private API ${api}`)
}
assert(!pageWxml.includes('开启安全守护'), 'meet safety page must not advertise removed live location tracking')
assert(cloudHandler.includes('meet_address'), 'cloud handler must persist the selected address')
assert(cloudHandler.includes('location_source'), 'cloud handler must persist the location source')

console.log('PASS meet safety WeChat map contract')
