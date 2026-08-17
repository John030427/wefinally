const {
  assertActivation,
  partnerCodes
} = require('./partnerOnboardingPolicy')
const crypto = require('crypto')

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function partnerDto(row = {}) {
  return {
    id: number(row.id),
    partner_code: String(row.partner_code || ''),
    promote_code: String(row.promote_code || ''),
    status: number(row.status),
    binding_version: Math.max(1, number(row.binding_version))
  }
}

function requestId(value) {
  const result = String(value || '').trim().slice(0, 128)
  if (!result) throw new Error('激活请求编号不能为空')
  return result
}

function requestDocumentId(value) {
  return `partner_activation_${crypto.createHash('sha256').update(value).digest('hex')}`
}

function createPartnerOnboardingService(deps, options = {}) {
  if (!deps || typeof deps.transaction !== 'function') throw new Error('合伙人激活事务依赖缺失')
  const phoneSecret = String(options.phoneSecret || '')

  async function activate(input = {}) {
    const candidateId = number(input.candidate_id)
    const currentUserId = number(input.current_user_id)
    const activationRequestId = requestId(input.request_id)
    if (!candidateId || !currentUserId) throw new Error('合伙人激活参数无效')

    return deps.transaction(async (tx) => {
      const auditDocumentId = requestDocumentId(activationRequestId)
      const prior = await tx.byDocId('partner_audit_log', auditDocumentId)
      if (prior) {
        if (number(prior.actor_user_id) !== currentUserId) throw new Error('激活请求编号冲突')
        const existing = await tx.byId('partner', prior.result_partner_id)
        if (!existing) throw new Error('激活幂等记录无效')
        return partnerDto(existing)
      }

      const candidate = await tx.byId('partner_candidate', candidateId)
      const partner = candidate && number(candidate.partner_id)
        ? await tx.byId('partner', candidate.partner_id)
        : null
      const bindingDocumentId = `partner_user_${currentUserId}`
      const bindingLock = await tx.byDocId('partner_binding', bindingDocumentId)
      const partnerForUser = bindingLock && number(bindingLock.partner_id)
        ? await tx.byId('partner', bindingLock.partner_id)
        : null
      const binding = assertActivation({
        candidate,
        partner,
        partnerForUser,
        rosterPhone: input.roster_phone,
        currentUserId,
        secret: phoneSecret
      })
      const timestamp = tx.now()
      let activated

      if (partner) {
        let codes = {
          partner_code: String(partner.partner_code || ''),
          promote_code: String(partner.promote_code || '')
        }
        if (!codes.partner_code) codes = Object.assign(codes, partnerCodes(await tx.nextCounter('partner_support_code')))
        activated = await tx.updateByDoc('partner', partner, {
          partner_code: codes.partner_code,
          promote_code: String(partner.promote_code || codes.promote_code),
          user_id: currentUserId,
          candidate_id: candidateId,
          phone_digest: binding.phone_digest,
          phone_masked: String(candidate.phone_masked || ''),
          status: 1,
          binding_version: Math.max(1, number(partner.binding_version) + 1),
          binding_time: timestamp
        })
      } else {
        const codes = partnerCodes(await tx.nextCounter('partner_support_code'))
        activated = await tx.addWithId('partner', {
          circle_id: number(candidate.circle_id),
          name: String(candidate.name || candidate.phone_masked || codes.partner_code),
          status: 1,
          partner_code: codes.partner_code,
          promote_code: codes.promote_code,
          user_id: currentUserId,
          candidate_id: candidateId,
          phone_digest: binding.phone_digest,
          phone_masked: String(candidate.phone_masked || ''),
          binding_version: 1,
          binding_time: timestamp,
          total_promote_user: 0,
          total_promote_vip: 0,
          total_commission: 0,
          balance: 0
        }, 'partner')
      }

      await tx.updateByDoc('partner_candidate', candidate, {
        activation_status: 'bound',
        partner_id: number(activated.id),
        applicant_user_id: number(candidate.applicant_user_id) || currentUserId,
        bound_at: timestamp
      })
      await tx.setByDocId('partner_binding', bindingDocumentId, {
        user_id: currentUserId,
        partner_id: number(activated.id),
        candidate_id: candidateId,
        binding_version: number(activated.binding_version),
        status: 1,
        update_time: timestamp
      })
      await tx.setByDocId('partner_audit_log', auditDocumentId, {
        actor_type: 'user',
        actor_user_id: currentUserId,
        candidate_id: candidateId,
        partner_id: number(activated.id),
        result_partner_id: number(activated.id),
        action: 'activate',
        from_status: 'needs_verification',
        to_status: 'active',
        request_id: activationRequestId,
        reason: 'roster_phone_binding',
        create_time: timestamp
      })
      return partnerDto(activated)
    })
  }

  return { activate }
}

module.exports = { createPartnerOnboardingService, partnerDto }
