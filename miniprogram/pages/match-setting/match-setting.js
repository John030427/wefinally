const { get, post } = require('../../utils/request')
const {
  API_PATHS,
  STORAGE_KEYS,
  AGE_RANGE_OPTIONS,
  EDUCATION_OPTIONS,
  CITY_OPTIONS,
  HEIGHT_RANGE_OPTIONS,
  LIKE_MARRY_OPTIONS,
  LIKE_BABY_PLAN_OPTIONS,
  PSYCH_PROFILE_OPTIONS,
  TEXT_MIN_LEN,
  TEXT_MAX_LEN,
  SUBSCRIBE_TMPL_IDS
} = require('../../utils/constants')
const { getCooldownRemain, setCooldownEnd, validateTextLength } = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    ageRangeOptions: AGE_RANGE_OPTIONS,
    educationOptions: EDUCATION_OPTIONS,
    cityOptions: CITY_OPTIONS,
    heightRangeOptions: HEIGHT_RANGE_OPTIONS,
    likeMarryOptions: LIKE_MARRY_OPTIONS,
    likeBabyPlanOptions: LIKE_BABY_PLAN_OPTIONS,
    marriagePaceOptions: PSYCH_PROFILE_OPTIONS.marriage_pace,
    conflictStyleOptions: PSYCH_PROFILE_OPTIONS.conflict_style,
    securitySpaceOptions: PSYCH_PROFILE_OPTIONS.security_space,
    familyBoundaryOptions: PSYCH_PROFILE_OPTIONS.family_boundary,
    moneyViewOptions: PSYCH_PROFILE_OPTIONS.money_view,
    careerFamilyOptions: PSYCH_PROFILE_OPTIONS.career_family,
    form: {
      preferAge: '',
      preferAgeIndex: -1,
      preferEducation: '',
      preferEducationIndex: -1,
      preferCity: '',
      preferCityIndex: -1,
      preferHeight: '',
      preferHeightIndex: -1,
      likeMarry: '',
      likeMarryIndex: -1,
      likeBabyPlan: '',
      likeBabyPlanIndex: -1,
      marriagePace: '',
      marriagePaceIndex: -1,
      conflictStyle: '',
      conflictStyleIndex: -1,
      securitySpace: '',
      securitySpaceIndex: -1,
      familyBoundary: '',
      familyBoundaryIndex: -1,
      moneyView: '',
      moneyViewIndex: -1,
      careerFamily: '',
      careerFamilyIndex: -1,
      myValues: '',
      expectValues: ''
    },
    myValuesLen: 0,
    expectValuesLen: 0,
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
      const [settingData, cooldownData] = await Promise.all([
        get(API_PATHS.MATCH_SETTING, {}, { showError: false }).catch(() => null),
        get(API_PATHS.MATCH_SETTING_COOLDOWN, {}, { showError: false }).catch(() => null)
      ])

      if (settingData) this.fillForm(settingData)

      const cooldownEnd = (cooldownData && (cooldownData.cooldownEndTime || cooldownData.cooldown_end_time)) ||
        (cooldownData && cooldownData.cooldown_remain_days > 0
          ? Date.now() + cooldownData.cooldown_remain_days * 86400000
          : null) ||
        wx.getStorageSync(STORAGE_KEYS.MATCH_SETTING_COOLDOWN)

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
    pick(AGE_RANGE_OPTIONS, data.prefer_age || data.preferAge, 'preferAge', 'preferAgeIndex')
    pick(EDUCATION_OPTIONS, data.prefer_education || data.min_education, 'preferEducation', 'preferEducationIndex')
    pick(CITY_OPTIONS, data.prefer_city || data.like_city, 'preferCity', 'preferCityIndex')
    pick(HEIGHT_RANGE_OPTIONS, data.prefer_height, 'preferHeight', 'preferHeightIndex')
    pick(LIKE_MARRY_OPTIONS, data.like_marry_status, 'likeMarry', 'likeMarryIndex')
    pick(LIKE_BABY_PLAN_OPTIONS, data.like_baby_plan, 'likeBabyPlan', 'likeBabyPlanIndex')
    const psych = data.psych_profile || data.psychProfile || {}
    pick(PSYCH_PROFILE_OPTIONS.marriage_pace, psych.marriage_pace, 'marriagePace', 'marriagePaceIndex')
    pick(PSYCH_PROFILE_OPTIONS.conflict_style, psych.conflict_style, 'conflictStyle', 'conflictStyleIndex')
    pick(PSYCH_PROFILE_OPTIONS.security_space, psych.security_space, 'securitySpace', 'securitySpaceIndex')
    pick(PSYCH_PROFILE_OPTIONS.family_boundary, psych.family_boundary, 'familyBoundary', 'familyBoundaryIndex')
    pick(PSYCH_PROFILE_OPTIONS.money_view, psych.money_view, 'moneyView', 'moneyViewIndex')
    pick(PSYCH_PROFILE_OPTIONS.career_family, psych.career_family, 'careerFamily', 'careerFamilyIndex')
    form.myValues = data.my_values || data.myValues || ''
    form.expectValues = data.expect_values || data.expectValues || ''
    this.setData({
      form,
      myValuesLen: form.myValues.length,
      expectValuesLen: form.expectValues.length
    })
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
      preferCity: { options: 'cityOptions', key: 'preferCity' },
      preferHeight: { options: 'heightRangeOptions', key: 'preferHeight' },
      likeMarry: { options: 'likeMarryOptions', key: 'likeMarry' },
      likeBabyPlan: { options: 'likeBabyPlanOptions', key: 'likeBabyPlan' },
      marriagePace: { options: 'marriagePaceOptions', key: 'marriagePace' },
      conflictStyle: { options: 'conflictStyleOptions', key: 'conflictStyle' },
      securitySpace: { options: 'securitySpaceOptions', key: 'securitySpace' },
      familyBoundary: { options: 'familyBoundaryOptions', key: 'familyBoundary' },
      moneyView: { options: 'moneyViewOptions', key: 'moneyView' },
      careerFamily: { options: 'careerFamilyOptions', key: 'careerFamily' }
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

  validateForm() {
    const { form, cooldownActive } = this.data
    if (cooldownActive) {
      wx.showModal({ title: '冷却中', content: '全套择偶配置7天内仅可修改1次，请等待冷却结束', showCancel: false })
      return false
    }
    if (!form.preferAge || !form.preferEducation || !form.preferCity || !form.preferHeight) {
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
    return true
  },

  async onSubmit() {
    if (!this.validateForm() || this.data.submitting) return

    this.setData({ submitting: true })
    const { form } = this.data

    try {
      await post(API_PATHS.MATCH_SETTING, {
        prefer_age: form.preferAge,
        prefer_education: form.preferEducation,
        prefer_city: form.preferCity,
        prefer_height: form.preferHeight,
        like_marry_status: form.likeMarry,
        like_baby_plan: form.likeBabyPlan,
        psych_profile: {
          marriage_pace: form.marriagePace,
          conflict_style: form.conflictStyle,
          security_space: form.securitySpace,
          family_boundary: form.familyBoundary,
          money_view: form.moneyView,
          career_family: form.careerFamily
        },
        my_values: form.myValues.trim(),
        expect_values: form.expectValues.trim()
      }, { showLoading: true, loadingText: '保存中...' })

      const cooldownEnd = setCooldownEnd()
      wx.setStorageSync(STORAGE_KEYS.MATCH_SETTING_COOLDOWN, cooldownEnd)
      this.startCooldownTimer(cooldownEnd)
      if (SUBSCRIBE_TMPL_IDS.length) {
        wx.requestSubscribeMessage({ tmplIds: SUBSCRIBE_TMPL_IDS, complete: () => {} })
      }

      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000)
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
