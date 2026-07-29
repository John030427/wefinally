const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const inputDir = path.join(root, 'cloudbase-export')
const outputDir = path.join(root, 'cloudbase-export-jsonl')

function convertFile(file) {
  const inputFile = path.join(inputDir, file)
  const collection = path.basename(file, '.json')
  if (collection === 'manifest') return null
  const raw = fs.readFileSync(inputFile, 'utf8')
  const rows = JSON.parse(raw)
  if (!Array.isArray(rows)) return null
  const outputFile = path.join(outputDir, `${collection}.json`)
  const content = rows.map((row) => JSON.stringify(row)).join('\n')
  fs.writeFileSync(outputFile, content ? `${content}\n` : '', 'utf8')
  return { collection, count: rows.length, file: outputFile }
}

function convertDemoFlags() {
  const inputFile = path.join(root, 'tools', 'cloudbase', 'demo-system-configs.json')
  if (!fs.existsSync(inputFile)) return null
  const rows = JSON.parse(fs.readFileSync(inputFile, 'utf8'))
  const outputFile = path.join(outputDir, 'system_configs.json')
  const content = rows.map((row) => JSON.stringify(row)).join('\n')
  fs.writeFileSync(outputFile, content ? `${content}\n` : '', 'utf8')
  return { collection: 'system_configs', count: rows.length, file: outputFile }
}

function main() {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`missing export directory: ${inputDir}`)
  }
  fs.mkdirSync(outputDir, { recursive: true })
  const results = fs.readdirSync(inputDir)
    .filter((file) => file.endsWith('.json'))
    .map(convertFile)
    .filter(Boolean)
  const demo = convertDemoFlags()
  if (demo) results.push(demo)
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(results.map((item) => ({
      collection: item.collection,
      count: item.count,
      file: path.relative(root, item.file)
    })), null, 2),
    'utf8'
  )
  results.forEach((item) => {
    console.log(`jsonl ${item.collection}: ${item.count}`)
  })
  console.log(`cloudbase json lines written to: ${outputDir}`)
}

main()
