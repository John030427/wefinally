# WeFinally 5.1 Review Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 5.1 第二轮代码审查整改，使协调通知、未读游标、协调事件和双方 AI 会话消息在并发与重试下保持原子幂等，并闭环 GitHub 与 CloudBase 可追溯发布。

**Architecture:** 保留已经通过测试的 LangGraph、AI 报告、counter-offer 和到场位置实现，不重写业务流程。把幂等边界下沉至 CloudBase 数据库事务：通知与未读游标在同一事务提交；协调事件和每个参与者的投影消息分别用稳定幂等 claim，重复调用可补齐缺失投影但不会重复写入。

**Tech Stack:** 微信小程序、CloudBase 云函数、CloudBase Document Database、Node.js 16.13（云端）/ Node.js >=18（本地）、现有 LangGraph 协调服务。

**Spec:** `docs/superpowers/plans/2026-09-03-wefinally-51-review-remediation.md`；本计划落实其完成后的第二轮 Review 发现。

## Global Constraints

- 工作目录：`D:\wefinal\.worktrees\wefinally-qa-replay-global`；分支：`fix/date-counter-offer-negotiation`。
- 当前基线 HEAD 为 `52fd28b`；开始前重新读取实际 HEAD，若已变化则记录新基线，不得 reset 或覆盖其他人的改动。
- 只修复第二轮 Review 的集合初始化、未读游标并发、事件/消息幂等和发布追踪，不改匹配、RAG、画像、AI 报告内容、协调产品流程与 UI。
- 所有全局数据库写入继续经过云函数；不得信任客户端传入的用户 ID、OPENID 或协调参与者身份。
- 不展示另一方原始回答；只保存和投递既有安全投影。
- 先写可失败的并发/恢复测试，再修改实现；禁止删除或放宽现有断言。
- 不新增第三方依赖；散列使用 Node 内置 `crypto`。
- 不删除线上测试数据来获得绿灯，不修改 CloudBase 环境变量。
- `miniprogram/project.config.json` 仅存在缺失末尾换行的噪声，必须通过一个恢复提交还原，后续不得再次纳入业务提交。
- 所有门禁通过、业务提交已推送 GitHub 后，才能重新部署 CloudBase `api`。

## File Structure

- `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js`：允许自动初始化的 Agent/协调集合白名单。
- `miniprogram/cloudfunctions/api/lib/collections.js`：逻辑集合到 CloudBase 物理集合的唯一映射。
- `miniprogram/cloudfunctions/api/lib/db.js`：通知、游标、协调事件和投影消息的事务实现。
- `miniprogram/cloudfunctions/api/lib/coordinationInbox.js`：站内通知服务，只消费数据库原子结果，不在事务外递增未读数。
- `miniprogram/cloudfunctions/api/agent/dateCoordinationEvents.js`：协调事件和双方安全投影消息的编排。
- `server/selfcheck/coordination-notification-concurrency.js`：同 key 与不同 key 并发通知测试。
- `server/selfcheck/date-coordination-events.js`：事件重复调用、并发调用和故障恢复测试。
- `server/selfcheck/date-coordination-review-followups.js`：集合映射/自动初始化与第二轮回归契约。
- `project-docs/WORK_REPORT_2026-09-03_51_REVIEW_ROUND2.md`：代码 SHA、远程分支、测试、部署与真机待验项。

---

### Task 1: 将所有新增幂等集合纳入显式映射和自动初始化

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/collections.js:50-60`
- Modify: `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js:1-35`
- Modify: `server/selfcheck/date-coordination-review-followups.js`

**Interfaces:**
- Consumes: `withCollection(logicalName, operation)` 和 `canBootstrapCollection(logicalName)`。
- Produces: 通知、协调事件、消息投影使用的幂等集合在空环境中可安全创建一次。

- [ ] **Step 1: 增加缺失集合的失败测试**

在 `date-coordination-review-followups.js` 中直接验证逻辑名称与物理名称：

```js
const collections = require('../../miniprogram/cloudfunctions/api/lib/collections')
const { canBootstrapCollection } = require('../../miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy')

