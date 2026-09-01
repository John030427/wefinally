const {
  first,
  list,
  byId,
  nextId,
  addWithId,
  updateByDoc,
  authError,
  now,
  listChunksByOwnerIds,
  upsertChunk,
  disableChunks
} = require('../lib/db')
const { currentUser } = require('./user')
const { isVipActive, ageBand, dateOnly } = require('../lib/format')
const { flagEnabled } = require('../lib/flags')
const { MEMBER_STATUS, memberStatus, canUseMatching, normalizeMatchSettingInput } = require('../lib/memberPolicy')
const { rankCandidates, scoreDetailFor } = require('../lib/matchPolicy')
const { compileIntentProfile, normalizeMode } = require('../lib/intentProfile')
const {
  compileAiMatchProfile,
  shouldInvalidateAiMatchProfile,
  sourceFingerprint,
  applyAiProfileCorrection
} = require('../lib/aiMatchProfile')
const { presentAiMatchProfile } = require('../lib/aiMatchProfilePresentation')
const { canonicalPairKey, deliverPair, createCloudClaimStore, CLAIM_STATUS } = require('../lib/matchClaim')
const { shanghaiBusinessClock } = require('../lib/businessClock')
const { indexClaimsForMatching } = require('../lib/matchCycleService')
const { semanticRerank, intentMatchGate } = require('../lib/semanticMatchService')
const { syncUserCorpus, loadCorpusForUserIds } = require('../lib/matchRagCorpus')
const reportTask = require('./reportTask')
const { isMatchOnlyFixture, canUseFixtureForMatch, canEnterFormalCandidatePool } = require('../lib/testFixturePolicy')
const { fixtureSceneBadge } = require('../lib/syntheticPartnerJourney')
const { createMatchTestRunHandlers } = require('../lib/matchTestRunService')
const { sharesCandidateCohort } = require('../lib/matchCohortPolicy')
const {
  qaRunKey,
  shouldBlockUserForClaim,
  shouldExcludeHistoricalClaims
} = require('../lib/qaRegistrationReplayPolicy')

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (err) {
    return null
  }
}

function ragCorpusRepository() {
  return { listChunksByOwnerIds, upsertChunk, disableChunks, now }
}

function loadRagCorpus(userIds) {
  return loadCorpusForUserIds(userIds, ragCorpusRepository())
}

function classifyRagSyncError(error) {
  const message = String(error && error.message || '').toLowerCase()
  const code = String(error && (error.code || error.class) || '').toLowerCase()
  if ((code.includes('invalid') || code.includes('schema'))
    || message.includes('无效') || message.includes('invalid') || message.includes('schema')) {
    return 'corpus_invalid'
  }
  return 'corpus_unavailable'
}

function settingDefaults(row) {
  return row || {
    age_min: null,
    age_max: null,
    height_min: null,
    height_max: null,
    min_education: '',
    like_circle_ids: '',
    like_marry_status: '',
    like_baby_plan: '',
    like_income: '',
    like_house_car: '',
    self_view_text: '',
    target_view_text: '',
    other_requirements: '',
    intent_profile_json: null,
    intent_profile_confirmed_at: null,
    last_edit_time: null
  }
}

function fallbackMatchReportText(viewer, partner) {
  const sameCity = viewer.city && partner.city && viewer.city === partner.city
  const cityText = sameCity
    ? `${viewer.city}同城见面成本较低，适合先由平台客服确认双方意向后安排线下沟通。`
    : `你们当前城市安排需要提前确认，适合先通过平台客服把见面成本和后续落地节奏聊清楚。`
  const eduText = viewer.education && partner.education
    ? `双方学历和成长背景具备可沟通基础，后续重点不在条件罗列，而在生活节奏、婚育计划和家庭边界能否对齐。`
    : '双方资料仍有部分信息可继续完善，后续重点是确认真实相处节奏和长期规划。'
  return [
    `你们这组匹配的现实基础有继续了解的空间。${cityText}`,
    `${eduText}外貌期待只作为自述与偏好的契合参考，不做颜值判断，也不会向对方展示原文。`,
    '建议第一次对接先让客服协助确认三个问题：未来一到三年的城市安排、见面时间和公共场所选择、双方对婚育节奏与父母边界的基本想法。'
  ].join('\n\n')
}

async function transactionDocument(name, prefix, data) {
  const id = await nextId(name)
  const timestamp = now()
  return Object.assign({}, data, {
    _id: `${prefix || name}_${id}`,
    id,
    create_time: data.create_time || timestamp,
    update_time: data.update_time || timestamp
  })
}

function withReportStatus(scoreDetail, status, report) {
  return Object.assign({}, scoreDetail || {}, {
    report_status: status,
    report_provider: report && report.provider ? report.provider : '',
    report_model: report && report.model ? report.model : '',
    report_fallback_used: status !== 1
  })
}

