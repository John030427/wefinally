const { execSync } = require('child_process')
const path = require('path')

const envId = process.env.TCB_ENV || 'cloud1-d4gy8l52g08bba326'
const root = path.resolve(__dirname, '../..')

function parseJsonOutput(raw) {
  const start = raw.indexOf('{')
  return JSON.parse(raw.slice(start))
}

function workerSecretFromCloud() {
  if (process.env.MATCH_WORKER_SECRET && process.env.MATCH_WORKER_SECRET.length >= 24) {
    return process.env.MATCH_WORKER_SECRET
  }
  const detail = parseJsonOutput(execSync(`tcb fn detail api -e ${envId} --json`, { cwd: root, encoding: 'utf8' }))
  const vars = (((detail.data || detail).Environment || {}).Variables) || []
  const row = vars.find((item) => item.Key === 'MATCH_WORKER_SECRET')
  return row ? String(row.Value || '') : ''
}

async function main() {
  const workerSecret = workerSecretFromCloud()
  if (!workerSecret || workerSecret.length < 24) {
    console.error('[live-smoke] worker secret unavailable')
    process.exit(2)
  }
  const params = JSON.stringify({
    action: 'aiSmoke',
    payload: { worker_secret: workerSecret, prompt: '只回复：HY3_OK' }
  })
  const response = parseJsonOutput(execSync(`tcb fn invoke api -e ${envId} --params ${JSON.stringify(params)} --json`, {
    cwd: root,
    encoding: 'utf8'
  }))
  const ret = JSON.parse(((response.data || response).RetMsg) || '{}')
  if (!ret.success) {
    console.error('[live-smoke] failed:', ret.error || ret)
    process.exit(1)
  }
  const payload = ret.data || {}
  console.log('[live-smoke]', JSON.stringify({
    provider: payload.metadata && payload.metadata.provider,
    model: payload.metadata && payload.metadata.model,
    ok: payload.ok,
    text: payload.text,
    latencyMs: payload.metadata && payload.metadata.latencyMs
  }))
  if (!payload.ok) process.exit(1)
}

main().catch((err) => {
  console.error('[live-smoke]', err.message || err)
  process.exit(1)
})
