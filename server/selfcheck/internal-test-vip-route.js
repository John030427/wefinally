const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const backoffice = fs.readFileSync(
  path.join(root, 'miniprogram/cloudfunctions/api/handlers/backoffice.js'),
  'utf8'
)
const adminHtml = fs.readFileSync(path.join(root, 'server/public/admin/index.html'), 'utf8')

assert(backoffice.includes("require('./internalTestVip')"))
assert(backoffice.includes("new RegExp('/api/admin/users/(\\\\d+)/test-vip$')"))
assert(backoffice.includes('changeInternalTestVip({'))
assert(backoffice.includes("vip_source: user.vip_source || ''"))
assert(adminHtml.includes('adminTestVip('))
assert(adminHtml.includes('submitAdminTestVip('))
assert(adminHtml.includes("memberApi('/admin/users/' + userId + '/test-vip'"))
assert(adminHtml.includes('A/B 内测结束后请及时撤销'))
assert(adminHtml.includes('crypto.randomUUID'))

console.log('PASS internal test VIP cloud route and admin UI contract')