const SCORE_DIMENSIONS = [
  { key: 'baby', max: 30 },
  { key: 'view', max: 25 },
  { key: 'psych', max: 18 },
  { key: 'appearance', max: 10 },
  { key: 'age', max: 15 },
  { key: 'height', max: 12 },
  { key: 'education', max: 8 },
  { key: 'circle', max: 6 },
  { key: 'city', max: 4 }
]

function sameText(a, b) {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  return Boolean(left && right && left === right)
}

function scoreAppearance(viewer, partner) {
  const want = String(viewer.appearance_want || viewer.appearanceWant || '').trim()
  const desc = String(partner.appearance_description || partner.appearanceDescription || '').trim()
  if (!want || !desc) return 6
  const tokens = ['清爽', '自然', '干净', '运动', '阳光', '简洁', '稳重', '温柔', '成熟']
  return tokens.some((token) => want.includes(token) && desc.includes(token)) ? 9 : 6
}

function buildDemoScoreSide(viewer, partner) {
  const sameCity = sameText(viewer.city, partner.city)
  const sameCircle = sameText(viewer.circle_name, partner.circle_name)
    || (viewer.circle_id && partner.circle_id && Number(viewer.circle_id) === Number(partner.circle_id))
  const sameBaby = sameText(viewer.baby_plan, partner.baby_plan)
  const side = {
    baby: sameBaby ? 30 : 22,
    view: 22,
    psych: 12,
    appearance: scoreAppearance(viewer, partner),
    age: 15,
    height: 12,
    education: viewer.education && partner.education ? 8 : 6,
    circle: sameCircle ? 6 : 4,
    city: sameCity ? 4 : 2
  }
  side.psych_score = Math.round((side.psych / 18) * 100)
  side.dimensions = SCORE_DIMENSIONS.reduce((out, item) => {
    out[item.key] = {
      raw_score: side[item.key],
      max_score: item.max,
      compatibility_score: Math.min(100, Math.round((side[item.key] / item.max) * 100))
    }
    return out
  }, {})
  return side
}

function hasScoreDetailSide(scoreDetail) {
  const side = scoreDetail && scoreDetail.side
  if (!side) return false
  return SCORE_DIMENSIONS.some((item) => (
    side[item.key] !== undefined
      || (side.dimensions && side.dimensions[item.key])
  ))
}

function buildDemoScoreDetail(viewer, partner, options) {
  const totalScore = Number((options && options.totalScore) || 88)
  return {
    version: 'algo_evidence_v3',
    algorithm_rank: options && options.algorithmRank ? options.algorithmRank : 1,
    ai_rank: null,
    ai_weight: 0,
    report_status: options && options.reportStatus ? options.reportStatus : 0,
    report_provider: '',
    total: totalScore,
    maxTotal: 100,
    normalizedTotal: totalScore,
    side: buildDemoScoreSide(viewer, partner),
    quality_gate: { pass: true, reasons: [] }
  }
}

function ensureScoreDetailDimensions(scoreDetail, row, viewer, partner) {
  if (hasScoreDetailSide(scoreDetail)) return scoreDetail
  const fallback = buildDemoScoreDetail(viewer, partner, {
    totalScore: Number(row.total_score || row.view_similarity || 88),
    reportStatus: Number(row.ai_report_status || (scoreDetail && scoreDetail.report_status) || 0)
  })
  return Object.assign({}, fallback, scoreDetail || {}, {
    side: fallback.side,
    quality_gate: (scoreDetail && scoreDetail.quality_gate) || fallback.quality_gate
  })
}

function withSemanticRerankDetail(scoreDetail, best, reranked) {
  const baseNormalizedTotal = Number(scoreDetail.normalized_total || scoreDetail.normalizedTotal || 0)
  const semanticScore = Number(best && best.canonical_score)
  const finalMatchScore = reranked && reranked.applied === true && Number.isFinite(semanticScore)
    ? Math.max(0, Math.min(100, Math.round(semanticScore)))
    : Math.max(0, Math.min(100, Math.round(baseNormalizedTotal)))
  return Object.assign({}, scoreDetail, {
    base_normalized_total: baseNormalizedTotal,
    final_match_score: finalMatchScore,
    normalized_total: finalMatchScore,
    normalizedTotal: finalMatchScore,
    ai_rerank: {
      applied: Boolean(reranked && reranked.applied),
      reason: reranked && reranked.reason || '',
      model: reranked && reranked.model || ''
    },
    rag: reranked && reranked.rag ? Object.assign({}, reranked.rag) : null
  })
}

