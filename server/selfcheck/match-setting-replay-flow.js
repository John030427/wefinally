const assert = require('assert')

const {
  nextMatchSettingAction,
  matchSettingFailureMessage
} = require('../../miniprogram/utils/matchSettingFlow')

assert.strictEqual(nextMatchSettingAction({
  memberStatus: 'approved',
  intentConfirmationRequired: false
}), 'complete')

assert.strictEqual(nextMatchSettingAction({
  memberStatus: 'pending_profile',
  intentConfirmationRequired: false
}), 'submit_application')

assert.strictEqual(nextMatchSettingAction({
  memberStatus: 'approved',
  intentConfirmationRequired: true
}), 'confirm_intent')

assert.strictEqual(
  matchSettingFailureMessage('profile', { message: 'SERVER_ERROR' }),
  '基础资料保存失败：服务器处理异常，请稍后重试'
)
assert.strictEqual(
  matchSettingFailureMessage('setting', { message: 'SERVER_ERROR' }),
  '匹配配置保存失败：服务器处理异常，请稍后重试'
)
assert.strictEqual(
  matchSettingFailureMessage('application', { message: '当前状态不能提交会员申请' }),
  '会员申请提交失败：当前状态不能提交会员申请'
)

async function verifyApprovedPageFlow() {
  const requestPath = require.resolve('../../miniprogram/utils/request')
  const pagePath = require.resolve('../../miniprogram/pages/match-setting/match-setting')
  const calls = []
  const toasts = []
  let navigatedBack = false
  let pageDefinition = null
  const originalRequestCache = require.cache[requestPath]
  const originalPage = global.Page
  const originalWx = global.wx
  const originalGetApp = global.getApp
  const originalSetTimeout = global.setTimeout

  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      get: async () => ({}),
      put: async (path) => {
        calls.push(path)
        return { member_status: 'approved' }
      },
      post: async (path) => {
        calls.push(path)
        return { intent_confirmation_required: false }
      }
    }
  }
  global.Page = (definition) => { pageDefinition = definition }
  global.getApp = () => ({ globalData: {}, checkNetwork: async () => true })
  global.wx = {
    setStorageSync: () => {},
    showToast: (options) => { toasts.push(options.title) },
    showModal: () => {},
    navigateBack: () => { navigatedBack = true }
  }
  global.setTimeout = (callback) => { callback(); return 1 }

  try {
    delete require.cache[pagePath]
    require(pagePath)
    const page = Object.assign({}, pageDefinition, {
      data: Object.assign({}, pageDefinition.data, {
        memberStatus: 'approved',
        appearanceWant: '清爽自然健康',
        form: {
          preferAge: '25-35岁',
          preferEducation: '本科',
          preferHeight: '170-180cm',
          likeMarry: '仅看未婚',
          likeBabyPlan: '2-3年内',
          myValues: '真诚沟通共同规划稳定生活尊重边界一起成长经营家庭',
          expectValues: '真诚沟通共同规划稳定生活尊重边界一起成长经营家庭',
          otherRequirements: ''
        }
      }),
      setData(patch) {
        Object.assign(this.data, patch)
      }
    })
    await page.onSubmit.call(page)
    assert(calls.includes('/api/user/profile'))
    assert(calls.includes('/api/match/setting'))
    assert(!calls.includes('/api/member/application/submit'))
    assert(toasts.includes('配置已保存'))
    assert.strictEqual(navigatedBack, true)
  } finally {
    delete require.cache[pagePath]
    if (originalRequestCache) require.cache[requestPath] = originalRequestCache
    else delete require.cache[requestPath]
    global.Page = originalPage
    global.wx = originalWx
    global.getApp = originalGetApp
    global.setTimeout = originalSetTimeout
  }
}

verifyApprovedPageFlow()
  .then(() => console.log('PASS approved registration replay match-setting flow'))
  .catch((error) => {
    console.error(error.stack || error.message)
    process.exit(1)
  })
