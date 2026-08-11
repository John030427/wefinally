function referralSource(value) {
  return String(value || '').trim().toLowerCase().startsWith('wf1.')
    ? 'signed_token'
    : 'promote_code'
}

async function ensureReferralAttribution(user, partner, rawReferral, deps = {}) {
  const first = deps.first
  const addWithId = deps.addWithId
  const now = deps.now || (() => new Date())
  if (typeof first !== 'function' || typeof addWithId !== 'function') {
    throw new Error('归因记录依赖未配置')
  }
  const userId = Number(user && user.id)
  const partnerId = Number(partner && partner.id)
  if (!userId || !partnerId) throw new Error('归因对象无效')
  const existing = await first('partner_referral_attribution', { user_id: userId })
  if (existing) return existing
  return addWithId('partner_referral_attribution', {
    partner_id: partnerId,
    user_id: userId,
    promote_code: String((partner && partner.promote_code) || (user && user.promote_code) || '').trim().toUpperCase(),
    source_type: referralSource(rawReferral),
    attribution_key: `user:${userId}`,
    attribution_locked: true,
    attributed_at: now()
  }, 'partner_referral', userId)
}

module.exports = { referralSource, ensureReferralAttribution }
