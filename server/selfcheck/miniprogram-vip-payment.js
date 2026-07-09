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
