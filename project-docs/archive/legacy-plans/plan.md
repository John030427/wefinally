# WeFinally 实施计划 · 第 1 波：工程地基 + 确定性 Bug + 安全加固

> **执行者**：Cursor（主模型 GPT-5.5）→ 用 **Composer** 逐任务实现 → 再用 **GPT 做 review**（对照每个任务的「验收」与文末总检查表）。
> **本计划由项目 PM/架构师产出，需求已锁定。** 你（执行 agent）几乎不了解本项目，请严格按任务卡执行，不要自由发挥、不要重构计划外的代码。

**Goal（本波目标）**：让项目**能在本地跑起来**、修掉 **4 个确定性 Bug**、堵上 **4 个安全漏洞**，且**不改动任何 UI、不改动业务规则**。

**Architecture**：原生微信小程序（前端） + Node.js/Express（后端） + MySQL 8 + node-cron。后端分层 `routes / services / middleware / config / cron`。本波只动后端少量路由/中间件/配置 + 工程文件，**完全不碰小程序页面 UI**。

**Tech Stack**：Node 18+ / Express / mysql2 / jsonwebtoken / node-cron / 原生微信小程序。

---

## 0. 必读约束（违反即返工）

### 0.1 代码根目录（有坑：双层同名嵌套）
真实代码根目录是：
```
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\
```
**请在这个目录打开/操作**。下文所有路径都相对此根目录（如 `server/src/app.js`）。`miniprogram/`、`server/`、`database/`、`project-docs/` 都在这一层。

### 0.2 需求是锁定的，不要改
- 商业规则锁定：VIP **188 元/30 天**、匹配**周三/五 0:00**、择偶配置 **7 天冷却**、分润 **50/50 T+7**、**无图片上传**、**无用户私聊**。这些是 PRD 死规则，**本波不得改动**。
- 详细背景与决策见 `project-docs/`（入口 `README_HANDOVER.md`）。**遇到与本计划冲突的疑问，先停下、不要猜**——记录到 `project-docs/QUESTIONS_TO_BOSS.md` 等人确认。

### 0.3 绝对不能动（本波范围外）
- 任何 `miniprogram/` 下的页面 `.wxml/.wxss`（UI 不动）
- `server/src/services/matchService.js` 的匹配权重与算法（双向互配是**下一波**，本波不碰）
- `orderService` 的 188/94/94 分润计算
- `database/init.sql` 已上线表结构（如需结构调整，写新的 `database/patch-*.sql`，不要改 init.sql）

### 0.4 工作纪律
- **小步提交**：每个任务（Task）至少 1 个 commit，message 用 `fix(scope): ...` / `chore: ...` / `security(scope): ...`。
- **每完成一个 Phase，跑该 Phase 的验收命令**，确认通过再继续。
- 不引入新依赖（除非任务明确要求）。不升级现有依赖。
- 不删除现有代码块（除非任务明确要求替换）。

---

## Phase 0 — 工程地基（R0：让它先跑起来）

> 目的：建立 git 基线（可回滚）+ 确认项目真的能启动。**这一步常会暴露环境/依赖问题，不跑通不要往下做。**

### Task 0.1：初始化 git 仓库 + .gitignore

**Files：**
- Create：`.gitignore`（代码根目录）

- [ ] **Step 1**：在代码根目录创建 `.gitignore`，内容：

```gitignore
# dependencies
node_modules/
server/node_modules/

# env / secrets
.env
server/.env
*.env.local

# logs
*.log
npm-debug.log*
logs/

# WeChat devtools
project.private.config.json
miniprogram/miniprogram_npm/

# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/
```

- [ ] **Step 2**：初始化并首个提交

```bash
git init
git add .
git commit -m "chore: initial commit (baseline before fixes)"
```

- [ ] **Step 3 验收**：`git log --oneline` 有 1 条提交；`git status` 干净；确认 `node_modules/` 与 `.env` 未被跟踪。

---

### Task 0.2：配置后端环境变量

**Files：**
- Create：`server/.env`（从 `server/.env.example` 复制）

- [ ] **Step 1**：复制模板

