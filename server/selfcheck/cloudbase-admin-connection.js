const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'public', 'admin', 'index.html'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const serverPath = path.join(root, 'tools', 'cloudbase-admin-local.js')

function ok(label, condition) {
  if (!condition) throw new Error(`FAIL ${label}`)
  console.log(`PASS ${label}`)
}

ok('admin supports explicit CloudBase-only mode', html.includes('WF_CLOUD_ONLY'))
ok('CloudBase hosted admin defaults to CloudBase-only mode without a query flag', html.includes("/\\.tcloudbaseapp\\.com$/i.test(location.hostname)"))
ok('CloudBase-only mode sends the primary API client to the cloud function', html.includes("const API = CLOUD_ONLY ? CLOUD_MEMBER_API + '/api' : '/api'"))
ok('CloudBase service base does not duplicate the api path', html.includes("DEFAULT_CLOUD_MEMBER_API = 'https://cloud1-d4gy8l52g08bba326.service.tcloudbase.com'"))
ok('CloudBase-only mode limits navigation to migrated cloud pages', html.includes("const CLOUD_ONLY_PAGES = ['dashboard', 'service', 'users', 'members', 'matches', 'partners', 'orders', 'knowledge']"))
ok('CloudBase-only login reuses one cloud token without a second login', html.includes('if (CLOUD_ONLY) {') && html.includes('setCloudToken(d.token)'))
ok('CloudBase-only tokens expire with the browser session', html.includes('CLOUD_ONLY ? sessionStorage : localStorage'))
ok('CloudBase-only mode explains a stale deployed API version', html.includes('云端 api 版本较旧，尚未包含当前后台所需接口'))
ok('local CloudBase admin launcher exists', fs.existsSync(serverPath))

const launcher = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : ''
ok('launcher injects real CloudBase mode without proxying database access', launcher.includes('window.WF_CLOUD_ONLY = true') && launcher.includes('window.WF_CLOUD_BACKOFFICE_API'))
ok('launcher uses the CloudBase service origin as its base', launcher.includes("'https://cloud1-d4gy8l52g08bba326.service.tcloudbase.com'"))
ok('launcher binds only to loopback', launcher.includes("listen(port, '127.0.0.1'"))
ok('package exposes an explicit CloudBase admin command', packageJson.scripts['admin:cloudbase'] === 'node tools/cloudbase-admin-local.js')

console.log('PASS CloudBase admin connection contract')
