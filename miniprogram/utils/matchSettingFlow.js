const STAGE_LABELS = {
  profile: '基础资料保存失败',
  setting: '匹配配置保存失败',
  application: '会员申请提交失败'
}

function nextMatchSettingAction(input = {}) {
  if (input.intentConfirmationRequired === true) return 'confirm_intent'
  return input.memberStatus === 'approved' ? 'complete' : 'submit_application'
}

function matchSettingFailureMessage(stage, error) {
  const prefix = STAGE_LABELS[stage] || '保存失败'
  const raw = String(error && error.message || '').trim()
  const detail = raw === 'SERVER_ERROR'
    ? '服务器处理异常，请稍后重试'
    : (raw || '请稍后重试')
  return `${prefix}：${detail}`
}

module.exports = {
  nextMatchSettingAction,
  matchSettingFailureMessage
}
