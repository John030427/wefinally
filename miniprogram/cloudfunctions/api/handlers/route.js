const auth = require('./auth')
const common = require('./common')
const user = require('./user')
const match = require('./match')
const meet = require('./meet')
const vip = require('./vip')
const chat = require('./chat')
const member = require('./member')
const reportTask = require('./reportTask')
const agent = require('./agent')
const dateCoordination = require('./dateCoordination')
const dateApplicationPatch = require('./dateApplicationPatch')
const experienceFeedback = require('./experienceFeedback')
const backoffice = require('./backoffice')
const partnerOnboarding = require('./partnerOnboardingCloud')

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
    'POST /api/auth/partner-login': backoffice.partnerLoginForMiniProgram,
    'GET /api/partner/onboarding/status': partnerOnboarding.status,
    'POST /api/partner/activation': partnerOnboarding.activate,
    'POST /api/partner/session': partnerOnboarding.session,
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
    'GET /api/member/application': member.status,
    'POST /api/member/application/submit': member.submit,
    'GET /api/match/setting': match.getSetting,
    'POST /api/match/setting': match.saveSetting,
    'POST /api/match/intent/confirm': match.confirmIntent,
    'GET /api/match/setting/cooldown': match.cooldown,
    'POST /api/match/start': match.start,
    'POST /api/match/test-runs': match.create,
    'POST /api/match/report': match.generateReport,
    'POST /api/match/report-tasks': reportTask.create,
    'GET /api/match/report-tasks/status': reportTask.status,
    'POST /api/match/report-tasks/retry': reportTask.retry,
    'GET /api/match/latest': match.latest,
    'GET /api/match/list': match.matchList,
    'GET /api/match/detail': match.detail,
    'POST /api/match/handoff': match.handoff,
    'GET /api/match/feedback': experienceFeedback.getMatch,
    'POST /api/match/feedback': experienceFeedback.saveMatch,
    'GET /api/date-feedback': experienceFeedback.getDate,
    'POST /api/date-feedback': experienceFeedback.saveDate,
    'GET /api/vip/info': vip.info,
    'POST /api/vip/purchase': vip.purchase,
    'GET /api/order/status': vip.status,
    'GET /api/order/list': vip.list,
    'POST /api/order/invoice': vip.invoice,
    'GET /api/chat/history': chat.history,
    'POST /api/chat/send': chat.send,
    'POST /api/agent/sessions': agent.createSession,
    'POST /api/agent/human-tickets': agent.createHumanTicket,
    'POST /api/date-coordinations': dateCoordination.create,
    'POST /api/meet/create': meet.create,
    'POST /api/meet/sos': meet.homeSos,
    'GET /api/meet/existing': meet.existing,
    'GET /api/meet/list': meet.meetList
  }
  if (exact === 'GET /api/partner/invite-assets') return backoffice.partnerInviteAssetsForMiniProgram
  if (exact === 'GET /api/partner/dashboard') return backoffice.partnerDashboardForMiniProgram
  if (exact === 'POST /api/partner/share-event') return backoffice.recordShareEventForMiniProgram
  if (map[exact]) return map[exact]

  let m = path.match(/^\/api\/agent\/sessions\/(\d+)\/messages$/)
  if (method === 'GET' && m) return withParams(agent.messages, { id: Number(m[1]), session_id: Number(m[1]) })
  if (method === 'POST' && m) return withParams(agent.send, { id: Number(m[1]), session_id: Number(m[1]) })
  m = path.match(/^\/api\/date-coordinations\/(\d+)$/)
  if (method === 'GET' && m) return withParams(dateCoordination.detail, { id: Number(m[1]), coordination_id: Number(m[1]) })
  m = path.match(/^\/api\/date-coordinations\/(\d+)\/invitation-response$/)
  if (method === 'POST' && m) return withParams(dateCoordination.respondInvitation, { coordination_id: Number(m[1]) })
  m = path.match(/^\/api\/date-coordinations\/(\d+)\/application$/)
  if (method === 'PUT' && m) return withParams(dateCoordination.saveApplication, { coordination_id: Number(m[1]) })
  m = path.match(/^\/api\/date-coordinations\/(\d+)\/application-patches$/)
  if (method === 'POST' && m) return withParams(dateApplicationPatch.createPreview, { coordination_id: Number(m[1]) })
  m = path.match(/^\/api\/date-coordinations\/(\d+)\/application-patches\/(\d+)\/confirm$/)
  if (method === 'POST' && m) return withParams(dateApplicationPatch.confirm, {
    coordination_id: Number(m[1]),
    patch_id: Number(m[2])
  })
  m = path.match(/^\/api\/date-coordinations\/(\d+)\/application-patches\/(\d+)\/cancel$/)
  if (method === 'POST' && m) return withParams(dateApplicationPatch.cancel, {
    coordination_id: Number(m[1]),
    patch_id: Number(m[2])
  })
  m = path.match(/^\/api\/date-coordinations\/(\d+)\/proposals\/(\d+)\/confirm$/)
  if (method === 'POST' && m) return withParams(dateCoordination.confirmProposal, {
    coordination_id: Number(m[1]),
    proposal_id: Number(m[2])
  })
  m = path.match(/^\/api\/date-coordinations\/(\d+)\/recoordinate$/)
  if (method === 'POST' && m) return withParams(dateCoordination.recoordinate, { coordination_id: Number(m[1]) })
  m = path.match(/^\/api\/meet\/share\/([^/]+)$/)
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
  m = path.match(/^\/api\/match\/test-runs\/(\d+)\/execute$/)
  if (method === 'POST' && m) return withParams(match.execute, { id: Number(m[1]) })
  m = path.match(/^\/api\/match\/test-runs\/(\d+)$/)
  if (method === 'GET' && m) return withParams(match.get, { id: Number(m[1]) })
  if (method === 'GET' && path === '/api/match/test-runs') return match.get
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
