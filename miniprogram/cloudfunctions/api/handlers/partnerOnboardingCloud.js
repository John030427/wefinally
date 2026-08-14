const cloud = require('wx-server-sdk')
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

async function consumePhoneCode(code) {
  const result = await cloud.openapi.phonenumber.getPhoneNumber({ code })
  const phoneInfo = result && (result.phoneInfo || result.phone_info)
  const phone = phoneInfo && (phoneInfo.phoneNumber || phoneInfo.phone_number || phoneInfo.purePhoneNumber || phoneInfo.pure_phone_number)
  if (!phone) throw new Error('手机号授权已失效')
  return String(phone)
}

const activationService = createPartnerOnboardingService(db, { phoneSecret: phoneSecret() })
const handlers = createPartnerOnboardingHandlers({
  first: db.first,
  byId: db.byId,
  addWithId: db.addWithId,
  updateByDoc: db.updateByDoc,
  now: db.now,
  consumePhoneCode,
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
