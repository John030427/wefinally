const fs = require('node:fs')
const path = require('node:path')

const distDir = path.join(__dirname, 'dist')
const distTestDir = path.join(distDir, 'test')

fs.mkdirSync(distDir, { recursive: true })
fs.writeFileSync(path.join(distDir, 'package.json'), '{"type":"module"}\n')

// ponytail: never ship compiled tests to CloudBase upload.
if (fs.existsSync(distTestDir)) {
  fs.rmSync(distTestDir, { recursive: true, force: true })
}
