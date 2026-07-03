const { get } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const {
  formatDateOnly,
  getCompatibilityColor,
  getCompatibilityDisplayText,
  getCompatibilityLevel,
  getTotalMatchDisplayText,
  getCompatibilityTagClass
} = require('../../utils/util')

const SCORE_ITEMS = [
  { key: 'baby', label: '婚育节奏', max: 30, note: '双方婚育计划是否同频' },
  { key: 'view', label: '三观文本', max: 25, note: '双方三观自述与期待的语义契合' },
  { key: 'psych', label: '关系偏好', max: 18, note: '沟通、安全感、边界、金钱观等偏好' },
  { key: 'age', label: '年龄区间', max: 15, note: '是否落在对方年龄偏好内' },
  { key: 'height', label: '身高区间', max: 12, note: '是否落在对方身高偏好内' },
  { key: 'education', label: '学历偏好', max: 8, note: '学历是否达到对方偏好' },
  { key: 'circle', label: '职业圈层', max: 6, note: '是否命中对方偏好圈层' },
  { key: 'city', label: '城市距离', max: 4, note: '同城更利于见面和落地' }
]

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatScore(value) {
  const n = num(value)
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function buildScoreBreakdown(scoreDetail) {
  const side = (scoreDetail && scoreDetail.side) || {}
  return SCORE_ITEMS.map((item) => {
    const score = num(side[item.key])
    return {
      ...item,
      scoreText: formatScore(score),
      percent: item.max ? Math.min(100, Math.round((score / item.max) * 100)) : 0
    }
  })
}

function buildQualityText(scoreDetail) {
  const gate = scoreDetail && scoreDetail.quality_gate
  if (!gate) return ''
  if (gate.pass) return '已通过严格质量门槛'
  const reasons = gate.reasons || []
  return `未通过门槛：${reasons.join('、') || '未知原因'}`
}

function buildPsychText(value) {
  const score = Number(value)
  if (!Number.isFinite(score)) return ''
  if (score >= 85) return '关系偏好高度接近'
  if (score >= 65) return '关系偏好较为接近'
  if (score >= 50) return '关系偏好需要磨合'
  return '关系偏好差异明显'
}

function shortDate(value) {
  return formatDateOnly(value)
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    matchId: '',
    detail: null,
    compatibilityScore: 0,
    totalScore: 0,
    totalScorePercent: 0,
    totalScoreText: '',
    compatibilityPercent: 0,
    compatibilityText: '',
    psychText: '',
    hasTotalScore: false,
    hasScore: false,
    compatibilityLevel: '',
    progressColor: 'progress-gray',
    tagClass: 'tag-gray'
  },

  onLoad(options) {
    this.setData({ matchId: options.id || '' })
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    if (!this.data.matchId) {
      this.setData({ pageState: 'error', errorMsg: '缺少匹配ID' })
      return
    }

    try {
      const detail = await get(API_PATHS.MATCH_DETAIL, { id: this.data.matchId }, { showError: false })
      if (!detail) {
        this.setData({ pageState: 'empty' })
        return
      }

      const score = detail.view_similarity ?? detail.compatibilityScore ?? detail.compatibility_score
      const totalScore = detail.total_score ?? detail.totalScore ?? 0
      const locked = !!detail.locked
      const hasScore = !locked && score !== null && score !== undefined && score > 0
      const hasTotalScore = !locked && totalScore !== null && totalScore !== undefined && Number(totalScore) > 0

      const normalized = {
        locked,
        ageBand: detail.age_band || '',
        height: detail.height_range || '',
        education: detail.education || '--',
        babyPlan: detail.baby_plan || '--',
        circleName: detail.circle_name || '--',
        matchedUserId: detail.matched_user_id || detail.match_user_id || 0,
        matchType: detail.match_type || detail.matchType || '',
        matchDate: shortDate(detail.match_date || detail.matchDate || ''),
        totalScore: Math.round(Number(totalScore) || 0),
        totalScorePercent: Math.min(100, Math.round(Number(totalScore) || 0)),
        totalScoreText: getTotalMatchDisplayText(totalScore),
        compatibilityText: getCompatibilityDisplayText(score),
        compatibilityPercent: Math.min(95, Math.round(Number(score) || 0)),
        scoreDetail: detail.score_detail || detail.scoreDetail || null,
        scoreBreakdown: buildScoreBreakdown(detail.score_detail || detail.scoreDetail || null),
        qualityText: buildQualityText(detail.score_detail || detail.scoreDetail || null),
        psychScore: (detail.score_detail || detail.scoreDetail || {}).side
          ? (detail.score_detail || detail.scoreDetail || {}).side.psych_score
          : null,
        psychText: buildPsychText((detail.score_detail || detail.scoreDetail || {}).side
          ? (detail.score_detail || detail.scoreDetail || {}).side.psych_score
          : null),
        aiReportText: detail.ai_report_text || detail.aiReportText || '',
        aiReportStatus: detail.ai_report_status ?? detail.aiReportStatus ?? 0,
        lockMsg: detail.message || '开通 VIP 查看完整匹配详情'
      }

      const numScore = hasScore ? Number(score) : 0
      const numTotalScore = hasTotalScore ? normalized.totalScore : 0

      this.setData({
        pageState: 'success',
        detail: normalized,
        totalScore: numTotalScore,
        totalScorePercent: hasTotalScore ? normalized.totalScorePercent : 0,
        totalScoreText: hasTotalScore ? normalized.totalScoreText : '',
        compatibilityText: hasScore ? normalized.compatibilityText : '',
        compatibilityPercent: hasScore ? normalized.compatibilityPercent : 0,
        psychText: normalized.psychText,
        hasTotalScore,
        compatibilityScore: numScore,
        hasScore,
        compatibilityLevel: hasScore ? getCompatibilityLevel(numScore) : '',
        progressColor: hasScore ? getCompatibilityColor(numScore) : 'progress-gray',
        tagClass: hasScore ? getCompatibilityTagClass(numScore) : 'tag-gray'
      })
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载失败'
      })
    }
  },

  onRetry() {
    this.loadDetail()
  }
})
