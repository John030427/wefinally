# WeFinally Cloudbase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the WeFinally mini program experience build away from local `wx.request` / local MySQL and onto WeChat Cloud Development env `cloud1-d4gy8l52g08bba326`.

**Architecture:** The mini program initializes Cloudbase once in `app.js`, calls a single `cloudfunctions/api` function through `miniprogram/utils/cloudApi.js`, and the cloud function reads/writes Cloudbase database collections. The first implementation slice must remove experience-version dependency on `http://127.0.0.1:3000`, `http://10.20.154.54:3000`, and other LAN APIs for user-facing pages; legacy Express/MySQL remains only as local/admin fallback until the cloud handlers fully replace it.

**Tech Stack:** Native WeChat mini program, `wx.cloud.callFunction`, `wx-server-sdk`, Cloudbase database, existing Node selfcheck scripts.

## Global Constraints

- Cloud environment ID must be exactly `cloud1-d4gy8l52g08bba326`.
- Mini program frontend must not directly connect to MySQL or expose database credentials.
- Experience/review build must not depend on `http://10.20.154.54:3000`, `localhost`, `127.0.0.1`, `192.168.*`, or local port `3000`.
- Frontend pages must call the unified wrapper, not scatter `wx.cloud.callFunction`.
- Preserve existing UI and page behavior; replace request layer before rewriting screens.
- No user photo/avatar/album/image upload; no user-to-user private chat.
- Safety feature must not claim direct 110 police-system integration.
- Use tests/selfchecks before production-code changes for behavior changes.

---

### Task 1: Cloudbase Migration Selfcheck

**Files:**
- Create: `server/selfcheck/cloudbase-migration.js`
- Modify: `server/selfcheck/run-all.js`
- Modify: `server/package.json`

**Interfaces:**
- Produces command: `node selfcheck/cloudbase-migration.js`
- Produces package script: `npm run selfcheck:cloudbase`

- [ ] **Step 1: Write the failing selfcheck**

Create `server/selfcheck/cloudbase-migration.js` with assertions that fail on current code:

```js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const miniRoot = path.join(root, 'miniprogram');
const cloudRoot = path.join(miniRoot, 'cloudfunctions');
const cloudEnv = 'cloud1-d4gy8l52g08bba326';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function ok(name, condition) {
  if (!condition) {
    console.error(`FAIL - ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS - ${name}`);
}

const appJs = read('miniprogram/app.js');
const appJson = JSON.parse(read('miniprogram/project.config.json'));
const requestJs = read('miniprogram/utils/request.js');
const cloudApiPath = path.join(root, 'miniprogram/utils/cloudApi.js');

ok('app initializes wx cloud with production env', appJs.includes('wx.cloud.init') && appJs.includes(cloudEnv));
ok('project config declares cloud function root', appJson.cloudfunctionRoot === 'cloudfunctions/');
ok('cloud api wrapper exists', fs.existsSync(cloudApiPath));
ok('request layer uses cloud api wrapper', requestJs.includes("require('./cloudApi')") && requestJs.includes('callApi'));
ok('request layer no longer shows LAN diagnostic to users', !requestJs.includes('请确认手机和电脑在同一局域网') && !requestJs.includes('apiBaseUrl'));
ok('login cloud function exists', fs.existsSync(path.join(cloudRoot, 'login/index.js')));
ok('api cloud function exists', fs.existsSync(path.join(cloudRoot, 'api/index.js')));
ok('api cloud function has ping action', read('miniprogram/cloudfunctions/api/index.js').includes("case 'ping'"));
ok('api cloud function has route adapter', read('miniprogram/cloudfunctions/api/index.js').includes("case 'request'"));
ok('mini program source avoids hardcoded local backend default', !appJs.includes("http://127.0.0.1:3000") && !appJs.includes('10.20.154.54'));

if (process.exitCode) process.exit(process.exitCode);
```

- [ ] **Step 2: Run selfcheck to verify it fails**

Run:

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\server
node selfcheck/cloudbase-migration.js
```

Expected: FAIL for missing cloud init, cloud wrapper, cloudfunctions, and local backend default.

- [ ] **Step 3: Add script wiring**

Modify `server/package.json` scripts:

```json
"selfcheck:cloudbase": "node selfcheck/cloudbase-migration.js"
```

Modify `server/selfcheck/run-all.js` to include `cloudbase-migration.js` in the selfcheck list after `miniprogram-real-device.js`.

- [ ] **Step 4: Re-run red check**

Run:

```bash
npm run selfcheck:cloudbase
```

Expected: still FAIL until later tasks implement Cloudbase.

---

### Task 2: Mini Program Cloud Initialization And Request Wrapper

**Files:**
- Modify: `miniprogram/app.js`
- Modify: `miniprogram/project.config.json`
- Create: `miniprogram/utils/cloudApi.js`
- Modify: `miniprogram/utils/request.js`

**Interfaces:**
- Produces `callApi(action, payload, options)` in `miniprogram/utils/cloudApi.js`.
- Produces route-compatible request functions `get/post/put/del` still consumed by existing pages.

- [ ] **Step 1: Make `app.js` initialize Cloudbase once**

In `onLaunch`, before network/session setup, add:

```js
this.initCloud()
```

Add method:

```js
initCloud() {
  if (this.globalData.cloudInited) return
  if (!wx.cloud) {
    console.error('请使用 2.2.3 或以上基础库以使用云能力')
    return
  }
  wx.cloud.init({
    env: 'cloud1-d4gy8l52g08bba326',
    traceUser: true
  })
  this.globalData.cloudInited = true
}
```

Set `globalData.CLOUD_ENV_ID = 'cloud1-d4gy8l52g08bba326'` and remove local API default from production path.

- [ ] **Step 2: Configure cloud function root**

Add to `miniprogram/project.config.json`:

```json
"cloudfunctionRoot": "cloudfunctions/"
```

- [ ] **Step 3: Create `cloudApi.js`**

Implement:

```js
function normalizeCloudError(err) {
  const message = (err && (err.message || err.errMsg)) || '服务暂时不可用，请稍后重试'
  return new Error(message)
}

