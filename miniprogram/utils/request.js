const { STORAGE_KEYS } = require('./constants')

function getAppInstance() {
  return getApp()
}

function getBaseUrl() {
  const app = getAppInstance()
  return (app && app.globalData && app.globalData.API_BASE_URL) || ''
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

        wx.request({
          url: getBaseUrl() + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
            ...header
          },
          success(res) {
            if (showLoading) wx.hideLoading()
            const statusCode = res.statusCode
            if (statusCode >= 200 && statusCode < 300) {
              const body = res.data
              if (body && (body.code === 0 || body.code === 200 || body.success === true)) {
                resolve(body.data !== undefined ? body.data : body)
              } else if (body && body.code === 401) {
                app && app.clearLoginState && app.clearLoginState()
                wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
                setTimeout(() => {
                  wx.reLaunch({ url: '/pages/login/login' })
                }, 1500)
                reject({ code: 401, message: '未授权', type: 'auth' })
              } else {
                const msg = (body && (body.message || body.msg)) || '请求失败'
                if (showError) wx.showToast({ title: msg, icon: 'none' })
                reject({ code: body && body.code, message: msg, type: 'api' })
              }
            } else if (statusCode === 401) {
              app && app.clearLoginState && app.clearLoginState()
              wx.showToast({ title: '登录已过期', icon: 'none' })
              reject({ code: 401, message: '未授权', type: 'auth' })
            } else {
              const msg = `服务异常(${statusCode})`
              if (showError) wx.showToast({ title: msg, icon: 'none' })
              reject({ code: statusCode, message: msg, type: 'http' })
            }
          },
          fail(err) {
            if (showLoading) wx.hideLoading()
            const msg = '网络请求失败，请稍后重试'
            if (showError) wx.showToast({ title: msg, icon: 'none' })
            reject({ code: -2, message: msg, type: 'network', detail: err })
          }
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
