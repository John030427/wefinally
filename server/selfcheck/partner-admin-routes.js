const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/backoffice.js'), 'utf8')

assert.match(source, /createPartnerAdminService/)
assert.ok(source.includes('partner-candidates$/.test(path)'))
assert.ok(source.includes('partner-candidates\\/import$/.test(path)'))
assert.match(source, /reviewCandidate\(actor/)
assert.match(source, /candidateDetail\(actor/)
assert.match(source, /changePartner\(actor/)
assert.match(source, /listPartners\(actor/)
assert.match(source, /PARTNER_PHONE_LOOKUP_SECRET/)

console.log('PASS partner admin roster and lifecycle routes')