async function getSetting(data, wxContext) {
  const user = await currentUser(wxContext)
  const setting = settingDefaults(await first('user_match_setting', { user_id: user.id }))
  const intentProfile = parseJson(setting.intent_profile_json)
  return Object.assign(setting, {
    intent_profile: intentProfile,
    intent_confirmation_required: Boolean(
      intentProfile
      && intentProfile.mode === 'confirm'
      && !setting.intent_profile_confirmed_at
    )
  })
}

async function cooldown(data, wxContext) {
  const user = await currentUser(wxContext)
  if (memberStatus(user) !== MEMBER_STATUS.APPROVED) {
    return { can_edit: true, canEdit: true, last_edit_time: null, cooldown_days: 7 }
  }
  const setting = settingDefaults(await first('user_match_setting', { user_id: user.id }))
  const last = setting.last_edit_time ? new Date(setting.last_edit_time) : null
  const canEdit = !last || Date.now() - last.getTime() >= 7 * 86400000
  return {
    can_edit: canEdit,
    canEdit,
    last_edit_time: setting.last_edit_time || null,
    cooldown_days: 7
  }
}

async function saveSetting(data, wxContext) {
  const user = await currentUser(wxContext)
  const existing = await first('user_match_setting', { user_id: user.id })
  const normalized = normalizeMatchSettingInput(data)
  const intentProfile = compileIntentProfile(Object.assign({}, user, normalized, {
    mode: normalizeMode()
  }))
  const intentProfileJson = JSON.stringify(intentProfile)
  const alreadyConfirmed = Boolean(
    existing && existing.intent_profile_confirmed_at && existing.intent_profile_json === intentProfileJson
  )
  const profileSource = Object.assign({}, user, normalized, {
    identity_tags: user.identity_tags,
    secondary_circle_ids: user.secondary_circle_ids
  })
  let aiMatchProfile = null
  const existingAi = existing && existing.ai_match_profile_json
    ? (typeof existing.ai_match_profile_json === 'string'
      ? (() => { try { return JSON.parse(existing.ai_match_profile_json) } catch (e) { return null } })()
      : existing.ai_match_profile_json)
    : null
  if (!existingAi || shouldInvalidateAiMatchProfile(existingAi, profileSource)) {
    aiMatchProfile = compileAiMatchProfile(profileSource, {
      intent: intentProfile,
      profile_version: Number(existing && existing.profile_version || 0) + 1,
      confirmed_by_user: alreadyConfirmed,
      corrections: (existingAi && existingAi.corrections) || (existing && existing.ai_profile_corrections) || []
    })
  } else {
    aiMatchProfile = existingAi
  }
  const payload = {
    user_id: user.id,
    age_min: normalized.age_min,
    age_max: normalized.age_max,
    height_min: normalized.height_min,
    height_max: normalized.height_max,
    min_education: normalized.min_education,
    like_circle_ids: Array.isArray(data.like_circle_ids) ? data.like_circle_ids.join(',') : (data.like_circle_ids || ''),
    like_marry_status: data.like_marry_status || '',
    like_baby_plan: data.like_baby_plan || '',
    like_income: data.like_income || '',
    like_house_car: data.like_house_car || '',
    self_view_text: normalized.self_view_text,
    target_view_text: normalized.target_view_text,
    other_requirements: normalized.other_requirements,
    intent_profile_json: intentProfileJson,
    intent_profile_confirmed_at: alreadyConfirmed ? existing.intent_profile_confirmed_at : null,
    psych_profile_json: data.psych_profile_json || data.psych_profile || null,
    ai_match_profile_json: aiMatchProfile,
    ai_match_profile_version: Number(aiMatchProfile.profile_version || 1),
    ai_match_profile_source_version: aiMatchProfile.source_profile_version || sourceFingerprint(profileSource),
    ai_match_profile_status: 'ready',
    ai_match_profile_generated_at: aiMatchProfile.generated_at || now(),
    profile_version: Number(aiMatchProfile.profile_version || 1),
    last_edit_time: memberStatus(user) === MEMBER_STATUS.APPROVED ? now() : null
  }
  const saved = existing
    ? await updateByDoc('user_match_setting', existing, payload)
    : await addWithId('user_match_setting', payload, 'match_setting')
  // Keep the owner-scoped sparse corpus synchronized with the canonical
  // settings write. Retrieval callers use the same repository contract. A
  // missing corpus collection must not turn a successful settings save into a
  // failed user request, and the returned diagnostic is deliberately bounded.
  let ragSync = { synced: true, reason: '' }
  try {
    await syncUserCorpus(user, saved, ragCorpusRepository())
  } catch (error) {
    ragSync = { synced: false, reason: classifyRagSyncError(error) }
  }
  return Object.assign(saved, {
    intent_profile: intentProfile,
    ai_match_profile: aiMatchProfile,
    intent_confirmation_required: intentProfile.requires_confirmation && !alreadyConfirmed,
    rag_sync: ragSync
  })
}