assert.strictEqual(collections.coordination_notification_dedupe, 'coordination_notification_dedupes')
assert.strictEqual(canBootstrapCollection('coordination_notification_dedupe'), true)
```

Task 3 如果新增 `date_coordination_event_dedupe`、`agent_message_dedupe`，同一个测试必须验证它们的映射和 bootstrap 白名单。

- [ ] **Step 2: 运行测试确认当前代码失败**

Run: `node server/selfcheck/date-coordination-review-followups.js`

Expected: FAIL，因为 `coordination_notification_dedupe` 尚未加入 `BOOTSTRAP_COLLECTIONS`。

- [ ] **Step 3: 补齐映射与 bootstrap 白名单**

保持单数逻辑名、复数物理名：

```js
// collections.js
coordination_notification_dedupe: 'coordination_notification_dedupes',
date_coordination_event_dedupe: 'date_coordination_event_dedupes',
agent_message_dedupe: 'agent_message_dedupes',
```

```js
// collectionBootstrapPolicy.js
'coordination_notification_dedupe',
'date_coordination_event_dedupe',
'agent_message_dedupe',
```

如果 Task 3 通过复用一个已有幂等集合而不需要后两个集合，则不要创建未使用集合，同时从测试删除对应要求；每个保留的幂等集合必须同时存在于映射与 bootstrap 白名单。

- [ ] **Step 4: 验证并提交集合契约**

Run:

```powershell
node server/selfcheck/date-coordination-review-followups.js
node --check miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js
```

Expected: PASS。

```powershell
git add miniprogram/cloudfunctions/api/lib/collections.js miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js server/selfcheck/date-coordination-review-followups.js
git commit -m "fix(cloudbase): bootstrap coordination dedupe collections"
```

---

### Task 2: 将通知、幂等锁和未读游标放进同一事务

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/db.js:1258-1284`
- Modify: `miniprogram/cloudfunctions/api/lib/coordinationInbox.js:40-80,120-161`
- Modify: `server/selfcheck/coordination-notification-concurrency.js`

**Interfaces:**
- Consumes: `createCoordinationNotificationOnce(notification)`。
- Produces: `{ created: boolean, notification: object, unread_count: number }`；相同 key 不重复通知/计数，不同 key 并发时未读数逐条累加且每个用户只有一个 cursor。

- [ ] **Step 1: 增加不同幂等 key 的并发失败测试**

现有测试只覆盖相同 key。新增两个不同事件同时发送给同一用户：

```js
const firstInput = { ...input, event_type: 'proposal_ready' }
const secondInput = { ...input, event_type: 'meeting_arrived:abc123' }
const [firstResult, secondResult] = await Promise.all([
  notifyInbox(firstInput, atomicDeps),
  notifyInbox(secondInput, atomicDeps)
])

assert.strictEqual(tables.coordination_notification.length, 2)
assert.strictEqual(tables.user_notification_cursor.length, 1)
assert.strictEqual(tables.user_notification_cursor[0].unread_count, 2)
assert.deepStrictEqual(
  [firstResult.unread_count, secondResult.unread_count].sort((a, b) => a - b),
  [1, 2]
)
```

测试依赖必须模拟事务串行冲突/重试，不可继续用两个互不约束的数组写入来假装原子。

- [ ] **Step 2: 运行测试确认事务外 cursor 更新会失败**

Run: `node server/selfcheck/coordination-notification-concurrency.js`

Expected: FAIL，表现为 `unread_count` 丢增量或出现两个相同用户的 cursor。

- [ ] **Step 3: 扩展数据库事务返回值**

在 `db.createCoordinationNotificationOnce()` 的同一个 `db.runTransaction` 内完成：

1. 按 SHA-256 幂等锁读取/创建通知。
2. `created === true` 时查询 `user_notification_cursor`。
3. 已有 cursor 时在事务内更新 `unread_count + 1`。
4. 没有 cursor 时在事务内创建唯一一条 `{ user_id, unread_count: 1 }`。
5. `created === false` 时只读取当前 cursor，不增加未读数。

返回结构固定为：

