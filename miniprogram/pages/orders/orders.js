const { get } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { formatDate } = require('../../utils/util')

function amountText(order) {
  const amountFen = Number(order && order.amount_total || 0)
  const amount = amountFen > 0 ? amountFen / 100 : Number(order && order.price || 0)
  return amount.toFixed(2)
}

function statusText(order) {
  if (Number(order && order.pay_status || 0) === 1 || order.is_paid) return '已支付'
  const state = String(order && order.trade_state || '').toUpperCase()
  if (state === 'CLOSED' || state === 'REVOKED' || state === 'PAYERROR') return '已关闭'
  return '待支付'
}

function normalizeOrder(order) {
  const paid = Number(order && order.pay_status || 0) === 1 || Boolean(order && order.is_paid)
  const invoiceStatus = String(order && order.invoice_status || '')
  return {
    orderNo: String(order && order.order_no || ''),
    amountText: amountText(order),
    vipDays: Number(order && order.vip_days || 30),
    statusText: statusText(order),
    statusClass: paid ? 'paid' : 'pending',
    isPaid: paid,
    invoiceStatus,
    invoiceStatusText: invoiceStatus === 'pending'
      ? '开票处理中'
      : (invoiceStatus === 'issued' ? '发票已开具' : (invoiceStatus === 'rejected' ? '开票未通过' : '')),
    invoiceEligible: paid && order.invoice_eligible !== false && !['pending', 'issued'].includes(invoiceStatus),
    payTimeText: order && order.pay_time ? formatDate(order.pay_time, 'YYYY-MM-DD HH:mm') : '',
    createTimeText: order && order.create_time ? formatDate(order.create_time, 'YYYY-MM-DD HH:mm') : ''
  }
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    orders: [],
    refreshingOrderNo: ''
  },

  onShow() {
    this.loadOrders()
  },

  async loadOrders() {
    this.setData({ pageState: 'loading', errorMsg: '' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }
    try {
      const result = await get(API_PATHS.ORDER_LIST, { limit: 20 }, { showError: false })
      const rows = Array.isArray(result) ? result : ((result && (result.list || result.orders)) || [])
      this.setData({
        pageState: 'success',
        orders: rows.map(normalizeOrder)
      })
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '订单加载失败'
      })
    }
  },

  onRetry() {
    this.loadOrders()
  },

  async refreshOrder(e) {
    const orderNo = String(e.currentTarget.dataset.orderNo || '')
    if (!orderNo || this.data.refreshingOrderNo) return
    this.setData({ refreshingOrderNo: orderNo })
    try {
      const status = await get(API_PATHS.ORDER_STATUS, { order_no: orderNo }, {
        showLoading: true,
        loadingText: '正在查询支付状态...'
      })
      const orders = this.data.orders.map((order) => order.orderNo === orderNo
        ? Object.assign({}, order, normalizeOrder(Object.assign({}, status, {
          order_no: orderNo,
          amount_total: Math.round(Number(order.amountText || 0) * 100),
          vip_days: order.vipDays,
          create_time: order.createTimeText
        })))
        : order)
      this.setData({ orders })
      wx.showToast({ title: status && status.is_paid ? '支付已确认' : '暂未支付', icon: 'none' })
    } catch (err) {
      wx.showModal({
        title: '查询失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ refreshingOrderNo: '' })
    }
  },

  requestInvoice(e) {
    const orderNo = String(e.currentTarget.dataset.orderNo || '')
    if (!orderNo) return
    wx.navigateTo({
      url: `/pages/invoice/invoice?orderNo=${encodeURIComponent(orderNo)}`
    })
  }
})

module.exports = { amountText, statusText, normalizeOrder }