async function confirmIntent(data, wxContext) {
  const user = await currentUser(wxContext)
  const setting = await first('user_match_setting', { user_id: user.id })
  if (!setting || !setting.intent_profile_json) throw new Error('请先保存匹配设置')
  const profile = parseJson(setting.intent_profile_json)
  if (!profile || profile.mode !== 'confirm') throw new Error('当前无需确认 AI 理解')
  const confirmedAt = now()
  await updateByDoc('user_match_setting', setting, {
    intent_profile_confirmed_at: confirmedAt
  })
  return {
    confirmed: true,
    confirmed_at: confirmedAt,
    intent_profile: profile
  }
}

function parseAiProfilePayload(value) {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (error) {
    return null
  }
}

async function getAiProfile(data, wxContext) {
  const user = await currentUser(wxContext)
  const setting = await first('user_match_setting', { user_id: user.id })
  if (!setting || !setting.ai_match_profile_json) {
    return { available: false, presentation: null, confirmed: false, profile_version: 0, corrections: [] }
  }
  const profile = parseAiProfilePayload(setting.ai_match_profile_json)
  return {
    available: true,
    presentation: presentAiMatchProfile(profile),
    confirmed: Boolean(setting.ai_match_profile_confirmed_at || (profile && profile.confirmed_by_user)),
    confirmed_at: setting.ai_match_profile_confirmed_at || null,
    profile_version: Number(setting.ai_match_profile_version || (profile && profile.profile_version) || 0),
    corrections: Array.isArray(setting.ai_profile_corrections)
      ? setting.ai_profile_corrections.map((item) => String(item && item.text || '').slice(0, 200))
      : [],
    source_profile_version: String(setting.ai_match_profile_source_version || (profile && profile.source_profile_version) || '')
  }
}

async function confirmAiProfile(data, wxContext) {
  const user = await currentUser(wxContext)
  const setting = await first('user_match_setting', { user_id: user.id })
  if (!setting) throw new Error('请先保存匹配设置')
  const profile = parseAiProfilePayload(setting.ai_match_profile_json)
  if (!profile) throw new Error('AI 理解尚未生成，请先保存匹配设置')
  const confirmedAt = now()
  const patched = Object.assign({}, profile, { confirmed_by_user: true })
  await updateByDoc('user_match_setting', setting, {
    ai_match_profile_json: patched,
    ai_match_profile_confirmed_at: confirmedAt,
    ai_match_profile_status: 'ready'
  })
  return {
    confirmed: true,
    confirmed_at: confirmedAt,
    presentation: presentAiMatchProfile(patched),
    profile_version: Number(setting.ai_match_profile_version || patched.profile_version || 1)
  }
}

async function correctAiProfile(data, wxContext) {
  const user = await currentUser(wxContext)
  const setting = await first('user_match_setting', { user_id: user.id })
  if (!setting) throw new Error('请先保存匹配设置')
  const correctionText = String(data.correction_text || data.text || '').trim()
  if (!correctionText) throw new Error('请填写纠正意见')
  if (correctionText.length > 200) throw new Error('纠正意见最多200字')
  let profile = parseAiProfilePayload(setting.ai_match_profile_json)
  if (!profile) {
    const intentProfile = parseJson(setting.intent_profile_json) || compileIntentProfile(Object.assign({}, user, setting, { mode: 'automatic' }))
    profile = compileAiMatchProfile(Object.assign({}, user, setting), {
      intent: intentProfile,
      profile_version: Number(setting.profile_version || 0) + 1,
      confirmed_by_user: true
    })
  }
  const corrected = applyAiProfileCorrection(profile, { text: correctionText }, { now: now() })
  const corrections = Array.isArray(setting.ai_profile_corrections) ? setting.ai_profile_corrections.slice() : []
  corrections.push({
    text: correctionText,
    created_at: now(),
    evidence_key: `user_correction.${corrected.correction_count || 1}`
  })
  const updated = await updateByDoc('user_match_setting', setting, {
    ai_match_profile_json: corrected,
    ai_match_profile_version: Number(corrected.profile_version || 1),
    ai_match_profile_source_version: String(corrected.source_profile_version || setting.ai_match_profile_source_version || ''),
    ai_match_profile_status: 'ready',
    ai_match_profile_confirmed_at: setting.ai_match_profile_confirmed_at || now(),
    ai_profile_corrections: corrections,
    profile_version: Number(corrected.profile_version || 1)
  })
  return {
    corrected: true,
    presentation: presentAiMatchProfile(corrected),
    profile_version: corrected.profile_version,
    previous_version: Number(profile.profile_version || 1),
    evidence_key: `user_correction.${corrected.correction_count || 1}`,
    corrections: corrections.map((item) => String(item.text || '').slice(0, 200))
  }
}

