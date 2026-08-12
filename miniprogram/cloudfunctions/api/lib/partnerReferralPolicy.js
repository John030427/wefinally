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

function sceneSignature(partnerPart, expiresPart, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`w1.${partnerPart}.${expiresPart}`)
    .digest('hex')
    .slice(0, 12)
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

function createReferralScene(partnerId, options = {}) {
  const id = Number(partnerId)
  if (!Number.isInteger(id) || id <= 0) throw new Error('合伙人归因对象无效')
  const now = Number(options.now === undefined ? Date.now() : options.now)
  const ttlMs = Number(options.ttlMs === undefined ? 90 * 86400000 : options.ttlMs)
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('归因标识有效期无效')
  const partnerPart = id.toString(36)
  const expiresPart = Math.floor((now + ttlMs) / 1000).toString(36)
  return `w1.${partnerPart}.${expiresPart}.${sceneSignature(partnerPart, expiresPart, secretValue(options))}`
}

function verifyReferralScene(scene, options = {}) {
  const parts = String(scene || '').trim().split('.')
  if (parts.length !== 4 || parts[0].toLowerCase() !== 'w1') throw new Error('归因标识无效')
  const partnerId = parseInt(parts[1], 36)
  const expiresAt = parseInt(parts[2], 36) * 1000
  if (!Number.isInteger(partnerId) || partnerId <= 0 || !Number.isFinite(expiresAt)) throw new Error('归因标识无效')
  const now = Number(options.now === undefined ? Date.now() : options.now)
  if (expiresAt <= now) throw new Error('归因标识已过期')
  const expected = sceneSignature(parts[1].toLowerCase(), parts[2].toLowerCase(), secretValue(options))
  const actualBuffer = Buffer.from(parts[3])
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('归因标识无效')
  }
  return { partnerId, expiresAt, version: 'w1' }
}

function referralInput(value, options = {}) {
  const input = String(value || '').trim()
  if (input.toLowerCase().startsWith('wf1.')) return verifyReferralToken(input, options)
  if (input.toLowerCase().startsWith('w1.')) return verifyReferralScene(input, options)
  return { code: input.toUpperCase() }
}

module.exports = { createReferralToken, verifyReferralToken, createReferralScene, verifyReferralScene, referralInput }
