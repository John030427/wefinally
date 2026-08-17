const {
  REVIEW_STATUS,
  ACTIVATION_STATUS,
  normalizePhone,
  maskPhone,
  phoneDigest,
  candidateDto
} = require('./partnerOnboardingPolicy')

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function text(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength)
}

function requireAdmin(actor) {
  if (!actor || actor.role !== 'admin') throw new Error('无权访问合伙人管理')
  return actor
}

function requireSuperAdmin(actor) {
  requireAdmin(actor)
  if (actor.admin_role !== 'super_admin') throw new Error('无权修改合伙人资料')
  return actor
}

function requireReason(value) {
  const result = text(value, 500)
  if (!result) throw new Error('必须填写操作原因')
  return result
}

function requireRequestId(value) {
  const result = text(value, 128)
  if (!result) throw new Error('请求编号不能为空')
  return result
}

function auditDto(row = {}) {
  return {
    id: number(row.id),
    actor_type: String(row.actor_type || ''),
    actor_admin_id: number(row.actor_admin_id),
    actor_admin_role: String(row.actor_admin_role || ''),
    candidate_id: number(row.candidate_id),
    partner_id: number(row.partner_id),
    action: String(row.action || ''),
    from_status: String(row.from_status || ''),
    to_status: String(row.to_status || ''),
    request_id: String(row.request_id || ''),
    reason: String(row.reason || ''),
    create_time: row.create_time || null
  }
}

function partnerAdminDto(row = {}) {
  return {
    id: number(row.id),
    name: String(row.name || ''),
    partner_code: String(row.partner_code || ''),
    promote_code: String(row.promote_code || ''),
    status: number(row.status),
    user_id: number(row.user_id),
    candidate_id: number(row.candidate_id),
    phone_masked: String(row.phone_masked || ''),
    balance: number(row.balance),
    binding_version: Math.max(1, number(row.binding_version)),
    create_time: row.create_time || null,
    update_time: row.update_time || null
  }
}

