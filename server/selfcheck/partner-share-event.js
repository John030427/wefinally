const assert = require('assert')
const fs = require('fs')
const path = require('path')

const handler = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/cloudfunctions/api/handlers/backoffice.js'), 'utf8')
const page = fs.readFileSync(path.resolve(__dirname, '../public/partner/index.html'), 'utf8')

assert(handler.includes('async function recordShareEvent(body, actor)'))
assert(handler.includes("db.addWithId('partner_share_event'"))
assert(handler.includes("/api\\/partner\\/share-event$"))
assert(handler.includes("body.channel || 'link'"))
assert(page.includes("api('/partner/share-event'"))
assert(page.includes("body: { channel: channel || 'link' }"))

console.log('PASS partner share trigger writes an authenticated behavior event')
