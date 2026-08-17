const { get, post, put } = require('../../utils/request')
const {
  API_PATHS,
  STORAGE_KEYS,
  AGE_RANGE_OPTIONS,
  EDUCATION_OPTIONS,
  HEIGHT_RANGE_OPTIONS,
  LIKE_MARRY_OPTIONS,
  LIKE_BABY_PLAN_OPTIONS,
  TEXT_MIN_LEN,
  TEXT_MAX_LEN,
  SUBSCRIBE_TMPL_IDS
} = require('../../utils/constants')
const { getCooldownRemain, setCooldownEnd, validateTextLength } = require('../../utils/util')

function normalizeLikeMarryLabel(value) {
  if (value === '未婚') return '仅看未婚'
  if (value === '不限') return '可接受离异'
  return value || ''
}

function toLikeMarryValue(value) {
  if (value === '仅看未婚') return '未婚'
  if (value === '可接受离异') return '不限'
  return value || ''
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    ageRangeOptions: AGE_RANGE_OPTIONS,
    educationOptions: EDUCATION_OPTIONS,
    heightRangeOptions: HEIGHT_RANGE_OPTIONS,
    likeMarryOptions: LIKE_MARRY_OPTIONS,
    likeBabyPlanOptions: LIKE_BABY_PLAN_OPTIONS,
    form: {
      preferAge: '',
      preferAgeIndex: -1,
      preferEducation: '',
      preferEducationIndex: -1,
      preferHeight: '',
      preferHeightIndex: -1,
      likeMarry: '',
      likeMarryIndex: -1,
      likeBabyPlan: '',
      likeBabyPlanIndex: -1,
      myValues: '',
      expectValues: '',
      otherRequirements: ''
    },
    myValuesLen: 0,
    expectValuesLen: 0,
    appearanceDescription: '',
    appearanceWant: '',
    appearanceDescriptionLen: 0,
    appearanceWantLen: 0,
    appearanceMaxLen: 500,
    otherRequirementsLen: 0,
    otherRequirementsMaxLen: 500,
    intentConfirmation: null,
    aiProfile: null,
    aiConfirmed: false,
    aiCorrectionMode: false,
    aiCorrectionText: '',
    aiProfileVersion: 0,
    aiFeedbackLoading: false,
    memberStatus: '',
    textMinLen: TEXT_MIN_LEN,
    textMaxLen: TEXT_MAX_LEN,
    cooldownActive: false,
    cooldownText: '',
    submitting: false
  },

  _cooldownTimer: null,

  onLoad() {
    this.initPage()
  },

  onUnload() {
    this.clearCooldownTimer()
  },

  onHide() {
    this.clearCooldownTimer()
  },

  clearCooldownTimer() {
    if (this._cooldownTimer) {
      clearInterval(this._cooldownTimer)
      this._cooldownTimer = null
    }
  },

  async initPage() {
    this.setData({ pageState: 'loading' })
    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      this.setData({ pageState: 'no-network' })
      return
    }

    try {
      const [settingData, cooldownData, profileData, aiProfileData] = await Promise.all([
        get(API_PATHS.MATCH_SETTING, {}, { showError: false }).catch(() => null),
        get(API_PATHS.MATCH_SETTING_COOLDOWN, {}, { showError: false }).catch(() => null),
        get(API_PATHS.USER_PROFILE, {}, { showError: false }).catch(() => null),
        get(API_PATHS.MATCH_AI_PROFILE, {}, { showError: false }).catch(() => null)
      ])

      if (settingData) this.fillForm(settingData)
      if (profileData) this.fillAppearance(profileData)
      if (aiProfileData) this.fillAiProfile(aiProfileData)

      const canEditWithoutCooldown = cooldownData && (
        cooldownData.can_edit === true || cooldownData.canEdit === true || cooldownData.can_update === true
      )
      if (canEditWithoutCooldown) wx.removeStorageSync(STORAGE_KEYS.MATCH_SETTING_COOLDOWN)
      const cooldownEnd = canEditWithoutCooldown ? null : (
        (cooldownData && (cooldownData.cooldownEndTime || cooldownData.cooldown_end_time)) ||
        (cooldownData && cooldownData.cooldown_remain_days > 0
          ? Date.now() + cooldownData.cooldown_remain_days * 86400000
          : null) ||
        wx.getStorageSync(STORAGE_KEYS.MATCH_SETTING_COOLDOWN)
      )

      if (cooldownEnd) this.startCooldownTimer(cooldownEnd)
      this.setData({ pageState: 'success' })
    } catch (err) {
      const localEnd = wx.getStorageSync(STORAGE_KEYS.MATCH_SETTING_COOLDOWN)
      if (localEnd) this.startCooldownTimer(localEnd)
      this.setData({
        pageState: localEnd ? 'success' : 'error',
        errorMsg: (err && err.message) || '加载失败'
      })
    }
  },

  fillForm(data) {
    const form = { ...this.data.form }
    const pick = (opts, val, key, idxKey) => {
      if (!val) return
      const idx = opts.indexOf(val)
      form[key] = val
      form[idxKey] = idx >= 0 ? idx : -1
    }
    const ageRange = Number(data.age_min) === 45 && Number(data.age_max) === 65
      ? '45岁以上'
      : (data.age_min && data.age_max ? `${data.age_min}-${data.age_max}岁` : '')
    const heightRange = Number(data.height_min) === 190 && Number(data.height_max) === 220
      ? '190cm以上'
      : (data.height_min && data.height_max ? `${data.height_min}-${data.height_max}cm` : '')
    pick(AGE_RANGE_OPTIONS, data.prefer_age || data.preferAge || ageRange, 'preferAge', 'preferAgeIndex')
    pick(EDUCATION_OPTIONS, data.prefer_education || data.min_education, 'preferEducation', 'preferEducationIndex')
    pick(HEIGHT_RANGE_OPTIONS, data.prefer_height || heightRange, 'preferHeight', 'preferHeightIndex')
    pick(LIKE_MARRY_OPTIONS, normalizeLikeMarryLabel(data.like_marry_status), 'likeMarry', 'likeMarryIndex')
    pick(LIKE_BABY_PLAN_OPTIONS, data.like_baby_plan, 'likeBabyPlan', 'likeBabyPlanIndex')
    form.myValues = data.my_values || data.myValues || data.self_view_text || ''
    form.expectValues = data.expect_values || data.expectValues || data.target_view_text || ''
    form.otherRequirements = data.other_requirements || data.otherRequirements || ''
    this.setData({
      form,
      myValuesLen: form.myValues.length,
      expectValuesLen: form.expectValues.length,
      otherRequirementsLen: form.otherRequirements.length,
      intentConfirmation: data.intent_confirmation_required ? (data.intent_profile || null) : null
    })
  },

  fillAppearance(data) {
    const appearanceDescription = data.appearance_description || ''
    const appearanceWant = data.appearance_want || ''
    this.setData({
      appearanceDescription,
      appearanceWant,
      memberStatus: data.member_status || '',
      appearanceDescriptionLen: appearanceDescription.length,
      appearanceWantLen: appearanceWant.length
    })
  },

  fillAiProfile(data) {
    if (!data || data.available !== true || !data.presentation) return
    this.setData({
      aiProfile: data.presentation,
      aiConfirmed: data.confirmed === true,
      aiProfileVersion: Number(data.profile_version || 0),
      aiCorrectionMode: false,
      aiCorrectionText: ''
    })
  },

  onToggleAiCorrection() {
    if (this.data.aiFeedbackLoading) return
    this.setData({ aiCorrectionMode: !this.data.aiCorrectionMode, aiCorrectionText: '' })
  },

  onAiCorrectionInput(e) {
    this.setData({ aiCorrectionText: String(e.detail.value || '').slice(0, 200) })
  },

  async onConfirmAiProfile() {
    if (this.data.aiFeedbackLoading || !this.data.aiProfile) return
    this.setData({ aiFeedbackLoading: true })
    try {
      const result = await post(API_PATHS.MATCH_AI_PROFILE_CONFIRM, {}, { showError: false })
      if (result && result.presentation) {
        this.setData({ aiProfile: result.presentation, aiConfirmed: true, aiProfileVersion: Number(result.profile_version || this.data.aiProfileVersion) })
      } else {
        this.setData({ aiConfirmed: true })
      }
      wx.showToast({ title: '已记录，谢谢确认', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '确认失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ aiFeedbackLoading: false })
    }
  },

  async onSubmitAiCorrection() {
    const text = String(this.data.aiCorrectionText || '').trim()
    if (!text) {
      wx.showToast({ title: '请先填写纠正意见', icon: 'none' })
      return
    }
    if (text.length > 200) {
      wx.showToast({ title: '纠正意见最多200字', icon: 'none' })
      return
    }
    if (this.data.aiFeedbackLoading) return
    this.setData({ aiFeedbackLoading: true })
    try {
      const result = await post(API_PATHS.MATCH_AI_PROFILE_CORRECT, { correction_text: text }, { showError: false })
      if (result && result.presentation) {
        this.setData({
          aiProfile: result.presentation,
          aiConfirmed: true,
          aiProfileVersion: Number(result.profile_version || this.data.aiProfileVersion),
          aiCorrectionMode: false,
          aiCorrectionText: ''
        })
      }
      wx.showToast({ title: '已更新AI对你的理解', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '提交失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ aiFeedbackLoading: false })
    }
  },

  startCooldownTimer(cooldownEnd) {
    this.clearCooldownTimer()
    const update = () => {
      const remain = getCooldownRemain(cooldownEnd)
      this.setData({ cooldownActive: remain.active, cooldownText: remain.text })
      if (!remain.active) {
        this.clearCooldownTimer()
        wx.removeStorageSync(STORAGE_KEYS.MATCH_SETTING_COOLDOWN)
      }
    }
    update()
    this._cooldownTimer = setInterval(update, 1000)
  },

  onRetry() {
    this.initPage()
  },

  onPickerChange(e) {
    const field = e.currentTarget.dataset.field
    const index = Number(e.detail.value)
    const map = {
      preferAge: { options: 'ageRangeOptions', key: 'preferAge' },
      preferEducation: { options: 'educationOptions', key: 'preferEducation' },
      preferHeight: { options: 'heightRangeOptions', key: 'preferHeight' },
      likeMarry: { options: 'likeMarryOptions', key: 'likeMarry' },
      likeBabyPlan: { options: 'likeBabyPlanOptions', key: 'likeBabyPlan' }
    }
    const config = map[field]
    const value = this.data[config.options][index]
    this.setData({
      [`form.${config.key}`]: value,
      [`form.${config.key}Index`]: index
    })
  },

  onMyValuesInput(e) {
    const val = e.detail.value
    this.setData({ 'form.myValues': val, myValuesLen: val.length })
  },

  onExpectValuesInput(e) {
    const val = e.detail.value
    this.setData({ 'form.expectValues': val, expectValuesLen: val.length })
  },

  onOtherRequirementsInput(e) {
    const val = e.detail.value || ''
    this.setData({ 'form.otherRequirements': val, otherRequirementsLen: val.length })
  },

  onAppearanceDescriptionInput(e) {
    const val = e.detail.value || ''
    this.setData({ appearanceDescription: val, appearanceDescriptionLen: val.length })
  },

  onAppearanceWantInput(e) {
    const val = e.detail.value || ''
    this.setData({ appearanceWant: val, appearanceWantLen: val.length })
  },

  validateForm() {
    const { form, cooldownActive } = this.data
    if (cooldownActive) {
      wx.showModal({ title: '冷却中', content: '全套择偶配置7天内仅可修改1次，请等待冷却结束', showCancel: false })
      return false
    }
    if (!form.preferAge || !form.preferEducation || !form.preferHeight) {
      wx.showToast({ title: '请完善择偶条件', icon: 'none' })
      return false
    }
    if (!validateTextLength(form.myValues, TEXT_MIN_LEN, TEXT_MAX_LEN)) {
      wx.showModal({
        title: '字数不足',
        content: `【我的三观自述】需 ${TEXT_MIN_LEN}-${TEXT_MAX_LEN} 字，当前 ${(form.myValues || '').trim().length} 字`,
        showCancel: false
      })
      return false
    }
    if (!validateTextLength(form.expectValues, TEXT_MIN_LEN, TEXT_MAX_LEN)) {
      wx.showModal({
        title: '字数不足',
        content: `【期待对方三观】需 ${TEXT_MIN_LEN}-${TEXT_MAX_LEN} 字，当前 ${(form.expectValues || '').trim().length} 字`,
        showCancel: false
      })
      return false
    }
    if (String(form.otherRequirements || '').trim().length > this.data.otherRequirementsMaxLen) {
      wx.showToast({ title: '其他补充需求最多500字', icon: 'none' })
      return false
    }
    return true
  },

  async submitApplication() {
    await post(API_PATHS.MEMBER_APPLICATION_SUBMIT, {}, {
      showLoading: true,
      loadingText: '提交审核中...'
    })
    if (SUBSCRIBE_TMPL_IDS.length) {
      wx.requestSubscribeMessage({ tmplIds: SUBSCRIBE_TMPL_IDS, complete: () => {} })
    }
    wx.showToast({ title: '申请已提交', icon: 'success' })
    setTimeout(() => wx.redirectTo({ url: '/pages/member-application/member-application' }), 1000)
  },

  async onConfirmIntent() {
    if (!this.data.intentConfirmation || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await post(API_PATHS.MATCH_INTENT_CONFIRM, {}, { showError: false })
      if (this.data.memberStatus === 'approved') {
        this.setData({ intentConfirmation: null })
        wx.showToast({ title: '理解已确认', icon: 'success' })
        setTimeout(() => wx.navigateBack({ delta: 1 }), 600)
      } else {
        await this.submitApplication()
      }
    } catch (err) {
      wx.showModal({
        title: '提交失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onEditIntent() {
    if (this.data.submitting) return
    this.setData({ intentConfirmation: null })
  },

  async onSubmit() {
    if (!this.validateForm() || this.data.submitting) return

    this.setData({ submitting: true })
    const { form } = this.data

    try {
      const profile = await put(API_PATHS.USER_PROFILE_UPDATE, {
        appearance_want: this.data.appearanceWant.trim()
      }, { showError: false })
      const app = getApp()
      app.globalData.userInfo = profile
      wx.setStorageSync(STORAGE_KEYS.USER_INFO, profile)

      const savedSetting = await post(API_PATHS.MATCH_SETTING, {
        prefer_age: form.preferAge,
        prefer_education: form.preferEducation,
        prefer_height: form.preferHeight,
        like_marry_status: toLikeMarryValue(form.likeMarry),
        like_baby_plan: form.likeBabyPlan,
        psych_profile: null,
        my_values: form.myValues.trim(),
        expect_values: form.expectValues.trim(),
        other_requirements: form.otherRequirements.trim()
      }, { showLoading: true, loadingText: '保存中...' })
      if (savedSetting && savedSetting.intent_confirmation_required) {
        this.setData({ intentConfirmation: savedSetting.intent_profile || null })
      } else {
        await this.submitApplication()
      }
    } catch (err) {
      wx.showModal({
        title: '保存失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
