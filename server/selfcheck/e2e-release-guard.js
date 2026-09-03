'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const allowRoots = [
  path.join(root, 'server', 'e2e'),
  path.join(root, 'server', 'selfcheck')
]

const scanRoots = [
  path.join(root, 'miniprogram'),
  path.join(root, 'server', 'src')
]

const allowFiles = [
  path.join(root, 'miniprogram', 'cloudfunctions', 'api', 'agent', 'controlledDateScenarioService.js')
]

const forbidden = ['CONTROLLED_USER_ID', 'LOCAL_E2E']

function underAllowed(file) {
  return allowRoots.some((prefix) => file.startsWith(prefix))
}

function isAllowed(file) {
  if (underAllowed(file)) return true
  return allowFiles.some((allowed) => path.normalize(file) === path.normalize(allowed))
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walk(full, out)
      continue
    }
    if (!/\.(js|ts|tsx)$/.test(name)) continue
    out.push(full)
  }
}

function main() {
  const files = []
  for (const dir of scanRoots) walk(dir, files)
  const violations = []
  for (const file of files) {
    if (isAllowed(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const token of forbidden) {
      if (text.includes(token)) violations.push(`${file}: ${token}`)
    }
  }
  if (violations.length) {
    console.error('E2E release guard failed:')
    violations.forEach((line) => console.error(line))
    process.exit(1)
  }
  console.log('E2E release guard passed')
}

main()
