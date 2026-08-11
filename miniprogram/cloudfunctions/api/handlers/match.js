const { first, list, byId, addWithId, updateByDoc, authError, now } = require('../lib/db')
const { currentUser } = require('./user')
const { isVipActive, ageBand, dateOnly } = require('../lib/format')
const { flagEnabled } = require('../lib/flags')
const { MEMBER_STATUS, memberStatus, canUseMatching, normalizeMatchSettingInput } = require('../lib/memberPolicy')
const { rankCandidates, scoreDetailFor } = require('../lib/matchPolicy')
const { compileIntentProfile, normalizeMode } = require('../lib/intentProfile')
const reportTask = require('./reportTask')

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (err) {
    return null
  }
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
    version: 'algo_evidence_v2',
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

async function getSetting(data, wxContext) {
  const user = await currentUser(wxContext)
  return settingDefaults(await first('user_match_setting', { user_id: user.id }))
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
    last_edit_time: memberStatus(user) === MEMBER_STATUS.APPROVED ? now() : null
  }
  const saved = existing
    ? await updateByDoc('user_match_setting', existing, payload)
    : await addWithId('user_match_setting', payload, 'match_setting')
  return Object.assign(saved, {
    intent_profile: intentProfile,
    intent_confirmation_required: intentProfile.requires_confirmation && !alreadyConfirmed
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
    match_user_id: row.match_user_id
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
  const existingMatches = await list('user_match_log', { user_id: user.id }, 100)
  const seenPartnerIds = {}
  existingMatches.forEach((row) => {
    seenPartnerIds[Number(row.match_user_id)] = true
  })
  const candidates = (await list('user', { status: 1 }, 100))
    .filter((item) => memberStatus(item) === MEMBER_STATUS.APPROVED)
  if (data.dev_seed_current_user_candidates && candidates.length === 0) {
    candidates.push(await seedDemoCandidate(user))
  }
  const settingRows = await list('user_match_setting', {}, 200)
  const settingsByUserId = {}
  settingRows.forEach((setting) => {
    settingsByUserId[String(setting.user_id)] = setting
  })
  const blockedIds = new Set(Object.keys(seenPartnerIds).map(Number))
  const ranked = rankCandidates(user, candidates, settingsByUserId, { blockedIds })
  const best = ranked.find((item) => item.quality.pass)
  if (!best) {
    return {
      matched: 0,
      users: ranked.length + 1,
      evaluated_candidates: ranked.length,
      rejected_by_quality: ranked.filter((item) => !item.quality.pass).length,
      message: ranked.length ? '本轮暂无通过严格质量门槛的匹配' : '暂无新的可用候选'
    }
  }
  const partner = best.candidate
  const abTestRunId = String(partner.ab_test_run_id || '')
  const today = dateOnly(new Date())
  const detailJsonA = scoreDetailFor(best, 'a', ranked.indexOf(best) + 1)
  const detailJsonB = scoreDetailFor(best, 'b', ranked.indexOf(best) + 1)
  const logA = await addWithId('user_match_log', {
    user_id: user.id,
    match_user_id: partner.id,
    view_similarity: best.viewSimilarity,
    total_score: best.scoreA.total,
    score_detail_json: JSON.stringify(detailJsonA),
    score_version: 'algo_evidence_v2',
    ai_report_text: '',
    ai_report_status: 0,
    ai_report_error: '',
    ai_report_time: null,
    local_report_text: fallbackMatchReportText(user, partner),
    match_date: today,
    match_type: abTestRunId ? 'A/B内测' : '双向算法测试',
    ab_test_run_id: abTestRunId
  }, 'match_log')
  const logB = await addWithId('user_match_log', {
    user_id: partner.id,
    match_user_id: user.id,
    view_similarity: best.viewSimilarity,
    total_score: best.scoreB.total,
    score_detail_json: JSON.stringify(detailJsonB),
    score_version: 'algo_evidence_v2',
    ai_report_text: '',
    ai_report_status: 0,
    ai_report_error: '',
    ai_report_time: null,
    local_report_text: fallbackMatchReportText(partner, user),
    match_date: today,
    match_type: abTestRunId ? 'A/B内测' : '双向算法测试',
    ab_test_run_id: abTestRunId
  }, 'match_log')
  await reportTask.ensureTaskForMatch(logA, 'auto')
  return {
    matched: 1,
    users: ranked.length + 1,
    evaluated_candidates: ranked.length,
    match_id: logA.id,
    match_user_id: partner.id,
    view_similarity: best.viewSimilarity,
    mutual_score: best.mutualScore,
    algorithm_version: 'algo_evidence_v2'
  }
}

module.exports = {
  getSetting,
  cooldown,
  saveSetting,
  confirmIntent,
  latest,
  matchList,
  detail,
  handoff,
  generateReport,
  start
}
