const { get } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const {
  getCompatibilityColor,
  getCompatibilityLevel,
  getCompatibilityTagClass
} = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    matchId: '',
    detail: null,
    compatibilityScore: 0,
    totalScore: 0,
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
        matchDate: detail.match_date || detail.matchDate || '',
        totalScore: Math.min(100, Math.round(Number(totalScore) || 0)),
        scoreDetail: detail.score_detail || detail.scoreDetail || null,
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
