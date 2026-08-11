const { callApi } = require('./cloudApi')
const { STORAGE_KEYS } = require('./constants')

function partnerToken() {
  return wx.getStorageSync(STORAGE_KEYS.PARTNER_TOKEN) || ''
}

function requestPartner(path, method = 'GET', data = {}, options = {}) {
  const token = partnerToken()
  if (!token && options.requireToken !== false) {
    const err = new Error('请先登录合伙人账号')
    err.code = 401
    return Promise.reject(err)
  }
  return callApi('request', {
    method,
    path,
    data: Object.assign({}, data, { __partner_token: token })
  }, options)
}

function loginPartner(phone, password) {
  return callApi('request', {
    method: 'POST',
    path: '/api/auth/partner-login',
    data: { phone, password }
  })
}

module.exports = {
  partnerToken,
  requestPartner,
  loginPartner
}