```js
return {
  created,
  notification: storedNotification,
  unread_count: Number(cursor && cursor.unread_count || 0)
}
```

所有事务查询和写入都使用 `transactionAdapter`，不得在事务回调内调用全局 `first/addWithId/updateByDoc`。

- [ ] **Step 4: 删除 Inbox 的事务外 cursor 写入**

`coordinationInbox.notifyInbox()` 必须直接使用原子结果：

```js
const created = await createOnce({ ...notification, read_at: null })
const record = created.notification
const unreadCount = Number(created.unread_count || 0)
```

删除当前第 135-140 行的 `first → applyUnreadCursor → update/add`。重复通知返回相同 `notification_id` 和当前未读数；新通知在发送微信订阅适配器后返回事务计算的未读数。

- [ ] **Step 5: 同步内存实现的接口语义**

`memoryCreateCoordinationNotificationOnce()` 使用按用户串行的 Promise/Map 模拟数据库事务，返回相同三字段结构。它仅用于自检，生产默认依赖必须始终选择 `db.createCoordinationNotificationOnce`。

- [ ] **Step 6: 验证并提交**

Run:

```powershell
node server/selfcheck/coordination-notification-concurrency.js
npm --prefix server run selfcheck:agent
```

Expected: 相同 key 两次调用只有一条通知和一次未读增量；不同 key 并发产生两条通知、一个 cursor、未读数 2；完整 Agent 自检 PASS。

```powershell
git add miniprogram/cloudfunctions/api/lib/db.js miniprogram/cloudfunctions/api/lib/coordinationInbox.js server/selfcheck/coordination-notification-concurrency.js
git commit -m "fix(notification): update unread cursor atomically"
```

---

### Task 3: 原子幂等创建协调事件，并让消息投影可安全补偿

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/db.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collections.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/agent/dateCoordinationEvents.js:4-18,88-148`
- Modify: `server/selfcheck/date-coordination-events.js`
- Modify: `server/selfcheck/coordination-notification-concurrency.js`

**Interfaces:**
- Produces: `db.createCoordinationEventOnce(eventRecord)` 返回 `{ created, event }`。
- Produces: `db.createAgentMessageOnce(messageRecord)` 返回 `{ created, message }`。
- Consumes: `idempotency_key`/`coordination_event_key`；重复执行允许补齐缺失消息，但不能重复创建事件或同用户消息。

- [ ] **Step 1: 增加相同事件并发测试**

使用 `Promise.all` 同时调用两次 `publishCoordinationEvent`：

```js
const [left, right] = await Promise.all([
  publishCoordinationEvent(input, atomicDeps),
  publishCoordinationEvent(input, atomicDeps)
])

assert.strictEqual(rows.date_coordination_event.length, 1)
assert.strictEqual(rows.agent_message.filter((row) => row.coordination_event_key).length, 2)
assert.strictEqual([left, right].filter((result) => result.duplicate).length, 1)
```

两个参与者各有且只有一条安全投影消息。

- [ ] **Step 2: 增加事件成功、消息中断后的恢复测试**

第一次调用让 `createAgentMessageOnce` 在第一个参与者前抛出模拟错误；第二次用相同事件重试：

```js
await assert.rejects(() => publishCoordinationEvent(input, failingDeps), /simulated delivery failure/)
const recovered = await publishCoordinationEvent(input, healthyDeps)
assert.strictEqual(recovered.duplicate, true)
assert.strictEqual(rows.date_coordination_event.length, 1)
assert.strictEqual(rows.agent_message.length, 2)
```

这要求 duplicate event 仍然遍历参与者并尝试 `createAgentMessageOnce`，不能因为事件已存在就直接 return。

- [ ] **Step 3: 运行测试确认当前 check-then-insert 失败**

Run: `node server/selfcheck/date-coordination-events.js`

Expected: 并发时重复事件/消息，或故障重试无法补齐消息。

- [ ] **Step 4: 在 DB 层实现两个原子 create-once helper**

两个 helper 都使用 `db.runTransaction` 和 SHA-256 稳定锁：

```js
async function createCoordinationEventOnce(eventRecord) {
  return createRecordOnceInTransaction({
    key: eventRecord.idempotency_key,
    dataCollection: 'date_coordination_event',
    lockCollection: 'date_coordination_event_dedupe',
    prefix: 'date_coordination_event',
    data: eventRecord
  })
}

