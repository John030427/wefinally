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

function savePartnerSession(result) {
  if (!result || !result.token) throw new Error('合伙人会话响应无效')
  wx.setStorageSync(STORAGE_KEYS.PARTNER_TOKEN, result.token)
  wx.setStorageSync(STORAGE_KEYS.PARTNER_INFO, result.partner || {})
  return result
}

function onboardingStatus() {
  return requestPartner('/api/partner/onboarding/status', 'GET', {}, { requireToken: false })
}

function submitPartnerApplication(data) {
  return requestPartner('/api/partner/applications', 'POST', data, { requireToken: false })
}

function activatePartner(phoneCode, requestId) {
  return requestPartner('/api/partner/activation', 'POST', { phone_code: phoneCode, request_id: requestId }, { requireToken: false })
    .then((result) => {
      savePartnerSession(result.session)
      if (result.partner) wx.setStorageSync(STORAGE_KEYS.PARTNER_INFO, result.partner)
      return result
    })
}

function restorePartnerSession() {
  return requestPartner('/api/partner/session', 'POST', {}, { requireToken: false }).then(savePartnerSession)
}

module.exports = {
  partnerToken,
  requestPartner,
  loginPartner,
  onboardingStatus,
  submitPartnerApplication,
  activatePartner,
  restorePartnerSession,
  savePartnerSession
}
