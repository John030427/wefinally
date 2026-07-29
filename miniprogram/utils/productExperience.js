const PROFILE_FIELDS = [
  { key: 'gender', label: '性别' },
  { key: 'birth_year', label: '出生年份' },
  { key: 'city', label: '所在城市' },
  { key: 'education', label: '学历' },
  { key: 'marry_status', label: '婚姻状态' },
  { key: 'baby_plan', label: '生育计划' },
  { key: 'height_range', label: '身高区间' },
  { key: 'occupation', label: '职业信息' },
  { key: 'appearance_description', label: '外貌描述', recommended: true },
  { key: 'self_view_text', label: '我的价值观' },
  { key: 'target_view_text', label: '期待的关系' }
]

const MATCH_DIMENSIONS = [
  { key: 'baby', label: '婚育节奏', max: 30 },
  { key: 'view', label: '价值观', max: 25 },
  { key: 'psych', label: '关系偏好', max: 18 },
  { key: 'appearance', label: '外貌偏好', max: 10 },
  { key: 'age', label: '年龄阶段', max: 15 },
  { key: 'height', label: '身高区间', max: 12 },
  { key: 'education', label: '学历偏好', max: 8 },
  { key: 'circle', label: '职业圈层', max: 6 },
  { key: 'city', label: '城市距离', max: 4 }
]

function text(value) {
  return String(value === null || value === undefined ? '' : value).trim()
}

function settingOf(profile) {
  return (profile && (profile.match_settings || profile.matchSetting)) || {}
}

function fieldPresent(profile, key) {
  const user = profile || {}
  const setting = settingOf(user)
  if (key === 'occupation') {
    return Number(user.circle_id || 0) > 0 || Boolean(text(user.occupation_description))
  }
  if (key === 'self_view_text' || key === 'target_view_text') {
    return Boolean(text(user[key] || setting[key]))
  }
  if (key === 'gender') return Number(user.gender || 0) > 0 || Boolean(text(user.gender))
  return Boolean(text(user[key]))
}

function buildProfileReadiness(profile) {
  const completed = PROFILE_FIELDS.filter((field) => fieldPresent(profile, field.key))
  const missing = PROFILE_FIELDS.filter((field) => !fieldPresent(profile, field.key))
  const missingRequired = missing.filter((field) => field.recommended !== true)
  const percent = Math.round((completed.length / PROFILE_FIELDS.length) * 100)
  return {
    percent,
    completedCount: completed.length,
    totalCount: PROFILE_FIELDS.length,
    isComplete: missingRequired.length === 0,
    missingKeys: missing.map((field) => field.key),
    missingLabels: missing.map((field) => field.label),
    missingText: missing.map((field) => field.label).join('、'),
    hint: missingRequired.length
      ? `还差 ${missingRequired.slice(0, 3).map((field) => field.label).join('、')}${missingRequired.length > 3 ? '等' : ''}`
      : (missing.length ? '资料已就绪，可继续补充推荐项' : '资料已就绪，可用于审核与匹配')
  }
}

function journey(key, eyebrow, title, description, actionText, url) {
  return { key, eyebrow, title, description, actionText, url }
}

function buildJourneyState(input) {
  const data = input || {}
  const readiness = data.readiness || buildProfileReadiness(data.profile || {})
  if (!readiness.isComplete) {
    const settingKeys = ['self_view_text', 'target_view_text']
    const needsBaseProfile = readiness.missingKeys.some((key) => !settingKeys.includes(key))
    return journey(
      'complete_profile',
      '第 1 步 · 建立可信资料',
      '先补全影响匹配的资料',
      readiness.hint,
      '继续完善',
      needsBaseProfile ? '/pages/register/register?edit=1' : '/pages/match-setting/match-setting'
    )
  }
  if (String(data.memberStatus || '') !== 'approved') {
    return journey(
      'member_review',
      '第 2 步 · 人工审核',
      '完成会员真实性审核',
      '审核制能减少虚假资料，审核状态可随时查看',
      '查看审核进度',
      '/pages/member-application/member-application'
    )
  }
  if (!data.isVip) {
    return journey(
      'activate_membership',
      '第 3 步 · 开启匹配',
      '开通本期匹配资格',
      '每周三、周五由系统按双向条件自动匹配',
      '查看会员方案',
      '/pages/vip/vip'
    )
  }
  if (data.latestMatch && (data.latestMatch.id || data.latestMatch.matchId)) {
    return journey(
      'review_match',
      '当前 · 有一份新结果',
      '先看为什么匹配',
      '重点核对优势、差异和数据限制，再决定是否推进',
      '查看匹配理由',
      `/pages/match-detail/match-detail?id=${data.latestMatch.id || data.latestMatch.matchId}`
    )
  }
  return journey(
    'waiting_match',
    '当前 · 等待系统匹配',
    '你的资料已进入匹配池',
    data.nextMatchText ? `下次匹配：${data.nextMatchText}` : '每周三、周五自动匹配，无需手动刷新',
    '检查择偶配置',
    '/pages/match-setting/match-setting'
  )
}

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function scorePercent(item) {
  const score = finite(item && (item.score !== undefined ? item.score : item.raw_score))
  const max = finite(item && (item.max_score !== undefined ? item.max_score : item.max))
  if (score === null || max === null || max <= 0) return null
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)))
}

