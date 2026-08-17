const assert = require('assert')
const fs = require('fs')
const path = require('path')

function read(page, file) {
  return fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages', page, file), 'utf8')
}

const member = read('member-application', 'member-application.wxml')
const vip = read('vip', 'vip.wxml')
const match = read('match-detail', 'match-detail.wxml')
const chat = read('chat', 'chat.wxml')
assert(member.includes('open-type="contact"'))
assert(member.includes('人工客服'))
assert(vip.includes('open-type="contact"'))
assert(vip.includes('支付异常'))
assert(match.includes('open-type="contact"'))
assert(match.includes('匹配异常'))
assert(chat.includes('open-type="contact"'))
assert(![member, vip, match, chat].some((text) => /微信号|wxid_|@/.test(text)))

console.log('PASS official WeChat customer service entry covers member, payment and match issues')
