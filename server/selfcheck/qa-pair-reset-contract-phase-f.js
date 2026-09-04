'use strict'

const assert = require('assert')
const fs = require('fs')
const pathModule = require('path')

function read(path) {
  return fs.readFileSync(pathModule.join(__dirname, '../../', path), 'utf8')
}

const route = read('miniprogram/cloudfunctions/api/handlers/route.js')
const handler = read('miniprogram/cloudfunctions/api/handlers/qaPairReset.js')
const constants = read('miniprogram/utils/constants.js')
const match = read('miniprogram/cloudfunctions/api/handlers/match.js')
const panel = read('miniprogram/components/qa-match-panel/qa-match-panel.js')
const markup = read('miniprogram/components/qa-match-panel/qa-match-panel.wxml')

assert(route.includes("const qaPairReset = require('./qaPairReset')"))
assert(route.includes("'POST /api/match/qa-pair-reset': qaPairReset.reset"))
assert(route.includes("'GET /api/match/qa-pair-reset/status': qaPairReset.status"))
assert(handler.includes('executeQaPairReset'))
assert(handler.includes('getQaPairResetStatus'))
assert(handler.includes('wxContext.OPENID'))
assert(match.includes('assertQaPairResetNotBlockingMatch'))
assert(constants.includes("MATCH_QA_PAIR_RESET: '/api/match/qa-pair-reset'"))
assert(constants.includes("MATCH_QA_PAIR_RESET_STATUS: '/api/match/qa-pair-reset/status'"))
assert(panel.includes('onResetQaPairData'))
assert(panel.includes('qa_pair_reset_request_id'))
assert(panel.includes('confirm_text: \'彻底清空本对测试数据\''))
assert(markup.includes('清空双机匹配与协调数据'))
assert(markup.includes('保留注册资料、画像/RAG、会员、订单、推广归属及普通恋爱助手聊天'))

console.log('PASS QA pair reset route, identity boundary, and UI contract')