```bash
cd server
cp .env.example .env
```

- [ ] **Step 2**：编辑 `server/.env`，至少填好以下项（开发环境）：

```
NODE_ENV=development
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<你的本地MySQL密码>
DB_NAME=wefinally
JWT_SECRET=<随便一段长随机串，开发用即可>
CORS_ORIGIN=
```
> 微信**支付**相关（`WXPAY_*`）开发阶段可留空——留空时支付走 mock。
> ⚠️ 但 **`WX_APPID` / `WX_SECRET` 不能留空**：用户端微信登录 `POST /api/auth/wx-login` 会调 `wxCode2Session()` 请求微信服务器（`server/src/routes/auth.js:16-28`），缺这两项会直接抛「微信配置缺失」、登录走不通，后续所有需登录的页面都进不去。要在开发者工具里联调**用户端**，必须先注册一个微信小程序拿到 AppID+Secret 填进来（仅测后台 `/admin`、`/partner` 则不需要）。
> ⚠️ 若 `server/.env.example` 里的变量名与上面不同，**以 `.env.example` 的实际变量名为准**，只需保证 DB 连接、`JWT_SECRET` 有值。

- [ ] **Step 3 验收**：`server/.env` 存在且 DB 配置正确；确认它被 `.gitignore` 忽略（`git status` 看不到它）。

---

### Task 0.3：导入数据库

**Files：** 无（执行 SQL）

- [ ] **Step 1**：创建并导入 schema（单一真源是 `database/init.sql`，**不要用** `server/migrations/001_schema.sql`）

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS wefinally DEFAULT CHARSET=utf8mb4;"
mysql -u root -p wefinally < database/init.sql
mysql -u root -p wefinally < database/patch-002-partner-audit.sql
```
> Windows 也可直接双击运行 `database/import.bat`。`patch-002` 与 init.sql 里的 `partner_user_audit_log` 重复，是幂等的（`CREATE TABLE IF NOT EXISTS`），跑不跑都行。

- [ ] **Step 2 验收**：

```bash
mysql -u root -p wefinally -e "SHOW TABLES;"
```
Expected：列出 15 张表（含 `user`、`partner`、`marry_report`、`partner_withdraw`、`user_privacy_auth_log`、`partner_user_audit_log` 等）。

---

### Task 0.4：安装依赖并启动后端

**Files：** 无

- [ ] **Step 1**：安装 + 启动

```bash
cd server
npm install
npm run dev
```

- [ ] **Step 2 验收**：服务输出 `WeFinally server running on port 3000`；另开终端：

```bash
curl http://localhost:3000/api/common/health
```
Expected：`{"code":0,"message":"ok","data":{"status":"ok","time":"..."}}`（`code` 也可能是 0/200，以 `status:ok` 为准）

- [ ] **Step 3**：把启动中遇到的任何报错记录到 `project-docs/DEVELOPMENT_LOG.md`（新增一条 R0 记录）。**若启动失败，先解决再继续，不要跳过。**

- [ ] **Step 4 提交**：

```bash
git add server/.env.example project-docs/DEVELOPMENT_LOG.md
git commit -m "chore(r0): local run verified, log startup notes"
```
> 注意：`server/.env` 不提交（已 ignore）。

---

### Task 0.5（可选）：小程序导入说明
- [ ] 用「微信开发者工具」导入 `miniprogram/` 目录；在 `miniprogram/app.js` 把 `globalData.API_BASE_URL`（当前为 `https://api.wefinally.com`）改成本地/测试地址；开发期勾选「不校验合法域名」。
- 本波不改小程序代码，此步仅为联调，**不产生提交**。

**Phase 0 完成标准**：git 基线已建；后端能启动且 health 通过；DB 已导入。

---

## Phase 1 — 修 4 个确定性 Bug（纯后端，零 UI 影响）

### Task 1.1：提现驳回状态写错（驳回被误标为「已结算」）

**问题**：驳回提现（status=2）时虽然退回了余额，却把记录标成 `status=1`（与「通过/已结算」同值），导致驳回和通过无法区分。

