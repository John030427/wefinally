const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../../miniprogram')
const page = fs.readFileSync(path.join(root, 'pages/profile/profile.js'), 'utf8')
const markup = fs.readFileSync(path.join(root, 'pages/profile/profile.wxml'), 'utf8')

assert(page.includes('hasPartnerWorkspace'))
assert(page.includes('STORAGE_KEYS.PARTNER_TOKEN'))
assert(page.includes("'/pages/partner-invite/partner-invite'"))
assert(markup.includes('wx:if="{{hasPartnerWorkspace}}"'))
assert(markup.includes('合伙人工作台'))

console.log('PASS profile only renders partner workspace entry for an authenticated partner session')
