const assert = require('assert')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const fixturePort = 3112
const debugPort = 9337
const fixturePath = path.join(__dirname, 'admin-cloud-consolidation-browser-fixture.js')
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(url, attempts = 80) {
  for (let count = 0; count < attempts; count += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch (_) {}
    await delay(100)
  }
  throw new Error(`timed out waiting for ${url}`)
}

function cdpClient(wsUrl) {
  const socket = new WebSocket(wsUrl)
  const pending = new Map()
  let sequence = 0
  const events = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      return message.error ? reject(new Error(message.error.message)) : resolve(message.result)
    }
    events.push(message)
  })
  return {
    async ready() {
      if (socket.readyState === WebSocket.OPEN) return
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true })
        socket.addEventListener('error', reject, { once: true })
      })
    },
    send(method, params = {}) {
      const id = ++sequence
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    events,
    close() { socket.close() }
  }
}

async function main() {
  const chromePath = chromeCandidates.find(fs.existsSync)
  assert(chromePath, 'Chrome or Edge is required for the real-browser smoke test')
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wefinally-admin-cloud-'))
  const fixture = spawn(process.execPath, [fixturePath], { env: { ...process.env, ADMIN_CLOUD_FIXTURE_PORT: String(fixturePort) }, stdio: 'ignore' })
  let chrome
  let cdp
  try {
    await waitFor(`http://127.0.0.1:${fixturePort}/admin`)
    chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank'
    ], { stdio: 'ignore' })
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`)
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    const pageTarget = targets.find((item) => item.type === 'page')
    assert(pageTarget, 'headless browser page target was not created')
    cdp = cdpClient(pageTarget.webSocketDebuggerUrl)
    await cdp.ready()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${fixturePort}/admin` })

    async function evaluate(expression) {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'browser evaluation failed')
      return result.result.value
    }
    async function waitUntil(expression, label) {
      for (let count = 0; count < 100; count += 1) {
        if (await evaluate(expression)) return
        await delay(100)
      }
      throw new Error(`browser timed out: ${label}`)
    }
    const clickPage = async (name) => {
      await evaluate(`document.querySelector('.nav-item[data-p="${name}"]').click()`)
      await waitUntil(`document.getElementById('pageTitle').textContent === ${JSON.stringify({ users: '用户管理', service: '客服工作台', orders: '订单对账', matches: '匹配记录', partners: '合伙人审核与管理' }[name])} && !document.getElementById('content').textContent.includes('加载中')`, `${name} page`)
    }

    await waitUntil(`document.readyState === 'complete' && document.getElementById('loginForm')`, 'login page')
    await evaluate(`document.getElementById('loginUser').value='Grace'; document.getElementById('loginPass').value='Grace800100'; document.getElementById('loginBtn').click()`)
    await waitUntil(`!document.getElementById('appPage').classList.contains('hidden') && document.getElementById('content').textContent.includes('CloudBase 业务总览')`, 'CloudBase dashboard')

    const visiblePages = await evaluate(`[...document.querySelectorAll('.nav-item:not(.hidden)')].map((item) => item.dataset.p)`)
    assert.deepStrictEqual(visiblePages, ['dashboard', 'service', 'users', 'members', 'matches', 'partners', 'orders', 'knowledge'])

    await clickPage('users')
    assert((await evaluate(`document.getElementById('content').textContent`)).includes('WF-000007 · 女 · 深圳'))
    await evaluate(`document.getElementById('usersIncludeTest').click()`)
    await waitUntil(`document.getElementById('content').textContent.includes('TEST-000118')`, 'test user toggle')
    await evaluate(`document.querySelector('button[onclick="openUserContext(7)"]').click()`)
    await waitUntil(`document.querySelector('#modalRoot .modal-bd').textContent.includes('AI 会话（3）')`, 'combined user modal')
    assert((await evaluate(`document.querySelector('#modalRoot .modal-bd').textContent`)).includes('通知记录（1）'))
    await evaluate(`closeM()`)

    await clickPage('service')
    await waitUntil(`document.getElementById('content').textContent.includes('3 个会话') && document.getElementById('content').textContent.includes('用户业务汇总')`, 'official service context')
    let serviceText = await evaluate(`document.getElementById('content').textContent`)
    assert(serviceText.includes('WF-000007 · 女 · 深圳'))
    assert(!serviceText.includes('TEST-000118'))
    await evaluate(`document.getElementById('serviceIncludeTest').click()`)
    await waitUntil(`document.getElementById('content').textContent.includes('TEST-000118')`, 'test conversation toggle')
    await evaluate(`document.getElementById('serviceConversationReplyText').value='浏览器人工回复验收'; document.getElementById('serviceConversationReplyButton').click()`)
    await waitUntil(`document.getElementById('content').textContent.includes('浏览器人工回复验收')`, 'artificial human reply')

    await clickPage('orders')
    assert((await evaluate(`document.getElementById('content').textContent`)).includes('WF-000007 · 女 · 深圳'))
    await clickPage('matches')
    const matchText = await evaluate(`document.getElementById('content').textContent`)
    assert(matchText.includes('WF-000007 · 女 · 深圳'))
    assert(matchText.includes('WF-000008 · 男 · 潮州'))

    await clickPage('partners')
    assert((await evaluate(`document.getElementById('content').textContent`)).includes('138****0015'))
    await evaluate(`setPartnerWorkspace('roster')`)
    await waitUntil(`document.getElementById('partnerRosterForm')`, 'partner roster form')
    await evaluate(`document.getElementById('partnerRosterName').value='浏览器名单';document.getElementById('partnerRosterPhone').value='13700005678';document.getElementById('partnerRosterNote').value='老板确认';document.getElementById('partnerRosterForm').requestSubmit()`)
    await waitUntil(`document.getElementById('content').textContent.includes('137****5678')`, 'roster candidate created')
    await evaluate(`setPartnerWorkspace('queue')`)
    await waitUntil(`document.getElementById('content').textContent.includes('138****0015')`, 'partner review queue')
    await evaluate(`openPartnerAction('candidate',31,'approve')`)
    assert(await evaluate(`document.getElementById('partnerActionReason').value === ''`))
    await evaluate(`document.getElementById('partnerActionReason').value='浏览器审核通过';submitPartnerAction('candidate',31,'approve')`)
    await waitUntil(`document.getElementById('content').textContent.includes('浏览器审核通过')`, 'partner approval reason persisted')

    const browserErrors = cdp.events.filter((event) => event.method === 'Runtime.exceptionThrown')
    assert.strictEqual(browserErrors.length, 0, browserErrors.map((event) => JSON.stringify(event.params.exceptionDetails)).join('\n'))
    console.log('PASS CloudBase admin real-browser consolidation flow')
  } finally {
    if (cdp) cdp.close()
    if (chrome) chrome.kill()
    fixture.kill()
    await delay(150)
    fs.rmSync(profileDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
