const DEV_OPENID_STORAGE_KEY = 'wf_dev_openid'
const CLOUD_ENV_ID = 'cloud1-d4gy8l52g08bba326'
const networkCheckTimeoutMs = 1500
const STORAGE_KEYS = {
  TOKEN: 'wf_token',
  USER_INFO: 'wf_user_info',
  OPENID: 'wf_openid',
  AGREEMENT_ACCEPTED: 'wf_agreement_accepted',
  MATCH_SETTING_COOLDOWN: 'wf_match_setting_cooldown'
}

function getStoredDevOpenid() {
  return wx.getStorageSync(DEV_OPENID_STORAGE_KEY) || ''
}

function validateDevOpenid(openid) {
  const value = String(openid || '').trim()
  if (!value) return { ok: true, devOpenid: '', message: '已清空测试 openid' }
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(value)) {
    return { ok: false, message: '测试 openid 只能包含字母、数字、下划线和短横线，长度 3-80' }
  }
  return { ok: true, devOpenid: value, message: `当前测试 openid：${value}` }
}

App({
  globalData: {
    CLOUD_ENV_ID,
    cloudInited: false,
    DEV_OPENID: getStoredDevOpenid(),
    DEV_MATCH_BUTTON_ENABLED: false,
    userInfo: null,
    token: '',
    isLoggedIn: false,
    networkAvailable: true,
    launchScene: '',
    launchQuery: {}
  },

  onLaunch(options) {
    this.initCloud()
    this.initNetworkListener()
    this.restoreSession()
    if (options.scene) this.globalData.launchScene = options.scene
    if (options.query) this.globalData.launchQuery = options.query
  },

  initCloud() {
    if (this.globalData.cloudInited) return
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true
    })
    this.globalData.cloudInited = true
  },

  initNetworkListener() {
    wx.onNetworkStatusChange(function (res) {
      this.globalData.networkAvailable = res.isConnected
    }.bind(this))
    wx.getNetworkType({
      success: function (res) {
        this.globalData.networkAvailable = res.networkType !== 'none'
      }.bind(this)
    })
  },

  restoreSession() {
    const token = wx.getStorageSync(STORAGE_KEYS.TOKEN)
    const userInfo = wx.getStorageSync(STORAGE_KEYS.USER_INFO)
    if (token) {
      this.globalData.token = token
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = userInfo || null
    }
  },

  setLoginState(token, userInfo) {
    this.globalData.token = token
    this.globalData.userInfo = userInfo
    this.globalData.isLoggedIn = true
    wx.setStorageSync(STORAGE_KEYS.TOKEN, token)
    wx.setStorageSync(STORAGE_KEYS.USER_INFO, userInfo)
  },

  getApiBaseUrl() {
    return ''
  },

  getDevOpenid() {
    return this.globalData.DEV_OPENID || getStoredDevOpenid()
  },

  setDevOpenid(openid) {
    const result = validateDevOpenid(openid)
    if (!result.ok) {
      if (wx.showModal) {
        wx.showModal({
          title: '测试 openid 无效',
          content: result.message,
          showCancel: false
        })
      }
      return result
    }
    this.globalData.DEV_OPENID = result.devOpenid
    if (result.devOpenid) wx.setStorageSync(DEV_OPENID_STORAGE_KEY, result.devOpenid)
    else wx.removeStorageSync(DEV_OPENID_STORAGE_KEY)
    this.clearLoginState()
    wx.removeStorageSync(STORAGE_KEYS.OPENID)
    wx.removeStorageSync(STORAGE_KEYS.AGREEMENT_ACCEPTED)
    return result
  },

  resetLocalForRegistration(openid) {
    let result = { ok: true }
    if (openid !== undefined) {
      result = this.setDevOpenid(openid)
      if (!result.ok) return result
    } else {
      this.clearLoginState()
      wx.removeStorageSync(STORAGE_KEYS.OPENID)
      wx.removeStorageSync(STORAGE_KEYS.AGREEMENT_ACCEPTED)
    }
    wx.removeStorageSync(STORAGE_KEYS.MATCH_SETTING_COOLDOWN)
    if (wx.reLaunch) wx.reLaunch({ url: '/pages/login/login' })
    return {
      ok: true,
      devOpenid: this.getDevOpenid(),
      message: '本地登录态已清空，请重新点击微信一键登录进入注册流程'
    }
  },

  setApiBaseUrl(url) {
    wx.removeStorageSync('wf_api_base_url')
    const result = {
      ok: true,
      cloud: true,
      env: CLOUD_ENV_ID,
      message: '体验版已接入微信云开发，不再使用本地 API 地址'
    }
    console.log('[WeFinally] ' + result.message)
    if (wx.showModal) {
      wx.showModal({
        title: '云开发已启用',
        content: result.message,
        showCancel: false
      })
    }
    return result
  },

  debugApiHealth() {
    this.initCloud()
    const cloudApi = require('./utils/cloudApi')
    return cloudApi.callApi('ping', {}).then((data) => {
      const result = { ok: true, env: CLOUD_ENV_ID, data }
      console.log('[WeFinally] 云开发健康检查', result)
      if (wx.showModal) {
        wx.showModal({
          title: '云开发连接成功',
          content: 'api 云函数已连通：' + (data && data.message ? data.message : 'pong'),
          showCancel: false
        })
      }
      return result
    }).catch((err) => {
      const result = {
        ok: false,
        env: CLOUD_ENV_ID,
        errMsg: (err && err.message) || String(err || '')
      }
      console.error('[WeFinally] 云开发健康检查失败', result)
      if (wx.showModal) {
        wx.showModal({
          title: '云开发连接失败',
          content: '服务暂时不可用，请稍后重试',
          showCancel: false
        })
      }
      return result
      })
  },

  clearLoginState() {
    this.globalData.token = ''
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false
    wx.removeStorageSync(STORAGE_KEYS.TOKEN)
    wx.removeStorageSync(STORAGE_KEYS.USER_INFO)
  },

  checkNetwork(timeoutMs = networkCheckTimeoutMs) {
    const app = this
    return new Promise(function (resolve) {
      let settled = false
      let timer = null
      const finishNetworkCheck = function (available) {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        const ok = available !== false
        app.globalData.networkAvailable = ok
        resolve(ok)
      }

      const waitMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : networkCheckTimeoutMs
      timer = setTimeout(function () {
        finishNetworkCheck(app.globalData.networkAvailable !== false)
      }, waitMs)

      if (!wx.getNetworkType) {
        finishNetworkCheck(app.globalData.networkAvailable !== false)
        return
      }

      try {
        wx.getNetworkType({
          success: function (res) {
            finishNetworkCheck(res.networkType !== 'none')
          },
          fail: function () { finishNetworkCheck(false) }
        })
      } catch (err) {
        finishNetworkCheck(app.globalData.networkAvailable !== false)
      }
    })
  }
})
