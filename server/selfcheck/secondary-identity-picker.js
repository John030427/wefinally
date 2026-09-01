const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  buildSecondaryIdentityGroups,
  buildSelectedSecondaryIdentities,
  toggleSecondaryIdentitySelection
} = require('../../miniprogram/utils/secondaryIdentityPicker')

const circles = [
  { id: 1, name: '综合公务员', plate_name: '公共服务' },
  { id: 2, name: '中小学/幼教教师', plate_name: '教育' },
  { id: 3, name: '教培机构创始人', plate_name: '教育' },
  { id: 4, name: '程序员、软件工程师', plate_name: '互联网' },
  { id: 5, name: '互联网开发/产品/运营', plate_name: '互联网' },
  { id: 0, name: '其他', plate_name: '其他' }
]

const groups = buildSecondaryIdentityGroups(circles, 1, [3], '')
assert.deepStrictEqual(groups.map((row) => row.plate), ['教育', '互联网'])
assert.strictEqual(groups[0].items[1].selected, true)
assert.deepStrictEqual(
  buildSecondaryIdentityGroups(circles, 1, [3], '教师').map((row) => row.items.map((item) => item.id)),
  [[2]]
)
assert.deepStrictEqual(
  buildSecondaryIdentityGroups(circles, 1, [3], '互联网').map((row) => row.items.map((item) => item.id)),
  [[4, 5]]
)
assert.deepStrictEqual(buildSelectedSecondaryIdentities(circles, [5, 3]), [
  { id: 3, name: '教培机构创始人' },
  { id: 5, name: '互联网开发/产品/运营' }
])
assert.deepStrictEqual(toggleSecondaryIdentitySelection([2], 3, 2), {
  selectedIds: [2, 3],
  limitReached: false
})
assert.deepStrictEqual(toggleSecondaryIdentitySelection([2, 3], 4, 2), {
  selectedIds: [2, 3],
  limitReached: true
})
assert.deepStrictEqual(toggleSecondaryIdentitySelection([2, 3], 2, 2), {
  selectedIds: [3],
  limitReached: false
})

const registerSource = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/register/register.wxml'), 'utf8')
assert.ok(!registerSource.includes('wx:for="{{secondaryIdentityOptions}}"'))
;[
  'openSecondaryIdentityDrawer',
  'secondaryIdentityDrawerVisible',
  'onSecondaryIdentitySearch',
  'secondaryIdentityGroups',
  'selectedSecondaryIdentities',
  '关闭选择'
].forEach((contract) => assert.ok(registerSource.includes(contract), `missing register UI contract: ${contract}`))

console.log('PASS searchable secondary identity picker model and register drawer contract')
