const {
  first,
  list,
  removeByDoc,
  updateByDoc,
  addWithId,
  acquireQaPairResetRun,
  now,
  authError
} = require('../lib/db')
const { requireWxOpenid } = require('../lib/wxIdentity')
const {
  executeQaPairReset,
  getQaPairResetStatus
} = require('../lib/qaPairResetService')

async function reset(data = {}, wxContext = {}) {
  const openid = requireWxOpenid(wxContext)
  const actor = await first('user', { openid })
  if (!actor) throw authError('请先登录')
  const result = await executeQaPairReset({
    actor,
    requestId: data.request_id,
    confirmText: data.confirm_text
  }, {
    list,
    removeByDoc,
    updateByDoc,
    acquireRun: acquireQaPairResetRun,
    writeAudit: (record) => addWithId('qa_pair_reset_audit', record, 'qa_pair_reset_audit'),
    now
  })
  return Object.assign({}, result, {
    message: result.status === 'completed'
      ? '已清空本测试对的匹配记录、第一次约会数据、约会协调会话和相关通知；保留注册资料、画像/RAG、会员、订单、推广归属及普通恋爱助手聊天。'
      : '正在清空测试数据，请稍后再试'
  })
}

async function status(data = {}, wxContext = {}) {
  const openid = requireWxOpenid(wxContext)
  const actor = await first('user', { openid })
  if (!actor) throw authError('请先登录')
  return getQaPairResetStatus({ actor }, { list, now })
}

module.exports = { reset, status }
