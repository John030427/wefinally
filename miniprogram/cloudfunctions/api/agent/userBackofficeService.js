const { isTestUser, projectUserIdentity, supportCodeFor } = require('./userIdentity')
const { resolveTestIdentity, isSyntheticFixture } = require('../lib/testIdentityPolicy')

const USER_MUTABLE_FIELDS = new Set(['status', 'is_vip', 'vip_expire_time', 'marry_status'])

function error(message, code) {
  const value = new Error(message)
  value.code = code
  return value
}

function adminRole(actor) {
  if (!actor || actor.role !== 'admin') throw error('无权访问用户后台', 401)
  return String(actor.admin_role || 'super_admin')
}

function requireRole(actor, allowed) {
  const role = adminRole(actor)
  if (!allowed.includes(role)) throw error('无权执行该后台操作', 403)
  return role
}

function pageOptions(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || filters.page_size) || 20))
  return { page, pageSize }
}

function paginate(rows, filters) {
  const { page, pageSize } = pageOptions(filters)
  const offset = (page - 1) * pageSize
  return { list: rows.slice(offset, offset + pageSize), total: rows.length, page, pageSize }
}

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function paidOrder(row) {
  return Number(row.pay_status === undefined ? row.status : row.pay_status) === 1
}

function orderAmount(row) {
  return number(row.price === undefined ? row.amount : row.price)
}

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (err) { return null }
}