**Files：**
- Modify：`server/src/routes/admin.js`（约 273-287 行，`PUT /api/admin/withdrawals/:id` 内）

- [ ] **Step 1**：找到这段：

```js
    if (Number(status) === 1 && withdraw.status === 0) {
      await conn.query(
        'UPDATE partner_withdraw SET status = 1 WHERE id = ?',
        [req.params.id]
      );
    } else if (Number(status) === 2 && withdraw.status === 0) {
      await conn.query(
        'UPDATE `partner` SET balance = balance + ? WHERE id = ?',
        [withdraw.amount, withdraw.partner_id]
      );
      await conn.query(
        'UPDATE partner_withdraw SET status = 1 WHERE id = ?',
        [req.params.id]
      );
    }
```

- [ ] **Step 2**：替换为（驳回写 `status = 2`）：

```js
    if (Number(status) === 1 && withdraw.status === 0) {
      // 通过/打款
      await conn.query(
        'UPDATE partner_withdraw SET status = 1 WHERE id = ?',
        [req.params.id]
      );
    } else if (Number(status) === 2 && withdraw.status === 0) {
      // 驳回：退回余额，并标记为「已驳回」(status=2)，不能标成已结算
      await conn.query(
        'UPDATE `partner` SET balance = balance + ? WHERE id = ?',
        [withdraw.amount, withdraw.partner_id]
      );
      await conn.query(
        'UPDATE partner_withdraw SET status = 2 WHERE id = ?',
        [req.params.id]
      );
    }
```
> 状态语义自此为：`0=待处理`，`1=已结算/通过`，`2=已驳回(已退回余额)`。合伙人后台 UI 已按多状态展示，无需改前端。

- [ ] **Step 3 验收（手动）**：本地造一条 `partner_withdraw`（status=0）后调用驳回，确认该行变为 `status=2` 且对应 `partner.balance` 增加了对应金额；再造一条调用通过，确认变 `status=1` 且余额不变。

- [ ] **Step 4 提交**：

```bash
git add server/src/routes/admin.js
git commit -m "fix(admin): mark rejected withdrawals as status=2 (was wrongly 1)"
```

---

### Task 1.2：账号注销被当成「结婚报备」（会把用户误标为已婚并虚增领证数）

**问题**：`POST /api/user/cancel`（账号注销）和结婚报备都写 `marry_report.report_type=1`。管理员审核通过时（`admin.js` 的 `marry-reports/:id/approve`）会把用户 `status` 置为 **MARRIED** 并 **领证成功数 +1**——于是「注销」会被错误地当成「结婚成功」，污染公示数据。

**修复思路**：给注销一个独立类型 `report_type=3`，并让审核端按类型分别处理。

**Files：**
- Modify：`server/src/config/constants.js`
- Modify：`server/src/routes/user.js`（`POST /cancel`，约 462-485 行；import 块 15-23 行）
- Modify：`server/src/routes/admin.js`（`marry-reports/:id/approve`，约 551-567 行）

- [ ] **Step 1**：在 `server/src/config/constants.js` 的 `module.exports = {` 里，`ORDER_STATUS` 之后新增枚举：

```js
  MARRY_REPORT_TYPE: {
    MARRY: 1,
    DIVORCE: 2,
    CANCEL: 3,
  },
```

- [ ] **Step 2**：在 `server/src/routes/user.js` 顶部 constants 解构（第 15-23 行）里加入 `MARRY_REPORT_TYPE`：

```js
const {
  AGREEMENT_TYPES,
  MATCH_COOLDOWN_DAYS,
  VIEW_TEXT_MIN,
  VIEW_TEXT_MAX,
  USER_STATUS,
  PARTNER_STATUS,
  ROLES,
  MARRY_REPORT_TYPE,
} = require('../config/constants');
```

- [ ] **Step 3**：在 `user.js` 的 `POST /cancel` 里，把两处 `report_type = 1` 改成 `MARRY_REPORT_TYPE.CANCEL`。找到：

