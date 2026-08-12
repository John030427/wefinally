const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const cloud = require('wx-server-sdk')
const db = require('../lib/db')
const { signBackofficeToken, verifyBackofficeToken } = require('../lib/backofficeToken')
const { reviewMemberApplication } = require('./member')
const { changeInternalTestVip } = require('./internalTestVip')
const { changeAbMatchFixture } = require('./abMatchFixture')
const { createAgentBackofficeService } = require('../agent/backofficeService')
const { buildPartnerDashboard } = require('../lib/partnerDashboardPolicy')
const { createReferralToken, createReferralScene } = require('../lib/partnerReferralPolicy')
const { httpMethod, httpPath, queryParameters } = require('../lib/httpEvent')

const AGENT_BACKOFFICE_PATHS = Object.freeze({
  tickets: '/api/admin/agent/tickets',
  conversations: '/api/admin/agent/conversations',
  knowledge: '/api/admin/knowledge-articles',
  coordinations: '/api/admin/date-coordinations'
})

let agentBackoffice

function agentService() {
  if (!agentBackoffice) agentBackoffice = createAgentBackofficeService(db)
  return agentBackoffice
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': process.env.BACKOFFICE_CORS_ORIGIN || '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS'
    },
    body: JSON.stringify(body)
  }
}

function ok(data, message = 'ok') {
  return response(200, { code: 0, message, data })
}

function fail(message, statusCode = 400) {
  return response(statusCode, { code: statusCode, message, data: null })
}

function parseBody(event) {
  if (!event.body) return {}
  if (typeof event.body === 'object') return event.body
  try {
    return JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body)
  } catch (err) {
    throw new Error('请求数据格式错误')
  }
}

