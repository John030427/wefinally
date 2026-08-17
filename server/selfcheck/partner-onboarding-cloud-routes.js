const assert = require('assert')
const fs = require('fs')
const path = require('path')

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
}

const route = source('../../miniprogram/cloudfunctions/api/handlers/route.js')
const cloudHandler = source('../../miniprogram/cloudfunctions/api/handlers/partnerOnboardingCloud.js')
const db = source('../../miniprogram/cloudfunctions/api/lib/db.js')
const backoffice = source('../../miniprogram/cloudfunctions/api/handlers/backoffice.js')

for (const endpoint of [
  'GET /api/partner/onboarding/status',
  'POST /api/partner/activation',
  'POST /api/partner/session',
  'GET /api/partner/dashboard'
]) assert.ok(route.includes(endpoint), `missing route ${endpoint}`)

assert.ok(!route.includes('POST /api/partner/applications'))
assert.doesNotMatch(cloudHandler, /phonenumber\.getPhoneNumber/)
assert.doesNotMatch(cloudHandler, /consumePhoneCode/)
assert.match(cloudHandler, /createPartnerOnboardingService/)
assert.match(cloudHandler, /ttlSeconds:\s*86400/)
assert.match(db, /async function transaction/)
assert.doesNotMatch(db, /rawTransaction[\s\S]{0,1200}\.where\(/)
assert.match(backoffice, /binding_version/)

console.log('PASS CloudBase partner onboarding, session and protected route contracts')
