const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')
const { buildFieldExplainItems, buildLocalMatchReport } = require('../../utils/matchReport')
const { resolveTotalScorePercent } = require('../../utils/matchScore')
const { buildMatchSummary } = require('../../utils/productExperience')
const { presentAiMatchReport } = require('../../utils/aiMatchReportPresentation')
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
  if (status === 'succeeded') return '已生成'
  if (status === 'queued') return '排队中'
  if (status === 'generating') return '生成中'
  if (status === 'failed') return '生成失败，可重试'
  if (status === 'disabled') return '未开启'
  if (status === 'expired') return '已到期'
  return '待生成'
}

function buildReportErrorText(value) {
  const message = String(value || '').toLowerCase()
  if (!message) return 'AI服务暂时不可用'
  if (message.includes('missing deepseek_api_key') || message.includes('disabled')) return 'AI服务配置尚未完成'
  if (message.includes('timeout') || message.includes('timed out')) return 'AI服务响应超时'
  if (message.includes('429') || message.includes('rate')) return 'AI服务请求繁忙'
  if (message.includes('401') || message.includes('403')) return 'AI服务鉴权失败'
  return 'AI服务暂时不可用'
}

function normalizeAiReportState(detail) {
  const status = String(detail.ai_report_status || detail.aiReportStatus || 'not_requested')
  const reportTime = detail.ai_report_time || detail.aiReportTime || detail.update_time || detail.updatedAt || ''
  return {
    aiReportStatus: status,
    aiReportTime: reportTime,
    hasAiReportText: status === 'succeeded',
    canGenerateReport: status === 'not_requested' || status === 'failed',
    canRefreshReport: status === 'queued' || status === 'generating',
    reportActionText: status === 'failed' ? '重试AI报告' : '生成AI报告',
    reportStatusText: buildReportStatusText(status),
    aiReportErrorText: status === 'failed' ? buildReportErrorText(detail.ai_report_error || detail.aiReportError) : '',
    reportHintText: status === 'expired' ? 'AI报告已超过保存期限，相关内容已删除。' : ''
  }
}