function createPartnerAdminService(deps, options = {}) {
  if (!deps || typeof deps.list !== 'function' || typeof deps.addWithId !== 'function') {
    throw new Error('合伙人后台服务依赖缺失')
  }
  const phoneSecret = String(options.phoneSecret || '')

  async function audit(actor, data) {
    return deps.addWithId('partner_audit_log', {
      actor_type: 'admin',
      actor_admin_id: number(actor.id),
      actor_admin_role: String(actor.admin_role || ''),
      candidate_id: number(data.candidate_id),
      partner_id: number(data.partner_id),
      action: String(data.action || ''),
      from_status: String(data.from_status || ''),
      to_status: String(data.to_status || ''),
      request_id: text(data.request_id, 128),
      reason: text(data.reason, 500),
      create_time: deps.now()
    }, 'partner_audit')
  }

  async function priorWrite(actor, action, requestId) {
    const prior = await deps.first('partner_audit_log', { action, request_id: requestId })
    if (prior && number(prior.actor_admin_id) !== number(actor.id)) throw new Error('请求编号冲突')
    return prior
  }

  async function createRosterCandidate(actor, input = {}) {
    requireSuperAdmin(actor)
    const rosterRequestId = text(input.request_id, 128)
    const prior = rosterRequestId ? await priorWrite(actor, 'roster_create', rosterRequestId) : null
    if (prior) {
      const priorCandidate = await deps.byId('partner_candidate', prior.candidate_id)
      if (!priorCandidate) throw new Error('名单幂等记录无效')
      return candidateDto(priorCandidate)
    }
    const normalizedPhone = normalizePhone(input.phone)
    const digest = phoneDigest(normalizedPhone, phoneSecret)
    const existing = await deps.first('partner_candidate', { phone_digest: digest })
    if (existing) throw new Error('手机号已在合伙人名单')
    const name = text(input.name, 100)
    if (!name) throw new Error('合伙人姓名不能为空')
    const timestamp = deps.now()
    const candidate = await deps.addWithId('partner_candidate', {
      source: 'roster',
      name,
      phone_digest: digest,
      phone_masked: maskPhone(normalizedPhone),
      applicant_user_id: 0,
      review_status: REVIEW_STATUS.APPROVED,
      activation_status: ACTIVATION_STATUS.UNBOUND,
      review_note: text(input.note, 500),
      reviewed_by: number(actor.id),
      reviewed_at: timestamp,
      create_time: timestamp,
      update_time: timestamp
    }, 'partner_candidate')
    await audit(actor, {
      candidate_id: candidate.id,
      action: 'roster_create',
      from_status: '',
      to_status: REVIEW_STATUS.APPROVED,
      request_id: rosterRequestId,
      reason: input.note
    })
    return candidateDto(candidate)
  }

  async function importRoster(actor, input = {}) {
    requireSuperAdmin(actor)
    const rows = Array.isArray(input.rows) ? input.rows.slice(0, 200) : []
    if (!rows.length) throw new Error('导入名单不能为空')
    const baseRequestId = text(input.request_id, 100)
    const results = []
    let created = 0
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const candidate = await createRosterCandidate(actor, {
          ...rows[index],
          request_id: baseRequestId ? `${baseRequestId}:${index + 1}` : ''
        })
        created += 1
        results.push({ index, ok: true, candidate })
      } catch (error) {
        results.push({ index, ok: false, error: String(error.message || error) })
      }
    }
    return { created, failed: rows.length - created, results }
  }

  async function listCandidates(actor, filters = {}) {
    requireAdmin(actor)
    const rows = await deps.list('partner_candidate', {}, 500)
    return rows
      .filter((row) => !filters.review_status || row.review_status === filters.review_status)
      .filter((row) => !filters.activation_status || row.activation_status === filters.activation_status)
      .filter((row) => !filters.source || row.source === filters.source)
      .sort((left, right) => number(right.id) - number(left.id))
      .map(candidateDto)
  }

  async function candidateDetail(actor, candidateId) {
    requireAdmin(actor)
    const candidate = await deps.byId('partner_candidate', candidateId)
    if (!candidate) throw new Error('合伙人申请不存在')
    const partner = number(candidate.partner_id) ? await deps.byId('partner', candidate.partner_id) : null
    const audits = await deps.list('partner_audit_log', { candidate_id: number(candidate.id) }, 200)
    return {
      candidate: candidateDto(candidate),
      partner: partner ? partnerAdminDto(partner) : null,
      audits: audits.sort((left, right) => number(right.id) - number(left.id)).map(auditDto)
    }
  }

  async function reviewCandidate(actor, candidateId, input = {}) {
    requireSuperAdmin(actor)
    const reason = requireReason(input.reason)
    const action = String(input.action || '')
    if (!['approve', 'reject'].includes(action)) throw new Error('审核操作无效')
    const reviewRequestId = requireRequestId(input.request_id)
    const prior = await priorWrite(actor, action, reviewRequestId)
    if (prior) {
      if (number(prior.candidate_id) !== number(candidateId)) throw new Error('请求编号冲突')
      const priorCandidate = await deps.byId('partner_candidate', candidateId)
      if (!priorCandidate) throw new Error('审核幂等记录无效')
      return candidateDto(priorCandidate)
    }
    const candidate = await deps.byId('partner_candidate', candidateId)
    if (!candidate) throw new Error('合伙人申请不存在')
    const fromStatus = String(candidate.review_status || '')
    const toStatus = action === 'approve' ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.REJECTED
    const timestamp = deps.now()
    const updated = await deps.updateByDoc('partner_candidate', candidate, {
      review_status: toStatus,
      activation_status: ACTIVATION_STATUS.UNBOUND,
      review_note: reason,
      reviewed_by: number(actor.id),
      reviewed_at: timestamp,
      update_time: timestamp
    })
    await audit(actor, {
      candidate_id: candidate.id,
      partner_id: candidate.partner_id,
      action,
      from_status: fromStatus,
      to_status: toStatus,
      request_id: reviewRequestId,
      reason
    })
    return candidateDto(updated)
  }

  async function listPartners(actor, filters = {}) {
    requireAdmin(actor)
    const rows = await deps.list('partner', {}, 500)
    return rows
      .filter((row) => filters.status === undefined || number(row.status) === number(filters.status))
      .sort((left, right) => number(right.id) - number(left.id))
      .map(partnerAdminDto)
  }

  async function changePartner(actor, partnerId, input = {}) {
    requireSuperAdmin(actor)
    const reason = requireReason(input.reason)
    const action = String(input.action || '')
    if (!['suspend', 'resume', 'unbind', 'revoke'].includes(action)) throw new Error('合伙人操作无效')
    const changeRequestId = requireRequestId(input.request_id)
    const prior = await priorWrite(actor, action, changeRequestId)
    if (prior) {
      if (number(prior.partner_id) !== number(partnerId)) throw new Error('请求编号冲突')
      const priorPartner = await deps.byId('partner', partnerId)
      if (!priorPartner) throw new Error('状态操作幂等记录无效')
      return partnerAdminDto(priorPartner)
    }
    const partner = await deps.byId('partner', partnerId)
    if (!partner) throw new Error('合伙人不存在')
    const fromStatus = String(number(partner.status))
    const candidateId = number(partner.candidate_id)
    const changes = { update_time: deps.now() }
    if (action === 'suspend') changes.status = 2
    if (action === 'resume') changes.status = 1
    if (action === 'unbind' || action === 'revoke') {
      changes.status = action === 'revoke' ? 2 : 0
      changes.user_id = 0
      changes.binding_version = Math.max(1, number(partner.binding_version)) + 1
    }
    const updated = await deps.updateByDoc('partner', partner, changes)
    if (candidateId && (action === 'unbind' || action === 'revoke')) {
      const candidate = await deps.byId('partner_candidate', candidateId)
      if (candidate) {
        await deps.updateByDoc('partner_candidate', candidate, {
          review_status: action === 'revoke' ? REVIEW_STATUS.REVOKED : candidate.review_status,
          activation_status: ACTIVATION_STATUS.UNBOUND_BY_ADMIN,
          update_time: deps.now()
        })
      }
    }
    await audit(actor, {
      candidate_id: candidateId,
      partner_id: partner.id,
      action,
      from_status: fromStatus,
      to_status: String(number(updated.status)),
      request_id: changeRequestId,
      reason
    })
    return partnerAdminDto(updated)
  }

  return {
    createRosterCandidate,
    importRoster,
    listCandidates,
    candidateDetail,
    reviewCandidate,
    listPartners,
    changePartner
  }
}

module.exports = { createPartnerAdminService, partnerAdminDto }
