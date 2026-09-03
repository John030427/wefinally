const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const source = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/user.js'), 'utf8')
const registerSource = source.slice(source.indexOf('async function register'), source.indexOf('async function getProfile'))
const profileSource = source.slice(source.indexOf('async function profilePayload'), source.indexOf('function parseGender'))

assert(profileSource.includes('ensureUserSupportCode(user)'))
assert(registerSource.includes('const registeredProfile = await profilePayload(user)'))
assert.strictEqual((registerSource.match(/profilePayload\(user\)/g) || []).length, 1)
assert(registerSource.includes('user: registeredProfile'))
assert(registerSource.includes('userInfo: registeredProfile'))
assert(registerSource.indexOf('const registeredProfile = await profilePayload(user)') < registerSource.lastIndexOf('return {'))

console.log('PASS registration returns one durable support-coded profile')