async function formatMatch(row, viewer) {
  if (!row) return null
  const partner = await byId('user', row.match_user_id)
  const vip = isVipActive(viewer)
  if (!partner) return null
  const canViewReport = canUseMatching({ member_status: memberStatus(viewer), vipActive: vip })
  if (!canViewReport) {
    return {
      id: row.id,
      matchId: row.id,
      status: 'matched',
      locked: true,
      match_date: dateOnly(row.match_date),
      match_type: row.match_type || '',
      message: memberStatus(viewer) === MEMBER_STATUS.APPROVED
        ? '请先开通 VIP 查看完整匹配详情'
        : '会员审核通过后才能查看匹配详情'
    }
  }
  const scoreDetail = ensureScoreDetailDimensions(parseJson(row.score_detail_json), row, viewer, partner)
  const fallbackReportUsed = scoreDetail && scoreDetail.report_fallback_used === true
  const rowAiReportText = row.ai_report_text || ''
  const visibleAiReportText = fallbackReportUsed ? '' : rowAiReportText
  const localReportText = row.local_report_text || (fallbackReportUsed ? rowAiReportText : '')
  const task = await reportTask.findTaskForMatch(row)
  const taskSide = task && Number(task.user_ids.a) === Number(row.user_id) ? 'a' : 'b'
  const taskView = reportTask.publicTask(task, taskSide)
  const base = {
    id: row.id,
    matchId: row.id,
    status: 'matched',
    match_date: dateOnly(row.match_date),
    match_type: row.match_type || '',
    view_similarity: row.view_similarity || 0,
    compatibilityScore: row.view_similarity || 0,
    total_score: Number(row.total_score || 0),
    totalScore: Number(row.total_score || 0),
    score_detail: scoreDetail,
    ai_report_text: taskView.report ? taskView.report.summary : visibleAiReportText,
    ai_report: taskView.report || null,
    ai_report_status: taskView.status,
    ai_report_error: taskView.error_message || '',
    ai_report_time: taskView.generated_at || row.ai_report_time || null,
    ai_report_task: taskView,
    local_report_text: localReportText,
    matched_user_id: row.match_user_id,
    match_user_id: row.match_user_id,
    match_only_fixture: isMatchOnlyFixture(partner),
    test_data_badge: fixtureSceneBadge(partner),
    fixture_journey: Number(partner.is_test_fixture || 0) === 1 ? String(partner.fixture_journey || '') : ''
  }
  if (!vip) return base
  return Object.assign(base, {
    gender: partner.gender,
    birth_year: partner.birth_year,
    city: partner.city,
    age_band: ageBand(partner.birth_year),
    height_range: partner.height_range,
    education: partner.education,
    circle_name: partner.circle_name || '',
    baby_plan: partner.baby_plan
  })
}

async function latest(data, wxContext) {
  const user = await currentUser(wxContext)
  const rows = await list('user_match_log', { user_id: user.id }, 100)
  rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  return formatMatch(rows[0], user)
}

async function matchList(data, wxContext) {
  const user = await currentUser(wxContext)
  const rows = await list('user_match_log', { user_id: user.id }, 100)
  rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  const out = []
  for (let i = 0; i < rows.length; i += 1) {
    const item = await formatMatch(rows[i], user)
    if (item) out.push(item)
  }
  return { list: out, total: out.length }
}

async function detail(data, wxContext) {
  const user = await currentUser(wxContext)
  const row = await byId('user_match_log', data.id || data.matchId)
  if (!row || Number(row.user_id) !== Number(user.id)) throw new Error('匹配记录不存在')
  const canViewReport = canUseMatching({ member_status: memberStatus(user), vipActive: isVipActive(user) })
  if (canViewReport) await reportTask.ensureTaskForMatch(row, 'history_open')
  const item = await formatMatch(row, user)
  const ticket = await first('match_handoff_ticket', { match_log_id: row.id, user_id: user.id })
  item.handoff_ticket = ticket || null
  return item
}

async function handoff(data, wxContext) {
  const user = await currentUser(wxContext)
  if (!canUseMatching({ member_status: memberStatus(user), vipActive: isVipActive(user) })) {
    throw authError(memberStatus(user) === MEMBER_STATUS.APPROVED ? '请先开通 VIP' : '会员审核通过后才能申请奔现对接')
  }
  const matchId = Number(data.match_log_id || data.matchLogId || data.id || 0)
  const matchUserId = Number(data.match_user_id || data.matchUserId || data.matched_user_id || 0)
  let row = matchId ? await byId('user_match_log', matchId) : null
  if (!row && matchUserId) {
    row = await first('user_match_log', { user_id: user.id, match_user_id: matchUserId })
  }
  if (!row || Number(row.user_id) !== Number(user.id)) throw new Error('匹配记录不存在，请返回匹配记录页重新进入')
  const existing = await first('match_handoff_ticket', { user_id: user.id, match_log_id: row.id })
  if (existing) return existing
  return addWithId('match_handoff_ticket', {
    match_log_id: row.id,
    user_id: user.id,
    match_user_id: row.match_user_id,
    status: 'submitted',
    service_note: ''
  }, 'handoff')
}

