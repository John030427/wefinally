const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../../miniprogram')

function resolveRequire(fromFile, requestPath) {
  const base = path.dirname(fromFile)
  const candidate = path.resolve(base, requestPath)
  const extensions = ['', '.js']
  for (const ext of extensions) {
    if (fs.existsSync(candidate + ext)) return candidate + ext
  }
  throw new Error(`missing module ${requestPath} from ${path.relative(root, fromFile)}`)
}

function expectRequire(fromRelative, requestPath) {
  const fromFile = path.join(root, fromRelative)
  resolveRequire(fromFile, requestPath)
}

expectRequire('utils/qaMatchSimulator.js', './request')
expectRequire('utils/qaMatchSimulator.js', './constants')
expectRequire('components/qa-match-panel/qa-match-panel.js', '../../utils/qaMatchSimulator')
expectRequire('components/qa-match-panel/qa-match-panel.js', '../../utils/request')
expectRequire('components/qa-match-panel/qa-match-panel.js', '../../utils/constants')
expectRequire('pages/index/index.js', '../../utils/request')
expectRequire('pages/match-list/match-list.js', '../../utils/request')

console.log('PASS QA frontend module require paths resolve')
