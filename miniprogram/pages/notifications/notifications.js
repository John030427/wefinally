const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { refreshNotificationBadge } = require('../../utils/notificationBadge')

const EVENT_ICONS = {
  invitation_created: '💌',
  invitation_accepted: '🤝',
  preference_changed: '🔄',
  proposal_generated: '🗓',
  proposal_confirmed: '✅',
  arranged: '🎉',
  coordination_updated: '📣'
}

function timeText(value) {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const pad = (n) => String(n).padStart(2, '0')
  if (sameDay) return pad(date.getHours()) + ':' + pad(date.getMinutes())
  return (date.getMonth() + 1) + '月' + date.getDate() + '日'
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    list: [],
    unreadCount: 0
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ pageState: 'loading', errorMsg: '' })
    const app = getApp()
    if (!await app.checkNetwork()) {
      this.setData({ pageState: 'no-network' })
      return
    }
    try {
      const data = await get(API_PATHS.NOTIFICATIONS, {}, { showError: false })
      const raw = (data && (data.list || data.items)) || []
      const list = raw.map((item) => ({
        id: item.id,
        coordinationId: item.coordination_id,
        icon: EVENT_ICONS[item.event_type] || '📣',
        title: item.title || '约会协调有新进展',
        body: item.body || '请进入查看最新安排。',
        timeText: timeText(item.create_time),
        unread: !item.read_at
      }))
      this.setData({
        pageState: list.length ? 'success' : 'empty',
        list,
        unreadCount: Number((data && (data.unread_count || data.unreadCount)) || 0)
      })
      await refreshNotificationBadge()
    } catch (err) {
      const deploymentMismatch = Boolean(err && (err.deploymentMismatch || err.routeMissing))
      this.setData({
        pageState: 'error',
        errorMsg: deploymentMismatch
          ? '当前 CloudBase 后端版本尚未包含消息服务，请更新 api 云函数后再试。'
          : ((err && err.message) || '加载失败')
      })
    }
  },

  async onMarkAllRead() {
    try {
      await post(API_PATHS.NOTIFICATIONS_READ, {}, { showError: false })
      await refreshNotificationBadge()
      this.load()
      wx.showToast({ title: '已全部标记为已读', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    }
  },

  async onTapItem(e) {
    const item = e.currentTarget.dataset
    const coordinationId = Number(item.coordinationId || 0)
    if (!coordinationId) {
      wx.showToast({ title: '该记录缺少协调编号', icon: 'none' })
      return
    }
    try {
      await post(API_PATHS.NOTIFICATIONS_READ, { coordination_id: coordinationId }, { showError: false })
    } catch (err) { /* 标记已读失败不阻断跳转 */ }
    wx.navigateTo({ url: '/pages/date-coordination/date-coordination?coordinationId=' + coordinationId })
  }
})