```js
      const [pending] = await pool.query(
        'SELECT id FROM marry_report WHERE user_id = ? AND report_type = 1 AND audit_status = 0',
        [req.auth.id]
      );
      if (pending.length > 0) {
        return fail(res, '已有待审核申请，请等待处理');
      }

      await pool.query(
        `INSERT INTO marry_report (user_id, report_type, proof_img, audit_status)
         VALUES (?, 1, ?, 0)`,
        [req.auth.id, '用户申请账号注销']
      );
```

替换为：

```js
      const [pending] = await pool.query(
        'SELECT id FROM marry_report WHERE user_id = ? AND report_type = ? AND audit_status = 0',
        [req.auth.id, MARRY_REPORT_TYPE.CANCEL]
      );
      if (pending.length > 0) {
        return fail(res, '已有待审核申请，请等待处理');
      }

      await pool.query(
        `INSERT INTO marry_report (user_id, report_type, proof_img, audit_status)
         VALUES (?, ?, ?, 0)`,
        [req.auth.id, MARRY_REPORT_TYPE.CANCEL, '用户申请账号注销']
      );
```
> `POST /api/user/marry-report`（结婚报备）保持 `report_type=1` **不变**。

- [ ] **Step 4**：在 `server/src/routes/admin.js` 的 `marry-reports/:id/approve` 审核通过分支里，按类型分别处理。找到：

```js
    if (approve) {
      await conn.query(
        'UPDATE marry_report SET audit_status = 1 WHERE id = ?',
        [reportId]
      );
      await conn.query(
        'UPDATE `user` SET status = ?, is_vip = 0, vip_expire_time = NULL WHERE id = ?',
        [USER_STATUS.MARRIED, report.user_id]
      );
      if (report.report_type === 1) {
        await conn.query(
          'UPDATE system_stat SET marry_success_count = marry_success_count + 1 WHERE id = 1'
        );
      }
      await conn.commit();
      return success(res, null, '审核通过，账号已注销');
    }
```

替换为：

```js
    if (approve) {
      await conn.query(
        'UPDATE marry_report SET audit_status = 1 WHERE id = ?',
        [reportId]
      );

      if (report.report_type === 3) {
        // 账号注销：停用账号，不标记已婚、不计入领证成功数
        await conn.query(
          'UPDATE `user` SET status = ?, is_vip = 0, vip_expire_time = NULL WHERE id = ?',
          [USER_STATUS.BANNED, report.user_id]
        );
        await conn.commit();
        return success(res, null, '审核通过，账号已注销');
      }

      if (report.report_type === 1) {
        // 结婚报备：标记已婚 + 领证成功数 +1
        await conn.query(
          'UPDATE `user` SET status = ?, is_vip = 0, vip_expire_time = NULL WHERE id = ?',
          [USER_STATUS.MARRIED, report.user_id]
        );
        await conn.query(
          'UPDATE system_stat SET marry_success_count = marry_success_count + 1 WHERE id = 1'
        );
        await conn.commit();
        return success(res, null, '结婚审核通过，账号已注销');
      }

      // 其它类型：仅标记已审核，不改用户状态
      await conn.commit();
      return success(res, null, '审核通过');
    }
```
> 说明：本波用 `USER_STATUS.BANNED` 作为「注销=停用」的落点（`guard.js` 的 `requireActiveUser` 已拦截 BANNED，用户随即出池）。专门的 `CANCELLED` 状态属后续优化（需同时改 guard 的拦截名单），本波不做。

- [ ] **Step 5 验收（手动）**：
  1. 调 `POST /api/user/cancel` → 查 `marry_report` 新行 `report_type=3`；
  2. 管理员审核通过该行 → 该用户 `status` 变 BANNED，`system_stat.marry_success_count` **不变**；
  3. 另造一条结婚报备（`report_type=1`）审核通过 → 用户 `status=MARRIED` 且 `marry_success_count +1`。

- [ ] **Step 6 提交**：

```bash
git add server/src/config/constants.js server/src/routes/user.js server/src/routes/admin.js
git commit -m "fix(user/admin): separate account-cancel (type 3) from marriage report; stop false MARRIED + stat inflation"
```

---

### Task 1.3：隐私授权日志「授权时间」取错列（恒为空）

