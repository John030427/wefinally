const fs = require('node:fs')
const path = require('node:path')

const distDir = path.join(__dirname, 'dist')
const distTestDir = path.join(distDir, 'test')
const sharedDir = path.join(__dirname, 'shared')

// Always rebuild dist from a clean slate (run before tsc).
fs.rmSync(distDir, { recursive: true, force: true })
fs.mkdirSync(distDir, { recursive: true })
fs.writeFileSync(path.join(distDir, 'package.json'), '{"type":"module"}\n')
if (fs.existsSync(sharedDir)) {
  fs.cpSync(sharedDir, path.join(distDir, 'shared'), { recursive: true, filter: (source) => !source.endsWith('.d.cts') })
}

// ponytail: never ship compiled tests to CloudBase upload.
if (fs.existsSync(distTestDir)) {
  fs.rmSync(distTestDir, { recursive: true, force: true })
}
