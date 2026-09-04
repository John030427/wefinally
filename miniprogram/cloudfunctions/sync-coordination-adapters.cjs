'use strict'

const fs = require('node:fs')
const path = require('node:path')

const source = path.join(__dirname, 'agent-graph', 'shared', 'coordinationAdapters.cjs')

function copyCoordinationAdapter(target) {
  if (!fs.existsSync(source)) throw new Error(`coordination adapter source missing: ${source}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  return target
}

function copyCoordinationAdapters(options = {}) {
  const apiArtifact = options.apiArtifact || path.join(__dirname, 'api', 'lib', 'coordinationAdapters.cjs')
  const graphArtifact = options.graphArtifact || path.join(__dirname, 'agent-graph', 'dist', 'shared', 'coordinationAdapters.cjs')
  return {
    source,
    apiArtifact: copyCoordinationAdapter(apiArtifact),
    graphArtifact: copyCoordinationAdapter(graphArtifact)
  }
}

if (require.main === module) copyCoordinationAdapters()

module.exports = { source, copyCoordinationAdapter, copyCoordinationAdapters }
