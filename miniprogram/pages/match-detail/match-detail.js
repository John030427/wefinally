const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { buildFieldExplainItems, buildLocalMatchReport } = require('../../utils/matchReport')
const {
  formatDateOnly,
  getCompatibilityColor,
  getCompatibilityDisplayText,
  getCompatibilityLevel,
  getTotalMatchDisplayText,
  getCompatibilityTagClass
} = require('../../utils/util')

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

function buildAppearanceText() {
  return '外貌偏好已按双方自述与期待的契合度计入匹配度，不做颜值评分，也不展示对方外貌原文。'
}

function buildReportStatusText(status) {
  const value = Number(status || 0)
  if (value === 1) return '已生成'
  if (value === 4) return '生成中'
  if (value === 2) return '生成失败，可重试'
  if (value === 3) return '未开启'
  return '待生成'
}

function isStaleRunningReport(value) {
  if (!value) return false
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return Date.now() - time > 90 * 1000
}

function normalizeAiReportState(detail, aiReportText) {
  const hasAiReportText = Boolean(String(aiReportText || '').trim())
  let status = detail.ai_report_status !== null && detail.ai_report_status !== undefined
    ? Number(detail.ai_report_status)
    : (detail.aiReportStatus !== null && detail.aiReportStatus !== undefined ? Number(detail.aiReportStatus) : 0)
  if (hasAiReportText) status = 1
  const reportTime = detail.ai_report_time || detail.aiReportTime || detail.update_time || detail.updatedAt || ''
  const runningStale = status === 4 && isStaleRunningReport(reportTime)
  const canRefreshReport = status === 4 && !runningStale && !hasAiReportText
  const canGenerateReport = !hasAiReportText && status !== 4
  const canRegenerateReport = !hasAiReportText && (status === 2 || runningStale)
  return {
    aiReportStatus: runningStale ? 2 : status,
    aiReportTime: reportTime,
    hasAiReportText,
    canGenerateReport: canGenerateReport || canRegenerateReport,
    canRefreshReport,
    reportActionText: canRegenerateReport ? '重新生成AI报告' : '生成AI报告',
    reportStatusText: buildReportStatusText(runningStale ? 2 : status),
    reportHintText: runningStale
      ? 'AI报告生成等待时间较长，可以刷新进度或重新生成；匹配结果不受影响。'
      : ''
  }
}

