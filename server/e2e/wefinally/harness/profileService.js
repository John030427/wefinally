'use strict'

const { compileAiMatchProfile, shouldInvalidateAiMatchProfile, applyAiProfileCorrection } = require('../../../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')
const { compileIntentProfile } = require('../../../../miniprogram/cloudfunctions/api/lib/intentProfile')
const { normalizeMatchSettingInput } = require('../../../../miniprogram/cloudfunctions/api/lib/memberPolicy')
const { normalizeIdentityInput } = require('../../../../miniprogram/cloudfunctions/api/lib/userIdentityTags')
const { resolveRegion } = require('../../../../miniprogram/cloudfunctions/api/lib/regionNormalize')
const { MEMBER_STATUS, memberStatus } = require('../../../../miniprogram/cloudfunctions/api/lib/memberPolicy')

async function replaceIdentityTags(db, userId, tags) {
  db.tables.user_identity_tag = (db.tables.user_identity_tag || []).filter((row) => Number(row.user_id) !== Number(userId))
  for (const tag of tags || []) {
    await db.addWithId('user_identity_tag', {
      user_id: Number(userId),
      circle_id: Number(tag.circle_id),
      is_primary: tag.is_primary ? 1 : 0,
      source: tag.source || 'user_declared',
      verified_status: tag.verified_status || 'unverified',
      occupation_description: tag.occupation_description || ''
    }, 'user_identity_tag')
  }
}

async function updateProfileForUser(db, user, data) {
  const patch = {}
  const allowed = [
    'city', 'education', 'income_range', 'house_car', 'baby_plan',
    'height_range', 'appearance_description', 'appearance_want',
    'circle_id', 'occupation_description',
    'province_code', 'province_name', 'city_code', 'city_name',
    'country_code', 'country_name'
  ]
  if (memberStatus(user) !== MEMBER_STATUS.APPROVED) allowed.push('birth_year')
  allowed.forEach((key) => {
    if (data[key] !== undefined) patch[key] = data[key]
  })

  if (data.primary_circle_id != null || data.circle_id != null || data.secondary_circle_ids) {
    const identity = normalizeIdentityInput({
      circle_id: data.primary_circle_id != null ? data.primary_circle_id : (data.circle_id != null ? data.circle_id : user.circle_id),
      secondary_circle_ids: data.secondary_circle_ids,
      occupation_description: data.occupation_description != null ? data.occupation_description : user.occupation_description
    })
    patch.circle_id = identity.primary_circle_id
    patch.occupation_description = identity.occupation_description
    await replaceIdentityTags(db, user.id, identity.tags)
  }

  if (data.city || data.province_code || data.city_code) {
    const region = resolveRegion(Object.assign({}, user, data, patch))
    patch.city = region.city || patch.city || user.city
    patch.province_code = region.province_code
    patch.province_name = region.province_name
    patch.city_code = region.city_code
    patch.city_name = region.city_name || patch.city
    patch.country_code = region.country_code || 'CN'
    patch.country_name = region.country_name || '中国'
  }

  const updated = await db.updateByDoc('user', user, patch)
  return updated
}

async function saveMatchSetting(db, user, rawInput) {
  const input = normalizeMatchSettingInput(rawInput)
  let setting = await db.first('user_match_setting', { user_id: user.id })
  if (!setting) {
    setting = await db.addWithId('user_match_setting', { user_id: user.id }, 'user_match_setting')
  }

  const intent = compileIntentProfile(Object.assign({}, setting, input, {
    education: user.education,
    city: user.city,
    baby_plan: user.baby_plan,
    circle_id: user.circle_id
  }))

  const source = Object.assign({}, setting, input, {
    education: user.education,
    city: user.city,
    baby_plan: user.baby_plan,
    circle_id: user.circle_id,
    marry_status: user.marry_status
  })

  let aiProfile = setting.ai_match_profile_json ? (typeof setting.ai_match_profile_json === 'string' ? JSON.parse(setting.ai_match_profile_json) : setting.ai_match_profile_json) : null
  if (!aiProfile || shouldInvalidateAiMatchProfile(aiProfile, source)) {
    aiProfile = compileAiMatchProfile(source, { intent })
  }

  const merged = await db.updateByDoc('user_match_setting', setting, Object.assign({}, input, {
    intent_profile_json: JSON.stringify(intent),
    ai_match_profile_json: JSON.stringify(aiProfile),
    ai_match_profile_version: aiProfile.version || 1,
    last_edit_time: db.now()
  }))
  return { setting: merged, aiProfile, intent }
}

async function applyProfileCorrection(db, user, correction) {
  const setting = await db.first('user_match_setting', { user_id: user.id })
  if (!setting) throw new Error('match setting missing')
  let aiProfile = typeof setting.ai_match_profile_json === 'string'
    ? JSON.parse(setting.ai_match_profile_json)
    : setting.ai_match_profile_json
  aiProfile = applyAiProfileCorrection(aiProfile, correction)
  await db.updateByDoc('user_match_setting', setting, {
    ai_match_profile_json: JSON.stringify(aiProfile),
    ai_match_profile_version: (Number(setting.ai_match_profile_version || 0) + 1)
  })
  return aiProfile
}

function markAiProfileStale(db, userId) {
  return db.first('user_match_setting', { user_id: userId }).then(async (setting) => {
    if (!setting) return null
    return db.updateByDoc('user_match_setting', setting, {
      ai_match_profile_stale: 1,
      last_profile_change_at: db.now()
    })
  })
}

module.exports = {
  updateProfileForUser,
  saveMatchSetting,
  applyProfileCorrection,
  markAiProfileStale,
  replaceIdentityTags
}
