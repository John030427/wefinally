const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '../..')

function assignPath(target, pathText, value) {
  const parts = pathText.split('.')
  let cursor = target
  while (parts.length > 1) {
    const key = parts.shift()
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}
    cursor = cursor[key]
  }
  cursor[parts[0]] = value
}

function contextFor(page) {
  return Object.assign({}, page, {
    data: JSON.parse(JSON.stringify(page.data)),
    setData(patch) {
      Object.keys(patch).forEach((key) => assignPath(this.data, key, patch[key]))
    }
  })
}

function loadPage(relativePath, requestMocks) {
  let definition = null
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const calls = { posts: [], toasts: [], modals: [], navigations: [] }
  const constants = require(path.join(root, 'miniprogram/utils/constants.js'))
  const sandbox = {
    console,
    setInterval,
    clearInterval,
    Page(value) { definition = value },
    getApp: () => ({
      checkNetwork: async () => true,
      globalData: { isLoggedIn: true }
    }),
    wx: {
      showToast: (value) => calls.toasts.push(value),
      showModal: (value) => {
        calls.modals.push(value)
        if (value && value.success) value.success({ confirm: true })
      },
      navigateBack: () => calls.navigations.push('back'),
      navigateTo: (value) => calls.navigations.push(value.url)
    },
    require(request) {
      if (request === '../../utils/request') {
        return {
          get: requestMocks.get,
          post: async (apiPath, data) => {
            calls.posts.push({ path: apiPath, data })
            return requestMocks.post ? requestMocks.post(apiPath, data) : {}
          }
        }
      }
      if (request === '../../utils/constants') return constants
      if (request === '../../utils/matchReport') {
        return require(path.join(root, 'miniprogram/utils/matchReport.js'))
      }
      if (request === '../../utils/matchScore') {
        return require(path.join(root, 'miniprogram/utils/matchScore.js'))
      }
      if (request === '../../utils/productExperience') {
        return require(path.join(root, 'miniprogram/utils/productExperience.js'))
      }
      if (request === '../../utils/util') {
        return require(path.join(root, 'miniprogram/utils/util.js'))
      }
      if (request === '../../utils/aiMatchReportPresentation') {
        return require(path.join(root, 'miniprogram/utils/aiMatchReportPresentation.js'))
      }
      throw new Error(`Unexpected require: ${request}`)
    }
  }
  vm.runInNewContext(source, sandbox, { filename: relativePath })
  return { page: definition, calls, constants }
}

async function matchDetailChecks() {
  const detail = {
    id: 9,
    match_user_id: 2,
    total_score: 100,
    view_similarity: 82,
    score_detail: {
      normalized_total: 78,
      side: { baby: 28, view: 21, psych: 14, city: 1 }
    },
    ai_report_status: 'succeeded',
    ai_report: {
      summary: '双方长期规划有共同基础。',
      strengths: [{ title: '婚育节奏', detail: '时间预期接近' }],
      differences: [{ title: '城市安排', detail: '需要确认通勤和定居' }],
      communication_suggestions: [],
      first_date_suggestions: [],
      data_limitations: ['收入字段未填写']
    }
  }
  const loaded = loadPage('miniprogram/pages/match-detail/match-detail.js', {
    get: async (apiPath) => {
      if (apiPath === '/api/match/detail') return detail
      if (apiPath === '/api/date-feedback') {
        return { can_submit: true, coordination_id: 30, proposal_date: '2026-07-26', feedback: null }
      }
      return null
    },
    post: async (apiPath, data) => Object.assign({ saved: true }, data)
  })
  const ctx = contextFor(loaded.page)
  ctx.data.matchId = '9'
  await ctx.loadDetail()
  await ctx.loadExperienceState()
  assert.strictEqual(ctx.data.totalScorePercent, 78)
  assert(ctx.data.matchSummary.strengths.some((item) => item.includes('婚育')))
  assert(ctx.data.matchSummary.confirmations.some((item) => item.includes('城市')))
  assert.strictEqual(ctx.data.matchSummary.hasAiText, true)
  assert.strictEqual(ctx.data.matchSummary.limitations, undefined)
  assert.strictEqual(ctx.data.showAlgorithmDetails, false)
  ctx.toggleAlgorithmDetails()
  assert.strictEqual(ctx.data.showAlgorithmDetails, true)
  ctx.selectFeedbackVerdict({ currentTarget: { dataset: { value: 'partly_accurate' } } })
  ctx.toggleFeedbackReason({ currentTarget: { dataset: { value: 'location' } } })
  await ctx.submitMatchFeedback()
  assert.strictEqual(loaded.calls.posts[0].path, loaded.constants.API_PATHS.MATCH_FEEDBACK)
  assert.strictEqual(loaded.calls.posts[0].data.verdict, 'partly_accurate')
  assert.strictEqual(JSON.stringify(loaded.calls.posts[0].data.reasons), JSON.stringify(['location']))
}

async function dateFeedbackChecks() {
  const loaded = loadPage('miniprogram/pages/date-feedback/date-feedback.js', {
    get: async () => ({ can_submit: true, coordination_id: 30, proposal_date: '2026-07-26', feedback: null }),
    post: async (apiPath, data) => data
  })
  const ctx = contextFor(loaded.page)
  ctx.data.matchLogId = 9
  ctx.data.coordinationId = 30
  await ctx.loadFeedback()
  assert.strictEqual(ctx.data.pageState, 'success')
  ctx.selectSingle({ currentTarget: { dataset: { key: 'met_status', value: 'no_show' } } })
  assert.strictEqual(ctx.data.form.safety, 'not_applicable')
  assert.strictEqual(ctx.validate(), true)
  ctx.toggleReason({ currentTarget: { dataset: { value: 'authenticity' } } })
  await ctx.submit()
  assert.strictEqual(loaded.calls.posts[0].path, loaded.constants.API_PATHS.DATE_FEEDBACK)
  assert.strictEqual(loaded.calls.posts[0].data.met_status, 'no_show')
  assert.strictEqual(loaded.calls.posts[0].data.safety, 'not_applicable')
  assert(loaded.calls.navigations.includes('back'))
}

Promise.resolve()
  .then(matchDetailChecks)
  .then(dateFeedbackChecks)
  .then(() => console.log('product-experience-pages selfcheck passed'))
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
