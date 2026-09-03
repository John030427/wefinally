const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const clientRoot = path.join(root, 'miniprogram')

function clientFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'cloudfunctions') return []
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return clientFiles(target)
    return /\.(js|json|wxml|wxss)$/.test(entry.name) ? [target] : []
  })
}

const forbidden = [
  'wf_test_run_id',
  'startQaTestRun',
  'executeQaTestRun',
  '10秒测试匹配',
  '开发测试：重新注册用户'
]

const qaAllowedFiles = new Set([
  path.join(clientRoot, 'pages/match-list/match-list.js'),
  path.join(clientRoot, 'pages/match-list/match-list.wxml'),
  path.join(clientRoot, 'pages/match-list/match-list.json'),
  path.join(clientRoot, 'pages/index/index.js'),
  path.join(clientRoot, 'pages/index/index.wxml'),
  path.join(clientRoot, 'pages/index/index.json'),
  path.join(clientRoot, 'components/qa-match-panel/qa-match-panel.js'),
  path.join(clientRoot, 'components/qa-match-panel/qa-match-panel.wxml'),
  path.join(clientRoot, 'utils/qaMatchSimulator.js'),
  path.join(clientRoot, 'utils/constants.js')
])

const qaOnlyTokens = ['MATCH_TEST_RUNS', '/api/match/test-runs']

const leaks = []
for (const file of clientFiles(clientRoot)) {
  const source = fs.readFileSync(file, 'utf8')
  for (const token of forbidden) {
    if (source.includes(token)) leaks.push(`${path.relative(root, file)} -> ${token}`)
  }
  for (const token of qaOnlyTokens) {
    if (!source.includes(token)) continue
    if (!qaAllowedFiles.has(file)) {
      leaks.push(`${path.relative(root, file)} -> ${token}`)
    }
  }
}

assert.deepStrictEqual(leaks, [], `正式客户端仍包含未授权的测试入口：\n${leaks.join('\n')}`)

const matchListJs = fs.readFileSync(path.join(clientRoot, 'pages/match-list/match-list.js'), 'utf8')
const matchListWxml = fs.readFileSync(path.join(clientRoot, 'pages/match-list/match-list.wxml'), 'utf8')
const indexWxml = fs.readFileSync(path.join(clientRoot, 'pages/index/index.wxml'), 'utf8')
const qaComponent = fs.readFileSync(path.join(clientRoot, 'components/qa-match-panel/qa-match-panel.js'), 'utf8')
assert(matchListWxml.includes('qa-match-panel'))
assert(indexWxml.includes('qa-match-panel'))
assert(qaComponent.includes('refreshQaAccess'))

const serverRoute = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
const testRunService = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/lib/matchTestRunService.js'), 'utf8')
assert(serverRoute.includes('/api/match/test-runs'))
assert(testRunService.includes('resolveQaTestRunEnabled'))
assert(testRunService.includes('publicEnabled'))

console.log('PASS formal mini program keeps QA match test entry internal-only on match-list')
