'use strict'

const { rankCandidates } = require('../../../../miniprogram/cloudfunctions/api/lib/matchPolicy')
const { executeFormalMatching } = require('../../../../miniprogram/cloudfunctions/api/lib/formalMatching')
const { scoreBilateralProfiles } = require('../../../../miniprogram/cloudfunctions/api/lib/bilateralNeedsMatch')
const { canEnterFormalCandidatePool } = require('../../../../miniprogram/cloudfunctions/api/lib/testIdentityPolicy')
const { compileAiMatchProfile } = require('../../../../miniprogram/cloudfunctions/api/lib/aiMatchProfile')
const { presentAiMatchReport } = require('../../../../miniprogram/cloudfunctions/api/lib/aiMatchReportPresentation')

function parseAiProfile(setting) {
  if (!setting || !setting.ai_match_profile_json) return null
  return typeof setting.ai_match_profile_json === 'string'
    ? JSON.parse(setting.ai_match_profile_json)
    : setting.ai_match_profile_json
}

function attachAiProfiles(settings) {
  return settings.map((row) => {
    const copy = Object.assign({}, row)
    copy.ai_match_profile = parseAiProfile(row)
    return copy
  })
}

async function runMatchPipeline(db, userA, userB, aiProvider, options = {}) {
  const settings = await db.list('user_match_setting')
  const settingsById = {}
  for (const row of settings) settingsById[row.user_id] = row

  const candidates = [userB].filter((c) => canEnterFormalCandidatePool(c) || options.includeFixtures)
  const stageLog = []

  const ranked = rankCandidates(userA, candidates, settingsById, { referenceYear: 2026 })
  stageLog.push({ stage: 'hard_gate_rank', input: 1, output: ranked.length })

  if (ranked.length === 0) {
    return { matched: false, stageLog, reason: 'AGE_HARD_GATE' }
  }

  const settingA = settingsById[userA.id]
  const settingB = settingsById[userB.id]
  const profileA = parseAiProfile(settingA) || compileAiMatchProfile(Object.assign({}, userA, settingA || {}))
  const profileB = parseAiProfile(settingB) || compileAiMatchProfile(Object.assign({}, userB, settingB || {}))
  const bilateral = scoreBilateralProfiles(profileA, profileB)
  stageLog.push({ stage: 'bilateral', mutual_score: bilateral.mutual_score })

  let rerank = ranked
  if (aiProvider && aiProvider.semanticRerank) {
    rerank = (await aiProvider.semanticRerank(ranked)).ranked || ranked
    stageLog.push({ stage: 'ai_rerank', applied: true })
  }

  const top = rerank[0]
  const matched = Boolean(top && top.quality && top.quality.pass)
  return {
    matched,
    top,
    bilateral,
    stageLog,
    reason: matched ? 'MATCH' : ((top && top.quality && top.quality.reasons && top.quality.reasons[0]) || 'QUALITY_GATE')
  }
}

async function runFormalMatchBatch(db, aiProvider, options = {}) {
  const users = await db.list('user')
  const pool = users.filter((u) => options.includeFixtures || canEnterFormalCandidatePool(u))
  const settings = await db.list('user_match_setting')

  return executeFormalMatching({
    clock: options.clock || { businessDate: '2026-08-20', matchType: 'Wed', matchCycleId: '2026-08-20-WED' },
    deps: {
      list: async (name) => {
        if (name === 'user') return pool
        if (name === 'user_match_setting') return settings
        if (name === 'match_claim') return db.tables.match_claim || []
        return db.tables[name] || []
      },
      semanticRerank: aiProvider ? (ranked) => aiProvider.semanticRerank(ranked) : async (ranked) => ({ applied: false, ranked }),
      deliverPair: options.deliverPair || (async () => ({ delivered: false })),
      ensureReportTask: options.ensureReportTask || (async () => null),
      addWithId: db.addWithId.bind(db)
    }
  })
}

function buildMatchReport() {
  return presentAiMatchReport({
    summary: 'High mutual fit across values and lifestyle.',
    strengths: ['Values alignment', 'Shared life planning', 'Same city convenience'],
    differences: ['Pace needs offline confirmation'],
    data_limitations: ['Some fields may be missing; no interaction history yet.'],
    ai_generated: true,
    provider: 'e2e_fixture',
    model: 'hy3'
  })
}

async function createMatchLog(db, userA, userB, overrides = {}) {
  return db.addWithId('user_match_log', Object.assign({
    user_id: userA.id,
    match_user_id: userB.id,
    status: 'matched',
    match_type: 'E2E Test',
    match_date: '2026-08-20',
    total_score: 128,
    normalized_total: 92
  }, overrides), 'user_match_log')
}

module.exports = {
  runMatchPipeline,
  runFormalMatchBatch,
  buildMatchReport,
  createMatchLog,
  parseAiProfile,
  attachAiProfiles
}
