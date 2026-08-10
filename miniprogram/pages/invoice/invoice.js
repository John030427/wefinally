const { post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

Page({
  data: {
    orderNo: '',
    invoice_type: 'personal',
    title: '',
    tax_no: '',
    email: '',
    submitting: false
  },

  onLoad(options) {
    this.setData({ orderNo: decodeURIComponent(String(options.orderNo || '')) })
  },

  onTypeChange(e) {
    this.setData({ invoice_type: e.detail.value, tax_no: '' })
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (field) this.setData({ [field]: e.detail.value || '' })
  },

  async onSubmit() {
    if (this.data.submitting) return
    const payload = {
      order_no: this.data.orderNo,
      invoice_type: this.data.invoice_type,
      title: this.data.title.trim(),
      tax_no: this.data.tax_no.trim(),
      email: this.data.email.trim()
    }
    if (!payload.title || !payload.email || (payload.invoice_type === 'company' && !payload.tax_no)) {
      wx.showToast({ title: '请完整填写开票信息', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await post(API_PATHS.ORDER_INVOICE, payload, {
        showLoading: true,
        loadingText: '正在提交...'
      })
      wx.showModal({
        title: '申请已提交',
        content: '开票完成后将发送至您填写的邮箱。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
    } catch (err) {
      wx.showModal({
        title: '提交失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
