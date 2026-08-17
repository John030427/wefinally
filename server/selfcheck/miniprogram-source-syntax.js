const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '../../miniprogram')

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return javascriptFiles(fullPath)
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : []
  })
}

const roots = ['pages', 'components', 'utils', 'custom-tab-bar']
  .map((name) => path.join(root, name))
  .filter((directory) => fs.existsSync(directory))
const files = [path.join(root, 'app.js')].concat(roots.flatMap(javascriptFiles))
assert(files.length > 0)
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  new vm.Script(source, { filename: path.relative(root, file) })
}

console.log(`PASS mini program JavaScript syntax (${files.length} files)`)