function createUserBackofficeService(deps) {
  if (!deps) throw new Error('User backoffice dependencies are required')

  function sensitive(actor) {
    return requireRole(actor, ['super_admin', 'customer_service', 'auditor']) === 'super_admin'
  }

  function userDto(user, actor) {
    const dto = Object.assign(projectUserIdentity(user, { includeSensitive: sensitive(actor) }), {
      status: number(user.status),
      birth_year: number(user.birth_year),
      education: String(user.education || ''),
      occupation_description: String(user.occupation_description || ''),
      marry_status: String(user.marry_status || ''),
      member_status: String(user.member_status || ''),
      is_vip: number(user.is_vip),
      vip_source: String(user.vip_source || ''),
      vip_expire_time: user.vip_expire_time || null,
      create_time: user.create_time || null
    })
    return dto
  }

  function orderDto(row, user, actor) {
    const isSuperAdmin = sensitive(actor)
    const dto = {
      id: row.id,
      user: userDto(user, actor),
      amount: orderAmount(row),
      pay_status: number(row.pay_status === undefined ? row.status : row.pay_status),
      settle_status: number(row.settle_status),
      partner_id: number(row.partner_id),
      pay_time: row.pay_time || row.paid_at || null,
      create_time: row.create_time || row.created_at || null
    }
    if (isSuperAdmin) dto.order_no = String(row.order_no || '')
    return dto
  }

  function matchDto(row, owner, matched, actor) {
    return {
      id: row.id,
      owner: userDto(owner, actor),
      matched: userDto(matched, actor),
      total_score: number(row.total_score),
      view_similarity: number(row.view_similarity),
      match_date: row.match_date || null,
      match_type: String(row.match_type || ''),
      score_version: String(row.score_version || '')
    }
  }

  function matchSettingDto(row, actor) {
    if (!row) return null
    const dto = {
      age_min: number(row.age_min),
      age_max: number(row.age_max),
      height_min: number(row.height_min),
      height_max: number(row.height_max),
      min_education: String(row.min_education || ''),
      like_marry_status: String(row.like_marry_status || ''),
      like_baby_plan: String(row.like_baby_plan || ''),
      other_requirements: String(row.other_requirements || ''),
      self_view_text: String(row.self_view_text || ''),
      target_view_text: String(row.target_view_text || '')
    }
    if (sensitive(actor)) {
      dto.appearance_want = String(row.appearance_want || '')
      dto.psych_profile_json = row.psych_profile_json || null
    }
    return dto
  }

  function memberApplicationDto(row, actor) {
    if (!row) return null
    const dto = {
      id: row.id,
      user_id: number(row.user_id),
      assigned_partner_id: number(row.assigned_partner_id),
      status: String(row.status || ''),
      submitted_at: row.submitted_at || null,
      reviewed_at: row.reviewed_at || null
    }
    if (sensitive(actor)) {
      dto.review_note = String(row.review_note || '')
      dto.profile_snapshot_json = row.profile_snapshot_json || null
    }
    return dto
  }

  function attributionDto(row) {
    if (!row) return null
    return {
      id: row.id,
      user_id: number(row.user_id),
      partner_id: number(row.partner_id),
      promote_code: String(row.promote_code || ''),
      source: String(row.source || row.channel || ''),
      create_time: row.create_time || null
    }
  }

  async function allUsers() {
    return deps.list('user', {}, 500)
  }

  function officialRows(rows, filters = {}) {
    const includeTest = filters.include_test === true || String(filters.include_test) === '1'
      || filters.include_tests === true || String(filters.include_tests) === '1'
    const kind = String(filters.identity_kind || '').trim()
    return rows.filter((row) => {
      const identity = resolveTestIdentity(row)
      if (isSyntheticFixture(row) && !includeTest && kind !== 'synthetic_fixture') return false
      if (!includeTest && !kind && isTestUser(row)) return false
      if (kind && identity.kind !== kind) return false
      return true
    })
  }

  async function dashboard(actor) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const [usersRaw, partners, orders, applications, tickets] = await Promise.all([
      allUsers(),
      deps.list('partner', {}, 200),
      deps.list('user_order', {}, 500),
      deps.list('member_application', {}, 500),
      deps.list('agent_human_ticket', {}, 500)
    ])
    const users = officialRows(usersRaw, {})
    const officialIds = new Set(users.map((row) => number(row.id)))
    const officialOrders = orders.filter((row) => officialIds.has(number(row.user_id)))
    return {
      users: users.length,
      vip_users: users.filter((row) => number(row.is_vip) === 1 || number(row.free_member) === 1).length,
      partners: partners.filter((row) => number(row.status) === 1).length,
      paid_orders: officialOrders.filter(paidOrder).length,
      revenue: officialOrders.filter(paidOrder).reduce((sum, row) => sum + orderAmount(row), 0),
      pending_member_applications: applications.filter((row) => String(row.status) === 'pending_review').length,
      open_service_tickets: tickets.filter((row) => !['closed', 'resolved'].includes(String(row.status))).length
    }
  }

  async function listUsers(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const keyword = String(filters.keyword || '').trim().toLowerCase()
    const statusSet = filters.status !== undefined && filters.status !== ''
    const rows = officialRows(await allUsers(), filters)
      .filter((row) => !statusSet || number(row.status) === number(filters.status))
      .filter((row) => {
        if (!keyword) return true
        return [supportCodeFor(row), row.city, row.member_status].join(' ').toLowerCase().includes(keyword)
      })
      .sort((a, b) => number(b.id) - number(a.id))
      .map((row) => userDto(row, actor))
    return paginate(rows, filters)
  }

  async function userRelations(userId) {
    const [setting, applications, attribution, orders, ownedMatches, receivedMatches, sessions, tickets, coordinationsA, coordinationsB, notifications] = await Promise.all([
      deps.first('user_match_setting', { user_id: userId }),
      deps.list('member_application', { user_id: userId }, 20),
      deps.first('partner_referral_attribution', { user_id: userId }),
      deps.list('user_order', { user_id: userId }, 100),
      deps.list('user_match_log', { user_id: userId }, 100),
      deps.list('user_match_log', { match_user_id: userId }, 100),
      deps.list('agent_session', { user_id: userId }, 200),
      deps.list('agent_human_ticket', { user_id: userId }, 200),
      deps.list('date_coordination', { user_a_id: userId }, 100),
      deps.list('date_coordination', { user_b_id: userId }, 100),
      deps.list('agent_notification_job', { user_id: userId }, 200)
    ])
    const application = applications.sort((a, b) => number(b.id) - number(a.id))[0] || null
    const partnerId = number((application && application.assigned_partner_id) || (attribution && attribution.partner_id))
    const partner = partnerId ? await deps.byId('partner', partnerId) : null
    const matches = ownedMatches.concat(receivedMatches.filter((row) => !ownedMatches.some((owned) => number(owned.id) === number(row.id))))
      .sort((a, b) => number(b.id) - number(a.id))
    const coordinations = coordinationsA.concat(coordinationsB.filter((row) => !coordinationsA.some((owned) => number(owned.id) === number(row.id))))
      .sort((a, b) => number(b.id) - number(a.id))
    return { setting, application, attribution, partner, orders, matches, sessions, tickets, coordinations, notifications }
  }

  async function aggregateUser(actor, id, auditAction) {
    const userId = number(id)
    const user = await deps.byId('user', userId)
    if (!user) throw error('用户不存在', 404)
    const relations = await userRelations(userId)
    const isSuperAdmin = sensitive(actor)
    const targetIsTestUser = isTestUser(user)
    const matchSummaries = await Promise.all(relations.matches.map(async (row) => {
      const owner = number(row.user_id) === userId ? user : await deps.byId('user', row.user_id)
      const matched = number(row.match_user_id) === userId ? user : await deps.byId('user', row.match_user_id)
      if (!owner || !matched) return null
      if (!targetIsTestUser && (isTestUser(owner) || isTestUser(matched))) return null
      return matchDto(row, owner, matched, actor)
    }))
    await deps.addWithId('partner_user_audit_log', {
      actor_role: 'admin',
      actor_id: actor.id,
      admin_role: adminRole(actor),
      action: auditAction,
      user_id: userId,
      reason: 'authorized_backoffice_read'
    }, 'member_audit')
    return {
      user: userDto(user, actor),
      match_settings: matchSettingDto(relations.setting, actor),
      member_application: memberApplicationDto(relations.application, actor),
      attribution: attributionDto(relations.attribution),
      partner: relations.partner ? {
        id: relations.partner.id,
        name: String(relations.partner.name || ''),
        promote_code: String(relations.partner.promote_code || ''),
        status: number(relations.partner.status)
      } : null,
      orders: relations.orders.sort((a, b) => number(b.id) - number(a.id)).map((row) => orderDto(row, user, actor)),
      matches: matchSummaries.filter(Boolean),
      conversations: relations.sessions.sort((a, b) => number(b.id) - number(a.id)).map((row) => ({
        id: row.id,
        agent_type: String(row.agent_type || ''),
        status: String(row.status || ''),
        summary: String(row.summary || '').slice(0, 500),
        create_time: row.create_time || null,
        update_time: row.update_time || null
      })),
      tickets: relations.tickets.sort((a, b) => number(b.id) - number(a.id)).map((row) => ({
        id: row.id,
        session_id: row.session_id,
        status: String(row.status || ''),
        category: String(row.category || ''),
        summary: String(row.summary || '').slice(0, 500),
        create_time: row.create_time || null
      })),
      coordinations: relations.coordinations.map((row) => ({
        id: row.id,
        status: String(row.status || ''),
        create_time: row.create_time || null,
        update_time: row.update_time || null
      })),
      notification_jobs: relations.notifications.map((row) => ({
        id: row.id,
        stage: String(row.stage || ''),
        status: String(row.status || ''),
        create_time: row.create_time || null,
        sent_at: row.sent_at || null
      })),
      sensitive_fields_included: isSuperAdmin
    }
  }

  async function userDetail(actor, id) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    return aggregateUser(actor, id, 'view_user_aggregate')
  }

  async function userContext(actor, id) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    return aggregateUser(actor, id, 'view_user_service_context')
  }

  async function updateUser(actor, id, input = {}) {
    requireRole(actor, ['super_admin'])
    const user = await deps.byId('user', number(id))
    if (!user) throw error('用户不存在', 404)
    const update = {}
    Object.keys(input).forEach((key) => {
      if (USER_MUTABLE_FIELDS.has(key)) update[key] = input[key]
    })
    if (Object.prototype.hasOwnProperty.call(update, 'status') && ![0, 1, 2, 3].includes(number(update.status))) {
      throw error('无效状态', 400)
    }
    if (Object.prototype.hasOwnProperty.call(update, 'is_vip') && ![0, 1].includes(number(update.is_vip))) {
      throw error('VIP状态无效', 400)
    }
    if (!Object.keys(update).length) throw error('没有可更新的用户字段', 400)
    if (Object.prototype.hasOwnProperty.call(update, 'status')) update.status = number(update.status)
    if (Object.prototype.hasOwnProperty.call(update, 'is_vip')) update.is_vip = number(update.is_vip)
    const updated = await deps.updateByDoc('user', user, update)
    await deps.addWithId('partner_user_audit_log', {
      actor_role: 'admin',
      actor_id: actor.id,
      admin_role: adminRole(actor),
      action: 'update_user',
      user_id: number(user.id),
      changed_fields: Object.keys(update),
      reason: 'authorized_backoffice_update'
    }, 'member_audit')
    return userDto(updated, actor)
  }

  async function listOrders(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const users = await allUsers()
    const usersById = new Map(users.map((row) => [number(row.id), row]))
    const rows = (await deps.list('user_order', {}, 500))
      .map((row) => ({ row, user: usersById.get(number(row.user_id)) }))
      .filter((item) => item.user && (filters.include_test === true || String(filters.include_test) === '1' || !isTestUser(item.user)))
      .sort((a, b) => number(b.row.id) - number(a.row.id))
      .map((item) => orderDto(item.row, item.user, actor))
    return paginate(rows, filters)
  }

  async function listMatches(actor, filters = {}) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const users = await allUsers()
    const usersById = new Map(users.map((row) => [number(row.id), row]))
    const includeTest = filters.include_test === true || String(filters.include_test) === '1'
    const rows = (await deps.list('user_match_log', {}, 500))
      .map((row) => ({ row, owner: usersById.get(number(row.user_id)), matched: usersById.get(number(row.match_user_id)) }))
      .filter((item) => item.owner && item.matched && (includeTest || (!isTestUser(item.owner) && !isTestUser(item.matched))))
      .sort((a, b) => number(b.row.id) - number(a.row.id))
      .map((item) => matchDto(item.row, item.owner, item.matched, actor))
    return paginate(rows, filters)
  }

  async function matchDetail(actor, id) {
    requireRole(actor, ['super_admin', 'customer_service', 'auditor'])
    const row = await deps.byId('user_match_log', number(id))
    if (!row) throw error('匹配记录不存在', 404)
    const [owner, matched, ownerSetting, matchedSetting] = await Promise.all([
      deps.byId('user', row.user_id),
      deps.byId('user', row.match_user_id),
      deps.first('user_match_setting', { user_id: row.user_id }),
      deps.first('user_match_setting', { user_id: row.match_user_id })
    ])
    if (!owner || !matched) throw error('匹配用户不存在', 404)
    return {
      log: matchDto(row, owner, matched, actor),
      owner: Object.assign(userDto(owner, actor), { match_settings: ownerSetting || null }),
      partner: Object.assign(userDto(matched, actor), { match_settings: matchedSetting || null }),
      score_detail: parseJson(row.score_detail_json)
    }
  }

  async function missingSupportCodeIds() {
    const users = await allUsers()
    return users.filter((row) => !isTestUser(row) && !supportCodeFor(row)).map((row) => number(row.id)).sort((a, b) => a - b)
  }

  async function backfillSupportCodes(actor, input = {}) {
    requireRole(actor, ['super_admin'])
    const expected = await missingSupportCodeIds()
    if (input.dry_run === true) return { dry_run: true, user_ids: expected }
    const requested = Array.isArray(input.user_ids)
      ? Array.from(new Set(input.user_ids.map(number).filter(Boolean))).sort((a, b) => a - b)
      : []
    if (input.confirm !== true || JSON.stringify(requested) !== JSON.stringify(expected)) {
      throw error('回填名单与预览不一致', 400)
    }
    const updated = []
    for (const userId of requested) {
      const user = await deps.byId('user', userId)
      if (!user || isTestUser(user)) throw error('回填用户无效', 400)
      updated.push({ user_id: userId, support_code: await deps.ensureUserSupportCode(user) })
    }
    await deps.addWithId('partner_user_audit_log', {
      actor_role: 'admin', actor_id: actor.id, admin_role: adminRole(actor), action: 'backfill_user_support_codes',
      user_ids: requested, reason: 'reviewed_backoffice_backfill'
    }, 'member_audit')
    return { dry_run: false, updated }
  }

  return { dashboard, listUsers, userDetail, userContext, updateUser, listOrders, listMatches, matchDetail, backfillSupportCodes }
}

