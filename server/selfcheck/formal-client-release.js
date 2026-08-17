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
  'MATCH_TEST_RUNS',
  '/api/match/test-runs',
  'wf_test_run_id',
  'startQaTestRun',
  'executeQaTestRun',
  '10秒测试匹配',
  '开发测试：重新注册用户'
]

const leaks = []
for (const file of clientFiles(clientRoot)) {
  const source = fs.readFileSync(file, 'utf8')
  for (const token of forbidden) {
    if (source.includes(token)) leaks.push(`${path.relative(root, file)} -> ${token}`)
  }
}

assert.deepStrictEqual(leaks, [], `正式客户端仍包含测试入口：\n${leaks.join('\n')}`)

const serverRoute = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/handlers/route.js'), 'utf8')
const testRunService = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/api/lib/matchTestRunService.js'), 'utf8')
assert(serverRoute.includes('/api/match/test-runs'))
assert(testRunService.includes('isInternalQaAccount'))
assert(testRunService.includes('publicEnabled'))

console.log('PASS formal mini program contains no match test entry or API reference')
