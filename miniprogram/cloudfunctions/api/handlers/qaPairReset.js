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
const { executeQaPairReset } = require('../lib/qaPairResetService')

async function reset(data = {}, wxContext = {}) {
  const openid = String(wxContext.OPENID || '')
  if (!openid) throw authError('无法获取微信身份')
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
      ? '已清空双机匹配与约会协调数据，可以重新开始匹配'
      : '正在清空测试数据，请稍后再试'
  })
}

module.exports = { reset }
