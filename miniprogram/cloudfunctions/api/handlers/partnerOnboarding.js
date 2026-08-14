const {
  REVIEW_STATUS,
  ACTIVATION_STATUS,
  normalizePhone,
  maskPhone,
  phoneDigest,
  onboardingState,
  candidateDto
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
    not_applied: ['apply', 'verify'],
    pending: [],
    needs_verification: ['verify'],
    rejected: ['apply'],
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

  async function apply(data = {}, wxContext) {
    const user = await currentUser(wxContext)
    const applyRequestId = requestId(data.request_id)
    const prior = await deps.first('partner_audit_log', {
      action: 'application_submit',
      request_id: applyRequestId
    })
    if (prior) {
      if (number(prior.actor_user_id) !== number(user.id)) throw new Error('请求编号冲突')
      const priorCandidate = await deps.byId('partner_candidate', prior.candidate_id)
      if (!priorCandidate) throw new Error('申请幂等记录无效')
      return candidateDto(priorCandidate)
    }

    const normalizedPhone = normalizePhone(data.phone)
    const digest = phoneDigest(normalizedPhone, phoneSecret)
    const candidateForPhone = await deps.first('partner_candidate', { phone_digest: digest })
    const candidateForUser = await deps.first('partner_candidate', { applicant_user_id: number(user.id) })
    if (candidateForPhone && number(candidateForPhone.id) !== number(candidateForUser && candidateForUser.id)) {
      throw new Error('该手机号暂不能提交合伙人申请')
    }
    if (candidateForUser && candidateForUser.review_status === REVIEW_STATUS.APPROVED) {
      throw new Error('当前合伙人资格已通过，请完成手机号验证')
    }
    const fromStatus = candidateForUser ? String(candidateForUser.review_status || '') : 'not_applied'
    const timestamp = deps.now()
    const payload = {
      source: 'application',
      phone_digest: digest,
      phone_masked: maskPhone(normalizedPhone),
      applicant_user_id: number(user.id),
      city: text(data.city || user.city, 100),
      circle_note: text(data.circle_note, 500),
      reason: text(data.reason, 1000),
      review_status: REVIEW_STATUS.PENDING,
      activation_status: ACTIVATION_STATUS.UNBOUND,
      review_note: '',
      update_time: timestamp
    }
    const candidate = candidateForUser
      ? await deps.updateByDoc('partner_candidate', candidateForUser, payload)
      : await deps.addWithId('partner_candidate', { ...payload, create_time: timestamp }, 'partner_candidate')
    await deps.addWithId('partner_audit_log', {
      actor_type: 'user',
      actor_user_id: number(user.id),
      candidate_id: number(candidate.id),
      partner_id: number(candidate.partner_id),
      action: 'application_submit',
      from_status: fromStatus,
      to_status: REVIEW_STATUS.PENDING,
      request_id: applyRequestId,
      reason: 'self_application',
      create_time: timestamp
    }, 'partner_audit')
    return candidateDto(candidate)
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
    const code = text(data.phone_code, 256)
    if (!code) throw new Error('请授权微信手机号')
    const verifiedPhone = await deps.consumePhoneCode(code)
    const digest = phoneDigest(verifiedPhone, phoneSecret)
    const candidate = await deps.first('partner_candidate', { phone_digest: digest })
    if (!candidate) throw new Error('手机号未获资格或验证不一致')
    const partner = await deps.activate({
      candidate_id: number(candidate.id),
      current_user_id: number(user.id),
      verified_phone: verifiedPhone,
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

  return { status, apply, activate, session }
}

module.exports = { createPartnerOnboardingHandlers, partnerDto, actionsFor }
