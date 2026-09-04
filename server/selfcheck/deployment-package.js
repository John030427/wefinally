'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const source = path.join(root, 'miniprogram/cloudfunctions/agent-graph/shared/coordinationAdapters.cjs')
const apiArtifact = path.join(root, 'miniprogram/cloudfunctions/api/lib/coordinationAdapters.cjs')
const graphArtifact = path.join(root, 'miniprogram/cloudfunctions/agent-graph/dist/shared/coordinationAdapters.cjs')

assert(fs.existsSync(apiArtifact), 'API deployable adapter artifact is missing')
assert(fs.existsSync(graphArtifact), 'agent-graph deployable adapter artifact is missing; run agent-graph build first')
const sourceBytes = fs.readFileSync(source)
assert.deepStrictEqual(fs.readFileSync(apiArtifact), sourceBytes, 'API adapter artifact differs from the single source')
assert.deepStrictEqual(fs.readFileSync(graphArtifact), sourceBytes, 'agent-graph adapter artifact differs from the single source')
assert.doesNotThrow(() => require(apiArtifact), 'API package must require its local adapter')
assert.doesNotThrow(() => require(path.join(root, 'miniprogram/cloudfunctions/api/index.js')), 'API package entrypoint must be loadable')

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(?:js|cjs)$/.test(entry.name) ? [full] : []
  })
}

for (const file of walk(path.join(root, 'miniprogram/cloudfunctions/api'))) {
  if (file.includes(`${path.sep}scripts${path.sep}`)) continue
  const text = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(text, /(?:\.\.\/)+agent-graph[\\/]shared[\\/]coordinationAdapters\.cjs/, `${file} escapes API package`)
}

console.log('PASS deployable API/agent-graph adapter artifacts are identical and package-local')
