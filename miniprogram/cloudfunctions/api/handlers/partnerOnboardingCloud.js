const db = require('../lib/db')
const { signBackofficeToken } = require('../lib/backofficeToken')
const { createPartnerOnboardingService } = require('../lib/partnerOnboardingService')
const { createPartnerOnboardingHandlers } = require('./partnerOnboarding')

const SESSION_OPTIONS = Object.freeze({ ttlSeconds: 86400 })

function tokenSecret() {
  return process.env.BACKOFFICE_TOKEN_SECRET || process.env.JWT_SECRET || ''
}

function phoneSecret() {
  return process.env.PARTNER_PHONE_LOOKUP_SECRET || process.env.PARTNER_REFERRAL_SECRET || ''
}

const activationService = createPartnerOnboardingService(db, { phoneSecret: phoneSecret() })
const handlers = createPartnerOnboardingHandlers({
  first: db.first,
  byId: db.byId,
  addWithId: db.addWithId,
  updateByDoc: db.updateByDoc,
  now: db.now,
  activate: activationService.activate,
  signPartnerToken(partner) {
    return signBackofficeToken({
      role: 'partner',
      id: partner.id,
      binding_version: partner.binding_version
    }, tokenSecret(), SESSION_OPTIONS.ttlSeconds)
  }
}, { phoneSecret: phoneSecret() })

module.exports = handlers
