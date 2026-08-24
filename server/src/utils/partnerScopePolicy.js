'use strict'

/**
 * Partner review authority follows the application's current assignment.
 * Attribution ownership (promote_partner_id) is not review authorization.
 */
function assertPartnerApplicationScope(user, application, partnerId) {
  const actorId = Number(partnerId || 0)
  if (!user || !application || Number(application.user_id) !== Number(user.id)) {
    throw new Error('用户或会员申请不存在')
  }
  if (!actorId || Number(application.assigned_partner_id) !== actorId) {
    throw new Error('无权审核其他合伙人的会员申请')
  }
  return true
}

module.exports = { assertPartnerApplicationScope }
