const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { TAB_ITEMS, tabIndexForRoute } = require('../../miniprogram/utils/tabBarState')

assert.deepStrictEqual(TAB_ITEMS.map((item) => item.text), ['匹配', '记录', '我的'])
assert.deepStrictEqual(TAB_ITEMS.map((item) => item.route), [
  '/pages/index/index',
  '/pages/match-list/match-list',
  '/pages/profile/profile'
])
assert.deepStrictEqual(TAB_ITEMS.map((item) => item.iconClass), [
  'tab-icon-match',
  'tab-icon-records',
  'tab-icon-profile'
])
assert.strictEqual(tabIndexForRoute('/pages/match-list/match-list'), 1)
assert.strictEqual(tabIndexForRoute('pages/profile/profile'), 2)
assert.strictEqual(tabIndexForRoute('/pages/unknown/unknown'), -1)

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8')
}

const app = JSON.parse(source('miniprogram/app.json'))
assert.strictEqual(app.tabBar.custom, true)
assert.strictEqual(app.tabBar.list.length, 3)
const componentSource = source('miniprogram/custom-tab-bar/index.wxml')
const styleSource = source('miniprogram/custom-tab-bar/index.wxss')
;['tab-icon-match', 'tab-icon-records', 'tab-icon-profile'].forEach((name) => {
  assert.ok(styleSource.includes(name), `missing tab icon: ${name}`)
})
assert.ok(!componentSource.includes('<svg'))
assert.ok(styleSource.includes('#E8637F'))
assert.ok(styleSource.includes('#B5A5A5'))
;[
  ['miniprogram/pages/index/index.js', '/pages/index/index'],
  ['miniprogram/pages/match-list/match-list.js', '/pages/match-list/match-list'],
  ['miniprogram/pages/profile/profile.js', '/pages/profile/profile']
].forEach(([file, route]) => {
  const pageSource = source(file)
  assert.ok(pageSource.includes('syncForRoute'), `missing tab synchronization: ${file}`)
  assert.ok(pageSource.includes(route), `missing tab route: ${file}`)
})

console.log('PASS custom tab bar routes, icons, palette, and page synchronization')