function bearer(headers = {}) {
  const value = headers.authorization || headers.Authorization || ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

function secret() {
  return process.env.BACKOFFICE_TOKEN_SECRET || process.env.JWT_SECRET || ''
}

async function actorFrom(event, requiredRole) {
  const actor = verifyBackofficeToken(bearer(event.headers), secret())
  if (requiredRole && actor.role !== requiredRole) throw new Error('无权访问')
  const collection = actor.role === 'partner' ? 'partner' : 'admin'
  const row = await db.byId(collection, actor.id)
  if (!row || Number(row.status) !== 1) throw new Error('后台账号已停用')
  return Object.assign({}, actor, {
    admin_role: actor.role === 'admin' ? (row.role || 'super_admin') : ''
  })
}

async function loginPartner(body) {
  const phone = String(body.phone || '').trim()
  const partner = await db.first('partner', { phone })
  if (!partner || Number(partner.status) !== 1 || !bcrypt.compareSync(String(body.password || ''), partner.password || '')) {
    throw new Error('账号或密码错误')
  }
  return {
    token: signBackofficeToken({ role: 'partner', id: partner.id }, secret()),
    partner: { id: partner.id, name: partner.name, phone: partner.phone, promote_code: partner.promote_code }
  }
}

async function loginAdmin(body) {
  const username = String(body.username || '').trim()
  const admin = await db.first('admin', { username })
  if (!admin || Number(admin.status) !== 1 || !bcrypt.compareSync(String(body.password || ''), admin.password || '')) {
    throw new Error('账号或密码错误')
  }
  return {
    token: signBackofficeToken({ role: 'admin', id: admin.id }, secret()),
    admin: { id: admin.id, username: admin.username, role: admin.role || 'super_admin' }
  }
}

async function applicationList(actor, status) {
  const query = actor.role === 'partner' ? { assigned_partner_id: actor.id } : {}
  if (status) query.status = status
  const rows = await db.list('member_application', query, 200)
  rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  return Promise.all(rows.map(async (application) => {
    const user = await db.byId('user', application.user_id)
    const partner = await db.byId('partner', application.assigned_partner_id)
    const fixture = user ? await db.first('user', {
      ab_test_owner_user_id: user.id,
      is_test_fixture: 1,
      status: 1
    }) : null
    return Object.assign({}, application, {
      user: user ? {
        id: user.id,
        gender: user.gender,
        birth_year: user.birth_year,
        education: user.education,
        city: user.city,
        occupation_description: user.occupation_description || '',
        member_status: user.member_status,
        is_vip: Number(user.is_vip || 0),
        vip_expire_time: user.vip_expire_time || null,
        vip_source: user.vip_source || ''
      } : null,
      partner_name: partner ? partner.name : '',
      ab_test_fixture: fixture ? {
        user_id: fixture.id,
        run_id: fixture.ab_test_run_id,
        expires_at: fixture.ab_test_expires_at
      } : null
    })
  }))
}

async function inviteAssets(actor) {
  const partner = await db.byId('partner', actor.id)
  const code = partner && partner.promote_code || ''
  let referral = code
  let referralScene = ''
  if (process.env.PARTNER_REFERRAL_SECRET) {
    try {
      referral = createReferralToken(actor.id)
      referralScene = createReferralScene(actor.id)
    } catch (err) {
      referral = code
    }
  }
  let qrcodeBase64 = ''
  let qrcodeError = referralScene ? '' : '合伙人归因签名密钥未配置'
  if (referralScene) {
    try {
      const result = await cloud.openapi.wxacode.getUnlimited({
        scene: referralScene,
        page: 'pages/register/register',
        checkPath: false,
        envVersion: process.env.MINIPROGRAM_ENV_VERSION || 'trial'
      })
      const buffer = result && (result.buffer || result)
      if (Buffer.isBuffer(buffer)) qrcodeBase64 = buffer.toString('base64')
    } catch (err) {
      qrcodeError = err.message || '小程序码生成失败'
    }
  }
  return {
    promote_code: code,
    attribution_token: referral === code ? '' : referral,
    miniprogram_path: `/pages/register/register?promote_code=${encodeURIComponent(referral)}`,
    scene: referralScene,
    qrcode_base64: qrcodeBase64,
    qrcode_error: qrcodeError
  }
}

async function recordShareEvent(body, actor) {
  if (!actor || actor.role !== 'partner') throw new Error('无权记录分享行为')
  const channel = String(body.channel || 'link').trim().slice(0, 32) || 'link'
  const allowedChannels = new Set(['link', 'code', 'qrcode', 'wechat'])
  const partner = await db.byId('partner', actor.id)
  if (!partner || Number(partner.status) !== 1) throw new Error('后台账号已停用')
  const normalizedChannel = allowedChannels.has(channel) ? channel : 'link'
  await db.addWithId('partner_share_event', {
    partner_id: Number(actor.id),
    event_type: 'share_trigger',
    channel: normalizedChannel,
    source: 'partner_dashboard'
  }, 'partner_share_event')
  return { recorded: true, channel: normalizedChannel }
}

function miniPartnerToken(data = {}) {
  return String(data.__partner_token || data.partner_token || data.__token || '').trim()
}

async function actorFromMiniProgram(data) {
  const actor = verifyBackofficeToken(miniPartnerToken(data), secret())
  if (actor.role !== 'partner') throw new Error('仅合伙人可以使用邀请功能')
  const partner = await db.byId('partner', actor.id)
  if (!partner || Number(partner.status) !== 1) throw new Error('后台账号已停用')
  return actor
}

async function partnerLoginForMiniProgram(data) {
  return loginPartner(data)
}

async function partnerInviteAssetsForMiniProgram(data) {
  return inviteAssets(await actorFromMiniProgram(data))
}

async function recordShareEventForMiniProgram(data) {
  return recordShareEvent(data, await actorFromMiniProgram(data))
}

async function partnerDashboard(actor) {
  const partner = await db.byId('partner', actor.id)
  if (!partner) throw new Error('合伙人不存在')
  async function safeList(name, query, limit) {
    try {
      return await db.list(name, query || {}, limit || 5000)
    } catch (err) {
      return []
    }
  }
  const partnerId = Number(actor.id)
  const [users, orders, withdrawals, attributions, shareEvents, ledger, rules, daily] = await Promise.all([
    safeList('user', { promote_partner_id: partnerId }, 5000),
    safeList('user_order', { partner_id: partnerId }, 5000),
    safeList('partner_withdraw', { partner_id: partnerId }, 5000),
    safeList('partner_referral_attribution', { partner_id: partnerId }, 5000),
    safeList('partner_share_event', { partner_id: partnerId }, 5000),
    safeList('partner_commission_ledger', { partner_id: partnerId }, 5000),
    safeList('partner_commission_rule', { status: 1 }, 20),
    safeList('partner_dashboard_daily', { partner_id: partnerId }, 60)
  ])
  const rule = rules.sort((left, right) => Number(right.id || 0) - Number(left.id || 0))[0] || null
  return buildPartnerDashboard({ partner, users, orders, withdrawals, attributions, shareEvents, ledger, rule, daily })
}

async function reassign(applicationId, body, actor) {
  if (actor.role !== 'admin') throw new Error('无权转交会员申请')
  const partnerId = Number(body.partner_id || 0)
  const reason = String(body.reason || '').trim().slice(0, 500)
  if (!partnerId || !reason) throw new Error('请选择接管合伙人并填写原因')
  const partner = await db.byId('partner', partnerId)
  if (!partner || Number(partner.status) !== 1) throw new Error('目标合伙人不存在或已停用')
  const application = await db.byId('member_application', applicationId)
  if (!application) throw new Error('会员申请不存在')
  await db.updateByDoc('member_application', application, { assigned_partner_id: partnerId })
  await db.addWithId('partner_user_audit_log', {
    application_id: application.id,
    partner_id: partnerId,
    user_id: application.user_id,
    actor_role: 'admin',
    actor_id: actor.id,
    action: 'reassign',
    from_status: application.status,
    to_status: application.status,
    reason
  }, 'member_audit')
  return { assigned_partner_id: partnerId }
}

async function createPartner(body) {
  const phone = String(body.phone || '').trim()
  const password = String(body.password || '')
  const name = String(body.name || '').trim()
  if (!phone || !name || password.length < 8) throw new Error('请填写姓名、手机号和至少8位密码')
  if (await db.first('partner', { phone })) throw new Error('手机号已存在')
  const promoteCode = String(body.promote_code || `WF${crypto.randomBytes(4).toString('hex')}`).toUpperCase()
  return db.addWithId('partner', {
    circle_id: Number(body.circle_id || 0),
    name,
    phone,
    password: bcrypt.hashSync(password, 10),
    status: 1,
    promote_code: promoteCode,
    total_promote_user: 0,
    total_promote_vip: 0,
    total_commission: 0,
    balance: 0
  }, 'partner')
}

async function handleBackofficeHttp(event = {}) {
  const method = httpMethod(event)
  const path = httpPath(event)
  const query = queryParameters(event)
  if (method === 'OPTIONS') return response(204, {})
  const body = parseBody(event)
  try {
    if (method === 'POST' && /\/api\/auth\/partner-login$/.test(path)) return ok(await loginPartner(body))
    if (method === 'POST' && /\/api\/auth\/admin-login$/.test(path)) return ok(await loginAdmin(body))

    let actor
    if (/\/api\/partner\//.test(path)) actor = await actorFrom(event, 'partner')
    if (/\/api\/admin\//.test(path)) actor = await actorFrom(event, 'admin')

    if (method === 'GET' && /\/api\/partner\/member-applications$/.test(path)) {
      return ok({ list: await applicationList(actor, query.status || '') })
    }
    if (method === 'GET' && /\/api\/partner\/dashboard$/.test(path)) return ok(await partnerDashboard(actor))
    if (method === 'POST' && /\/api\/partner\/share-event$/.test(path)) return ok(await recordShareEvent(body, actor))
    if (method === 'GET' && /\/api\/admin\/member-applications$/.test(path)) {
      return ok({ list: await applicationList(actor, query.status || '') })
    }
    if (method === 'GET' && path.endsWith(AGENT_BACKOFFICE_PATHS.tickets)) {
      return ok({ list: await agentService().listTickets(actor, query) })
    }
    if (method === 'GET' && path.endsWith(AGENT_BACKOFFICE_PATHS.conversations)) {
      return ok({ list: await agentService().listConversations(actor, query) })
    }
    if (method === 'GET' && path.endsWith(AGENT_BACKOFFICE_PATHS.knowledge)) {
      return ok({ list: await agentService().listKnowledge(actor, query) })
    }
    if (method === 'POST' && path.endsWith(AGENT_BACKOFFICE_PATHS.knowledge)) {
      return ok(await agentService().saveKnowledge(actor, body), '知识草稿已保存')
    }
    if (method === 'GET' && path.endsWith(AGENT_BACKOFFICE_PATHS.coordinations)) {
      return ok({ list: await agentService().listCoordinations(actor, query) })
    }
    if (method === 'GET' && /\/api\/partner\/invite-assets$/.test(path)) return ok(await inviteAssets(actor))

    let matched = path.match(/\/api\/(partner|admin)\/member-applications\/(\d+)$/)
    if (method === 'GET' && matched) {
      const application = await db.byId('member_application', Number(matched[2]))
      if (!application) throw new Error('会员申请不存在')
      if (actor.role === 'partner' && Number(application.assigned_partner_id) !== Number(actor.id)) {
        throw new Error('无权查看其他合伙人的会员申请')
      }
      const user = await db.byId('user', application.user_id)
      return ok({ application, user })
    }

    matched = path.match(/\/api\/(partner|admin)\/member-applications\/(\d+)\/review$/)
    if (method === 'PUT' && matched) {
      const result = await reviewMemberApplication({
        applicationId: Number(matched[2]),
        action: body.action,
        note: body.reason || body.note
      }, actor, db)
      return ok(result, '审核状态已更新')
    }
    matched = path.match(/\/api\/admin\/member-applications\/(\d+)\/reassign$/)
    if (method === 'PUT' && matched) return ok(await reassign(Number(matched[1]), body, actor))

    matched = path.match(new RegExp('/api/admin/users/(\\d+)/test-vip$'))
    if (method === 'POST' && matched) {
      const result = await changeInternalTestVip({
        userId: Number(matched[1]),
        action: body.action,
        days: body.days,
        reason: body.reason,
        requestId: body.request_id
      }, actor)
      return ok(result, body.action === 'revoke' ? '内测 VIP 已撤销' : '内测 VIP 已授权')
    }

    matched = path.match(new RegExp('/api/admin/users/(\\d+)/ab-match-fixture$'))
    if (method === 'POST' && matched) {
      const result = await changeAbMatchFixture({
        ownerUserId: Number(matched[1]),
        action: body.action,
        reason: body.reason,
        requestId: body.request_id,
        runId: body.run_id
      }, actor)
      return ok(result, body.action === 'cleanup' ? 'A/B 测试数据已清理' : 'A/B 测试候选已准备')
    }

    matched = path.match(/\/api\/admin\/agent\/tickets\/(\d+)$/)
    if (method === 'GET' && matched) {
      return ok(await agentService().ticketDetail(actor, Number(matched[1])))
    }
    matched = path.match(/\/api\/admin\/agent\/conversations\/(\d+)$/)
    if (method === 'GET' && matched) {
      return ok(await agentService().conversationDetail(actor, Number(matched[1])))
    }
    matched = path.match(/\/api\/admin\/agent\/conversations\/(\d+)\/reply$/)
    if (method === 'POST' && matched) {
      return ok(await agentService().replyConversation(actor, Number(matched[1]), body.content), '人工回复已发送')
    }
    matched = path.match(/\/api\/admin\/agent\/tickets\/(\d+)\/reply$/)
    if (method === 'POST' && matched) {
      return ok(await agentService().replyTicket(actor, Number(matched[1]), body.content), '人工回复已发送')
    }
    matched = path.match(/\/api\/admin\/agent\/tickets\/(\d+)\/close$/)
    if (method === 'POST' && matched) {
      return ok(await agentService().closeTicket(actor, Number(matched[1]), body), '人工工单已关闭')
    }
    matched = path.match(/\/api\/admin\/knowledge-articles\/(\d+)$/)
    if (method === 'PUT' && matched) {
      return ok(await agentService().saveKnowledge(actor, body, Number(matched[1])), '知识草稿已更新')
    }
    matched = path.match(/\/api\/admin\/knowledge-articles\/(\d+)\/publish$/)
    if (method === 'POST' && matched) {
      return ok(await agentService().publishKnowledge(actor, Number(matched[1])), '知识文章已发布')
    }
    matched = path.match(/\/api\/admin\/knowledge-articles\/(\d+)\/offline$/)
    if (method === 'POST' && matched) {
      return ok(await agentService().unpublishKnowledge(actor, Number(matched[1])), '知识文章已下线')
    }

    if (method === 'GET' && /\/api\/admin\/partners$/.test(path)) {
      return ok({ list: await db.list('partner', {}, 200) })
    }
    if (method === 'POST' && /\/api\/admin\/partners$/.test(path)) return ok(await createPartner(body))
    matched = path.match(/\/api\/admin\/partners\/(\d+)$/)
    if (method === 'PUT' && matched) {
      const partner = await db.byId('partner', Number(matched[1]))
      if (!partner) throw new Error('合伙人不存在')
      return ok(await db.updateByDoc('partner', partner, {
        status: body.status === undefined ? partner.status : Number(body.status),
        name: body.name === undefined ? partner.name : String(body.name),
        phone: body.phone === undefined ? partner.phone : String(body.phone)
      }))
    }
    return response(404, { code: 404, message: '接口不存在', data: null })
  } catch (err) {
    return fail(err.message || '后台服务错误', /Token|无权|停用/.test(err.message || '') ? 401 : 400)
  }
}

module.exports = {
  handleBackofficeHttp,
  partnerLoginForMiniProgram,
  partnerInviteAssetsForMiniProgram,
  recordShareEventForMiniProgram
}