function shortDate(value) {
  return formatDateOnly(value)
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function selectionMap(items) {
  const map = {}
  ;(items || []).forEach((item) => { map[item] = true })
  return map
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    matchId: '',
    autoReportPending: false,
    detail: null,
    reportPresentation: { sections: [], summary: '', disclaimer: 'AI 生成内容，仅供参考' },
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
    tagClass: 'tag-gray',
    showAlgorithmDetails: false,
    matchSummary: null,
    matchFeedback: null,
    feedbackVerdict: '',
    feedbackReasons: [],
    feedbackReasonSelection: {},
    feedbackNote: '',
    feedbackReview: false,
    feedbackSubmitting: false,
    dateFeedbackEligibility: null,
    feedbackVerdictOptions: [
      { value: 'accurate', label: '比较准确' },
      { value: 'partly_accurate', label: '部分准确' },
      { value: 'not_accurate', label: '不太准确' }
    ],
    feedbackReasonOptions: [
      { value: 'preferences', label: '择偶条件' },
      { value: 'values', label: '价值观' },
      { value: 'appearance', label: '外貌偏好' },
      { value: 'life_stage', label: '生活阶段' },
      { value: 'location', label: '城市距离' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad(options) {
    this.setData({
      matchId: options.id || '',
      autoReportPending: options.autoReport === '1' || options.autoReport === 'true'
    })
    this.loadDetail()
  },

  onUnload() {
    this.stopReportPolling()
  },

  startReportPolling() {
    if (this.reportPollTimer) return
    this.reportPollCount = 0
    this.reportPollTimer = setInterval(() => {
      this.reportPollCount += 1
      if (this.reportPollCount > 20) return this.stopReportPolling()
      this.loadDetail({ polling: true })
    }, 3000)
  },

  stopReportPolling() {
    if (this.reportPollTimer) clearInterval(this.reportPollTimer)
    this.reportPollTimer = null
    this.reportPollCount = 0
  },

  async loadDetail(options) {
    if (!(options && options.polling)) this.setData({ pageState: 'loading' })
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
      const totalScorePercent = resolveTotalScorePercent(totalScore, scoreDetail)
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
      const aiReportState = normalizeAiReportState(detail)

      const normalized = {
        locked,
        ageBand: detail.age_band || '',
        height: detail.height_range || '',
        education: detail.education || '--',
        babyPlan: detail.baby_plan || '--',
        circleName: detail.circle_name || '--',
        matchedUserId: detail.matched_user_id || detail.match_user_id || 0,
        matchOnlyFixture: detail.match_only_fixture === true,
        matchType: detail.match_type || detail.matchType || '',
        matchDate: shortDate(detail.match_date || detail.matchDate || ''),
        totalScore: Math.round(Number(totalScore) || 0),
        totalScorePercent,
        totalScoreText: getTotalMatchDisplayText(totalScorePercent),
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
        semanticScore: nullableNumber(scoreDetail && scoreDetail.mutual_semantic_score) === null
          ? null : Math.round(nullableNumber(scoreDetail.mutual_semantic_score)),
        aToBSemanticScore: nullableNumber(scoreDetail && scoreDetail.a_to_b_semantic_score) === null
          ? null : Math.round(nullableNumber(scoreDetail.a_to_b_semantic_score)),
        bToASemanticScore: nullableNumber(scoreDetail && scoreDetail.b_to_a_semantic_score) === null
          ? null : Math.round(nullableNumber(scoreDetail.b_to_a_semantic_score)),
        semanticStrengths: Array.isArray(scoreDetail && scoreDetail.semantic_strengths)
          ? scoreDetail.semantic_strengths : [],
        asymmetricRisks: Array.isArray(scoreDetail && scoreDetail.asymmetric_risks)
          ? scoreDetail.asymmetric_risks : [],
        confirmationQuestions: Array.isArray(scoreDetail && scoreDetail.confirmation_questions)
          ? scoreDetail.confirmation_questions : [],
        dataCompleteness: nullableNumber(scoreDetail && scoreDetail.data_completeness) === null
          ? null : Math.round(nullableNumber(scoreDetail.data_completeness) * 100),
        semanticConfidence: nullableNumber(scoreDetail && scoreDetail.semantic_confidence) === null
          ? null : Math.round(nullableNumber(scoreDetail.semantic_confidence) * 100),
        aiReportText,
        aiReport: detail.ai_report || detail.aiReport || null,
        localReportText,
        displayReportText: aiReportText,
        hasAiReportText: aiReportState.hasAiReportText,
        aiReportStatus: aiReportState.aiReportStatus,
        aiReportError: detail.ai_report_error || detail.aiReportError || '',
        aiReportErrorText: aiReportState.aiReportErrorText,
        aiReportTime: aiReportState.aiReportTime,
        canGenerateReport: aiReportState.canGenerateReport,
        canRefreshReport: aiReportState.canRefreshReport,
        reportActionText: aiReportState.reportActionText,
        reportStatusText: aiReportState.reportStatusText,
        reportHintText: aiReportState.reportHintText,
        handoffTicket: detail.handoff_ticket || detail.handoffTicket || null,
        lockMsg: detail.message || '开通 VIP 查看完整匹配详情'
      }

      const aiReportPayload = normalized.aiReport
      const reportPresentation = aiReportPayload
        ? presentAiMatchReport(aiReportPayload, {
          forYou: scoreDetail && (scoreDetail.a_to_b_reasons || scoreDetail.for_you),
          forThem: scoreDetail && (scoreDetail.b_to_a_reasons || scoreDetail.for_them)
        })
        : { sections: [], summary: '' }

      const numScore = hasScore ? Number(score) : 0
      const numTotalScore = hasTotalScore ? normalized.totalScore : 0

      this.setData({
        pageState: 'success',
        autoReportPending: false,
        detail: normalized,
        reportPresentation,
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
        tagClass: hasScore ? getCompatibilityTagClass(numScore) : 'tag-gray',
        matchSummary: buildMatchSummary(detail)
      })
      if (!(options && options.polling)) this.loadExperienceState()
      if (normalized.aiReportStatus === 'queued' || normalized.aiReportStatus === 'generating') this.startReportPolling()
      else this.stopReportPolling()
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

  toggleAlgorithmDetails() {
    this.setData({ showAlgorithmDetails: !this.data.showAlgorithmDetails })
  },

  async loadExperienceState() {
    const params = { match_log_id: Number(this.data.matchId) }
    const results = await Promise.all([
      get(API_PATHS.MATCH_FEEDBACK, params, { showError: false }).catch(() => null),
      get(API_PATHS.DATE_FEEDBACK, params, { showError: false }).catch(() => null)
    ])
    const feedback = results[0]
    const dateState = results[1]
    const reasons = feedback && Array.isArray(feedback.reasons) ? feedback.reasons : []
    this.setData({
      matchFeedback: feedback || null,
      feedbackVerdict: feedback ? feedback.verdict || '' : '',
      feedbackReasons: reasons,
      feedbackReasonSelection: selectionMap(reasons),
      feedbackNote: feedback ? feedback.note || '' : '',
      feedbackReview: feedback ? feedback.request_human_review === true : false,
      dateFeedbackEligibility: dateState || null
    })
  },

  selectFeedbackVerdict(e) {
    this.setData({ feedbackVerdict: e.currentTarget.dataset.value || '' })
  },

  toggleFeedbackReason(e) {
    const value = e.currentTarget.dataset.value
    const current = this.data.feedbackReasons || []
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : current.concat(value).slice(0, 5)
    this.setData({
      feedbackReasons: next,
      feedbackReasonSelection: selectionMap(next)
    })
  },

  onFeedbackNoteInput(e) {
    this.setData({ feedbackNote: e.detail.value || '' })
  },

  onFeedbackReviewChange(e) {
    this.setData({ feedbackReview: Boolean(e.detail.value && e.detail.value.length) })
  },

  async submitMatchFeedback() {
    if (!this.data.feedbackVerdict || this.data.feedbackSubmitting) {
      if (!this.data.feedbackVerdict) wx.showToast({ title: '请先选择准确程度', icon: 'none' })
      return
    }
    this.setData({ feedbackSubmitting: true })
    try {
      const saved = await post(API_PATHS.MATCH_FEEDBACK, {
        match_log_id: Number(this.data.matchId),
        verdict: this.data.feedbackVerdict,
        reasons: this.data.feedbackReasons,
        note: this.data.feedbackNote,
        request_human_review: this.data.feedbackReview
      }, { showLoading: true, loadingText: '正在保存...' })
      this.setData({ matchFeedback: saved || {} })
      wx.showToast({ title: '反馈已保存', icon: 'success' })
    } catch (err) {
      wx.showModal({
        title: '反馈未保存',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ feedbackSubmitting: false })
    }
  },

  goDateFeedback() {
    const state = this.data.dateFeedbackEligibility
    if (!state || !state.can_submit) return
    wx.navigateTo({
      url: `/pages/date-feedback/date-feedback?matchLogId=${this.data.matchId}&coordinationId=${state.coordination_id || 0}`
    })
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
    const reportWasFailed = this.data.detail.aiReportStatus === 'failed'
    this.setData({
      reportGenerating: true,
      'detail.aiReportStatus': 4,
      'detail.reportStatusText': '生成中'
    })
    try {
      const path = reportWasFailed
        ? API_PATHS.MATCH_REPORT_TASK_RETRY
        : API_PATHS.MATCH_REPORT_TASK
      await post(path, {
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