async function generateReport(data, wxContext) {
  return reportTask.create(data, wxContext)
}

async function seedDemoCandidate(user) {
  const gender = Number(user.gender) === 1 ? 2 : 1
  const partner = await addWithId('user', {
    openid: `cloud_demo_candidate_${user.id}_${Date.now()}`,
    gender,
    birth_year: gender === 2 ? 1997 : 1992,
    height_range: gender === 2 ? '160-170cm' : '170-180cm',
    education: user.education || '本科',
    circle_id: user.circle_id || 1,
    circle_name: user.circle_name || '',
    city: user.city || '深圳',
    marry_status: '未婚',
    baby_plan: user.baby_plan || '3-5年内',
    income_range: user.income_range || '',
    house_car: user.house_car || '',
    status: 1,
    is_vip: 1,
    vip_expire_time: new Date(Date.now() + 30 * 86400000),
    promote_partner_id: 0,
    promote_code: '',
    free_member: 1,
    free_source: 'cloud_demo_seed',
    appearance_description: '干净清爽，日常穿搭简洁自然',
    appearance_want: '',
    appearance_tags: '',
    appearance_want_tags: '',
    last_match_setting_time: null
  }, 'user')
  await addWithId('user_match_setting', {
    user_id: partner.id,
    age_min: null,
    age_max: null,
    height_min: null,
    height_max: null,
    min_education: '',
    like_circle_ids: '',
    like_marry_status: '未婚',
    like_baby_plan: '',
    self_view_text: '我认真看待长期关系，重视真诚、责任、边界和稳定沟通，希望通过平台慢慢了解。',
    target_view_text: '希望对方真诚稳定，愿意共同规划生活，也能尊重彼此节奏和现实安排。',
    psych_profile_json: null,
    last_edit_time: null
  }, 'match_setting')
  return partner
}