function fallbackDimensionItems(scoreDetail) {
  const fields = Array.isArray(scoreDetail && scoreDetail.fields) ? scoreDetail.fields : []
  if (fields.length) return fields
  const side = scoreDetail && scoreDetail.side
  const dimensions = side && side.dimensions
  if (dimensions && typeof dimensions === 'object') {
    return Object.keys(dimensions).map((key) => {
      const item = dimensions[key] || {}
      const config = MATCH_DIMENSIONS.find((dimension) => dimension.key === key) || {}
      return {
        label: item.label || config.label || key,
        score: item.raw_score !== undefined ? item.raw_score : item.score,
        max_score: item.max_score !== undefined ? item.max_score : (item.max !== undefined ? item.max : config.max)
      }
    })
  }
  if (!side || typeof side !== 'object') return []
  return MATCH_DIMENSIONS.filter((config) => side[config.key] !== undefined).map((config) => {
    return {
      label: config.label,
      score: side[config.key],
      max_score: config.max
    }
  })
}

function uniqueText(items) {
  const seen = {}
  return (items || []).map(text).filter((item) => {
    if (!item || seen[item]) return false
    seen[item] = true
    return true
  })
}

function reportTexts(items) {
  return (items || []).map((item) => {
    if (typeof item === 'string') return item
    if (!item || typeof item !== 'object') return ''
    const title = text(item.title || item.label)
    const detail = text(item.detail || item.description)
    return title && detail ? `${title}：${detail}` : (title || detail)
  })
}

function buildMatchSummary(detail) {
  const data = detail || {}
  const scoreDetail = data.score_detail || data.scoreDetail || {}
  const report = data.ai_report || data.aiReport || {}
  const dimensions = fallbackDimensionItems(scoreDetail)
    .map((item) => ({ label: text(item.label || item.name), percent: scorePercent(item) }))
    .filter((item) => item.label && item.percent !== null)
    .sort((a, b) => b.percent - a.percent)
  const strengths = uniqueText(
    reportTexts(report.strengths || scoreDetail.strengths || []).concat(
      dimensions.filter((item) => item.percent >= 70).slice(0, 3)
        .map((item) => `${item.label}较匹配`)
    )
  ).slice(0, 3)
  const confirmations = uniqueText(
    reportTexts(report.risks || report.differences || scoreDetail.confirmations || []).concat(
      dimensions.filter((item) => item.percent < 55).slice(0, 3)
        .map((item) => `${item.label}需要进一步确认`)
    )
  ).slice(0, 3)
  const limitations = uniqueText(
    report.data_limitations
      || report.dataLimitations
      || scoreDetail.data_limitations
      || scoreDetail.dataLimitations
      || []
  ).slice(0, 3)
  return {
    strengths: strengths.length ? strengths : ['基础条件通过双方硬性筛选'],
    confirmations: confirmations.length ? confirmations : ['仍需通过真实沟通确认相处感受'],
    limitations: limitations.length ? limitations : ['结果来自已填写资料，不代表现实关系结论']
  }
}

module.exports = {
  PROFILE_FIELDS,
  buildProfileReadiness,
  buildJourneyState,
  buildMatchSummary
}
