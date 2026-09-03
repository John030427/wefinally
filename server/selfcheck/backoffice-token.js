const assert = require('assert')

const { signBackofficeToken, verifyBackofficeToken } = require('../../miniprogram/cloudfunctions/api/lib/backofficeToken')

const secret = 'test-secret-at-least-32-characters-long'
const token = signBackofficeToken({ role: 'partner', id: 3 }, secret, 60, 1000)
assert.deepStrictEqual(verifyBackofficeToken(token, secret, 1001), {
  role: 'partner',
  id: 3,
  exp: 1060
})
assert.throws(() => verifyBackofficeToken(`${token}x`, secret, 1001), /无效/)
assert.throws(() => verifyBackofficeToken(token, secret, 1061), /过期/)
assert.throws(() => signBackofficeToken({ role: 'partner', id: 3 }, 'short'), /安全密钥/)

const boundToken = signBackofficeToken({ role: 'partner', id: 3, binding_version: 4 }, secret, 86400, 1000)
assert.deepStrictEqual(verifyBackofficeToken(boundToken, secret, 1001), {
  role: 'partner',
  id: 3,
  exp: 87400,
  binding_version: 4
})

console.log('PASS backoffice token')