async function createAgentMessageOnce(messageRecord) {
  return createRecordOnceInTransaction({
    key: messageRecord.coordination_event_key,
    dataCollection: 'agent_message',
    lockCollection: 'agent_message_dedupe',
    prefix: 'agent_message',
    data: messageRecord
  })
}
```

`createRecordOnceInTransaction` 必须：验证 key 非空；锁文档 ID 为 key 的 SHA-256；锁内保存原始 key、目标数字 ID；发现同 hash 不同 key 时失败；已有锁时返回真实目标记录；目标记录缺失时抛出一致性错误，不得悄悄重复创建。

- [ ] **Step 5: 改造事件发布器为“事件一次、投影各一次”**

`dateCoordinationEvents.defaultDeps()` 注入两个 DB helper。`publishCoordinationEvent()`：

1. 构建安全事件记录并调用 `createCoordinationEventOnce`。
2. 无论事件是新建还是 duplicate，都为两名参与者生成安全投影。
3. 每个投影调用 `createAgentMessageOnce`；重复消息直接返回已有记录。
4. 返回 `created` 只反映事件是否新建，`duplicate: !created` 保持现有调用契约。

删除事件和消息的 `first → addWithId` 竞态。不得把对方原始申请、原始会话或完整模型输出放入事件/消息幂等锁。

- [ ] **Step 6: 同步测试模式依赖**

现有 unit/selfcheck 调用如果没有真实 DB helper，必须显式提供共享 Map/Promise 形式的 create-once stub；禁止生产代码根据 `first/addWithId` 自动推断测试模式。

- [ ] **Step 7: 验证并提交**

Run:

```powershell
node server/selfcheck/date-coordination-events.js
node server/selfcheck/coordination-notification-concurrency.js
npm --prefix server run selfcheck:date-qa-reset
npm --prefix server run selfcheck:agent
```

Expected: 并发事件一次、双方消息各一次；中断重试补齐消息；所有既有协调与 Agent 测试 PASS。

```powershell
git add miniprogram/cloudfunctions/api/lib/db.js miniprogram/cloudfunctions/api/lib/collections.js miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js miniprogram/cloudfunctions/api/agent/dateCoordinationEvents.js server/selfcheck/date-coordination-events.js server/selfcheck/coordination-notification-concurrency.js
git commit -m "fix(date): make coordination events and messages idempotent"
```

---

### Task 4: 清理配置噪声并执行完整发布门禁

**Files:**
- Modify: `miniprogram/project.config.json`（只恢复末尾换行）
- Test: all existing release gates; do not weaken them.

**Interfaces:**
- Consumes: Tasks 1-3 的提交。
- Produces: 无配置噪声、无未提交业务文件、完整测试全绿的发布代码 SHA。

- [ ] **Step 1: 用编辑器恢复配置文件末尾换行**

只在最后一个 `}` 后恢复换行，不改 JSON 内容。验证：

```powershell
git diff 7ef3d33 -- miniprogram/project.config.json
```

Expected: 无输出。

- [ ] **Step 2: 提交配置恢复**

```powershell
git add miniprogram/project.config.json
git commit -m "chore: restore local project config formatting"
```

- [ ] **Step 3: 运行完整门禁**

Run:

```powershell
git diff --check
npm --prefix server run selfcheck:date-counter-offer
npm --prefix server run selfcheck:date-qa-reset
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:release-guard
node --check miniprogram/cloudfunctions/api/lib/db.js
node --check miniprogram/cloudfunctions/api/lib/coordinationInbox.js
node --check miniprogram/cloudfunctions/api/agent/dateCoordinationEvents.js
```

Expected: 全部退出码 0；`LIVE_GRAPH_SMOKE: MANUAL_REQUIRED` 可保留并进入真机待验列表。

- [ ] **Step 4: 审核提交范围**

```powershell
git status --short
git diff 52fd28b..HEAD --stat
git log --oneline -10
```

Expected: 工作树干净；改动仅覆盖本计划文件；没有密钥、OPENID、手机号、私密会话正文和环境变量变化。

---

### Task 5: 推送 GitHub、部署明确 SHA 并记录结果

**Files:**
- Create: `project-docs/WORK_REPORT_2026-09-03_51_REVIEW_ROUND2.md`

**Interfaces:**
- Consumes: Task 4 得到的发布代码 SHA。
- Produces: 可在 GitHub Review 的远程分支，以及能映射到该 SHA 的 CloudBase `api` 部署记录。

- [ ] **Step 1: 推送当前分支并记录发布代码 SHA**

```powershell
$releaseCodeSha = git rev-parse HEAD
git push -u origin fix/date-counter-offer-negotiation
git ls-remote --heads origin fix/date-counter-offer-negotiation
```

Expected: 远程分支 SHA 等于 `$releaseCodeSha`。推送失败时停止，不得先部署。

- [ ] **Step 2: 从明确代码 SHA 构建干净部署源**

使用仓库已有的安全 staging 流程，仅复制 `$releaseCodeSha` 中的 `miniprogram/cloudfunctions/api`，排除 `node_modules`、本地日志和凭证。由于 CLI 3.7.3 的 `--dir` 行为已知有风险，必须进入 staging 中的函数目录后执行部署命令。

- [ ] **Step 3: 部署 CloudBase API**

在干净函数目录执行：

```powershell
tcb fn code update api -e cloud1-d4gy8l52g08bba326 --deployMode cos
tcb fn detail api -e cloud1-d4gy8l52g08bba326
```

Expected: 函数状态为 `Deployment completed` / `Active`，运行时保持 `Nodejs16.13`，修改时间晚于本次部署开始时间。不得修改函数环境变量。

- [ ] **Step 4: 完成只读云端冒烟**

调用现有 `{ action: 'ping' }` 只读入口，确认 `pong` 和环境 `cloud1-d4gy8l52g08bba326`。不得为了冒烟创建或删除真实用户协调数据。

- [ ] **Step 5: 写部署报告**

报告必须包含：

```markdown
# WeFinally 5.1 Review Round 2 Work Report

