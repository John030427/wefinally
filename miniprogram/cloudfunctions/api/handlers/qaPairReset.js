'use strict'

const {
  first,
  list,
  listPage,
  removeByDoc,
  updateByDoc,
  addWithId,
  acquireQaPairResetRun,
  now,
  authError
} = require('../lib/db')
const {
  executeQaPairReset,
  getQaPairResetStatus
} = require('../lib/qaPairResetService')

function requireWxOpenid(wxContext = {}) {
  const openid = String(wxContext.OPENID || '').trim()
  if (!openid) throw authError('无法获取微信身份')
  return openid
}

async function actorForContext(wxContext) {
  const actor = await first('user', { openid: requireWxOpenid(wxContext) })
  if (!actor) throw authError('请先登录')
  return actor
}

function serviceDeps() {
  return {
    list,
    listPage,
    removeByDoc,
    updateByDoc,
    acquireRun: acquireQaPairResetRun,
    writeAudit: (record) => addWithId('qa_pair_reset_audit', record, 'qa_pair_reset_audit'),
    now
  }
}

async function reset(data = {}, wxContext = {}) {
  const actor = await actorForContext(wxContext)
  const result = await executeQaPairReset({
    actor,
    requestId: data.request_id,
    confirmText: data.confirm_text
  }, serviceDeps())
  return Object.assign({}, result, {
    message: result.status === 'completed'
      ? '已清空本测试对的匹配记录、第一次约会数据、约会协调会话和相关通知；保留注册资料、画像/RAG、会员、订单、推广归属及普通恋爱助手聊天。'
      : '正在清空测试数据，请稍后再试'
  })
}

async function status(data = {}, wxContext = {}) {
  const actor = await actorForContext(wxContext)
  return getQaPairResetStatus({ actor }, { list, now })
}

module.exports = { reset, status }
