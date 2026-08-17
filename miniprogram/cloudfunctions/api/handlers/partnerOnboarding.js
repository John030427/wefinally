const {
  normalizePhone,
  phoneDigest,
  onboardingState
} = require('../lib/partnerOnboardingPolicy')

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function text(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function requestId(value) {
  const result = text(value, 128)
  if (!result) throw new Error('请求编号不能为空')
  return result
}

function partnerDto(row = {}) {
  return {
    id: number(row.id),
    partner_code: String(row.partner_code || ''),
    promote_code: String(row.promote_code || ''),
    phone_masked: String(row.phone_masked || ''),
    status: number(row.status),
    binding_version: Math.max(1, number(row.binding_version))
  }
}

function actionsFor(state) {
  const actions = {
    not_applied: ['verify'],
    pending: [],
    needs_verification: ['verify'],
    rejected: ['contact_support'],
    active: ['dashboard'],
    suspended: ['contact_support'],
    revoked: ['contact_support']
  }
  return actions[state] || []
}

function createPartnerOnboardingHandlers(deps, options = {}) {
  if (!deps || typeof deps.first !== 'function') throw new Error('合伙人用户态服务依赖缺失')
  const phoneSecret = String(options.phoneSecret || '')

  async function currentUser(wxContext = {}) {
    const openid = String(wxContext.OPENID || '')
    if (!openid) throw new Error('无法获取微信身份')
    const user = await deps.first('user', { openid })
    if (!user) throw new Error('请先登录')
    return user
  }

  async function contextFor(user) {
    const partner = await deps.first('partner', { user_id: number(user.id) })
    let candidate = partner && number(partner.candidate_id)
      ? await deps.byId('partner_candidate', partner.candidate_id)
      : null
    if (!candidate) candidate = await deps.first('partner_candidate', { applicant_user_id: number(user.id) })
    return { partner, candidate }
  }

  function statusDto(user, candidate, partner) {
    const state = onboardingState({ candidate, partner, currentUserId: user.id })
    return {
      state,
      candidate_id: number(candidate && candidate.id),
      partner_code: String(partner && partner.partner_code || ''),
      promote_code: String(partner && partner.promote_code || ''),
      phone_masked: String((partner && partner.phone_masked) || (candidate && candidate.phone_masked) || ''),
      review_note: String(candidate && candidate.review_note || ''),
      allowed_actions: actionsFor(state)
    }
  }

  async function status(data, wxContext) {
    const user = await currentUser(wxContext)
    const context = await contextFor(user)
    return statusDto(user, context.candidate, context.partner)
  }

  async function sessionFor(partner) {
    if (!partner || number(partner.status) !== 1) throw new Error('合伙人权限不存在或已停用')
    const safePartner = partnerDto(partner)
    return {
      token: deps.signPartnerToken(safePartner),
      expires_in: 86400,
      binding_version: safePartner.binding_version,
      partner: safePartner
    }
  }

  async function activate(data = {}, wxContext) {
    const user = await currentUser(wxContext)
    const activationRequestId = requestId(data.request_id)
    let rosterPhone
    let digest
    try {
      rosterPhone = normalizePhone(data.phone)
      digest = phoneDigest(rosterPhone, phoneSecret)
    } catch (err) {
      throw new Error('手机号未获资格或验证不一致')
    }
    const candidate = await deps.first('partner_candidate', { source: 'roster', phone_digest: digest })
    if (!candidate) throw new Error('手机号未获资格或验证不一致')
    const partner = await deps.activate({
      candidate_id: number(candidate.id),
      current_user_id: number(user.id),
      roster_phone: rosterPhone,
      request_id: activationRequestId
    })
    return {
      state: 'active',
      partner: partnerDto(partner),
      session: await sessionFor(partner)
    }
  }

  async function session(data, wxContext) {
    const user = await currentUser(wxContext)
    const partner = await deps.first('partner', { user_id: number(user.id) })
    return sessionFor(partner)
  }

  return { status, activate, session }
}

module.exports = { createPartnerOnboardingHandlers, partnerDto, actionsFor }