function shortDate(value) {
  return formatDateOnly(value)
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    matchId: '',
    autoReportPending: false,
    detail: null,
    compatibilityScore: 0,
    totalScore: 0,
    totalScorePercent: 0,
    totalScoreText: '',
    compatibilityPercent: 0,
    compatibilityText: '',
    psychText: '',
    handoffSubmitting: false,
    reportGenerating: false,
    hasTotalScore: false,
    hasScore: false,
    compatibilityLevel: '',
    progressColor: 'progress-gray',
    tagClass: 'tag-gray'
  },

  onLoad(options) {
    this.setData({
      matchId: options.id || '',
      autoReportPending: options.autoReport === '1' || options.autoReport === 'true'
    })
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

      const score = detail.view_similarity !== null && detail.view_similarity !== undefined
        ? detail.view_similarity
        : (detail.compatibilityScore !== null && detail.compatibilityScore !== undefined
          ? detail.compatibilityScore
          : detail.compatibility_score)
      const totalScore = detail.total_score !== null && detail.total_score !== undefined
        ? detail.total_score
        : (detail.totalScore !== null && detail.totalScore !== undefined ? detail.totalScore : 0)
      const locked = !!detail.locked
      const hasScore = !locked && score !== null && score !== undefined && score > 0
      const hasTotalScore = !locked && totalScore !== null && totalScore !== undefined && Number(totalScore) > 0
      const scoreDetail = detail.score_detail || detail.scoreDetail || null
      const appearanceText = buildAppearanceText(scoreDetail)

      const builtLocalReportText = buildLocalMatchReport({
        scoreDetail,
        ageBand: detail.age_band || '',
        education: detail.education || '--',
        circleName: detail.circle_name || '--',
        babyPlan: detail.baby_plan || '--',
        appearanceText
      })

      const aiReportText = detail.ai_report_text || detail.aiReportText || ''
      const localReportText = detail.local_report_text || detail.localReportText || builtLocalReportText
      const aiReportState = normalizeAiReportState(detail, aiReportText)

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
        scoreDetail,
        scoreBreakdown: buildFieldExplainItems(scoreDetail),
        appearanceText,
        qualityText: buildQualityText(scoreDetail),
        psychScore: (scoreDetail || {}).side
          ? (scoreDetail || {}).side.psych_score
          : null,
        psychText: buildPsychText((scoreDetail || {}).side
          ? (scoreDetail || {}).side.psych_score
          : null),
        aiReportText,
        localReportText,
        displayReportText: aiReportText,
        hasAiReportText: aiReportState.hasAiReportText,
        aiReportStatus: aiReportState.aiReportStatus,
        aiReportError: detail.ai_report_error || detail.aiReportError || '',
        aiReportTime: aiReportState.aiReportTime,
        canGenerateReport: aiReportState.canGenerateReport,
        canRefreshReport: aiReportState.canRefreshReport,
        reportActionText: aiReportState.reportActionText,
        reportStatusText: aiReportState.reportStatusText,
        reportHintText: aiReportState.reportHintText,
        handoffTicket: detail.handoff_ticket || detail.handoffTicket || null,
        lockMsg: detail.message || '开通 VIP 查看完整匹配详情'
      }

      const numScore = hasScore ? Number(score) : 0
      const numTotalScore = hasTotalScore ? normalized.totalScore : 0

      const shouldAutoReport = this.data.autoReportPending
        && normalized.canGenerateReport
        && !normalized.hasAiReportText

      this.setData({
        pageState: 'success',
        autoReportPending: false,
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
      if (shouldAutoReport) {
        setTimeout(() => {
          this.requestAiReport({ silentReport: true })
        }, 200)
      }
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载失败'
      })
    }
  },

  onRetry() {
    this.loadDetail()
  },

  onToggleFieldExplain(e) {
    const key = e.currentTarget.dataset.key
    const items = ((this.data.detail && this.data.detail.scoreBreakdown) || []).map((item) => ({
      ...item,
      expanded: item.key === key ? !item.expanded : item.expanded
    }))
    this.setData({ 'detail.scoreBreakdown': items })
  },

  async requestHandoff() {
    if (!this.data.detail || this.data.detail.locked || this.data.handoffSubmitting) return
    this.setData({ handoffSubmitting: true })
    try {
      const ticket = await post(API_PATHS.MATCH_HANDOFF, {
        match_log_id: this.data.matchId,
        match_user_id: this.data.detail.matchedUserId
      }, { showLoading: true, loadingText: '正在提交...' })
      this.setData({ 'detail.handoffTicket': ticket })
      const ticketId = ticket && (ticket.id || ticket.ticket_id || ticket.ticketId)
      wx.navigateTo({
        url: `/pages/chat/chat?handoffTicketId=${ticketId || ''}&matchLogId=${this.data.matchId}&matchUserId=${this.data.detail.matchedUserId}`
      })
    } catch (err) {
      wx.showModal({
        title: '提交失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ handoffSubmitting: false })
    }
  },

  async requestAiReport(options) {
    if (!this.data.detail || this.data.detail.locked || this.data.reportGenerating) return
    const silentReport = options && options.silentReport === true
    this.setData({
      reportGenerating: true,
      'detail.aiReportStatus': 4,
      'detail.reportStatusText': '生成中'
    })
    try {
      await post(API_PATHS.MATCH_REPORT, {
        match_log_id: this.data.matchId,
        match_user_id: this.data.detail.matchedUserId
      }, { showLoading: !silentReport, loadingText: '正在生成AI报告...' })
      await this.loadDetail()
    } catch (err) {
      if (!silentReport) {
        wx.showModal({
          title: 'AI报告生成失败',
          content: (err && err.message) || '请稍后重试，匹配结果不受影响',
          showCancel: false
        })
      }
      await this.loadDetail()
    } finally {
      this.setData({ reportGenerating: false })
    }
  }
})
