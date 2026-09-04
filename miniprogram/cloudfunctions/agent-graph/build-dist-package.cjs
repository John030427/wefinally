const fs = require('node:fs')
const path = require('node:path')

const distDir = path.join(__dirname, 'dist')
const distTestDir = path.join(distDir, 'test')

// Always rebuild dist from a clean slate (run before tsc).
fs.rmSync(distDir, { recursive: true, force: true })
fs.mkdirSync(distDir, { recursive: true })
fs.writeFileSync(path.join(distDir, 'package.json'), '{"type":"module"}\n')

const sharedContractSrc = path.join(__dirname, '../api/lib/datePlanContract.js')
const sharedContractDest = path.join(distDir, 'datePlanContract.cjs')
fs.copyFileSync(sharedContractSrc, sharedContractDest)

// ponytail: never ship compiled tests to CloudBase upload.
if (fs.existsSync(distTestDir)) {
  fs.rmSync(distTestDir, { recursive: true, force: true })
}
