const assert = require('assert')
const {
  httpMethod,
  httpPath,
  queryParameters
} = require('../../miniprogram/cloudfunctions/api/lib/httpEvent')

const cases = [
  [{ httpMethod: 'POST', path: '/api/auth/admin-login' }, 'POST', '/api/auth/admin-login'],
  [{ requestContext: { httpMethod: 'POST', path: '/api/auth/admin-login' } }, 'POST', '/api/auth/admin-login'],
  [{ requestContext: { http: { method: 'POST', path: '/api/auth/admin-login' } } }, 'POST', '/api/auth/admin-login'],
  [{ requestContext: { http: { method: 'POST' } }, rawPath: '/api/auth/admin-login' }, 'POST', '/api/auth/admin-login'],
  [{ requestContext: { httpMethod: 'POST' }, requestContextPath: '/api/auth/admin-login' }, 'POST', '/api/auth/admin-login']
]

cases.forEach(([event, method, path]) => {
  assert.strictEqual(httpMethod(event), method)
  assert.strictEqual(httpPath(event), path)
})

assert.deepStrictEqual(queryParameters({ queryStringParameters: { status: 'pending' } }), { status: 'pending' })
assert.deepStrictEqual(queryParameters({ rawQueryString: 'status=pending&limit=20' }), { status: 'pending', limit: '20' })

console.log('PASS CloudBase HTTP event normalization covers gateway and SCF event shapes')
