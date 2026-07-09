const { STORAGE_KEYS } = require('./constants')
const { requestByPath } = require('./cloudApi')

function getAppInstance() {
  return getApp()
}

function request(options) {
  const {
    url,
    method = 'GET',
    data = {},
    header = {},
    showLoading = false,
    loadingText = '加载中...',
    showError = true
  } = options

  const app = getAppInstance()
  const token = (app && app.globalData && app.globalData.token) || wx.getStorageSync(STORAGE_KEYS.TOKEN)

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true })
  }

  return new Promise((resolve, reject) => {
    wx.getNetworkType({
      success(netRes) {
        if (netRes.networkType === 'none') {
          if (showLoading) wx.hideLoading()
          const err = { code: -1, message: '网络不可用，请检查网络连接', type: 'network' }
          if (showError) {
            wx.showToast({ title: err.message, icon: 'none', duration: 2500 })
          }
          reject(err)
          return
        }

        requestByPath(method, url, {
          ...data,
          __token: token || '',
          __headers: header || {}
        }).then((body) => {
          if (showLoading) wx.hideLoading()
          resolve(body)
        }).catch((err) => {
          if (showLoading) wx.hideLoading()
          if (err && err.code === 401) {
              app && app.clearLoginState && app.clearLoginState()
              wx.showToast({ title: '登录已过期', icon: 'none' })
              reject({ code: 401, message: '未授权', type: 'auth' })
              return
          }
          const msg = (err && err.message) || '服务暂时不可用，请稍后重试'
          if (showError) wx.showToast({ title: msg, icon: 'none' })
          reject({
            code: (err && err.code) || -2,
            message: msg,
            type: (err && err.type) || 'cloud',
            detail: err
          })
        })
      },
      fail() {
        if (showLoading) wx.hideLoading()
        const err = { code: -1, message: '网络不可用', type: 'network' }
        if (showError) wx.showToast({ title: err.message, icon: 'none' })
        reject(err)
      }
    })
  })
}

function get(url, data, options = {}) {
  return request({ url, method: 'GET', data, ...options })
}

function post(url, data, options = {}) {
  return request({ url, method: 'POST', data, ...options })
}

function put(url, data, options = {}) {
  return request({ url, method: 'PUT', data, ...options })
}

function del(url, data, options = {}) {
  return request({ url, method: 'DELETE', data, ...options })
}

module.exports = {
  request,
  get,
  post,
  put,
  del
}
