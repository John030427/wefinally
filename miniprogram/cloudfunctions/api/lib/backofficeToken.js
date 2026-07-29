const crypto = require('crypto')

function requireSecret(secret) {
  const value = String(secret || '')
  if (value.length < 32) throw new Error('后台Token安全密钥至少需要32个字符')
  return value
}

function signature(payload, secret) {
  return crypto.createHmac('sha256', requireSecret(secret)).update(payload).digest('base64url')
}

function signBackofficeToken(actor, secret, ttlSeconds = 7 * 86400, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = Buffer.from(JSON.stringify({
    role: actor.role,
    id: Number(actor.id),
    exp: nowSeconds + ttlSeconds
  })).toString('base64url')
  return `${payload}.${signature(payload, secret)}`
}

function verifyBackofficeToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const [payload, provided] = String(token || '').split('.')
  if (!payload || !provided) throw new Error('后台Token无效')
  const expected = signature(payload, secret)
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error('后台Token无效')
  let data
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch (err) {
    throw new Error('后台Token无效')
  }
  if (!data.exp || data.exp < nowSeconds) throw new Error('后台Token已过期')
  if (!['partner', 'admin'].includes(data.role) || !Number(data.id)) throw new Error('后台Token无效')
  return { role: data.role, id: Number(data.id), exp: Number(data.exp) }
}

module.exports = { signBackofficeToken, verifyBackofficeToken }