**问题**：`GET /api/admin/privacy-logs` 返回 `auth_time: row.create_time`，但 `user_privacy_auth_log` 表**没有 `create_time` 列**（只有 `auth_time`，见 `database/init.sql:212`），所以授权时间永远是空。

**Files：**
- Modify：`server/src/routes/admin.js`（约 503 行）

- [ ] **Step 1**：找到（在 `/privacy-logs` 的返回映射里）：

```js
        auth_time: row.create_time,
```

- [ ] **Step 2**：改为：

```js
        auth_time: row.auth_time,
```
> 注意：同一段 SQL 里把用户表的创建时间另起别名为 `user_create_time`，所以 `row.auth_time` 就是日志表的授权时间，不会冲突。

- [ ] **Step 3 验收（手动）**：调 `GET /api/admin/privacy-logs`，确认返回项里 `auth_time` 有真实时间值（非 null）。

- [ ] **Step 4 提交**：

```bash
git add server/src/routes/admin.js
git commit -m "fix(admin): privacy-logs auth_time should read row.auth_time (table has no create_time)"
```

---

### Task 1.4：择偶设置把「城市」误写进「圈层」字段

**问题**：`user.js` 保存择偶设置时 `like_circle_ids: like_circle_ids || prefer_city || ''`——当 `like_circle_ids` 为空时，会把城市字符串塞进圈层 ID 字段，污染匹配。

**Files：**
- Modify：`server/src/routes/user.js`（约 371 行，择偶设置 payload 构造处）

- [ ] **Step 1**：找到：

```js
        like_circle_ids: like_circle_ids || prefer_city || '',
```

- [ ] **Step 2**：改为：

```js
        like_circle_ids: like_circle_ids || '',
```
> `prefer_city` 没有对应的数据库列（当前 schema 无「城市偏好」字段），这里属误用，直接去掉兜底即可。若将来要做城市偏好，需另立字段——本波不做。

- [ ] **Step 3 验收（手动）**：保存一份 `like_circle_ids` 为空的择偶设置，确认 `user_match_setting.like_circle_ids` 存的是空串而**不是城市名**。

- [ ] **Step 4 提交**：

```bash
git add server/src/routes/user.js
git commit -m "fix(user): do not fall back to prefer_city for like_circle_ids"
```

**Phase 1 完成标准**：4 个 Bug 均改完并各自验收通过、各有 commit。后端仍能正常启动（`npm run dev` 无报错）。

---

## Phase 2 — 安全加固（R3，纯后端，零 UI 影响）

### Task 2.1：生产环境强制 JWT_SECRET（去掉 dev 默认值兜底的风险）

**问题**：`auth.js` 用 `process.env.JWT_SECRET || 'dev_secret'`，生产若忘配会用弱密钥，token 可被伪造。

**Files：**
- Modify：`server/src/app.js`（顶部，`require('dotenv').config();` 之后）

- [ ] **Step 1**：在 `server/src/app.js` 第一行 `require('dotenv').config();` 之后，新增启动校验：

```js
// ── 生产环境安全自检 ───────────────────────────────
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_secret') {
    throw new Error('FATAL: 生产环境必须设置强随机 JWT_SECRET（不能为空或 dev_secret）');
  }
}
```
> 不改 `auth.js`（开发期仍可用默认值）；只在生产启动时硬拦截。

- [ ] **Step 2 验收（手动）**：
  - `NODE_ENV=production` 且不设 `JWT_SECRET` 启动 → 进程报 FATAL 退出；
  - 开发模式（`NODE_ENV=development`）启动 → 正常。

- [ ] **Step 3 提交**：

```bash
git add server/src/app.js
git commit -m "security(server): require strong JWT_SECRET in production"
```

---

### Task 2.2：限制生产环境 CORS（不再默认 *）

**Files：**
- Modify：`server/src/app.js`（约 27 行，`app.use(cors(...))`）

- [ ] **Step 1**：找到：

```js
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
```

- [ ] **Step 2**：替换为：

