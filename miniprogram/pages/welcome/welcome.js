const { STORAGE_KEYS } = require('../../utils/constants')

Page({
  data: {
    current: 0,
    slides: [
      {
        step: '01',
        kicker: '认真认识',
        title: '先遇见一个，值得认真了解的人',
        description: '不用反复刷，也不用在人群里碰运气。我们先核验资料，再按照双方真正看重的条件，慢一点、认真一点地介绍。',
        badge: '每次介绍，都有来由',
        visual: 'shield'
      },
      {
        step: '02',
        kicker: '安心了解',
        title: '你的隐私，只留在该在的地方',
        description: '我们只使用匹配所需的信息，不向对方展示手机号和完整原文。要不要继续、什么时候见面，都由你决定。',
        badge: '少一点暴露，多一点安心',
        visual: 'privacy'
      },
      {
        step: '03',
        kicker: '走向真实',
        title: '匹配不是答案，是一次好好认识',
        description: '我们会告诉你们为什么合适，也会提醒哪些地方值得聊清楚。见过之后，你的真实感受，比任何分数都重要。',
        badge: '去见面，也保留判断',
        visual: 'match'
      }
    ]
  },

  onLoad() {
    if (wx.getStorageSync(STORAGE_KEYS.TRUST_ONBOARDING)) this.enterApp()
  },

  onSwiperChange(e) {
    this.setData({ current: Number(e.detail.current || 0) })
  },

  onNext() {
    const next = this.data.current + 1
    if (next >= this.data.slides.length) {
      this.finishOnboarding()
      return
    }
    this.setData({ current: next })
  },

  onSkip() {
    this.finishOnboarding()
  },

  finishOnboarding() {
    wx.setStorageSync(STORAGE_KEYS.TRUST_ONBOARDING, true)
    this.enterApp()
  },

  enterApp() {
    const app = getApp()
    if (app.globalData.isLoggedIn) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    wx.redirectTo({ url: '/pages/login/login' })
  }
})
