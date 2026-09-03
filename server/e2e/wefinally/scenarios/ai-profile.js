'use strict'

const { seedSingle, passResult, failResult } = require('./_helpers')
const { assertProfileComplete } = require('../assertions/profile')
const { applyProfileCorrection } = require('../harness/profileService')

async function run() {
  const name = 'AI-PROFILE'
  try {
    const { db, persona } = await seedSingle(null, 'A', 10)
    const setting = await db.first('user_match_setting', { user_id: persona.user.id })
    const profile = JSON.parse(setting.ai_match_profile_json)
    assertProfileComplete(profile)

    const corrected = await applyProfileCorrection(db, persona.user, {
      text: 'Career stability is not a hard requirement for me'
    })
    assertProfileComplete(corrected)

    return passResult(name, {
      personas: `A=${persona.user.id}`,
      expected: 'schema complete + correction USER_DECLARED',
      actual: `version=${corrected.profile_version || setting.ai_match_profile_version}`
    })
  } catch (error) {
    return failResult(name, error, { personas: 'A' })
  }
}

module.exports = { run, id: 'ai-profile' }