```js
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === 'production' && corsOrigins.length === 0) {
  throw new Error('FATAL: 生产环境必须设置 CORS_ORIGIN（逗号分隔的允许来源）');
}
app.use(cors({ origin: corsOrigins.length > 0 ? corsOrigins : '*' }));
```
> 说明：微信小程序请求不带 Origin、不受浏览器 CORS 限制；此项主要保护 `/admin`、`/partner` 两个网页后台。开发期 `CORS_ORIGIN` 留空 → 仍用 `*`，不影响本地联调。

- [ ] **Step 3 验收（手动）**：开发模式启动正常；`NODE_ENV=production` 且不设 `CORS_ORIGIN` → 启动报 FATAL。

- [ ] **Step 4 提交**：

```bash
git add server/src/app.js
git commit -m "security(server): restrict CORS in production"
```

---

### Task 2.3：微信支付下单接口 `/unified` 缺鉴权（任何人可下单）

**问题**：`POST /api/wxpay/unified` 没有任何登录校验，且直接用请求体里的 `order_no`/`openid`，可被滥用。

**Files：**
- Modify：`server/src/routes/wxpay.js`（顶部 import；`/unified` 路由定义；取到 order 之后）

- [ ] **Step 1**：在 `wxpay.js` 顶部 import 区加入：

```js
const { userAuth } = require('../middleware/auth');
```

- [ ] **Step 2**：给 `/unified` 挂上 `userAuth`。找到：

```js
router.post('/unified', async (req, res, next) => {
```
改为：

```js
router.post('/unified', userAuth, async (req, res, next) => {
```

- [ ] **Step 3**：在取到订单之后（`const order = orders[0];` 这一行后面）加订单归属校验：

```js
    const order = orders[0];
    if (order.user_id !== req.auth.id) {
      return res.status(403).json({ code: 403, message: '无权操作此订单' });
    }
```
> 不要给 `/notify`（微信服务器回调）和 `/mock-pay` 加 `userAuth`。

- [ ] **Step 4 验收（手动）**：
  - 不带 token 调 `/api/wxpay/unified` → 401；
  - 带 A 用户 token 但传 B 用户的 `order_no` → 403；
  - 带正确 token + 自己的订单 → 正常返回（开发期为 mock 支付参数）。

- [ ] **Step 5 提交**：

```bash
git add server/src/routes/wxpay.js
git commit -m "security(wxpay): require userAuth + order ownership on /unified"
```

---

### Task 2.4：支付回调 `/notify` 在生产缺 API key 时不应放行

**问题**：`/notify` 仅在 `apiKey` 存在时验签；若生产漏配 `WXPAY_API_KEY`，会跳过验签直接把订单标记为已支付——可被伪造回调刷单。

**Files：**
- Modify：`server/src/routes/wxpay.js`（`/notify` 内，约 132 行）

- [ ] **Step 1**：找到：

```js
    const apiKey = process.env.WXPAY_API_KEY;
    if (apiKey) {
      const sign = data.sign;
      const computed = buildSign(data, apiKey);
      if (sign !== computed) {
        return res.send(buildXml({ return_code: 'FAIL', return_msg: '签名错误' }));
      }
    }
```

- [ ] **Step 2**：替换为：

```js
    const apiKey = process.env.WXPAY_API_KEY;
    if (process.env.NODE_ENV === 'production' && !apiKey) {
      console.error('[wxpay notify] 生产环境缺少 WXPAY_API_KEY，拒绝处理回调');
      return res.send(buildXml({ return_code: 'FAIL', return_msg: '支付未正确配置' }));
    }
    if (apiKey) {
      const sign = data.sign;
      const computed = buildSign(data, apiKey);
      if (sign !== computed) {
        return res.send(buildXml({ return_code: 'FAIL', return_msg: '签名错误' }));
      }
    }
```

- [ ] **Step 3 验收（手动）**：`NODE_ENV=production` 且不设 `WXPAY_API_KEY` 时，POST 一个伪造回调到 `/api/wxpay/notify` → 返回 FAIL 且订单**未**被标记已支付。

- [ ] **Step 4 提交**：

