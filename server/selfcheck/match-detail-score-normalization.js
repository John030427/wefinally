const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '../..')
const pageFile = path.join(root, 'miniprogram/pages/match-detail/match-detail.js')
const pageSource = fs.readFileSync(pageFile, 'utf8')

function loadPage(detail) {
  let definition = null
  const sandbox = {
    console,
    clearInterval,
    setInterval,
    getApp: () => ({ checkNetwork: async () => true }),
    Page: (value) => { definition = value },
    require(request) {
      if (request === '../../utils/request') {
        return {
          get: async () => detail,
          post: async () => ({})
        }
      }
      if (request === '../../utils/constants') {
        return { API_PATHS: { MATCH_DETAIL: '/match/detail' } }
      }
      if (request === '../../utils/matchReport') {
        return {
          buildFieldExplainItems: () => [],
          buildLocalMatchReport: () => ''
        }
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
      throw new Error(`Unexpected require: ${request}`)
    }
  }

  vm.runInNewContext(pageSource, sandbox, { filename: pageFile })
  return definition
}

async function render(detail) {
  const page = loadPage(detail)
  const context = Object.assign({}, page, {
    data: Object.assign({}, page.data, { matchId: 'match-1' }),
    setData(patch) {
      Object.assign(this.data, patch)
    }
  })
  await page.loadDetail.call(context)
  return context.data
}

async function run() {
  const base = {
    total_score: 100,
    view_similarity: 88,
    score_detail: {},
    ai_report_status: 'not_requested'
  }

  const snake = await render(Object.assign({}, base, {
    score_detail: { normalized_total: 81, total: 100, max_total: 128 }
  }))
  assert.strictEqual(snake.totalScorePercent, 81)

  const camel = await render(Object.assign({}, base, {
    score_detail: { normalizedTotal: 79, total: 100, max_total: 128 }
  }))
  assert.strictEqual(camel.totalScorePercent, 79)

  const derived = await render(Object.assign({}, base, {
    score_detail: { total: 100, max_total: 128 }
  }))
  assert.strictEqual(derived.totalScorePercent, 78)
  assert.strictEqual(derived.totalScoreText, '综合较高契合')

  const legacy = await render(Object.assign({}, base, {
    total_score: 73,
    score_detail: {}
  }))
  assert.strictEqual(legacy.totalScorePercent, 73)

  console.log('PASS match detail normalizes raw totals for percentage display')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
