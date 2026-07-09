const auth = require('./auth')
const common = require('./common')
const user = require('./user')
const match = require('./match')
const meet = require('./meet')
const vip = require('./vip')
const chat = require('./chat')

function methodOf(value) {
  return String(value || 'GET').toUpperCase()
}

function splitPath(path) {
  const raw = String(path || '')
  const parts = raw.split('?')
  return parts[0].replace(/\/+$/, '') || '/'
}

function withParams(handler, params) {
  return function wrapped(data, wxContext) {
    return handler(Object.assign({}, data, params), wxContext)
  }
}

function route(method, path) {
  const exact = `${method} ${path}`
  const map = {
    'POST /api/auth/wx-login': auth.wxLogin,
    'GET /api/common/circles': common.circles,
    'GET /api/common/promote-code': common.promoteCode,
    'GET /api/common/stats': common.marryStat,
    'GET /api/common/agreements': common.agreements,
    'GET /api/common/safety-config': common.safetyConfig,
    'GET /api/common/config': common.config,
    'GET /api/common/health': common.health,
    'GET /api/platform/marry-stat': common.marryStat,
    'GET /api/platform/rules': common.rules,
    'GET /api/user/profile': user.getProfile,
    'PUT /api/user/profile': user.updateProfile,
    'POST /api/user/register': user.register,
    'POST /api/user/marry-report': user.marryReport,
    'POST /api/user/cancel': user.cancel,
    'POST /api/user/claim-free': user.claimFree,
    'GET /api/user/divorce-review/status': user.divorceReviewStatus,
    'POST /api/user/divorce-review': user.submitDivorceReview,
    'GET /api/match/setting': match.getSetting,
    'POST /api/match/setting': match.saveSetting,
    'GET /api/match/setting/cooldown': match.cooldown,
    'POST /api/match/start': match.start,
    'POST /api/match/report': match.generateReport,
    'GET /api/match/latest': match.latest,
    'GET /api/match/list': match.matchList,
    'GET /api/match/detail': match.detail,
    'POST /api/match/handoff': match.handoff,
    'GET /api/vip/info': vip.info,
    'POST /api/vip/purchase': vip.purchase,
    'GET /api/order/status': vip.status,
    'GET /api/chat/history': chat.history,
    'POST /api/chat/send': chat.send,
    'POST /api/meet/create': meet.create,
    'POST /api/meet/sos': meet.homeSos,
    'GET /api/meet/existing': meet.existing,
    'GET /api/meet/list': meet.meetList
  }
  if (map[exact]) return map[exact]

  let m = path.match(/^\/api\/meet\/share\/([^/]+)$/)
  if (method === 'GET' && m) return withParams(meet.shareDetail, { token: m[1] })
  m = path.match(/^\/api\/meet\/(\d+)$/)
  if (method === 'GET' && m) return withParams(meet.detail, { id: Number(m[1]) })
  m = path.match(/^\/api\/meet\/(\d+)\/location$/)
  if (method === 'POST' && m) return withParams(meet.uploadLocation, { id: Number(m[1]) })
  m = path.match(/^\/api\/meet\/(\d+)\/finish$/)
  if (method === 'POST' && m) return withParams(meet.finish, { id: Number(m[1]) })
  m = path.match(/^\/api\/meet\/(\d+)\/cancel$/)
  if (method === 'POST' && m) return withParams(meet.cancel, { id: Number(m[1]) })
  m = path.match(/^\/api\/meet\/(\d+)\/sos$/)
  if (method === 'POST' && m) return withParams(meet.sos, { id: Number(m[1]) })
  m = path.match(/^\/api\/match\/(\d+)$/)
  if (method === 'GET' && m) return withParams(match.detail, { id: Number(m[1]) })

  return null
}

async function handleRoute(payload, wxContext) {
  const method = methodOf(payload.method)
  const path = splitPath(payload.path)
  const data = payload.data || {}
  const handler = route(method, path)
  if (!handler) throw new Error(`接口不存在：${method} ${path}`)
  return handler(data, wxContext || {})
}

module.exports = {
  handleRoute
}
