const { get, post } = require('../../utils/request')
const { API_PATHS, VIP_PRICE, VIP_DAYS } = require('../../utils/constants')
const { formatDate } = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    vipPrice: VIP_PRICE,
    vipDays: VIP_DAYS,
    isVip: false,
    vipExpireDate: '',
    purchasing: false,
    paymentProcessing: false,
    processingText: '',
    benefits: [
      { icon: '🎯', title: 'AI 定时匹配', desc: '每周三、周五 0:00 各空投 1 位对象' },
      { icon: '💭', title: '三观契合度', desc: '查看匹配对象三观契合度分析' },
      { icon: '💒', title: '私密奔现对接', desc: '平台官方一对一奔现服务' },
      { icon: '🔒', title: '无自动续费', desc: '到期自动回收，按需再次购买' }
    ]
  },

  onLoad() {
    this.loadVipInfo()
  },

  async loadVipInfo() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    try {
      const data = await get(API_PATHS.VIP_INFO, {}, { showError: false })
      const isVip = data && (data.isVip || data.is_vip === 1)
      this.setData({
        pageState: 'success',
        isVip,
        vipExpireDate: data && (data.expireDate || data.vip_expire_time)
          ? formatDate(data.expireDate || data.vip_expire_time, 'YYYY-MM-DD')
          : ''
      })
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载失败'
      })
    }
  },

  onRetry() {
    this.loadVipInfo()
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  },

  async pollOrderStatus(orderNo, maxAttempts = 5) {
    for (let i = 0; i < maxAttempts; i += 1) {
      try {
        const status = await get(API_PATHS.ORDER_STATUS, { order_no: orderNo }, { showError: false })
        if (status && status.is_paid) return status
      } catch (err) {
        // Payment may be confirmed by a delayed callback; keep the UI in processing state.
      }
      await this.sleep(1200)
    }
    return null
  },

  showProcessingModal() {
    wx.showModal({
      title: '支付处理中',
      content: '微信支付已返回，平台还在确认结果。请稍后刷新会员状态。',
      showCancel: false
    })
  },

  async onPurchase() {
    if (this.data.purchasing) return
    const purchaseAction = this.data.isVip ? '续费' : '开通'

    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }

    wx.showModal({
      title: this.data.isVip ? '确认续费' : '确认开通',
      content: `支付 ${this.data.vipPrice} 元${purchaseAction} ${this.data.vipDays} 天 VIP，不自动续费`,
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ purchasing: true })
        try {
          const result = await post(API_PATHS.VIP_PURCHASE, {}, {
            showLoading: true,
            loadingText: '创建订单...'
          })

          if (result && result.payment) {
            await new Promise((resolve, reject) => {
              wx.requestPayment({
                timeStamp: result.payment.timeStamp,
                nonceStr: result.payment.nonceStr,
                package: result.payment.package,
                signType: result.payment.signType || 'RSA',
                paySign: result.payment.paySign,
                success: resolve,
                fail: reject
              })
            })
            this.setData({
              paymentProcessing: true,
              processingText: '正在确认支付结果...'
            })
            const paid = await this.pollOrderStatus(result.order_no, 5)
            this.setData({ paymentProcessing: false, processingText: '' })
            if (paid && paid.is_paid) {
              wx.showToast({ title: `${purchaseAction}成功`, icon: 'success' })
              this.loadVipInfo()
              return
            }
            this.showProcessingModal()
            this.loadVipInfo()
            return
          }

          if (result && result.demo_granted) {
            wx.showModal({
              title: '演示模式',
              content: result.message
                ? `${result.message}。当前为演示模式，未发起微信支付，也不会扣款。`
                : '当前为演示模式，未发起微信支付，也不会扣款。',
              showCancel: false
            })
            this.loadVipInfo()
            return
          }

          wx.showModal({
            title: '支付暂未开启',
            content: result && result.message ? result.message : '微信支付暂未开启，请稍后重试',
            showCancel: false
          })
          this.loadVipInfo()
          return
        } catch (err) {
          if (err && err.errMsg && err.errMsg.includes('cancel')) {
            wx.showToast({ title: '已取消支付', icon: 'none' })
          } else {
            wx.showModal({
              title: '开通失败',
              content: (err && err.message) || '请稍后重试',
              showCancel: false
            })
          }
        } finally {
          this.setData({ purchasing: false })
        }
      }
    })
  }
})
