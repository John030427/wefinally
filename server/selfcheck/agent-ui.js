const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))

const app = JSON.parse(read('miniprogram/app.json'))
assert(app.pages.includes('pages/love-advisor/love-advisor'))
assert(app.pages.includes('pages/date-coordination/date-coordination'))

const indexWxml = read('miniprogram/pages/index/index.wxml')
const indexJs = read('miniprogram/pages/index/index.js')
assert(indexWxml.includes('AI恋爱助手'))
assert(indexJs.includes('/pages/love-advisor/love-advisor'))

const profileJs = read('miniprogram/pages/profile/profile.js')
assert(profileJs.includes('平台AI客服'))
assert(profileJs.includes('agentType=platform_service'))

const matchDetail = read('miniprogram/pages/match-detail/match-detail.wxml')
assert(matchDetail.includes('开启第一次约会'))
assert(matchDetail.includes('date-coordination'))

for (const page of ['love-advisor', 'date-coordination']) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    assert(exists(`miniprogram/pages/${page}/${page}.${ext}`), `${page}.${ext} missing`)
  }
}

const loveWxml = read('miniprogram/pages/love-advisor/love-advisor.wxml')
assert(loveWxml.includes('健康恋爱'))
assert(loveWxml.includes('信息有限'))

const dateJs = read('miniprogram/pages/date-coordination/date-coordination.js')
const dateWxml = read('miniprogram/pages/date-coordination/date-coordination.wxml')
const combined = `${dateJs}\n${dateWxml}`
for (const field of [
  'availability',
  'areas',
  'activities',
  'budget',
  'payment_preference',
  'duration',
  'transport_constraints',
  'other_requirements',
  'share_message'
]) assert(combined.includes(field), `${field} missing`)

assert(dateWxml.includes('未来14天'))
assert(dateJs.includes("const { get, post, put }"))
assert(dateJs.includes('/invitation-response'))
assert(dateJs.includes('/proposals/${proposalId}/confirm'))
assert(dateJs.includes("decision: 'confirm'"))
assert(dateJs.includes("periods: ['afternoon']"))
assert(dateJs.includes("activityOptions: ['咖啡', '吃饭', '奶茶', '散步', '看展', '电影', '桌游']"))
assert(dateJs.includes('areas: []'))
assert(dateWxml.includes('可约时间段'))
assert(dateWxml.includes("coordination.status === 'collecting_preferences'"))
assert(dateWxml.includes('对方可见内容'))
assert(dateWxml.includes('公共场所'))
assert(!/车牌|家庭住址|单位地址|是否开车/.test(combined))
assert(/loading|正在/.test(combined))
assert(/expired|已过期/.test(combined))
assert(/error|重试/.test(combined))

const chatJs = read('miniprogram/pages/chat/chat.js')
assert(chatJs.includes('reply.reply'))
assert(chatJs.includes("DATE_COORDINATOR: 'date_coordinator'"))
assert(chatJs.includes('coordination_id: this.data.coordinationId'))
assert(dateJs.includes('agentType=date_coordinator'))

console.log('PASS agent mini program UI contract')
