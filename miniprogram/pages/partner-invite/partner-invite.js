const { requestPartner, partnerToken } = require('../../utils/partnerApi')
const { STORAGE_KEYS } = require('../../utils/constants')

function sharePath(assets) {
  const referral = String((assets && (assets.attribution_token || assets.promote_code)) || '').trim()
  return referral
    ? `/pages/register/register?promote_code=${encodeURIComponent(referral)}`
    : '/pages/register/register'
}

function recordShareEvent(channel) {
  return requestPartner('/api/partner/share-event', 'POST', { channel })
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    partner: null,
    assets: null,
    qrcodePath: '',
    sharePath: ''
  },

  onLoad() {
    if (!partnerToken()) {
      wx.redirectTo({ url: '/pages/partner-login/partner-login' })
      return
    }
    this.loadAssets()
  },

  async loadAssets() {
    this.setData({ pageState: 'loading', errorMsg: '' })
    try {
      const assets = await requestPartner('/api/partner/invite-assets')
      const info = wx.getStorageSync(STORAGE_KEYS.PARTNER_INFO) || {}
      this.setData({
        pageState: 'success',
        partner: info,
        assets,
        sharePath: assets.miniprogram_path || sharePath(assets)
      })
      this.prepareQrCode(assets.qrcode_base64)
    } catch (err) {
      if (err && err.code === 401) {
        wx.removeStorageSync(STORAGE_KEYS.PARTNER_TOKEN)
        wx.removeStorageSync(STORAGE_KEYS.PARTNER_INFO)
        wx.redirectTo({ url: '/pages/partner-login/partner-login' })
        return
      }
      this.setData({ pageState: 'error', errorMsg: (err && err.message) || '邀请信息加载失败' })
    }
  },

  prepareQrCode(base64) {
    if (!base64 || !wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) return
    const filePath = `${wx.env.USER_DATA_PATH}/wf-partner-${Date.now()}.png`
    wx.getFileSystemManager().writeFile({
      filePath,
      data: base64,
      encoding: 'base64',
      success: () => this.setData({ qrcodePath: filePath })
    })
  },

  onRetry() {
    this.loadAssets()
  },

  onShareAppMessage() {
    const assets = this.data.assets || {}
    recordShareEvent('wechat').catch(() => {})
    return {
      title: assets.share_title || 'WeFinally · 遇见对的人',
      desc: assets.share_desc || '通过专属邀请申请 WeFinally 正式会员',
      path: this.data.sharePath || sharePath(assets)
    }
  },

  copyCode() {
    const code = this.data.assets && this.data.assets.promote_code
    if (!code) return
    wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '推广码已复制', icon: 'success' }) })
  },

  saveQrCode() {
    if (!this.data.qrcodePath) {
      wx.showToast({ title: '小程序码暂不可用', icon: 'none' })
      return
    }
    wx.saveImageToPhotosAlbum({
      filePath: this.data.qrcodePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => wx.showToast({ title: (err && err.errMsg) || '保存失败', icon: 'none' })
    })
  },

  logout() {
    wx.removeStorageSync(STORAGE_KEYS.PARTNER_TOKEN)
    wx.removeStorageSync(STORAGE_KEYS.PARTNER_INFO)
    wx.redirectTo({ url: '/pages/partner-login/partner-login' })
  }
})
