const ADMIN_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  CUSTOMER_SERVICE: 'customer_service',
  AUDITOR: 'auditor',
  FINANCE: 'finance'
})

const KNOWN_ADMIN_ROLES = new Set(Object.values(ADMIN_ROLES))

const CUSTOMER_SERVICE_RULES = Object.freeze([
  ['GET', /^\/api\/admin\/orders$/],
  ['GET', /^\/api\/admin\/matches(?:\/\d+)?$/],
  ['GET', /^\/api\/admin\/agent\/tickets(?:\/\d+)?$/],
  ['POST', /^\/api\/admin\/agent\/tickets\/\d+\/(?:reply|close)$/],
  ['GET', /^\/api\/admin\/agent\/conversations(?:\/\d+)?$/],
  ['POST', /^\/api\/admin\/agent\/conversations\/\d+\/reply$/],
  ['GET', /^\/api\/admin\/date-coordinations$/]
])

const AUDITOR_RULES = Object.freeze([
  ['GET', /^\/api\/admin\/member-applications(?:\/\d+)?$/],
  ['PUT', /^\/api\/admin\/member-applications\/\d+\/review$/],
  ['GET', /^\/api\/admin\/users(?:\/\d+)?$/],
  ['GET', /^\/api\/admin\/partners$/],
  ['GET', /^\/api\/admin\/partner-candidates(?:\/\d+)?$/]
])

const FINANCE_RULES = Object.freeze([
  ['GET', /^\/api\/admin\/orders$/],
  ['GET', /^\/api\/admin\/withdrawals$/],
  ['PUT', /^\/api\/admin\/withdrawals\/\d+$/]
])

const ROLE_RULES = Object.freeze({
  [ADMIN_ROLES.CUSTOMER_SERVICE]: CUSTOMER_SERVICE_RULES,
  [ADMIN_ROLES.AUDITOR]: AUDITOR_RULES,
  [ADMIN_ROLES.FINANCE]: FINANCE_RULES
})

function forbidden(message, code = 403) {
  const error = new Error(message)
  error.code = code
  return error
}

function canonicalAdminPath(path) {
  const value = String(path || '').split('?')[0].replace(/\/+$/, '')
  const index = value.indexOf('/api/admin/')
  return index >= 0 ? value.slice(index) : value
}

function adminRoleFromActor(actor) {
  if (!actor || actor.role !== 'admin') throw forbidden('无权访问后台', 401)
  const role = String(actor.admin_role || '').trim()
  if (!KNOWN_ADMIN_ROLES.has(role)) throw forbidden('后台账号角色无效')
  return role
}

function requireStoredAdminRole(value) {
  const role = String(value || '').trim()
  if (!KNOWN_ADMIN_ROLES.has(role)) throw forbidden('后台账号角色无效')
  return role
}

function authorizeCloudAdminRoute(actor, method, path) {
  const role = adminRoleFromActor(actor)
  if (role === ADMIN_ROLES.SUPER_ADMIN) return role
  const normalizedMethod = String(method || '').toUpperCase()
  const normalizedPath = canonicalAdminPath(path)
  const rules = ROLE_RULES[role] || []
  if (!rules.some(([allowedMethod, pattern]) => allowedMethod === normalizedMethod && pattern.test(normalizedPath))) {
    throw forbidden('当前账号无权访问该后台模块')
  }
  return role
}

function forbiddenResponseKey(key) {
  const normalized = String(key || '').toLowerCase()
  if (/^(openid|open_id|wx_openid|unionid|union_id)$/.test(normalized)) return true
  if (/^(phone|mobile|phone_number|telephone)$/.test(normalized)) return true
  if (normalized === 'match_settings' || normalized.includes('snapshot')) return true
  if (normalized === 'private_coordination' || normalized === 'coordination_private') return true
  if (normalized === 'audits' || normalized.includes('privacy_log') || normalized.includes('audit_log')) return true
  if (normalized.startsWith('raw_') || normalized.includes('_raw_') || normalized.includes('prompt')) return true
  if (/^(is_test|test_metadata|test_identity|identity_kind)$/.test(normalized)) return true
  if (normalized.startsWith('test_') || normalized.startsWith('ab_test_') || normalized.includes('fixture')) return true
  return false
}

function maskPhoneText(value) {
  return String(value).replace(/(?<!\d)(1\d{2})\d{4}(\d{4})(?!\d)/g, '$1****$2')
}

function projectLowerRoleValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return maskPhoneText(value)
  if (typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value
  if (Array.isArray(value)) return value.map(projectLowerRoleValue)
  const projected = {}
  Object.entries(value).forEach(([key, nested]) => {
    if (forbiddenResponseKey(key)) return
    projected[key] = projectLowerRoleValue(nested)
  })
  return projected
}

function authorizeCloudAdminResponse(actor, data) {
  const role = adminRoleFromActor(actor)
  return role === ADMIN_ROLES.SUPER_ADMIN ? data : projectLowerRoleValue(data)
}

module.exports = {
  ADMIN_ROLES,
  KNOWN_ADMIN_ROLES,
  CUSTOMER_SERVICE_RULES,
  AUDITOR_RULES,
  FINANCE_RULES,
  ROLE_RULES,
  adminRoleFromActor,
  requireStoredAdminRole,
  authorizeCloudAdminRoute,
  authorizeCloudAdminResponse
}
