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
  return (config || MATCH_CONFIG).educationRank[education] || 0
}

function hardOk(settings, candidate, config) {
  const cfg = config || MATCH_CONFIG
  const matchStatus = String(candidate.match_status || '').trim().toLowerCase()
  const matchedPartnerId = candidate.matched_partner_id
  const hasMatchedPartner = matchedPartnerId !== undefined
    && matchedPartnerId !== null
    && String(matchedPartnerId).trim() !== ''
    && Number(matchedPartnerId) !== 0
  if (matchStatus === 'matched' || hasMatchedPartner) return false
  const requiredText = (keys) => {
    for (let index = 0; index < keys.length; index += 1) {
      const value = String(settings[keys[index]] || '').trim()
      if (value) return value
    }
    return ''
  }
  const candidateText = (keys) => {
    for (let index = 0; index < keys.length; index += 1) {
      const value = String(candidate[keys[index]] || '').trim()
      if (value) return value
    }
    return ''
  }
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
  const requiredMarryStatus = requiredText(['must_marry_status', 'required_marry_status'])
  if (requiredMarryStatus && candidateText(['marry_status', 'marriage_status']) !== requiredMarryStatus) return false
  const requiredBabyPlan = requiredText(['must_baby_plan', 'required_baby_plan'])
  if (requiredBabyPlan && candidateText(['baby_plan']) !== requiredBabyPlan) return false
  const requiredCity = requiredText(['must_city', 'required_city'])
  if (requiredCity && candidateText(['city']) !== requiredCity) return false
  const requiredSmoking = requiredText(['must_smoking_status', 'required_smoking_status'])
  if (requiredSmoking && candidateText(['smoking_status', 'smoking']) !== requiredSmoking) return false
  const mustHeightMin = settings.must_height_min != null ? Number(settings.must_height_min) : null
  const mustHeightMax = settings.must_height_max != null ? Number(settings.must_height_max) : null
  if (mustHeightMin != null || mustHeightMax != null) {
    const height = parseHeightCm(candidate.height_range)
    if (height == null) return false
    if (mustHeightMin != null && height < mustHeightMin) return false
    if (mustHeightMax != null && height > mustHeightMax) return false
  }
  if (settings.require_safe_account === true) {
    if (candidate.status !== undefined && Number(candidate.status) !== 1) return false
    if (candidate.member_status && candidate.member_status !== 'approved') return false
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
  const compared = !(extra && extra.compared === false) && rawScore != null && Number.isFinite(Number(rawScore))
  const raw = compared ? round2(rawScore) : null
  const percent = compared && maxScore ? Math.min(100, Math.round((raw / maxScore) * 100)) : null
  return Object.assign({
    key,
    label,
    max: maxScore,
    max_score: maxScore,
    raw_score: raw,
    percent,
    compatibility_score: percent,
    status: compared ? 'compared' : 'not_compared',
    compared
  }, extra || {})
}

function scorePair(user, settings, candidate, viewSimilarity, config) {
  const cfg = config || MATCH_CONFIG
  const weights = cfg.weights
  const detail = {}
  const dimensions = {}
  let total = 0
  let comparedWeight = 0

  function take(key, label, weight, raw, extra) {
    const compared = raw != null && Number.isFinite(Number(raw))
    detail[key] = compared ? round2(raw) : null
    dimensions[key] = dimension(key, label, weight, compared ? raw : null, Object.assign({ compared }, extra || {}))
    if (compared) {
      total += Number(detail[key] || 0)
      comparedWeight += Number(weight || 0)
    }
  }

  const wantedBabyPlan = settings.like_baby_plan === '不限' ? '' : String(settings.like_baby_plan || '').trim()
  take('baby', '婚育节奏', weights.baby, wantedBabyPlan
    ? (candidate.baby_plan === wantedBabyPlan ? weights.baby : 0)
    : null)

  take('view', '三观文本', weights.view, round2((Number(viewSimilarity || 0) / 100) * weights.view), {
    similarity: Number(viewSimilarity || 0),
    signal: 'jaccard_diagnostic'
  })

  const psych = scorePsychProfile(settings.psych_profile_json, candidate.psych_profile_json)
  detail.psych_score = psych.score
  detail.psych_compared = psych.compared
  detail.psych_detail = psych.detail
  take('psych', '关系偏好', weights.psych, psych.compared ? round2((psych.score / 100) * weights.psych) : null, {
    compatibility_score: psych.score,
    compared: psych.compared,
    detail: psych.detail
  })

  const age = calcAge(candidate.birth_year)
  let ageRaw = null
  if (age != null && settings.age_min != null && settings.age_max != null) {
    if (age >= Number(settings.age_min) && age <= Number(settings.age_max)) ageRaw = weights.age
    else {
      const distance = Math.min(
        Math.abs(age - Number(settings.age_min)),
        Math.abs(age - Number(settings.age_max))
      )
      ageRaw = Math.max(0, weights.age - distance * 2)
    }
  }
  take('age', '年龄区间', weights.age, ageRaw)

  const height = parseHeightCm(candidate.height_range)
  let heightRaw = null
  if (height && settings.height_min && settings.height_max) {
    if (height >= Number(settings.height_min) && height <= Number(settings.height_max)) {
      heightRaw = weights.height
    } else {
      const distance = Math.min(
        Math.abs(height - Number(settings.height_min)),
        Math.abs(height - Number(settings.height_max))
      )
      heightRaw = Math.max(0, weights.height - distance)
    }
  }
  take('height', '身高区间', weights.height, heightRaw)

  const minEducation = String(settings.min_education || '').trim()
  take('education', '学历偏好', weights.education, minEducation
    ? (eduRank(candidate.education, cfg) >= eduRank(minEducation, cfg) ? weights.education : 0)
    : null)

  const circleIds = String(settings.like_circle_ids || '').split(',').map((item) => item.trim()).filter(Boolean)
  const candidateCircleIds = Array.isArray(candidate.identity_circle_ids) && candidate.identity_circle_ids.length
    ? candidate.identity_circle_ids.map(String)
    : [String(candidate.circle_id || '')].filter(Boolean)
  take('circle', '职业圈层', weights.circle, circleIds.length
    ? (circleIds.some((id) => candidateCircleIds.includes(String(id))) ? weights.circle : round2(weights.circle * 0.35))
    : null)

  const userCity = String(user.city_name || user.city || '').trim()
  const candidateCity = String(candidate.city_name || candidate.city || '').trim()
  const userProvince = String(user.province_code || user.province_name || '').trim()
  const candidateProvince = String(candidate.province_code || candidate.province_name || '').trim()
  let cityRaw = null
  if (userCity && candidateCity) {
    if (candidateCity === userCity) cityRaw = weights.city
    else if (userProvince && candidateProvince && userProvince === candidateProvince) cityRaw = round2(weights.city * 0.55)
    else cityRaw = 0
  }
  take('city', '城市距离', weights.city, cityRaw)

  const appearanceRatio = cfg.useAppearanceInMatch ? scoreAppearancePreference(user, candidate) : 0
  take('appearance', '外貌偏好', weights.appearance, cfg.useAppearanceInMatch && appearanceRatio > 0
    ? round2(weights.appearance * appearanceRatio)
    : (cfg.useAppearanceInMatch && (appearanceTerms(user, 'appearance_want_tags', 'appearance_want').length
      || appearanceTerms(candidate, 'appearance_tags', 'appearance_description').length)
      ? 0
      : null))

  const maxTotal = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0)
  const completeness = maxTotal ? Math.min(100, Math.round((comparedWeight / maxTotal) * 100)) : 0
  return {
    total: round2(total),
    maxTotal,
    comparedWeight: round2(comparedWeight),
    completeness,
    // Fit among compared dimensions only; completeness is separate.
    normalizedTotal: comparedWeight ? Math.min(100, Math.round((total / comparedWeight) * 100)) : null,
    detail,
    dimensions,
    score_schema_version: 'algo_evidence_v3'
  }
}

