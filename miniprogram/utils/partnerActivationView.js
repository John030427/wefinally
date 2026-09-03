const ALLOWED_ACTIVATION_ERRORS = [
  '手机号未获资格或验证不一致',
  '该合伙人资格已绑定其他微信用户',
  '当前用户已有合伙人身份'
]

function activationErrorMessage(error) {
  const message = String(error && (error.message || error.errMsg) || '')
  return ALLOWED_ACTIVATION_ERRORS.find((item) => message.includes(item)) ||
    '激活未完成，请稍后重试；如仍失败请联系平台'
}

module.exports = { activationErrorMessage }
