'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { requireWxOpenid } = require('../../miniprogram/cloudfunctions/api/lib/wxIdentity')

const userSource = fs.readFileSync(
  path.join(__dirname, '../../miniprogram/cloudfunctions/api/handlers/user.js'),
  'utf8'
)

assert.throws(() => requireWxOpenid({}), /微信身份/)
assert.throws(() => requireWxOpenid({ OPENID: '   ' }), /微信身份/)
assert.strictEqual(requireWxOpenid({ OPENID: 'wx_actor' }), 'wx_actor')
assert.ok(!userSource.includes('wxContext.OPENID || data.openid'))
assert.ok(!userSource.includes('data.openid || wxContext.OPENID'))

console.log('PASS wx identity boundary trusts only CloudBase OPENID')
