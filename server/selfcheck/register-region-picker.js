const assert = require('assert')
const fs = require('fs')
const path = require('path')

let pageDefinition = null
global.Page = (definition) => { pageDefinition = definition }
global.wx = { showToast() {} }

require('../../miniprogram/pages/register/register')

function setPath(target, path, value) {
  const parts = path.split('.')
  let cursor = target
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value
    else cursor = cursor[part]
  })
}

function pageInstance() {
  const instance = Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data))
  })
  instance.setData = (patch) => {
    Object.entries(patch).forEach(([path, value]) => setPath(instance.data, path, value))
  }
  return instance
}

assert(pageDefinition, 'register page must be loadable')
const page = pageInstance()

const markup = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/register/register.wxml'), 'utf8')
assert(markup.includes('mode="region"'))
assert(markup.includes('level="city"'))
assert(!markup.includes('range="{{regionMatrix}}"'))

page.onWorkRegionChange({
  detail: {
    value: ['广东省', '深圳市'],
    code: ['440000', '440300']
  }
})
assert.strictEqual(page.data.form.provinceCode, '440000')
assert.strictEqual(page.data.form.provinceName, '广东省')
assert.strictEqual(page.data.form.cityCode, '440300')
assert.strictEqual(page.data.form.city, '深圳')

console.log('PASS register work region uses native full province-city cascading picker')
