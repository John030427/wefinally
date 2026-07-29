const MATCH_CONFIG = {
  avoidRematch: true,
  useAppearanceInMatch: true,
  weights: {
    baby: 30,
    view: 25,
    psych: 18,
    appearance: 10,
    age: 15,
    height: 12,
    education: 8,
    circle: 6,
    city: 4
  },
  qualityGate: {
    enabled: true,
    minSideScore: 90,
    minViewSimilarity: 40,
    minPsychScore: 50,
    minPsychCompared: 3
  },
  hard: {
    age: true,
    height: false,
    minEducation: false
  },
  educationRank: { 高中及以下: 0, 大专: 1, 本科: 2, 硕士: 3, 博士: 4 }
}

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '他', '她', '它', '我们', '你们', '他们', '可以', '希望'
])

const PSYCH_DIMENSIONS = [
  'marriage_pace',
  'conflict_style',
  'security_space',
  'family_boundary',
  'money_view',
  'career_family'
]

const PSYCH_OPTIONS = {
  marriage_pace: ['稳定推进', '先磨合再定', '顺其自然'],
  conflict_style: ['及时沟通', '冷静后沟通', '需要空间'],
  security_space: ['高陪伴感', '亲密也独立', '重视个人空间'],
  family_boundary: ['大家庭融合', '小家庭优先', '边界清晰'],
  money_view: ['共同规划', '相对独立', '稳健储蓄'],
  career_family: ['事业优先', '家庭优先', '动态平衡']
}

const APPEARANCE_KEYWORDS = [
  '清爽', '自然', '干净', '整洁', '运动', '健身', '阳光', '健康',
  '文艺', '简洁', '休闲', '时尚', '精致', '成熟', '商务', '稳重',
  '温柔', '可爱', '高挑', '偏高', '匀称', '苗条', '微胖', '戴眼镜',
  '长发', '短发', '白净', '亲和', '大方', '有气质'
]

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function harmonicMean(aValue, bValue) {
  const a = Number(aValue || 0)
  const b = Number(bValue || 0)
  if (a <= 0 || b <= 0) return 0
  return round2((2 * a * b) / (a + b))
}

function calcAge(birthYear, currentYear) {
  const year = Number(birthYear)
  if (!Number.isFinite(year) || year <= 0) return null
  return Number(currentYear || new Date().getFullYear()) - year
}

function parseHeightCm(heightRange) {
  if (!heightRange) return null
  const values = String(heightRange).match(/\d+/g)
  if (!values) return null
  return values.length >= 2 ? (Number(values[0]) + Number(values[1])) / 2 : Number(values[0])
}

function eduRank(education, config) {
  return (config || MATCH_CONFIG).educationRank[education] ?? 0
}

function hardOk(settings, candidate, config) {
  const cfg = config || MATCH_CONFIG
  const hasAgeMin = settings.age_min != null && settings.age_min !== ''
  const hasAgeMax = settings.age_max != null && settings.age_max !== ''
  if (cfg.hard.age && (hasAgeMin || hasAgeMax)) {
    const age = calcAge(candidate.birth_year)
    if (age == null) return false
    if (hasAgeMin && age < Number(settings.age_min)) return false
    if (hasAgeMax && age > Number(settings.age_max)) return false
  }
  if (cfg.hard.height && settings.height_min != null && settings.height_max != null) {
    const height = parseHeightCm(candidate.height_range)
    if (height != null && (height < Number(settings.height_min) || height > Number(settings.height_max))) return false
  }
  if (cfg.hard.minEducation && settings.min_education) {
    if (eduRank(candidate.education, cfg) < eduRank(settings.min_education, cfg)) return false
  }
  return true
}

function tokenize(text) {
  if (!text || typeof text !== 'string') return []
  const cleaned = text.replace(/[\s\u3000,.，。！？!?\n\r\t]/g, '')
  const tokens = []
  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i]
    if (char && !STOP_WORDS.has(char)) tokens.push(char)
  }
  for (let i = 0; i < cleaned.length - 1; i += 1) tokens.push(cleaned.slice(i, i + 2))
  return tokens
}

function jaccard(left, right) {
  const setA = new Set(left)
  const setB = new Set(right)
  if (!setA.size && !setB.size) return 0
  let intersection = 0
  setA.forEach((item) => {
    if (setB.has(item)) intersection += 1
  })
  const union = setA.size + setB.size - intersection
  return union ? intersection / union : 0
}

function computeViewSimilarity(selfA, targetA, selfB, targetB) {
  const scoreA = jaccard(tokenize(selfA), tokenize(targetB))
  const scoreB = jaccard(tokenize(selfB), tokenize(targetA))
  return Math.round(Math.min(100, Math.max(0, ((scoreA + scoreB) / 2) * 100)))
}

function parseObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (err) {
    return {}
  }
}

