'use strict'

const { businessError } = require('./businessError')

function requireWxOpenid(wxContext = {}) {
  const openid = String(wxContext.OPENID || '').trim()
  if (!openid) {
    throw businessError('AUTH_REQUIRED', '无法获取微信身份，请重新进入小程序')
  }
  return openid
}

module.exports = {
  requireWxOpenid
}
