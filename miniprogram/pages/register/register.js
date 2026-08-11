const { get, post, put } = require('../../utils/request')
const {
  API_PATHS,
  STORAGE_KEYS,
  GENDER_OPTIONS,
  EDUCATION_OPTIONS,
  INCOME_OPTIONS,
  MARRIAGE_OPTIONS,
  BABY_PLAN_OPTIONS,
  HOUSE_CAR_OPTIONS,
  CITY_OPTIONS,
  HEIGHT_RANGE_OPTIONS
} = require('../../utils/constants')
const { parsePromoteCode, normalizePromoteCode } = require('../../utils/util')

Page({
  data: {
    pageState: 'loading',
    editMode: false,
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
    circleGroups: [],
    circlePlates: [],
    circleMatrix: [[], []],
    circleMultiIndex: [0, 0],
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
      occupationDescription: '',
      appearanceDescription: '',
      promote_code: ''
    },
    birthYearOptions: [],
    heightOptions: [],
    appearanceDescriptionLen: 0,
    appearanceMaxLen: 500,
    promoStatus: '',
    promoMessage: '',
    checkingPromo: false,
    submitting: false
  },

  onLoad(options) {
    if (!wx.getStorageSync(STORAGE_KEYS.AGREEMENT_ACCEPTED)) {
      wx.redirectTo({ url: '/pages/agreement/agreement' })
      return
    }
    this.setData({ editMode: Boolean(options && options.edit === '1') })
    this.initBirthYears()
    this.initHeights()
    this.parsePromoteCode(options)
    this.initPage()
  },

  initBirthYears() {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let y = currentYear - 65; y <= currentYear - 18; y++) {
      years.push(`${y}年`)
    }
    years.reverse()
    this.setData({ birthYearOptions: years })
  },

  initHeights() {
    this.setData({ heightOptions: HEIGHT_RANGE_OPTIONS })
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
      const normalized = normalizePromoteCode(code)
      wx.setStorageSync(STORAGE_KEYS.PROMOTE_CODE, normalized)
      this.setData({
        'form.promote_code': normalized,
        promoStatus: 'pending',
        promoMessage: '已带入推广码，提交前会自动校验'
      })
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
      const circlePicker = this.buildCirclePicker(list)
      this.setData({
        circleOptions: list,
        circleNames: list.map((c) => c.name || c.circle_name),
        circleGroups: circlePicker.groups,
        circlePlates: circlePicker.plates,
        circleMatrix: circlePicker.matrix,
        pageState: 'success'
      })
      if (this.data.editMode) {
        const profile = await get(API_PATHS.USER_PROFILE, {}, { showError: false })
        this.fillExistingProfile(profile, list, circlePicker.groups)
      }
    } catch (err) {
      this.setData({
        pageState: 'error',
        errorMsg: (err && err.message) || '加载圈层失败'
      })
    }
  },

  fillExistingProfile(profile, list, groups) {
    const circle = list.find((item) => Number(item.id) === Number(profile.circle_id))
    const plateIndex = Math.max(0, groups.findIndex((group) => group.circles.some((item) => Number(item.id) === Number(profile.circle_id))))
    const group = groups[plateIndex]
    const circleIndex = Math.max(0, group ? group.circles.findIndex((item) => Number(item.id) === Number(profile.circle_id)) : 0)
    const gender = Number(profile.gender) === 1 ? '男' : '女'
    const birthYear = profile.birth_year ? `${profile.birth_year}年` : ''
    const form = Object.assign({}, this.data.form, {
      gender,
      genderIndex: GENDER_OPTIONS.indexOf(gender),
      birthYear,
      birthYearIndex: this.data.birthYearOptions.indexOf(birthYear),
      city: profile.city || '',
      cityIndex: CITY_OPTIONS.indexOf(profile.city),
      education: profile.education || '',
      educationIndex: EDUCATION_OPTIONS.indexOf(profile.education),
      marriage: profile.marry_status || '',
      marriageIndex: MARRIAGE_OPTIONS.indexOf(profile.marry_status),
      babyPlan: profile.baby_plan || '',
      babyPlanIndex: BABY_PLAN_OPTIONS.indexOf(profile.baby_plan),
      houseCar: profile.house_car || '',
      houseCarIndex: HOUSE_CAR_OPTIONS.indexOf(profile.house_car),
      height: profile.height_range || '',
      heightIndex: HEIGHT_RANGE_OPTIONS.indexOf(profile.height_range),
      circleId: Number(profile.circle_id || 0),
      circleName: circle ? (circle.name || circle.circle_name) : '',
      occupationDescription: profile.occupation_description || '',
      appearanceDescription: profile.appearance_description || '',
      promote_code: profile.promote_code || ''
    })
    this.setData({
      form,
      circleMultiIndex: [plateIndex, circleIndex],
      circleMatrix: [this.data.circlePlates, group ? group.circles.map((item) => item.name || item.circle_name) : []],
      appearanceDescriptionLen: form.appearanceDescription.length,
      promoStatus: 'success',
      promoMessage: '邀请归属已锁定'
    })
  },

  buildCirclePicker(list) {
    const groupMap = {}
    list.forEach((circle) => {
      const plate = circle.plate_name || '其他'
      if (!groupMap[plate]) groupMap[plate] = []
      groupMap[plate].push(circle)
    })
    const plates = Object.keys(groupMap)
    const groups = plates.map((plate) => ({
      plate,
      circles: groupMap[plate]
    }))
    const firstCircles = groups[0] ? groups[0].circles : []
    return {
      groups,
      plates,
      matrix: [plates, firstCircles.map((c) => c.name || c.circle_name)]
    }
  },

  onCircleColumnChange(e) {
    const column = Number(e.detail.column)
    const value = Number(e.detail.value)
    const nextIndex = this.data.circleMultiIndex.slice()
    nextIndex[column] = value
    if (column === 0) {
      nextIndex[1] = 0
      const group = this.data.circleGroups[value]
      this.setData({
        circleMultiIndex: nextIndex,
        circleMatrix: [
          this.data.circlePlates,
          group ? group.circles.map((c) => c.name || c.circle_name) : []
        ]
      })
      return
    }
    this.setData({ circleMultiIndex: nextIndex })
  },

  onCircleChange(e) {
    const value = e.detail.value || [0, 0]
    const plateIndex = Number(value[0]) || 0
    const circleIndex = Number(value[1]) || 0
    const group = this.data.circleGroups[plateIndex]
    const circle = group && group.circles[circleIndex]
    if (!circle) return
    const name = circle.name || circle.circle_name
    this.setData({
      circleMultiIndex: [plateIndex, circleIndex],
      'form.circleId': circle.id,
      'form.circleName': name,
      'form.occupationDescription': Number(circle.id) === 0 ? this.data.form.occupationDescription : '',
      'form.circleIndex': this.data.circleOptions.findIndex((item) => item.id === circle.id)
    })
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
    if (!config) return
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

    if (field === 'marriage' && value === '离异') {
      wx.showModal({
        title: '离异复入申请',
        content: '离异用户需先由平台人工审核复入资格。用户端不上传证明材料，请提交联系方式后等待客服处理。',
        confirmText: '去申请',
        cancelText: '返回',
        success: (modal) => {
          if (modal.confirm) {
            wx.navigateTo({ url: '/pages/divorce-review/divorce-review' })
            return
          }
          this.setData({
            'form.marriage': '',
            'form.marriageIndex': -1
          })
        }
      })
    }
  },

  goDivorceReview() {
    wx.navigateTo({ url: '/pages/divorce-review/divorce-review' })
  },

  onPromoteInput(e) {
    const code = normalizePromoteCode(e.detail.value)
    const update = {
      'form.promote_code': code,
      promoStatus: code ? 'pending' : '',
      promoMessage: code ? '提交前会自动校验推广码' : ''
    }
    this.setData(update)
    if (!code) {
      wx.removeStorageSync(STORAGE_KEYS.PROMOTE_CODE)
    }
  },

  onAppearanceDescriptionInput(e) {
    const value = e.detail.value || ''
    this.setData({
      'form.appearanceDescription': value,
      appearanceDescriptionLen: value.length
    })
  },

  onOccupationDescriptionInput(e) {
    this.setData({ 'form.occupationDescription': e.detail.value || '' })
  },

  async onPromoteBlur() {
    await this.checkPromoteCode({ silent: true })
  },

  onPromoteClear() {
    wx.removeStorageSync(STORAGE_KEYS.PROMOTE_CODE)
    this.setData({
      'form.promote_code': '',
      promoStatus: '',
      promoMessage: ''
    })
  },

  async checkPromoteCode(options = {}) {
    const code = normalizePromoteCode(this.data.form.promote_code)
    if (!code) {
      this.setData({ promoStatus: '', promoMessage: '' })
      wx.removeStorageSync(STORAGE_KEYS.PROMOTE_CODE)
      return true
    }

    this.setData({ checkingPromo: true })
    try {
      const data = await get(API_PATHS.PROMOTE_CODE_CHECK, { code }, { showError: false })
      if (data && data.valid) {
        wx.setStorageSync(STORAGE_KEYS.PROMOTE_CODE, code)
        this.setData({
          'form.promote_code': code,
          promoStatus: 'success',
          promoMessage: data.message || '已识别有效推广码'
        })
        return true
      }

      const message = (data && data.message) || '推广码无效或合伙人未激活'
      this.setData({ promoStatus: 'error', promoMessage: message })
      if (!options.silent) {
        wx.showToast({ title: message, icon: 'none' })
      }
      return false
    } catch (err) {
      const message = (err && err.message) || '推广码校验失败，请稍后重试'
      this.setData({ promoStatus: 'error', promoMessage: message })
      if (!options.silent) {
        wx.showToast({ title: message, icon: 'none' })
      }
      return false
    } finally {
      this.setData({ checkingPromo: false })
    }
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

    const { form } = this.data
    const openid = wx.getStorageSync(STORAGE_KEYS.OPENID)
    if (!this.data.editMode && !openid) {
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
    if (Number(form.circleId) === 0 && !String(form.occupationDescription || '').trim()) {
      wx.showToast({ title: '请填写具体职业', icon: 'none' })
      return false
    }
    if (!String(form.promote_code || '').trim()) {
      wx.showToast({ title: '邀请制注册需要邀请码', icon: 'none' })
      return false
    }

    if (form.marriage === '离异') {
      wx.showModal({
        title: '需先提交复入申请',
        content: '离异用户暂不能直接进入普通注册，请先提交离异复入申请并等待平台人工审核。',
        confirmText: '去申请',
        showCancel: false,
        success: () => this.goDivorceReview()
      })
      return
    }

    const promoOk = await this.checkPromoteCode({ silent: false })
    if (!promoOk) return

    this.setData({ submitting: true })

    try {
      if (this.data.editMode) {
        const profile = await put(API_PATHS.USER_PROFILE_UPDATE, {
          birth_year: form.birthYear.replace('年', ''),
          city: form.city,
          education: form.education,
          baby_plan: form.babyPlan,
          house_car: form.houseCar || '',
          height_range: form.height,
          circle_id: form.circleId,
          occupation_description: String(form.occupationDescription || '').trim(),
          appearance_description: form.appearanceDescription.trim()
        }, { showLoading: true, loadingText: '保存中...' })
        app.globalData.userInfo = profile
        wx.setStorageSync(STORAGE_KEYS.USER_INFO, profile)
        wx.showToast({ title: '资料已更新', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
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
        appearance_description: form.appearanceDescription.trim(),
        circle_id: form.circleId,
        occupation_description: String(form.occupationDescription || '').trim(),
        promote_code: normalizePromoteCode(form.promote_code),
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
