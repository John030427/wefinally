const assert = require('assert')
const fs = require('fs')
const path = require('path')

const html = fs.readFileSync(path.resolve(__dirname, '../public/admin/index.html'), 'utf8')

assert.match(
  html,
  /const CLOUD_ONLY_PAGES = \['dashboard', 'service', 'users', 'members', 'matches', 'partners', 'orders', 'knowledge'\]/,
  'CloudBase admin must expose every migrated phase-one page in the agreed order'
)
assert.match(html, /function renderUserIdentity\(/, 'shared stable-code identity renderer must exist')
assert.match(html, /function openUserContext\(/, 'combined user context entry point must exist')
assert.match(html, /user_context/, 'service detail must consume the aggregate user context DTO')
assert.match(html, /包含测试数据/, 'users and service queues must expose an explicit test-data toggle')
assert.doesNotMatch(
  html,
  /const CLOUD_ONLY_PAGES = \[[^\]]*['"](?:chat|handoff)['"]/,
  'duplicate chat and handoff pages must remain hidden in CloudBase-only mode'
)

console.log('PASS CloudBase admin consolidation UI contract')
