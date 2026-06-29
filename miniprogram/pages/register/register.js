const { get, post } = require('../../utils/request')
const {
  API_PATHS,
  STORAGE_KEYS,
  GENDER_OPTIONS,
  EDUCATION_OPTIONS,
  INCOME_OPTIONS,
  MARRIAGE_OPTIONS,
  BABY_PLAN_OPTIONS,
  HOUSE_CAR_OPTIONS,
  CITY_OPTIONS
} = require('../../utils/constants')
const { parsePromoteCode } = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    genderOptions: GENDER_OPTIONS,
    educationOptions: EDUCATION_OPTIONS,
    incomeOptions: INCOME_OPTIONS,
    marriageOptions: MARRIAGE_OPTIONS,
    babyPlanOptions: BABY_PLAN_OPTIONS,
    houseCarOptions: HOUSE_CAR_OPTIONS,
    cityOptions: CITY_OPTIONS,
    circleOptions: [],
    circleNames: [],
    form: {
      gender: '',
      genderIndex: -1,
      birthYear: '',
      birthYearIndex: -1,
      city: '',
      cityIndex: -1,
      education: '',
      educationIndex: -1,
      income: '',
      incomeIndex: -1,
      marriage: '',
      marriageIndex: -1,
      babyPlan: '',
      babyPlanIndex: -1,
      houseCar: '',
      houseCarIndex: -1,
      height: '',
      heightIndex: -1,
      circleId: 0,
      circleIndex: -1,
      circleName: '',
      promote_code: ''
    },
    birthYearOptions: [],
    heightOptions: [],
    submitting: false
  },

  onLoad(options) {
    if (!wx.getStorageSync(STORAGE_KEYS.AGREEMENT_ACCEPTED)) {
      wx.redirectTo({ url: '/pages/agreement/agreement' })
      return
    }
    this.initBirthYears()
    this.initHeights()
    this.parsePromoteCode(options)
    this.initPage()
  },

  initBirthYears() {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let y = currentYear - 50; y <= currentYear - 18; y++) {
      years.push(`${y}年`)
    }
    years.reverse()
    this.setData({ birthYearOptions: years })
  },

  initHeights() {
    const heights = []
    for (let h = 150; h <= 200; h++) {
      heights.push(`${h}cm`)
    }
    this.setData({ heightOptions: heights })
  },

  parsePromoteCode(options) {
    const app = getApp()
    let code = parsePromoteCode(
      (options && options.scene) || (app.globalData.launchScene),
      { ...app.globalData.launchQuery, ...options }
    )
    if (!code) {
      code = wx.getStorageSync(STORAGE_KEYS.PROMOTE_CODE) || ''
    }
    if (code) {
      wx.setStorageSync(STORAGE_KEYS.PROMOTE_CODE, code)
      this.setData({ 'form.promote_code': code })
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
      const circles = await get(API_PATHS.CIRCLES, {}, { showError: false })
      const list = Array.isArray(circles) ? circles : []
      this.setData({
        circleOptions: list,
        circleNames: list.map((c) => c.name || c.circle_name),
        pageState: 'success'
      })
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载圈层失败'
      })
    }
  },

  onRetry() {
    this.initPage()
  },

  onPickerChange(e) {
    const field = e.currentTarget.dataset.field
    const index = Number(e.detail.value)
    const map = {
      gender: { options: 'genderOptions', key: 'gender' },
      birthYear: { options: 'birthYearOptions', key: 'birthYear' },
      city: { options: 'cityOptions', key: 'city' },
      education: { options: 'educationOptions', key: 'education' },
      income: { options: 'incomeOptions', key: 'income' },
      marriage: { options: 'marriageOptions', key: 'marriage' },
      babyPlan: { options: 'babyPlanOptions', key: 'babyPlan' },
      houseCar: { options: 'houseCarOptions', key: 'houseCar' },
      height: { options: 'heightOptions', key: 'height' },
      circle: { options: 'circleNames', key: 'circleName' }
    }
    const config = map[field]
    const value = this.data[config.options][index]
    const update = {
      [`form.${config.key}`]: value,
      [`form.${config.key}Index`]: index
    }
    if (field === 'circle') {
      const circle = this.data.circleOptions[index]
      update['form.circleId'] = circle ? circle.id : 0
    }
    this.setData(update)
  },

  validateForm() {
    const { form } = this.data
    const required = ['gender', 'birthYear', 'city', 'education', 'marriage', 'height', 'babyPlan', 'circleName']
    for (const key of required) {
      if (!form[key]) {
        wx.showToast({ title: '请完善所有必填信息', icon: 'none' })
        return false
      }
    }
    return true
  },

  async onSubmit() {
    if (!this.validateForm() || this.data.submitting) return

    const openid = wx.getStorageSync(STORAGE_KEYS.OPENID)
    if (!openid) {
      wx.showModal({
        title: '请先登录',
        content: '请返回登录页完成微信授权',
        showCancel: false,
        success: () => wx.redirectTo({ url: '/pages/login/login' })
      })
      return
    }

    const app = getApp()
    const hasNetwork = await app.checkNetwork()
    if (!hasNetwork) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    const { form } = this.data

    try {
      const data = await post(API_PATHS.REGISTER, {
        openid,
        gender: form.gender,
        birth_year: form.birthYear.replace('年', ''),
        city: form.city,
        education: form.education,
        income_range: form.income || '',
        marry_status: form.marriage,
        baby_plan: form.babyPlan,
        house_car: form.houseCar || '',
        height_range: form.height,
        circle_id: form.circleId,
        promote_code: form.promote_code,
        agreements: ['user_service', 'privacy', 'data_auth'],
        device_info: `${wx.getSystemInfoSync().model || ''} ${wx.getSystemInfoSync().system || ''}`
      }, { showLoading: true, loadingText: '提交中...' })

      if (data && data.token) {
        app.setLoginState(data.token, data.user || data.userInfo)
      }

      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/match-setting/match-setting' })
      }, 1000)
    } catch (err) {
      wx.showModal({
        title: '注册失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