function scorePsychProfile(leftValue, rightValue) {
  const left = parseObject(leftValue)
  const right = parseObject(rightValue)
  let compared = 0
  let total = 0
  const detail = {}
  PSYCH_DIMENSIONS.forEach((key) => {
    const a = String(left[key] || '').trim()
    const b = String(right[key] || '').trim()
    if (!a || !b) return
    const options = PSYCH_OPTIONS[key] || []
    const indexA = options.indexOf(a)
    const indexB = options.indexOf(b)
    let score = 0
    if (a === b) score = 100
    else if (indexA >= 0 && indexB >= 0) score = Math.abs(indexA - indexB) === 1 ? 70 : 35
    compared += 1
    total += score
    detail[key] = score
  })
  return {
    score: compared ? Math.round(total / compared) : 0,
    compared,
    detail
  }
}

function circleMatches(value, circleId) {
  const ids = String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
  return !ids.length || ids.includes(String(circleId))
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    return []
  }
}

function normalizeTerm(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

function uniqueTerms(values) {
  return [...new Set(values.map(normalizeTerm).filter((item) => item.length >= 2))]
}

function appearanceTerms(row, tagKey, textKey) {
  const text = normalizeTerm(row[textKey])
  return uniqueTerms([
    ...parseTags(row[tagKey]),
    ...APPEARANCE_KEYWORDS.filter((keyword) => text.includes(keyword))
  ])
}

function scoreAppearancePreference(user, candidate) {
  const wanted = appearanceTerms(user, 'appearance_want_tags', 'appearance_want')
  const actual = appearanceTerms(candidate, 'appearance_tags', 'appearance_description')
  if (!wanted.length || !actual.length) return 0
  const matched = wanted.filter((want) => (
    actual.some((have) => want === have || want.includes(have) || have.includes(want))
  )).length
  return matched / wanted.length
}

function dimension(key, label, maxScore, rawScore, extra) {
  const raw = round2(rawScore)
  const percent = maxScore ? Math.min(100, Math.round((raw / maxScore) * 100)) : 0
  return Object.assign({
    key,
    label,
    max: maxScore,
    max_score: maxScore,
    raw_score: raw,
    percent,
    compatibility_score: percent
  }, extra || {})
}

function scorePair(user, settings, candidate, viewSimilarity, config) {
  const cfg = config || MATCH_CONFIG
  const weights = cfg.weights
  const detail = {}
  const dimensions = {}
  let total = 0

  const wantedBabyPlan = settings.like_baby_plan === '不限' ? '' : settings.like_baby_plan
  detail.baby = wantedBabyPlan ? (candidate.baby_plan === wantedBabyPlan ? weights.baby : 0) : 10
  dimensions.baby = dimension('baby', '婚育节奏', weights.baby, detail.baby)
  total += detail.baby

  detail.view = round2((Number(viewSimilarity || 0) / 100) * weights.view)
  dimensions.view = dimension('view', '三观文本', weights.view, detail.view, {
    similarity: Number(viewSimilarity || 0)
  })
  total += detail.view

  const psych = scorePsychProfile(settings.psych_profile_json, candidate.psych_profile_json)
  detail.psych = psych.compared ? round2((psych.score / 100) * weights.psych) : 0
  detail.psych_score = psych.score
  detail.psych_compared = psych.compared
  detail.psych_detail = psych.detail
  dimensions.psych = dimension('psych', '关系偏好', weights.psych, detail.psych, {
    compatibility_score: psych.score,
    compared: psych.compared,
    detail: psych.detail
  })
  total += detail.psych

  const age = calcAge(candidate.birth_year)
  if (age != null && settings.age_min != null && settings.age_max != null) {
    if (age >= Number(settings.age_min) && age <= Number(settings.age_max)) detail.age = weights.age
    else {
      const distance = Math.min(
        Math.abs(age - Number(settings.age_min)),
        Math.abs(age - Number(settings.age_max))
      )
      detail.age = Math.max(0, weights.age - distance * 2)
    }
  } else detail.age = 5
  dimensions.age = dimension('age', '年龄区间', weights.age, detail.age)
  total += detail.age

  const height = parseHeightCm(candidate.height_range)
  if (height && settings.height_min && settings.height_max) {
    if (height >= Number(settings.height_min) && height <= Number(settings.height_max)) {
      detail.height = weights.height
    } else {
      const distance = Math.min(
        Math.abs(height - Number(settings.height_min)),
        Math.abs(height - Number(settings.height_max))
      )
      detail.height = Math.max(0, weights.height - distance)
    }
  } else detail.height = 3
  dimensions.height = dimension('height', '身高区间', weights.height, detail.height)
  total += detail.height

  detail.education = settings.min_education
    ? (eduRank(candidate.education, cfg) >= eduRank(settings.min_education, cfg) ? weights.education : 0)
    : 2
  dimensions.education = dimension('education', '学历偏好', weights.education, detail.education)
  total += detail.education

  detail.circle = circleMatches(settings.like_circle_ids, candidate.circle_id) ? weights.circle : 2
  dimensions.circle = dimension('circle', '职业圈层', weights.circle, detail.circle)
  total += detail.circle

  detail.city = user.city && candidate.city === user.city ? weights.city : 1
  dimensions.city = dimension('city', '城市距离', weights.city, detail.city)
  total += detail.city

  detail.appearance = cfg.useAppearanceInMatch
    ? round2(weights.appearance * scoreAppearancePreference(user, candidate))
    : 0
  dimensions.appearance = dimension('appearance', '外貌偏好', weights.appearance, detail.appearance)
  total += detail.appearance

  const maxTotal = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0)
  return {
    total: round2(total),
    maxTotal,
    normalizedTotal: maxTotal ? Math.min(100, Math.round((total / maxTotal) * 100)) : 0,
    detail,
    dimensions
  }
}