- Branch: fix/date-counter-offer-negotiation
- Release code commit: <exact SHA deployed>
- GitHub remote SHA: <exact SHA>
- CloudBase env: cloud1-d4gy8l52g08bba326
- Function: api
- Runtime: Nodejs16.13
- Deployment modification time: <exact value>
- Tests: <each command and PASS>
- Live graph smoke: MANUAL_REQUIRED
- Mini Program upload: NOT PERFORMED unless separately authorized
```

不得写入 worker secret、OpenID、手机号或双方会话内容。

- [ ] **Step 6: 提交并推送部署报告**

```powershell
git add project-docs/WORK_REPORT_2026-09-03_51_REVIEW_ROUND2.md
git commit -m "docs: record 5.1 round 2 deployment"
git push
```

说明文档 commit 晚于实际部署代码 SHA是正常的；报告必须明确区分 `release code commit` 与最新文档 commit。

## Final Acceptance Checklist

- [ ] 所有使用中的幂等集合同时存在于集合映射和 bootstrap 白名单。
- [ ] 相同通知 key 并发只生成一条通知、一次未读增量。
- [ ] 不同通知 key 并发生成两条通知、一个用户 cursor、未读数准确为 2。
- [ ] 相同协调事件并发只生成一个事件、双方各一条安全投影消息。
- [ ] 事件已写入而消息发送中断后，重试可补齐消息且不会重复。
- [ ] 第一轮通过的 counter-offer、AI 报告、提醒和到场位置测试继续通过。
- [ ] `project.config.json` 与 `7ef3d33` 相比无差异。
- [ ] 分支已推送 GitHub，远程发布代码 SHA与本地一致。
- [ ] CloudBase `api` 从明确代码 SHA部署，报告记录环境、时间和测试结果。
- [ ] 微信小程序体验版上传仍作为独立动作，不与云函数部署混淆。