async function dispatchUserBackofficeRoute(input) {
  const { method, path, query = {}, body = {}, actor, service } = input
  if (method === 'GET' && path === '/api/admin/dashboard') return { handled: true, data: await service.dashboard(actor) }
  if (method === 'GET' && path === '/api/admin/users') return { handled: true, data: await service.listUsers(actor, query) }
  if (method === 'POST' && path === '/api/admin/users/support-codes/backfill') {
    return { handled: true, data: await service.backfillSupportCodes(actor, body) }
  }
  let matched = path.match(/^\/api\/admin\/users\/(\d+)$/)
  if (method === 'GET' && matched) return { handled: true, data: await service.userDetail(actor, Number(matched[1])) }
  if (method === 'PUT' && matched) return { handled: true, data: await service.updateUser(actor, Number(matched[1]), body), message: '更新成功' }
  if (method === 'GET' && path === '/api/admin/orders') return { handled: true, data: await service.listOrders(actor, query) }
  if (method === 'GET' && path === '/api/admin/matches') return { handled: true, data: await service.listMatches(actor, query) }
  matched = path.match(/^\/api\/admin\/matches\/(\d+)$/)
  if (method === 'GET' && matched) return { handled: true, data: await service.matchDetail(actor, Number(matched[1])) }
  return { handled: false }
}

module.exports = { createUserBackofficeService, dispatchUserBackofficeRoute }