function callApi(action, payload = {}, options = {}) {
  return wx.cloud.callFunction({
    name: 'api',
    data: { action, payload }
  }).then((res) => {
    const result = res && res.result
    if (!result || result.success === false) {
      throw new Error((result && result.error) || '服务暂时不可用，请稍后重试')
    }
    return result.data
  }).catch((err) => {
    if (options.rawError) throw err
    throw normalizeCloudError(err)
  })
}

function requestByPath(method, path, data = {}) {
  return callApi('request', { method, path, data })
}

module.exports = { callApi, requestByPath }
```

- [ ] **Step 4: Convert `utils/request.js` to cloud route adapter**

Keep exports `request/get/post/put/del`. Replace `wx.request` call with:

```js
const { requestByPath } = require('./cloudApi')
...
requestByPath(method, url, data).then(resolve).catch(...)
```

User-facing network failures must show `服务暂时不可用，请稍后重试`, not local IP diagnostics.

- [ ] **Step 5: Run checks**

Run:

```bash
node --check miniprogram/app.js
node --check miniprogram/utils/cloudApi.js
node --check miniprogram/utils/request.js
npm run selfcheck:cloudbase
```

Expected: cloud init/request wrapper assertions pass; cloudfunctions assertions still fail until Task 3.

---

### Task 3: Cloud Function Scaffold And Route Dispatcher

**Files:**
- Create: `miniprogram/cloudfunctions/login/index.js`
- Create: `miniprogram/cloudfunctions/login/package.json`
- Create: `miniprogram/cloudfunctions/api/index.js`
- Create: `miniprogram/cloudfunctions/api/package.json`
- Create: `miniprogram/cloudfunctions/api/handlers/*.js`
- Create: `miniprogram/cloudfunctions/api/lib/*.js`

**Interfaces:**
- `login` returns `{ openid, appid, unionid }`.
- `api` supports `ping` and `request`.
- `request` payload is `{ method, path, data }`.

- [ ] **Step 1: Create login function**

`index.js`:

```js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID
  }
}
```

`package.json`:

```json
{
  "name": "wefinally-login",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

- [ ] **Step 2: Create api function entry**

`api/index.js` must:

```js
const cloud = require('wx-server-sdk')
const { handleRoute } = require('./handlers/route')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ENV_ID = 'cloud1-d4gy8l52g08bba326'

exports.main = async (event = {}, context = {}) => {
  const { action, payload = {} } = event
  try {
    switch (action) {
      case 'ping':
        return { success: true, data: { message: 'pong', env: ENV_ID } }
      case 'request':
        return { success: true, data: await handleRoute(payload, cloud.getWXContext()) }
      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  } catch (err) {
    return { success: false, error: err.message || 'server error' }
  }
}
```

- [ ] **Step 3: Implement route adapter**

`handlers/route.js` maps legacy paths to handler functions. It must support exact paths and dynamic paths such as `/api/meet/:id`.

- [ ] **Step 4: Run syntax checks**

Run:

```bash
node --check miniprogram/cloudfunctions/login/index.js
node --check miniprogram/cloudfunctions/api/index.js
npm run selfcheck:cloudbase
```

Expected: scaffold assertions pass; handler coverage may still be incomplete until later tasks.

---

### Task 4: Cloud Database Core Collections And Migration Script

**Files:**
- Create: `tools/cloudbase/export-mysql-to-cloud-json.js`
- Create: `project-docs/CLOUDBASE_MIGRATION_GUIDE_2026-07-08.md`
- Create: `miniprogram/cloudfunctions/api/lib/collections.js`

**Interfaces:**
- Migration command:

```bash
node tools/cloudbase/export-mysql-to-cloud-json.js
```

- Output directory:

```text
cloudbase-export/
```

- [ ] **Step 1: Define collection mapping**

`collections.js` exports the table-to-collection mapping:

```js
module.exports = {
  user: 'users',
  user_match_setting: 'user_match_settings',
  user_match_log: 'user_match_logs',
  occupation_circle: 'occupation_circles',
  user_order: 'user_orders',
  marry_report: 'marry_reports',
  system_stat: 'system_stats',
  ai_chat_log: 'ai_chat_logs',
  ai_knowledge: 'ai_knowledge',
  meet_report: 'meet_reports',
  meet_location_log: 'meet_location_logs',
  sos_log: 'sos_logs',
  free_whitelist: 'free_whitelist',
  free_whitelist_import_batch: 'free_whitelist_import_batches',
  match_handoff_ticket: 'match_handoff_tickets',
  partner: 'partners',
  partner_withdraw: 'partner_withdrawals',
  admin: 'admins',
  openid_blacklist: 'openid_blacklist',
  user_privacy_auth_log: 'user_privacy_auth_logs',
  partner_user_audit_log: 'partner_user_audit_logs'
}
```

- [ ] **Step 2: Create export script**

The script connects to local MySQL using `server/src/config/db.js`, exports each table to JSON with:

```js
{
  "_id": "<table>_<id-or-key>",
  "legacyId": 123,
  "...originalColumns": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

For `openid_blacklist`, use `_id = openid_blacklist_<openid>`.

- [ ] **Step 3: Document manual import**

Document Cloudbase console import steps for each JSON file, collection permissions, and the fact that database permissions should not be open public write.

---

### Task 5: Cloud Handlers For User-Facing Core Flow

**Files:**
- Create/Modify: `miniprogram/cloudfunctions/api/handlers/common.js`
- Create/Modify: `miniprogram/cloudfunctions/api/handlers/auth.js`
- Create/Modify: `miniprogram/cloudfunctions/api/handlers/user.js`
- Create/Modify: `miniprogram/cloudfunctions/api/handlers/match.js`
- Create/Modify: `miniprogram/cloudfunctions/api/handlers/meet.js`
- Create/Modify: `miniprogram/cloudfunctions/api/handlers/vip.js`
- Create/Modify: `miniprogram/cloudfunctions/api/handlers/chat.js`

**Interfaces:**
- Handlers consume Cloudbase `OPENID`, never trust frontend openid for authenticated operations except pre-registration divorce review.
- Existing page response shapes must remain compatible.

- [ ] **Step 1: Common/auth/user minimum**

Implement:

```text
GET /api/common/circles
GET /api/common/promote-code
GET /api/common/agreements
GET /api/common/safety-config
GET /api/common/config
GET /api/platform/rules
POST /api/auth/wx-login
POST /api/user/register
GET /api/user/profile
PUT /api/user/profile
```

- [ ] **Step 2: Match/VIP/chat/safety minimum**

Implement:

```text
GET /api/match/setting
POST /api/match/setting
GET /api/match/setting/cooldown
GET /api/match/latest
GET /api/match/list
GET /api/match/detail
POST /api/match/handoff
GET /api/vip/info
POST /api/vip/purchase
GET /api/chat/history
POST /api/chat/send
POST /api/meet/create
GET /api/meet/list
GET /api/meet/:id
GET /api/meet/share/:token
POST /api/meet/:id/location
POST /api/meet/:id/finish
POST /api/meet/:id/sos
POST /api/meet/sos
```

- [ ] **Step 3: Low-frequency user actions**

Implement:

```text
POST /api/user/marry-report
POST /api/user/cancel
POST /api/user/claim-free
GET /api/platform/marry-stat
GET /api/user/divorce-review/status
POST /api/user/divorce-review
```

---

### Task 6: Verification, Docs, And Experience Upload Checklist

**Files:**
- Modify: `project-docs/USER_TEST_GUIDE_2026-07-04.md`
- Create: `project-docs/CLOUDBASE_DELIVERY_2026-07-08.md`
- Modify: `project-docs/NEXT_THREAD_HANDOFF_2026-07-07.md`

**Interfaces:**
- Delivery doc includes cause, changed files, cloud functions, migrated actions, non-migrated risks, deployment steps, upload steps, and test results.

- [ ] **Step 1: Run static checks**

Run:

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
npm --prefix server run selfcheck:cloudbase
node --check miniprogram/cloudfunctions/api/index.js
node --check miniprogram/cloudfunctions/login/index.js
git diff --check
```

- [ ] **Step 2: Scan for forbidden experience-build local backend strings**

Run:

```bash
rg -n "10\\.20\\.154\\.54|http://127\\.0\\.0\\.1:3000|http://localhost:3000|http://192\\.168|请确认手机和电脑在同一局域网" miniprogram
```

Expected: no matches in uploadable mini program source except documentation comments if deliberately excluded from package.

- [ ] **Step 3: Write delivery doc**

`project-docs/CLOUDBASE_DELIVERY_2026-07-08.md` must include WeChat DevTools deployment steps:

```text
1. 打开微信开发者工具，导入 miniprogram。
2. 确认 AppID: wx91c6559ea4490a29。
3. 确认云环境: cloud1-d4gy8l52g08bba326。
4. 右键 cloudfunctions/login，上传并部署：云端安装依赖。
5. 右键 cloudfunctions/api，上传并部署：云端安装依赖。
6. 调用 api ping。
7. 上传小程序。
8. 微信公众平台版本管理设为体验版。
```
