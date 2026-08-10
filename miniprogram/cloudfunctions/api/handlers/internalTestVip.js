const { MEMBER_STATUS, memberStatus } = require('../lib/memberPolicy')
const { isVipActive } = require('../lib/format')

function defaultDeps() {
  const db = require('../lib/db')
  return {
    byId: db.byId,
    first: db.first,
    updateByDoc: db.updateByDoc,
    addWithId: db.addWithId,
    now: db.now
  }
}

function validateActor(actor) {
  if (!actor || actor.role !== 'admin' || actor.admin_role !== 'super_admin') {
    throw new Error('仅超级管理员可以管理内测 VIP')
  }
}

function normalizeInput(input = {}) {
  const action = String(input.action || '').trim()
  const userId = Number(input.userId || 0)
  const reason = String(input.reason || '').trim().slice(0, 500)
  const requestId = String(input.requestId || '').trim().slice(0, 100)
  const days = Number(input.days || 0)
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('用户ID无效')
  if (!['grant', 'revoke'].includes(action)) throw new Error('内测 VIP 操作无效')
  if (!reason) throw new Error(action === 'grant' ? '请填写授权原因' : '请填写撤销原因')
  if (requestId.length < 16) throw new Error('请求标识无效')
  if (action === 'grant' && (!Number.isInteger(days) || days < 1 || days > 14)) {
    throw new Error('内测 VIP 有效期必须为1至14天')
  }
  return { action, userId, reason, requestId, days }
}

async function changeInternalTestVip(input, actor, deps = defaultDeps()) {
  validateActor(actor)
  const normalized = normalizeInput(input)
  const user = await deps.byId('user', normalized.userId)
  if (!user) throw new Error('用户不存在')

  const existingAudit = await deps.first('partner_user_audit_log', {
    request_id: normalized.requestId
  })
  if (existingAudit) {
    if (
      Number(existingAudit.user_id) !== normalized.userId
      || existingAudit.action !== `${normalized.action}_test_vip`
    ) {
      throw new Error('请求标识已被其他操作使用')
    }
    return Object.assign({}, user, { idempotent: 1 })
  }

  if (memberStatus(user) !== MEMBER_STATUS.APPROVED || Number(user.status) !== 1) {
    throw new Error('只有审核通过且状态正常的用户才能获得内测 VIP')
  }

  const now = deps.now()
  const activeVip = isVipActive(user, now)
  const previousSource = String(user.vip_source || '')
  let userUpdate
  if (normalized.action === 'grant') {
    if (activeVip && previousSource !== 'internal_test') {
      throw new Error('该用户已有正式会员权益，不能覆盖为内测 VIP')
    }
    userUpdate = {
      is_vip: 1,
      vip_expire_time: new Date(now.getTime() + normalized.days * 86400000),
      vip_source: 'internal_test',
      vip_test_request_id: normalized.requestId,
      vip_test_granted_at: now
    }
  } else {
    if (previousSource !== 'internal_test') throw new Error('只能撤销内测 VIP，正式会员权益不受影响')
    userUpdate = {
      is_vip: 0,
      vip_expire_time: null,
      vip_source: '',
      vip_test_request_id: '',
      vip_test_granted_at: null
    }
  }

  const updatedUser = await deps.updateByDoc('user', user, userUpdate)
  await deps.addWithId('partner_user_audit_log', {
    application_id: 0,
    partner_id: Number(user.promote_partner_id || 0),
    user_id: user.id,
    actor_role: actor.role,
    actor_id: Number(actor.id),
    action: `${normalized.action}_test_vip`,
    from_status: activeVip ? (previousSource || 'active') : 'inactive',
    to_status: normalized.action === 'grant' ? 'internal_test' : 'inactive',
    reason: normalized.reason,
    request_id: normalized.requestId,
    vip_days: normalized.action === 'grant' ? normalized.days : 0,
    vip_expire_time: userUpdate.vip_expire_time
  }, 'member_audit')
  return updatedUser
}

module.exports = {
  changeInternalTestVip,
  normalizeInput,
  validateActor
}
