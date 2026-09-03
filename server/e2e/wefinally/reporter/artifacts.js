'use strict'

const fs = require('fs')
const path = require('path')

function artifactsDir() {
  return path.resolve(__dirname, '../../../../artifacts/e2e')
}

function writeArtifacts(payload) {
  const dir = artifactsDir()
  fs.mkdirSync(dir, { recursive: true })
  const jsonPath = path.join(dir, 'latest.json')
  const mdPath = path.join(dir, 'latest.md')
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8')

  const lines = [
    '# WeFinally E2E Latest',
    '',
    `- Run ID: ${payload.runId}`,
    `- AI mode: ${payload.aiMode}`,
    `- Git HEAD: ${payload.gitHead || 'unknown'}`,
    `- Timestamp: ${payload.timestamp}`,
    '',
    '## Scenarios',
    ''
  ]
  for (const row of payload.results || []) {
    lines.push(`- [${row.pass ? 'PASS' : 'FAIL'}] **${row.name}** ? ${row.actual || row.expected || ''}`)
  }
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8')
  return { jsonPath, mdPath }
}

module.exports = {
  artifactsDir,
  writeArtifacts
}
