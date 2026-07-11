const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

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
    submitting: false,
    detail: null,
    statusText: ''
  },

  onShow() {
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
