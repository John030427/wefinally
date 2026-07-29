const { get } = require('../../utils/request')
const { API_PATHS } = require('../../utils/constants')

const LOCAL_RULES = {
  user_service: {
    title: '用户服务协议',
    content: '欢迎使用 WeFinally 婚恋服务。您应如实填写个人信息，遵守平台规则。平台提供 AI 智能匹配服务，匹配结果仅供参考。禁止上传图片视频，禁止用户间私聊社交。'
  },
  privacy: {
    title: '隐私政策',
    content: '我们重视您的隐私保护。您的个人信息仅用于婚恋匹配服务，未经同意不会向第三方披露。我们采取合理措施保护数据安全。'
  },
  data_auth: {
    title: '个人信息授权协议',
    content: '您授权平台在婚恋匹配范围内使用您提交的个人信息，包括基础资料与三观文本，用于算法匹配与合规留痕。'
  },
  platform: {
    title: '平台规则',
    content: '1. 禁止上传图片视频，无头像相册\n2. 用户间无私聊、无社交\n3. AI 匹配每周三、周五 0:00 各 1 次\n4. 择偶配置 7 天仅可修改 1 次\n5. VIP 188 元/30 天，无自动续费\n6. 违规永久封号不退费\n7. 结婚可自主报备注销\n8. 仅官方一对一私密奔现'
  }
}

Page({
  data: {
    pageState: 'loading',
    errorMsg: '',
    title: '平台规则',
    content: ''
  },

  onLoad(options) {
    const TYPE_MAP = {
      userAgreement: 'user_service',
      privacyPolicy: 'privacy',
      dataAuth: 'data_auth'
    }
    const type = TYPE_MAP[options.type] || options.type || 'platform'
    this.loadRules(type)
  },

  async loadRules(type) {
    this.setData({ pageState: 'loading' })

    const local = LOCAL_RULES[type] || LOCAL_RULES.platform
    const hasNetwork = await getApp().checkNetwork()

    if (!hasNetwork) {
      this.setData({
        pageState: 'success',
        title: local.title,
        content: local.content
      })
      return
    }

    try {
      if (type === 'platform') {
        const data = await get(API_PATHS.RULES, {}, { showError: false })
        this.setData({
          pageState: 'success',
          title: (data && data.title) || local.title,
          content: (data && data.content) || local.content
        })
      } else {
        const data = await get(API_PATHS.AGREEMENTS, {}, { showError: false })
        const item = data && data[type]
        this.setData({
          pageState: 'success',
          title: (item && item.title) || local.title,
          content: (item && item.content) || local.content
        })
      }
    } catch (err) {
      this.setData({
        pageState: 'success',
        title: local.title,
        content: local.content
      })
    }
  }
})
