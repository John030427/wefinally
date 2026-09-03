const TAB_INDEX_RECORDS = 1

function applyTabBadge(unread) {
  const count = Math.max(0, Number(unread || 0))
  if (typeof wx === 'undefined') return count
  try {
    if (count > 0) {
      if (wx.showTabBarRedDot) wx.showTabBarRedDot({ index: TAB_INDEX_RECORDS })
      if (wx.setTabBarBadge) wx.setTabBarBadge({ index: TAB_INDEX_RECORDS, text: count > 99 ? '99+' : String(count) })
    } else {
      if (wx.hideTabBarRedDot) wx.hideTabBarRedDot({ index: TAB_INDEX_RECORDS })
      if (wx.removeTabBarBadge) wx.removeTabBarBadge({ index: TAB_INDEX_RECORDS })
    }
  } catch (err) { /* tab badge is best-effort */ }
  return count
}

async function refreshNotificationBadge(requestGet) {
  const { API_PATHS } = require('./constants')
  const get = requestGet || require('./request').get
  try {
    const data = await get(API_PATHS.NOTIFICATIONS_UNREAD, {}, { showError: false })
    const unread = Math.max(0, Number((data && (data.unread_count || data.unreadCount)) || 0))
    applyTabBadge(unread)
    return unread
  } catch (err) {
    return 0
  }
}

module.exports = {
  TAB_INDEX_RECORDS,
  applyTabBadge,
  refreshNotificationBadge
}
