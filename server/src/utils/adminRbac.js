'use strict'

const { ADMIN_ROLES } = require('../config/constants')

/**
 * Exact Express admin route allowlists by role.
 * Do not use "everything except super_admin" shortcuts.
 */

const CUSTOMER_SERVICE_RULES = [
  ['GET', /^\/dashboard$/],
  ['GET', /^\/service\/workbench$/],
  ['GET', /^\/orders$/],
  ['GET', /^\/chat\/sessions$/],
  ['POST', /^\/chat\/reply$/],
  ['GET', /^\/handoff\/tickets$/],
  ['PUT', /^\/handoff\/tickets\/\d+$/],
  ['GET', /^\/matches$/],
  ['GET', /^\/matches\/\d+$/]
]

const AUDITOR_RULES = [
  ['GET', /^\/dashboard$/],
  ['GET', /^\/member-applications$/],
  ['PUT', /^\/member-applications\/\d+\/review$/],
  ['GET', /^\/users$/],
  ['GET', /^\/users\/\d+$/],
  ['GET', /^\/partners$/]
]

const FINANCE_RULES = [
  ['GET', /^\/dashboard$/],
  ['GET', /^\/orders$/],
  ['GET', /^\/withdrawals$/],
  ['PUT', /^\/withdrawals\/\d+$/]
]

const ROLE_RULES = {
  [ADMIN_ROLES.CUSTOMER_SERVICE]: CUSTOMER_SERVICE_RULES,
  [ADMIN_ROLES.AUDITOR]: AUDITOR_RULES,
  [ADMIN_ROLES.FINANCE]: FINANCE_RULES
}

function currentAdminRole(req) {
  return req.auth?.admin_role || req.auth?.adminRole || ADMIN_ROLES.SUPER_ADMIN
}

function hasRouteAccess(req) {
  const role = currentAdminRole(req)
  if (role === ADMIN_ROLES.SUPER_ADMIN) return true
  const rules = ROLE_RULES[role]
  if (!rules) return false
  return rules.some(([method, pattern]) => req.method === method && pattern.test(req.path))
}

function canSeeOpenId(role) {
  return role === ADMIN_ROLES.SUPER_ADMIN
}

function rolePages() {
  return {
    customer_service: ['dashboard', 'service', 'orders', 'chat', 'handoff', 'matches'],
    auditor: ['dashboard', 'members', 'users', 'partners'],
    finance: ['dashboard', 'orders', 'withdrawals']
  }
}

module.exports = {
  CUSTOMER_SERVICE_RULES,
  AUDITOR_RULES,
  FINANCE_RULES,
  ROLE_RULES,
  currentAdminRole,
  hasRouteAccess,
  canSeeOpenId,
  rolePages
}
