const TAB_ITEMS = Object.freeze([
  Object.freeze({ text: '匹配', route: '/pages/index/index', iconClass: 'tab-icon-match' }),
  Object.freeze({ text: '记录', route: '/pages/match-list/match-list', iconClass: 'tab-icon-records' }),
  Object.freeze({ text: '我的', route: '/pages/profile/profile', iconClass: 'tab-icon-profile' })
])

function normalizeRoute(route) {
  const value = String(route || '').trim().split('?')[0]
  if (!value) return ''
  return value.startsWith('/') ? value : `/${value}`
}

function tabIndexForRoute(route) {
  const normalized = normalizeRoute(route)
  return TAB_ITEMS.findIndex((item) => item.route === normalized)
}

module.exports = { TAB_ITEMS, tabIndexForRoute }
