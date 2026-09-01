const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { STORAGE_KEYS } = require('../../utils/constants')
const { parsePromoteCode, normalizePromoteCode } = require('../../utils/util')

const STATUS_TEXT = {
  pending_profile: '资料待完善',
  pending_review: '等待合伙人审核',
  need_more_info: '需要补充资料',
  approved: '正式会员审核通过',
  rejected: '会员申请未通过',
  disabled: '正式会员资格已停用'
}

Page({
  data: {
    loading: true,
    redirectingToLogin: false,
    submitting: false,
    bindingReferral: false,
    referralInput: '',
    referralMessage: '',
    detail: null,
    statusText: ''
  },

  onLoad(options) {
    const app = getApp()
    const linkReferral = parsePromoteCode(
      (options && options.scene) || app.globalData.launchScene,
      { ...app.globalData.launchQuery, ...options }
    )
    const referral = normalizePromoteCode(linkReferral || wx.getStorageSync(STORAGE_KEYS.PROMOTE_CODE))
    if (referral) {
      wx.setStorageSync(STORAGE_KEYS.PROMOTE_CODE, referral)
      this.setData({ referralInput: referral, referralMessage: '已从微信邀请链接带入，请确认接受邀请' })
    }
    if (!wx.getStorageSync(STORAGE_KEYS.TOKEN)) {
      this.setData({ redirectingToLogin: true })
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },

  onShow() {
    if (this.data.redirectingToLogin || !wx.getStorageSync(STORAGE_KEYS.TOKEN)) return
    this.loadStatus()
  },

  async loadStatus() {
    this.setData({ loading: true })
    try {
      const detail = await get(API_PATHS.MEMBER_APPLICATION, {}, { showError: false })
      this.setData({
        detail,
        statusText: STATUS_TEXT[detail.member_status] || '会员申请状态'
      })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goComplete() {
    wx.navigateTo({ url: '/pages/match-setting/match-setting' })
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/register/register?edit=1' })
  },

  goVip() {
    wx.navigateTo({ url: '/pages/vip/vip' })
  },

  goService() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  },

  onReferralInput(e) {
    this.setData({ referralInput: e.detail.value || '', referralMessage: '' })
  },

  async bindReferral() {
    if (this.data.bindingReferral) return
    const referral = normalizePromoteCode(this.data.referralInput)
    if (!referral) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    this.setData({ bindingReferral: true, referralMessage: '' })
    try {
      const result = await post(API_PATHS.MEMBER_APPLICATION_REFERRAL, { referral }, {
        showLoading: true,
        loadingText: '确认邀请中...',
        showError: false
      })
      wx.removeStorageSync(STORAGE_KEYS.PROMOTE_CODE)
      if (result.auto_approved) {
        wx.showModal({
          title: '邀请已确认',
          content: '你的正式会员审核已通过，可以进入首页继续使用。',
          showCancel: false,
          success: () => wx.switchTab({ url: '/pages/index/index' })
        })
        return
      }
      this.setData({
        referralInput: result.promote_code || referral,
        referralMessage: '邀请关系已绑定，请等待该合伙人审核'
      })
      await this.loadStatus()
    } catch (err) {
      this.setData({ referralMessage: err.message || '邀请确认失败，请检查邀请码' })
    } finally {
      this.setData({ bindingReferral: false })
    }
  },

  async resubmit() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await post(API_PATHS.MEMBER_APPLICATION_SUBMIT, {}, {
        showLoading: true,
        loadingText: '重新提交中...'
      })
      wx.showToast({ title: '已重新提交', icon: 'success' })
      await this.loadStatus()
    } catch (err) {
      wx.showModal({ title: '暂时不能提交', content: err.message || '请稍后重试', showCancel: false })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