function passesQualityGate(scoreA, scoreB, viewSimilarity, config) {
  const gate = (config || MATCH_CONFIG).qualityGate
  const reasons = []
  if (Math.min(Number(scoreA.total || 0), Number(scoreB.total || 0)) < Number(gate.minSideScore || 0)) {
    reasons.push('side_score')
  }
  if (Number(viewSimilarity || 0) < Number(gate.minViewSimilarity || 0)) {
    reasons.push('view_similarity')
  }
  const psychFailed = [scoreA, scoreB].some((score) => (
    Number(score.detail.psych_compared || 0) >= Number(gate.minPsychCompared || 0)
      && Number(score.detail.psych_score || 0) < Number(gate.minPsychScore || 0)
  ))
  if (psychFailed) reasons.push('psych_score')
  return { pass: reasons.length === 0, reasons }
}

function settingsOf(user, settingsByUserId) {
  const settings = settingsByUserId[String(user.id)] || {}
  return Object.assign({
    age_min: null,
    age_max: null,
    height_min: null,
    height_max: null,
    min_education: '',
    like_circle_ids: '',
    like_baby_plan: '',
    psych_profile_json: null
  }, settings)
}

function rankCandidates(user, candidates, settingsByUserId, options) {
  const config = (options && options.config) || MATCH_CONFIG
  const blockedIds = (options && options.blockedIds) || new Set()
  const settingsA = settingsOf(user, settingsByUserId)
  return candidates.map((candidate) => {
    if (Number(candidate.id) === Number(user.id)) return null
    if (Number(candidate.gender) === Number(user.gender)) return null
    if (blockedIds.has(Number(candidate.id))) return null
    const settingsB = settingsOf(candidate, settingsByUserId)
    if (!hardOk(settingsA, candidate, config) || !hardOk(settingsB, user, config)) return null
    const viewSimilarity = computeViewSimilarity(
      settingsA.self_view_text,
      settingsA.target_view_text,
      settingsB.self_view_text,
      settingsB.target_view_text
    )
    const candidateEvidence = Object.assign({}, candidate, {
      psych_profile_json: settingsB.psych_profile_json
    })
    const userEvidence = Object.assign({}, user, {
      psych_profile_json: settingsA.psych_profile_json
    })
    const scoreA = scorePair(userEvidence, settingsA, candidateEvidence, viewSimilarity, config)
    const scoreB = scorePair(candidateEvidence, settingsB, userEvidence, viewSimilarity, config)
    const quality = passesQualityGate(scoreA, scoreB, viewSimilarity, config)
    return {
      candidate,
      viewSimilarity,
      scoreA,
      scoreB,
      mutualScore: harmonicMean(scoreA.total, scoreB.total),
      quality
    }
  }).filter(Boolean).sort((left, right) => (
    Number(right.quality.pass) - Number(left.quality.pass)
      || right.mutualScore - left.mutualScore
      || right.viewSimilarity - left.viewSimilarity
      || Number(left.candidate.id) - Number(right.candidate.id)
  ))
}

function scoreDetailFor(result, side, rank) {
  const score = side === 'b' ? result.scoreB : result.scoreA
  return {
    version: 'algo_evidence_v2',
    total: score.total,
    max_total: score.maxTotal,
    normalized_total: score.normalizedTotal,
    normalizedTotal: score.normalizedTotal,
    mutual_total: result.mutualScore,
    view_similarity: result.viewSimilarity,
    algorithm_rank: rank || 1,
    ai_rank: null,
    ai_weight: 0,
    report_status: 0,
    report_provider: '',
    quality_gate: {
      pass: result.quality.pass,
      reasons: result.quality.reasons,
      fallback: false
    },
    side: Object.assign({}, score.detail, { dimensions: score.dimensions })
  }
}

module.exports = {
  MATCH_CONFIG,
  calcAge,
  computeViewSimilarity,
  hardOk,
  harmonicMean,
  passesQualityGate,
  rankCandidates,
  scoreDetailFor,
  scorePair
}
