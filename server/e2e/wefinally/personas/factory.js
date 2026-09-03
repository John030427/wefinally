'use strict'

const { assertSafeOpenidPrefix } = require('../reset/guard')
const { baseUser, baseSetting, getPersonaDef } = require('./catalog')

function validatePersonaInput(input) {
  if (!input || !input.label) throw new Error('persona label required')
  if (!input.runId) throw new Error('runId required')
  return input
}

function createTestUser(input) {
  const spec = validatePersonaInput(input)
  const def = getPersonaDef(spec.label) || {}
  const runId = spec.runId
  const numericId = Number(spec.numericId || spec.id || (100 + spec.label.charCodeAt(0)))
  const openid = `e2e_${String(spec.label).toLowerCase()}_${runId}`
  assertSafeOpenidPrefix(openid)

  const user = baseUser(spec.label, runId, Object.assign({}, def, spec.overrides || {}, {
    id: numericId,
    openid,
    gender: spec.gender != null ? spec.gender : (def.gender || 1)
  }))

  if (def.fixture_journey) user.fixture_journey = def.fixture_journey
  if (spec.fixture_journey) user.fixture_journey = spec.fixture_journey

  const settingOverrides = Object.assign({}, def.setting || {}, spec.setting || {})
  const setting = baseSetting(numericId, settingOverrides)
  if (def.date_pref) setting._e2e_date_pref = def.date_pref
  if (spec.date_pref) setting._e2e_date_pref = spec.date_pref
  if (def.private_note) setting._e2e_private_note = def.private_note

  return { user, setting, def, label: spec.label }
}

function createPersonaPair(labelA, labelB, runId, idBase = 100) {
  const a = createTestUser({ label: labelA, runId, numericId: idBase, fixture_owner_user_id: idBase })
  const b = createTestUser({
    label: labelB,
    runId,
    numericId: idBase + 1,
    fixture_owner_user_id: idBase,
    overrides: { fixture_owner_user_id: idBase }
  })
  b.user.fixture_owner_user_id = idBase
  return { a, b }
}

function seedPersonas(db, runId, labels, options = {}) {
  const idBase = Number(options.idBase || 100)
  const users = []
  const settings = []
  labels.forEach((label, index) => {
    const built = createTestUser({ label, runId, numericId: idBase + index * 2 })
    users.push(built.user)
    settings.push(built.setting)
    db.tables.user.push(built.user)
    db.tables.user_match_setting.push(built.setting)
  })
  return { users, settings }
}

module.exports = {
  validatePersonaInput,
  createTestUser,
  createPersonaPair,
  seedPersonas
}