function passesQualityGate(scoreA, scoreB, viewSimilarity, config) {
  const gate = (config || MATCH_CONFIG).qualityGate
  const reasons = []
  const diagnostics = []
  const sidePoints = (score) => {
    const compared = Number(score.comparedWeight || 0)
    const maxTotal = Number(score.maxTotal || 0)
    // Incomplete profiles keep absolute points; well-covered profiles use fit among compared dims.
    if (compared > 0 && maxTotal > 0 && score.normalizedTotal != null && (compared / maxTotal) >= 0.5) {
      return round2((Number(score.normalizedTotal) / 100) * maxTotal)
    }
    return Number(score.total || 0)
  }
  if (Math.min(sidePoints(scoreA), sidePoints(scoreB)) < Number(gate.minSideScore || 0)) {
    reasons.push('side_score')
  }
  // ponytail: Jaccard is diagnostic only; must not eliminate synonym-capable pairs before RAG.
  if (Number(viewSimilarity || 0) < Number(gate.minViewSimilarity || 0)) {
    diagnostics.push('view_similarity')
  }
  const psychFailed = [scoreA, scoreB].some((score) => (
    Number(score.detail.psych_compared || 0) >= Number(gate.minPsychCompared || 0)
      && Number(score.detail.psych_score || 0) < Number(gate.minPsychScore || 0)
  ))
  if (psychFailed) reasons.push('psych_score')
  return { pass: reasons.length === 0, reasons, diagnostics }
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
    version: 'algo_evidence_v3',
    score_schema_version: 'algo_evidence_v3',
    total: score.total,
    max_total: score.maxTotal,
    compared_weight: score.comparedWeight,
    completeness: score.completeness,
    normalized_total: score.normalizedTotal,
    normalizedTotal: score.normalizedTotal,
    mutual_total: result.mutualScore,
    view_similarity: result.viewSimilarity,
    view_similarity_role: 'jaccard_diagnostic',
    algorithm_rank: rank || 1,
    ai_rank: null,
    ai_weight: 0,
    report_status: 0,
    report_provider: '',
    quality_gate: {
      pass: result.quality.pass,
      reasons: result.quality.reasons,
      diagnostics: result.quality.diagnostics || [],
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

// Soft re-export for bilateral needs helpers (keeps import paths stable)
try {
  const bilateral = require('./bilateralNeedsMatch')
  module.exports.bilateralAggregate = bilateral.bilateralAggregate
  module.exports.scoreBilateralProfiles = bilateral.scoreBilateralProfiles
  module.exports.blendStructuredWithBilateral = bilateral.blendStructuredWithBilateral
} catch (error) {
  // optional during partial deploys
}

