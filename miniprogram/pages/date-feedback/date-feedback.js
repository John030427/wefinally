const { get, post } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

function selectedMap(items) {
  const map = {}
  ;(items || []).forEach((item) => { map[item] = true })
  return map
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    matchLogId: 0,
    coordinationId: 0,
    submitting: false,
    saved: false,
    selectedReasons: {},
    form: {
      met_status: '',
      continue_intent: '',
      authenticity: '',
      safety: '',
      reasons: [],
      note: '',
      avoid_similar: false,
      request_human_review: false
    },
    metOptions: [
      { value: 'met', label: '已经见面' },
      { value: 'cancelled', label: '双方取消' },
      { value: 'no_show', label: '对方未出现' },
      { value: 'not_yet', label: '还未见面' }
    ],
    continueOptions: [
      { value: 'yes', label: '愿意继续了解' },
      { value: 'unsure', label: '还需要考虑' },
      { value: 'no', label: '不想继续' }
    ],
    authenticityOptions: [
      { value: 'consistent', label: '基本一致' },
      { value: 'minor_gap', label: '有少量差异' },
      { value: 'major_gap', label: '差异明显' },
      { value: 'not_sure', label: '暂时无法判断' }
    ],
    safetyOptions: [
      { value: 'safe', label: '感到安全' },
      { value: 'uncomfortable', label: '有些不适' },
      { value: 'unsafe', label: '感到不安全' }
    ],
    reasonOptions: [
      { value: 'conversation', label: '沟通感受' },
      { value: 'values', label: '价值观' },
      { value: 'pace', label: '关系节奏' },
      { value: 'appearance', label: '外貌感受' },
      { value: 'authenticity', label: '资料真实性' },
      { value: 'safety', label: '安全与边界' },
      { value: 'location', label: '距离安排' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad(options) {
    this.setData({
      matchLogId: Number(options.matchLogId || 0),
      coordinationId: Number(options.coordinationId || 0)
    })
    this.loadFeedback()
  },

  async loadFeedback() {
    if (!this.data.matchLogId) {
      this.setData({ pageState: 'error', errorMsg: '缺少匹配记录' })
      return
    }
    try {
      const result = await get(API_PATHS.DATE_FEEDBACK, {
        match_log_id: this.data.matchLogId,
        coordination_id: this.data.coordinationId
      }, { showError: false })
      if (!result || !result.can_submit) {
        this.setData({
          pageState: 'error',
          errorMsg: (result && result.reason) || '约会尚未完成安排'
        })
        return
      }
      const feedback = result.feedback || null
      const form = feedback
        ? Object.assign({}, this.data.form, feedback, { reasons: feedback.reasons || [] })
        : this.data.form
      this.setData({
        pageState: 'success',
        coordinationId: Number(result.coordination_id || this.data.coordinationId),
        form,
        selectedReasons: selectedMap(form.reasons),
        saved: Boolean(feedback)
      })
    } catch (err) {
      this.setData({ pageState: 'error', errorMsg: (err && err.message) || '反馈页面加载失败' })
    }
  },

  onRetry() {
    this.setData({ pageState: 'loading' })
    this.loadFeedback()
  },

  selectSingle(e) {
    const key = e.currentTarget.dataset.key
    const value = e.currentTarget.dataset.value
    if (key === 'met_status' && value !== 'met') {
      this.setData({
        'form.met_status': value,
        'form.continue_intent': value === 'no_show' ? 'no' : 'unsure',
        'form.authenticity': 'not_sure',
        'form.safety': 'not_applicable'
      })
      return
    }
    if (key === 'met_status' && value === 'met' && this.data.form.safety === 'not_applicable') {
      this.setData({
        'form.met_status': value,
        'form.continue_intent': '',
        'form.authenticity': '',
        'form.safety': ''
      })
      return
    }
    this.setData({ [`form.${key}`]: value })
  },

  toggleReason(e) {
    const value = e.currentTarget.dataset.value
    const reasons = this.data.form.reasons || []
    const next = reasons.includes(value)
      ? reasons.filter((item) => item !== value)
      : reasons.concat(value).slice(0, 5)
    this.setData({
      'form.reasons': next,
      selectedReasons: selectedMap(next)
    })
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value || '' })
  },

  onBooleanChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: Boolean(e.detail.value && e.detail.value.length) })
  },

  validate() {
    const form = this.data.form
    if (!form.met_status) {
      wx.showToast({ title: '请先选择是否见面', icon: 'none' })
      return false
    }
    if (form.met_status === 'met' && (!form.continue_intent || !form.authenticity || !form.safety)) {
      wx.showToast({ title: '请完成四项核心反馈', icon: 'none' })
      return false
    }
    return true
  },

  async submit() {
    if (!this.validate() || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await post(API_PATHS.DATE_FEEDBACK, Object.assign({}, this.data.form, {
        match_log_id: this.data.matchLogId,
        coordination_id: this.data.coordinationId
      }), { showLoading: true, loadingText: '正在保存...' })
      this.setData({ saved: true, form: Object.assign({}, this.data.form, result || {}) })
      wx.showModal({
        title: '反馈已保存',
        content: '感谢你的真实反馈。平台只会将结构化结果用于服务改进；需要人工复核的内容将由工作人员处理。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
    } catch (err) {
      wx.showModal({
        title: '反馈未保存',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
