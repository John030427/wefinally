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

  const rejectNetwork = (message) => {
    if (showLoading) wx.hideLoading()
    const err = { code: -1, message, type: 'network' }
    if (showError) wx.showToast({ title: err.message, icon: 'none', duration: 2500 })
    return Promise.reject(err)
  }

  return Promise.resolve()
    .then(() => app && typeof app.checkNetwork === 'function' ? app.checkNetwork() : true)
    .then((available) => {
      if (!available) return rejectNetwork('网络不可用，请检查网络连接')
      return requestByPath(method, url, {
          ...data,
          __token: token || '',
          __headers: header || {}
        }).then((body) => {
          if (showLoading) wx.hideLoading()
          return body
        }).catch((err) => {
          if (showLoading) wx.hideLoading()
          if (err && err.code === 401) {
              app && app.clearLoginState && app.clearLoginState()
              wx.showToast({ title: '登录已过期', icon: 'none' })
              return Promise.reject({ code: 401, message: '未授权', type: 'auth' })
          }
          const rawMsg = (err && err.message) || ''
          const msg = /接口不存在|route not found|unknown route/i.test(rawMsg)
            ? '功能服务尚未更新，请稍后再试'
            : (/DATABASE_COLLECTION_NOT_EXIST|database collection not exists|ResourceNotFound/i.test(rawMsg)
              ? '功能数据正在初始化，请稍后再试'
              : (rawMsg || '服务暂时不可用，请稍后重试'))
          const routeMissing = /接口不存在|route not found|unknown route/i.test(rawMsg)
          if (showError) wx.showToast({ title: msg, icon: 'none' })
          return Promise.reject({
            code: (err && err.code) || -2,
            message: msg,
            type: (err && err.type) || 'cloud',
            routeMissing,
            deploymentMismatch: routeMissing,
            detail: err
          })
        })
    }, () => rejectNetwork('网络不可用'))
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
