const { get, post } = require('../../utils/request')
const { API_PATHS, STORAGE_KEYS } = require('../../utils/constants')
const { genderText, calcAge } = require('../../utils/util')
const { buildProfileReadiness } = require('../../utils/productExperience')
const { onboardingStatus, restorePartnerSession } = require('../../utils/partnerApi')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    userInfo: null,
    isVip: false,
    partnerStatus: { state: 'loading', allowed_actions: [] },
    readiness: null,
    menuList: [
      { icon: '⚙️', title: '择偶配置', url: '/pages/match-setting/match-setting' },
      { icon: '📝', title: '外貌描述', url: '/pages/appearance/appearance' },
      { icon: '👑', title: 'VIP 会员', url: '/pages/vip/vip' },
      { icon: '🧾', title: '我的订单', url: '/pages/orders/orders' },
      { icon: '🎖️', title: '激活码兑换', action: 'claimFree' },
      { icon: '🛡️', title: '见面安全记录', url: '/pages/meet-safety-list/meet-safety-list' },
      { icon: '💒', title: '领证数据公示', url: '/pages/marry-stat/marry-stat' },
      { icon: '📋', title: '婚姻报备', url: '/pages/marry-report/marry-report' },
      { icon: '💬', title: '平台AI客服', url: '/pages/chat/chat?agentType=platform_service' },
      { icon: '📜', title: '平台规则', url: '/pages/rules/rules' },
      { icon: '❌', title: '账号注销', url: '/pages/account-cancel/account-cancel' }
    ]
  },

  onShow() {
    this.loadProfile()
    this.loadPartnerStatus()
  },

  async loadPartnerStatus() {
    try {
      const status = await onboardingStatus()
      this.setData({ partnerStatus: status || { state: 'not_applied', allowed_actions: ['verify'] } })
    } catch (err) {
      this.setData({ partnerStatus: { state: 'error', review_note: (err && err.message) || '暂时无法读取合伙人状态', allowed_actions: [] } })
    }
  },

  async loadProfile() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }

    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network', userInfo: app.globalData.userInfo })
      return
    }

    try {
      const profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
      const userInfo = profile || app.globalData.userInfo || {}
      if (profile) {
        app.globalData.userInfo = profile
        wx.setStorageSync(STORAGE_KEYS.USER_INFO, profile)
      }

      const display = {
        gender: genderText(userInfo.gender),
        age: calcAge(userInfo.birth_year),
        city: userInfo.city || '--',
        education: userInfo.education || '--',
        circleName: userInfo.circle_name || '--',
        babyPlan: userInfo.baby_plan || '--'
      }

      this.setData({
        pageState: 'success',
        userInfo: { ...userInfo, display },
        isVip: profile && (profile.isVip || profile.is_vip === 1),
        readiness: buildProfileReadiness(userInfo)
      })
    } catch (err) {
      this.setData({
        pageState: app.globalData.userInfo ? 'success' : 'error',
        errorMsg: (err && err.message) || '加载失败',
        userInfo: app.globalData.userInfo
      })
    }
  },

  onRetry() {
    this.loadProfile()
  },

  editBaseProfile() {
    wx.navigateTo({ url: '/pages/register/register?edit=1' })
  },

  editMatchProfile() {
    wx.navigateTo({ url: '/pages/match-setting/match-setting' })
  },

  async openPartnerWorkspace() {
    const state = this.data.partnerStatus && this.data.partnerStatus.state
    if (state !== 'active') {
      wx.navigateTo({ url: '/pages/partner-login/partner-login' })
      return
    }
    try {
      await restorePartnerSession()
      wx.navigateTo({ url: '/pages/partner-invite/partner-invite' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '会话恢复失败', icon: 'none' })
      this.loadPartnerStatus()
    }
  },

  onMenuTap(e) {
    const { url, action } = e.currentTarget.dataset
    if (action === 'claimFree') return this.onClaimFree()
    wx.navigateTo({ url })
  },

  onClaimFree() {
    wx.showModal({
      title: '激活码兑换',
      editable: true,
      placeholderText: '输入平台提供的激活码',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await post('/api/user/claim-free', { activation_code: (r.content || '').trim() }, { showLoading: true })
          wx.showToast({ title: '激活成功', icon: 'success' })
          this.loadProfile()
        } catch (e) {
          wx.showModal({ title: '激活失败', content: (e && e.message) || '激活码无效或已使用', showCancel: false })
        }
      }
    })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          getApp().clearLoginState()
          wx.showToast({ title: '已退出', icon: 'success' })
          setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 800)
        }
      }
    })
  }
})