```bash
git add server/src/routes/wxpay.js
git commit -m "security(wxpay): refuse notify without API key in production"
```

---

### Task 2.5：默认管理员密码 — 上线提醒（不改代码）

**问题**：`database/init.sql` 种了默认管理员 `admin / admin123456`。

**Files：**
- Modify：`project-docs/TODO.md`（在 P3 上线清单里补一条提醒，若已有类似条目则跳过）

- [ ] **Step 1**：在 `project-docs/TODO.md` 的 `## P3 — 上线与后台完善` 下补一条：

```markdown
- [ ] 上线后**立即修改默认管理员密码**（init.sql 默认 admin/admin123456）：用 bcrypt 生成新哈希后 `UPDATE admin SET password='<bcrypt哈希>' WHERE username='admin';`（可用 `node -e "console.log(require('bcryptjs').hashSync('新密码',10))"`，依赖名以 server/package.json 实际为准）
```

- [ ] **Step 2 提交**：

```bash
git add project-docs/TODO.md
git commit -m "docs(todo): remind to change default admin password before launch"
```

**Phase 2 完成标准**：4 处安全加固完成、各有 commit；开发模式 `npm run dev` 仍正常启动；TODO 补上密码提醒。

---

## 本波明确「不做」（留给后续 plan，不要在本计划里实现）

以下都是已确认要做、但**不属于本波**的工作。不要顺手做，避免失控：

| 项 | 为什么留到后面 |
|----|----------------|
| **双向互配 + 候选放开非 VIP** | 改 `matchService.js` 核心算法，需专门设计 + 测试用例，单独成 plan |
| **非 VIP 详情模糊 + 匹配详情字段收紧（Q1/Q2）** | 涉及小程序 UI 改动，与双向互配同批做 |
| **注册身高改区间 + 旧数据迁移（Q3）** | 涉及迁移脚本 + matchService 取数改中位数，单独成 plan |
| **外貌描述字段（v1）** | 新字段 + profile UI，单独成 plan |
| **见面安全确认 / 安全卡** | 新表 + 新页面，单独成 plan |
| **R2 配置化收敛 / GET /api/common/config** | 行为不变的重构，单独成 plan |
| **外貌描述 v2「关键词→LLM 生成画像」** | 会触碰「v1 不接外部大模型」决定，需老板确认 |

PM/架构师会在本波合并并 review 后，再产出下一波 plan。

---

## GPT Review 总检查表（每个 Phase 后对照）

执行完后，请 GPT 逐条核对（这是 review 的客观依据）：

**正确性**
- [ ] Task 1.1：驳回提现 → `partner_withdraw.status=2` 且余额已退回；通过 → `status=1`、余额不动
- [ ] Task 1.2：`/cancel` 写 `report_type=3`；审核注销 → 用户 BANNED、`marry_success_count` 不变；审核结婚 → MARRIED、计数 +1
- [ ] Task 1.3：`/admin/privacy-logs` 的 `auth_time` 有真实值
- [ ] Task 1.4：空 `like_circle_ids` 不再写入城市名
- [ ] Task 2.3：`/unified` 无 token=401、越权订单=403、正常=通过
- [ ] Task 2.4：生产缺 key 的伪造回调被拒、订单未被标记已支付

**范围纪律**
- [ ] 没有改动任何 `miniprogram/` 页面 UI
- [ ] 没有改动 `matchService.js`、`orderService` 分润、`database/init.sql` 结构
- [ ] 没有引入新依赖、没有大规模重构
- [ ] 每个 Task 都有独立、信息清晰的 commit
- [ ] 后端 `npm run dev` 全程可正常启动

**回归**
- [ ] `GET /api/common/health` 仍 200/ok
- [ ] 登录 → 资料 → 择偶设置 → 下单(mock) 主链路手动走通一遍无报错

---

> 完成本波后，把每个 Task 的实际改动与验收结果，追加记录到 `project-docs/DEVELOPMENT_LOG.md`（新增「第三阶段：R0+R1+R3 实施」条目）。有任何与本计划不符的现实情况（如变量名、行号偏移），以**实际代码为准**并在该处注明。
