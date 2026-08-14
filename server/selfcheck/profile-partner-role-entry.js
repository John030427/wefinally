const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../../miniprogram')
const page = fs.readFileSync(path.join(root, 'pages/profile/profile.js'), 'utf8')
const markup = fs.readFileSync(path.join(root, 'pages/profile/profile.wxml'), 'utf8')

assert(page.includes('loadPartnerStatus'))
assert(page.includes('partnerStatus'))
assert(page.includes("'/pages/partner-invite/partner-invite'"))
assert(!page.includes('hasPartnerWorkspace'))
assert(markup.includes('partnerStatus.state'))
assert(markup.includes('合作合伙人入口'))
assert(markup.includes('合伙人工作台'))

console.log('PASS profile renders a state-driven roster activation and partner workspace entry')
