'use strict'

const { createMemoryDb, newRunId } = require('../harness/memoryDb')
const { createServices } = require('../harness/serviceFactory')
const { createPersonaPair, createTestUser, seedPersonas } = require('../personas/factory')
const { saveMatchSetting } = require('../harness/profileService')
const { compileAiMatchProfile } = require('../../../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')

function applyCoordinationIdentity(pair) {
  pair.a.user.account_mode = 'internal_qa'
  pair.a.user.profile_origin = 'real_user'
  pair.a.user.is_test_fixture = 0
  pair.a.user.qa_test_run_enabled = 1
  pair.b.user.fixture_owner_user_id = pair.a.user.id
  if (pair.b.def && pair.b.def.fixture_journey) {
    pair.b.user.fixture_journey = pair.b.def.fixture_journey
  }
}

async function buildLab(options = {}) {
  const runId = options.runId || newRunId()
  const db = createMemoryDb({ runId, now: options.now })
  const services = createServices(db, options.services || {})
  return { runId, db, services }
}

async function seedPair(runId, labelA, labelB, idBase, options = {}) {
  const rid = runId || newRunId()
  const db = createMemoryDb({ runId: rid })
  const pair = createPersonaPair(labelA, labelB, rid, idBase)
  if (options.coordination) applyCoordinationIdentity(pair)
  db.tables.user.push(pair.a.user, pair.b.user)
  db.tables.user_match_setting.push(pair.a.setting, pair.b.setting)

  for (const side of [pair.a, pair.b]) {
    const aiProfile = compileAiMatchProfile(Object.assign({}, side.user, side.setting))
    side.setting.ai_match_profile_json = JSON.stringify(aiProfile)
    side.setting.ai_match_profile_version = 1
    await saveMatchSetting(db, side.user, side.setting)
  }

  const services = createServices(db)
  return { db, services, pair, runId: rid }
}

async function seedSingle(runId, label, idBase = 200) {
  const rid = runId || newRunId()
  const db = createMemoryDb({ runId: rid })
  const built = createTestUser({ label, runId: rid, numericId: idBase })
  db.tables.user.push(built.user)
  db.tables.user_match_setting.push(built.setting)
  const aiProfile = compileAiMatchProfile(Object.assign({}, built.user, built.setting))
  built.setting.ai_match_profile_json = JSON.stringify(aiProfile)
  await saveMatchSetting(db, built.user, built.setting)
  const services = createServices(db)
  return { db, services, persona: built, runId: rid }
}

function failResult(name, error, extras = {}) {
  return Object.assign({
    name,
    pass: false,
    error: error && (error.message || String(error)),
    actual: error && (error.message || String(error))
  }, extras)
}

function passResult(name, extras = {}) {
  return Object.assign({ name, pass: true }, extras)
}

module.exports = {
  buildLab,
  seedPair,
  seedSingle,
  seedPersonas,
  applyCoordinationIdentity,
  failResult,
  passResult
}
