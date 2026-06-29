const { get } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const {
  getCompatibilityColor,
  getCompatibilityLevel,
  getCompatibilityTagClass,
  genderText,
  calcAge
} = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    matchId: '',
    detail: null,
    compatibilityScore: 0,
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

      const mu = detail.matched_user || detail
      const score = detail.view_similarity ?? detail.compatibilityScore ?? detail.compatibility_score
      const hasScore = score !== null && score !== undefined && score > 0

      const normalized = {
        gender: genderText(mu.gender || detail.gender),
        age: mu.age || detail.age || calcAge(mu.birth_year || detail.birth_year),
        city: mu.city || detail.city || '--',
        education: mu.education || detail.education || '--',
        height: mu.height_range || detail.height_range || detail.height || '--',
        babyPlan: mu.baby_plan || detail.baby_plan || '--',
        circleName: mu.circle_name || detail.circle_name || '--',
        matchType: detail.match_type || detail.matchType || '',
        matchDate: detail.match_date || detail.matchDate || ''
      }

      const numScore = hasScore ? Number(score) : 0

      this.setData({
        pageState: 'success',
        detail: normalized,
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
