const crypto = require('crypto')

function secretValue(options) {
  const secret = String((options && options.secret) || process.env.PARTNER_REFERRAL_SECRET || '').trim()
  if (!secret) throw new Error('合伙人归因签名密钥未配置')
  return secret
}

function signature(partnerId, expiresAt, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`wf1.${partnerId}.${expiresAt}`)
    .digest('base64url')
    .slice(0, 22)
}

function createReferralToken(partnerId, options = {}) {
  const id = Number(partnerId)
  if (!Number.isInteger(id) || id <= 0) throw new Error('合伙人归因对象无效')
  const now = Number(options.now === undefined ? Date.now() : options.now)
  const ttlMs = Number(options.ttlMs === undefined ? 90 * 86400000 : options.ttlMs)
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('归因标识有效期无效')
  const expiresAt = now + ttlMs
  const secret = secretValue(options)
  return `wf1.${id}.${expiresAt}.${signature(id, expiresAt, secret)}`
}

function verifyReferralToken(token, options = {}) {
  const parts = String(token || '').trim().split('.')
  if (parts.length !== 4 || parts[0] !== 'wf1') throw new Error('归因标识无效')
  const partnerId = Number(parts[1])
  const expiresAt = Number(parts[2])
  if (!Number.isInteger(partnerId) || partnerId <= 0 || !Number.isFinite(expiresAt)) throw new Error('归因标识无效')
  const now = Number(options.now === undefined ? Date.now() : options.now)
  if (expiresAt <= now) throw new Error('归因标识已过期')
  const expected = signature(partnerId, expiresAt, secretValue(options))
  const actualBuffer = Buffer.from(parts[3])
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('归因标识无效')
  }
  return { partnerId, expiresAt, version: 'wf1' }
}

function referralInput(value, options = {}) {
  const input = String(value || '').trim()
  if (input.toLowerCase().startsWith('wf1.')) return verifyReferralToken(input, options)
  return { code: input.toUpperCase() }
}

module.exports = { createReferralToken, verifyReferralToken, referralInput }
