'use strict'

const { execSync } = require('child_process')
const { runScenarios, resetLab, seedLab, listScenarioIds } = require('./runner')

function parseArgs(argv) {
  const args = argv.slice(2)
  const command = args[0] || 'run'
  const options = { smokeAi: false }
  for (let i = 1; i < args.length; i += 1) {
    const token = args[i]
    if (token === '--smoke-ai') options.smokeAi = true
    else if (token.startsWith('--scenario=')) options.scenario = token.slice('--scenario='.length)
    else if (token === '--scenario' && args[i + 1]) {
      options.scenario = args[i + 1]
      i += 1
    }
  }
  return { command, options }
}

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch (error) {
    return ''
  }
}

async function main() {
  process.env.LOCAL_E2E = 'true'
  process.env.NODE_ENV = 'test'
  if (!process.env.E2E_AI_MODE) process.env.E2E_AI_MODE = 'fixture'

  const { command, options } = parseArgs(process.argv)
  options.gitHead = gitHead()

  if (command === 'reset') {
    console.log(JSON.stringify(resetLab(process.env.E2E_RUN_ID), null, 2))
    return
  }
  if (command === 'seed') {
    console.log(JSON.stringify(seedLab(process.env.E2E_RUN_ID), null, 2))
    return
  }
  if (command === 'list') {
    console.log(listScenarioIds().join('\n'))
    return
  }
  if (command === 'run') {
    if (options.smokeAi) process.env.E2E_LIVE_SMOKE = 'true'
    await runScenarios(options)
    return
  }

  console.error(`Unknown command: ${command}. Use reset | seed | run | list`)
  process.exit(1)
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
