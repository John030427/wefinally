const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'public', 'partner', 'index.html'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const launcher = fs.readFileSync(path.join(root, 'tools', 'cloudbase-admin-local.js'), 'utf8')

function ok(label, condition) {
  if (!condition) throw new Error(`FAIL ${label}`)
  console.log(`PASS ${label}`)
}

ok('partner supports explicit CloudBase-only mode', html.includes('WF_CLOUD_ONLY'))
ok('CloudBase-only mode sends partner API calls to the cloud function', html.includes("const API = CLOUD_ONLY ? CLOUD_MEMBER_API + '/api' : '/api'"))
ok('partner CloudBase service base does not duplicate the api path', html.includes("DEFAULT_CLOUD_MEMBER_API = 'https://cloud1-d4gy8l52g08bba326.service.tcloudbase.com'"))
ok('CloudBase-only partner navigation exposes only migrated pages', html.includes("const CLOUD_ONLY_PAGES = ['audit', 'promote']"))
ok('CloudBase-only partner login reuses one cloud token', html.includes('if (CLOUD_ONLY) {') && html.includes('setCloudToken(data.token)'))
ok('CloudBase-only partner tokens expire with the browser session', html.includes('CLOUD_ONLY ? sessionStorage : localStorage'))
ok('CloudBase-only partner mode hides the unavailable self-registration link', html.includes("document.getElementById('partnerRegisterEntry').classList.add('hidden')"))
ok('launcher serves partner CloudBase mode', launcher.includes("url.pathname === '/partner'") && launcher.includes('partnerHtmlPath'))
ok('package exposes the partner connection selfcheck', packageJson.scripts['selfcheck:cloudbase-partner'] === 'node selfcheck/cloudbase-partner-connection.js')

console.log('PASS CloudBase partner connection contract')