async function start(data, wxContext) {
  const enabled = await flagEnabled('cloud_demo_match_enabled')
  if (!enabled) {
    const err = new Error('测试匹配未开启，请在云数据库 system_configs 配置 cloud_demo_match_enabled=true')
    err.code = 403
    throw err
  }
  const user = await currentUser(wxContext)
  if (!canUseMatching({ member_status: memberStatus(user), vipActive: isVipActive(user) })) {
    throw authError(memberStatus(user) === MEMBER_STATUS.APPROVED ? '请先开通 VIP' : '会员审核通过后才能进入匹配流程')
  }
  const currentSetting = await first('user_match_setting', { user_id: user.id })
  const intentGate = intentMatchGate(currentSetting)
  if (intentGate) {
    const err = new Error(intentGate.message)
    err.code = intentGate.code
    err.clarification_questions = intentGate.clarification_questions
    throw err
  }
  const clock = shanghaiBusinessClock(now())
  const allClaims = await list('match_claim', { status: CLAIM_STATUS }, 500)
  const existingMatches = await list('user_match_log', { user_id: user.id }, 100)
  const { historicalClaimsByPair } = indexClaimsForMatching(allClaims, clock.matchCycleId || '')
  existingMatches.forEach((row) => {
    try {
      const pairKey = String(row.pair_key || canonicalPairKey(user.id, row.match_user_id))
      if (!historicalClaimsByPair.has(pairKey)) historicalClaimsByPair.set(pairKey, [])
      historicalClaimsByPair.get(pairKey).push(Object.assign({}, row, { pair_key: pairKey }))
    } catch (err) { /* malformed historical rows remain unavailable candidates */ }
  })
  const candidates = (await list('user', { status: 1 }, 100))
    .filter((item) => memberStatus(item) === MEMBER_STATUS.APPROVED)
    .filter((item) => canEnterFormalCandidatePool(item))
    .filter((item) => canUseFixtureForMatch(user, item, now()))
    .filter((item) => sharesCandidateCohort(user, item))
  if (data.dev_seed_current_user_candidates && candidates.length === 0) {
    candidates.push(await seedDemoCandidate(user))
  }
  const settingRows = await list('user_match_setting', {}, 200)
  const settingsByUserId = {}
  settingRows.forEach((setting) => {
    settingsByUserId[String(setting.user_id)] = setting
  })
  const claims = allClaims
  const claimBlockedIds = []
  if (clock.isMatchDay && clock.matchCycleId) {
    const usersById = new Map([[Number(user.id), user]])
    candidates.forEach((candidate) => usersById.set(Number(candidate.id), candidate))
    claims.forEach((claim) => {
      if (String(claim.match_cycle_id || '') === clock.matchCycleId && !Number(claim.qa_cycle || 0)) {
        ;[Number(claim.user_id), Number(claim.match_user_id)].forEach((id) => {
          const claimedUser = usersById.get(id)
          if (!claimedUser || shouldBlockUserForClaim(claim, claimedUser)) claimBlockedIds.push(id)
        })
      }
    })
  }
  if (claimBlockedIds.includes(Number(user.id))) {
    return {
      matched: 0,
      users: 0,
      evaluated_candidates: 0,
      message: '本轮已成功匹配，请等待下一匹配窗口'
    }
  }
  const blockedIds = new Set(claimBlockedIds)
  const ranked = rankCandidates(user, candidates, settingsByUserId, { blockedIds })
    .filter((item) => {
      try {
        const pairClaims = historicalClaimsByPair.get(canonicalPairKey(user.id, item.candidate.id)) || []
        return !shouldExcludeHistoricalClaims(pairClaims, user, item.candidate)
      } catch (err) {
        return false
      }
    })
  // Legacy contract: const reranked = await semanticRerank(ranked, user, settingsByUserId)
  const reranked = await semanticRerank(ranked, user, settingsByUserId, {
    loadCorpus: loadRagCorpus
  })
  if (!reranked || reranked.applied !== true) {
    return {
      matched: 0,
      users: ranked.length + 1,
      evaluated_candidates: ranked.length,
      reason_code: reranked && reranked.reason || 'ai_rerank_unavailable',
      message: 'AI匹配暂不可用，请稍后重试'
    }
  }
  const eligible = reranked.ranked.filter((item) => item.quality.pass)
  if (!eligible.length) {
    return {
      matched: 0,
      users: ranked.length + 1,
      evaluated_candidates: ranked.length,
      rejected_by_quality: ranked.filter((item) => !item.quality.pass).length,
      message: ranked.length ? '本轮暂无通过严格质量门槛的匹配' : '暂无新的可用候选'
    }
  }
  const today = dateOnly(new Date())
  const claimStore = createCloudClaimStore()
  for (let index = 0; index < eligible.length; index += 1) {
    const best = eligible[index]
    const partner = best.candidate
    const pairKey = canonicalPairKey(user.id, partner.id)
    const qaMatchRunKey = qaRunKey(user, partner)
    const claimInput = {
      userId: user.id,
      partnerId: partner.id,
      requestId: String(data.request_id || `match:${user.id}:${Date.now()}`),
      matchCycleId: clock.matchCycleId || '',
      qaMatchRunKey,
      qaUserRunId: qaMatchRunKey ? user.qa_match_run_id : '',
      qaPartnerRunId: qaMatchRunKey ? partner.qa_match_run_id : ''
    }
    const abTestRunId = String(partner.ab_test_run_id || '')
    const algorithmRank = ranked.findIndex((item) => Number(item.candidate.id) === Number(partner.id)) + 1
    const detailJsonA = withSemanticRerankDetail(Object.assign(scoreDetailFor(best, 'a', algorithmRank), {
        ai_rank: best.ai_rank || null,
        ai_weight: best.ai_weight || 0,
        semantic_score: best.semantic_score || null,
        a_to_b_semantic_score: best.a_to_b_semantic_score || null,
        b_to_a_semantic_score: best.b_to_a_semantic_score || null,
        mutual_semantic_score: best.mutual_semantic_score || null,
        semantic_strengths: best.semantic_strengths || [],
        semantic_confidence: best.semantic_confidence || null,
        data_completeness: best.data_completeness || null,
        asymmetric_risks: best.asymmetric_risks || [],
        confirmation_questions: best.confirmation_questions || [],
        semantic_strength_evidence_keys: best.semantic_strength_evidence_keys || [],
        semantic_risk_evidence_keys: best.semantic_risk_evidence_keys || [],
        semantic_missing_categories: best.semantic_missing_categories || [],
        bilateral_fit: best.bilateral_fit || null,
        bilateral_mutual_score: best.bilateral_fit ? Number(best.bilateral_fit.mutual_score || 0) : null
    }), best, reranked)
    const detailJsonB = withSemanticRerankDetail(Object.assign(scoreDetailFor(best, 'b', algorithmRank), {
        ai_rank: best.ai_rank || null,
        ai_weight: best.ai_weight || 0,
        semantic_score: best.semantic_score || null,
        a_to_b_semantic_score: best.a_to_b_semantic_score || null,
        b_to_a_semantic_score: best.b_to_a_semantic_score || null,
        mutual_semantic_score: best.mutual_semantic_score || null,
        semantic_strengths: best.semantic_strengths || [],
        semantic_confidence: best.semantic_confidence || null,
        data_completeness: best.data_completeness || null,
        asymmetric_risks: best.asymmetric_risks || [],
        confirmation_questions: best.confirmation_questions || [],
        semantic_strength_evidence_keys: best.semantic_strength_evidence_keys || [],
        semantic_risk_evidence_keys: best.semantic_risk_evidence_keys || [],
        semantic_missing_categories: best.semantic_missing_categories || [],
        bilateral_fit: best.bilateral_fit || null,
        bilateral_mutual_score: best.bilateral_fit ? Number(best.bilateral_fit.mutual_score || 0) : null
    }), best, reranked)
    const logA = await transactionDocument('user_match_log', 'match_log', {
        user_id: user.id,
        match_user_id: partner.id,
        view_similarity: best.viewSimilarity,
        total_score: best.scoreA.total,
        score_detail_json: JSON.stringify(detailJsonA),
        score_version: 'algo_evidence_v3',
        ai_report_text: '',
        ai_report_status: 0,
        ai_report_error: '',
        ai_report_time: null,
        local_report_text: fallbackMatchReportText(user, partner),
        match_date: today,
        match_type: abTestRunId ? 'A/B内测' : '双向算法测试',
        ab_test_run_id: abTestRunId,
      pair_key: pairKey
    })
    const logB = await transactionDocument('user_match_log', 'match_log', {
        user_id: partner.id,
        match_user_id: user.id,
        view_similarity: best.viewSimilarity,
        total_score: best.scoreB.total,
        score_detail_json: JSON.stringify(detailJsonB),
        score_version: 'algo_evidence_v3',
        ai_report_text: '',
        ai_report_status: 0,
        ai_report_error: '',
        ai_report_time: null,
        local_report_text: fallbackMatchReportText(partner, user),
        match_date: today,
        match_type: abTestRunId ? 'A/B内测' : '双向算法测试',
        ab_test_run_id: abTestRunId,
      pair_key: pairKey
    })
    const deliveredAt = now()
    const claimAudit = await transactionDocument('match_claim_audit', 'match_audit', {
      request_id: claimInput.requestId,
      pair_key: pairKey,
      user_id: user.id,
      match_user_id: partner.id,
      status: 'matched',
      action: 'claim_and_deliver',
      ...(reranked && reranked.rag ? { rag: Object.assign({}, reranked.rag) } : {}),
      ...(qaMatchRunKey ? { qa_match_run_key: qaMatchRunKey } : {})
    })
    const delivery = await deliverPair(Object.assign({}, claimInput, {
      logA,
      logB,
      audit: claimAudit,
      userDoc: user,
      partnerDoc: partner,
      userPatch: {
        match_status: 'matched',
        matched_partner_id: partner.id,
        matched_at: deliveredAt,
        update_time: deliveredAt
      },
      partnerPatch: {
        match_status: 'matched',
        matched_partner_id: user.id,
        matched_at: deliveredAt,
        update_time: deliveredAt
      }
    }), claimStore)
    if (!delivery.delivered) continue
    const deliveredLog = delivery.replayed
      ? await byId('user_match_log', delivery.claim.match_log_ids.a)
      : logA
    if (deliveredLog) await reportTask.ensureTaskForMatch(deliveredLog, 'auto').catch(() => null)
    return {
      matched: 1,
      users: ranked.length + 1,
      evaluated_candidates: ranked.length,
      match_id: deliveredLog ? deliveredLog.id : delivery.claim.match_log_ids.a,
      match_user_id: partner.id,
      view_similarity: best.viewSimilarity,
      mutual_score: best.mutualScore,
      pair_key: delivery.claim.pair_key,
      algorithm_version: 'algo_evidence_v3'
    }
  }
  return {
    matched: 0,
    users: ranked.length + 1,
    evaluated_candidates: ranked.length,
    message: '可用候选已被其他匹配占用，请稍后再试'
  }
}

module.exports = {
  getSetting,
  cooldown,
  saveSetting,
  confirmIntent,
  getAiProfile,
  confirmAiProfile,
  correctAiProfile,
  latest,
  matchList,
  detail,
  handoff,
  generateReport,
  start,
  ...createMatchTestRunHandlers({
    currentUser,
    first,
    list,
    byId,
    addWithId,
    acquireRun: require('../lib/db').acquireMatchTestRun,
    claimRun: require('../lib/db').claimMatchTestRun,
    completeRun: require('../lib/db').completeMatchTestRun,
    now,
    publicEnabled: () => flagEnabled('match_test_run_public_enabled'),
    semanticRerank,
    loadCorpus: loadRagCorpus
  })
}
