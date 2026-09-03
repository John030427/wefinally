'use strict'

const { seedSingle, passResult, failResult } = require('./_helpers')
const { updateProfileForUser, saveMatchSetting, markAiProfileStale } = require('../harness/profileService')
const { shouldInvalidateAiMatchProfile } = require('../../../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')

async function run() {
  const name = 'PROFILE-EVOLUTION'
  try {
    const { db, persona } = await seedSingle(null, 'S', 300)
    const user = persona.user

    await saveMatchSetting(db, user, Object.assign({}, persona.setting, {
      self_view_text: 'Master student in university research, values stable communication'
    }))
    let setting = await db.first('user_match_setting', { user_id: user.id })
    const v1 = JSON.parse(setting.ai_match_profile_json)

    await updateProfileForUser(db, user, { education: 'PhD', occupation_description: 'PhD student' })
    await markAiProfileStale(db, user.id)
    user.education = 'PhD'
    await saveMatchSetting(db, user, Object.assign({}, setting, {
      self_view_text: 'PhD student in research, values stable communication'
    }))
    setting = await db.first('user_match_setting', { user_id: user.id })
    const v2 = JSON.parse(setting.ai_match_profile_json)
    const invalidated = shouldInvalidateAiMatchProfile(v1, Object.assign({}, user, setting))

    await updateProfileForUser(db, user, { education: 'Master', occupation_description: 'Internet PM' })
    user.education = 'Master'
    await saveMatchSetting(db, user, Object.assign({}, setting, {
      self_view_text: 'Employed in internet industry, values planning and communication'
    }))
    setting = await db.first('user_match_setting', { user_id: user.id })
    const v3 = JSON.parse(setting.ai_match_profile_json)

    if (!invalidated) throw new Error('stage2 should invalidate v1 profile')
    if (v2.source_profile_version === v1.source_profile_version) throw new Error('v2 fingerprint should differ from v1')

    return passResult(name, {
      personas: `S=${user.id}`,
      expected: 'profile updates + AI profile v1->v2->v3',
      actual: `v1=${v1.source_profile_version.slice(0, 8)} v3=${v3.source_profile_version.slice(0, 8)} stale_ok=${invalidated}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'S' })
  }
}

module.exports = { run, id: 'profile-evolution' }
