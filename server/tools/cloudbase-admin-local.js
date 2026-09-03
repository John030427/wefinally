const fs = require('fs')
const http = require('http')
const path = require('path')

const port = Number(process.env.CLOUDBASE_ADMIN_PORT || 3107)
const adminHtmlPath = path.resolve(__dirname, '../public/admin/index.html')
const partnerHtmlPath = path.resolve(__dirname, '../public/partner/index.html')
const cloudApi = String(
  process.env.CLOUDBASE_BACKOFFICE_API
    || 'https://cloud1-d4gy8l52g08bba326.service.tcloudbase.com'
).replace(/\/api\/?$/, '').replace(/\/$/, '')
const parsedCloudApi = new URL(cloudApi)

if (parsedCloudApi.protocol !== 'https:' || !parsedCloudApi.hostname.endsWith('.service.tcloudbase.com')) {
  throw new Error('CLOUDBASE_BACKOFFICE_API 必须是 CloudBase HTTPS 服务地址')
}

function send(res, statusCode, body, contentType) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/admin' })
    return res.end()
  }
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const runtimeConfig = `<script>window.WF_CLOUD_ONLY = true; window.WF_CLOUD_BACKOFFICE_API = ${JSON.stringify(cloudApi)};</script><script>`
    const html = fs.readFileSync(adminHtmlPath, 'utf8').replace('<script>', runtimeConfig)
    return send(res, 200, html, 'text/html; charset=utf-8')
  }
  if (url.pathname === '/partner' || url.pathname === '/partner/') {
    const runtimeConfig = `<script>window.WF_CLOUD_ONLY = true; window.WF_CLOUD_BACKOFFICE_API = ${JSON.stringify(cloudApi)};</script><script>`
    const html = fs.readFileSync(partnerHtmlPath, 'utf8').replace('<script>', runtimeConfig)
    return send(res, 200, html, 'text/html; charset=utf-8')
  }
  return send(res, 404, 'Not Found', 'text/plain; charset=utf-8')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`CloudBase admin listening on http://127.0.0.1:${port}/admin`)
  console.log(`CloudBase partner listening on http://127.0.0.1:${port}/partner`)
})
