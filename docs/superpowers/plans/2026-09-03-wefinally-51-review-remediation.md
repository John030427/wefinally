# WeFinally 5.1 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Cursor 完成的 5.1 优化及历史故障修复中发现的生产事务、AI 报告留存、提醒契约、通知幂等和到场位置通知问题，并形成可复现的 Git 与 CloudBase 发布版本。

**Architecture:** LangGraph/AI 只负责理解用户意图与编排，所有确认、接受和状态迁移仍通过 CloudBase 数据库原子操作落库。通知使用稳定的事件身份和原子去重，AI 报告在成功生成时写入明确的输入与报告过期时间。先以自检复现每个缺陷，再做最小实现，最后运行完整发布门禁并在提交后部署。

**Tech Stack:** 微信小程序、CloudBase 云函数、Node.js 16.13（云端）/ Node.js >=18（本地自检）、CloudBase Document Database、现有 LangGraph 协调架构。

**Spec:** `docs/superpowers/specs/2026-08-11-wefinally-langgraph-orchestration-design.md`；本计划同时落实 2026-09-03 对当前脏工作树的代码 Review 结论。

## Global Constraints

- 工作目录固定为 `D:\wefinal\.worktrees\wefinally-qa-replay-global`，分支为 `fix/date-counter-offer-negotiation`。
- 不删除、不重置、不覆盖当前工作树中的既有修改；先检查 `git status --short` 并保存基线。
- 不修改匹配算法、RAG 语料/评测结果、用户画像、会员、支付和正式用户权限边界。
- 不依赖模型输出完成关键写入；模型只生成意图或候选动作，最终状态迁移必须由确定性服务校验并原子提交。
- 不向任一用户展示另一方原始回答，只展示安全摘要、共同结果和待确认的修改。
- 不提交 `miniprogram/project.config.json` 的纯本地/换行变化。
- 所有修复先增加会失败的自检，再实现最小修复；禁止通过删除断言、放宽断言或跳过测试制造绿灯。
- `npm --prefix server run selfcheck:agent`、`selfcheck:ai-report`、`selfcheck:date-qa-reset`、`selfcheck:date-counter-offer` 全部通过前，不得提交或部署。
- `LIVE_GRAPH_SMOKE: MANUAL_REQUIRED` 仅表示需要人工真机/在线冒烟，不可伪造为 PASS；其他失败必须解决。
- 必须先形成 Git commit，再从该 commit 部署 `api` 云函数；记录 commit SHA 和部署结果，保证云端可复现。

## File Structure

- `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`：生产协调处理器依赖组装，以及接受 counter-offer 的入口。
- `miniprogram/cloudfunctions/api/handlers/agent.js`：AI 会话对协调能力的调用，必须注入完整生产事务依赖。
- `miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js`：修改预览 claim/apply 的确定性状态机；不复制数据库实现。
- `miniprogram/cloudfunctions/api/handlers/reportTask.js`：AI 报告生成、审计快照和留存期限。
- `miniprogram/cloudfunctions/api/lib/db.js`：CloudBase 原子事务和通知幂等存储接口。
- `miniprogram/cloudfunctions/api/lib/coordinationInbox.js`：站内通知写入，消费原子去重接口。
- `miniprogram/cloudfunctions/api/lib/meetingCheckInService.js`：到场、位置更新、未找到和身份不符事件。
- `miniprogram/cloudfunctions/api/agent/notificationJobs.js`：提醒调度语义的唯一来源。
- `server/selfcheck/date-coordination-review-followups.js`：生产依赖、AI 接受路径和到场位置更新回归。
- `server/selfcheck/ai-report-retention.js`：报告生成后留存字段的行为测试。
- `server/selfcheck/coordination-notification-concurrency.js`：通知并发幂等行为测试。
- `server/selfcheck/date-coordination-cloud.js`、`server/selfcheck/agent-operations.js`：提醒时间契约测试。

---

### Task 1: 修复接受协调方案的生产依赖与原子提交

**Files:**
- Modify: `miniprogram/cloudfunctions/api/handlers/dateCoordination.js:104-130,403-450,1403-1465`
- Modify: `miniprogram/cloudfunctions/api/handlers/agent.js:173-190,603-625,820-850`
- Test: `server/selfcheck/date-coordination-review-followups.js`
- Test: `server/selfcheck/date-counter-offer.js`

**Interfaces:**
- Consumes: `dateApplicationPatch.claimPendingPatch(patch)`、`db.commitPreAcceptInvitationPatch(input)`、`db.commitPostAcceptApplicationPatch(input)`。
- Produces: `createDateCoordinationHandlers(deps).acceptCounterOfferForUser(data, user)` 在 API 直调和 AI 会话路径中使用同一套原子依赖。

- [ ] **Step 1: 在 Review 自检中加入默认生产依赖测试**

通过 `require` cache 或显式导出的依赖构造器验证默认依赖至少包含以下三个可调用函数：

```js
assert.strictEqual(typeof deps.claimPendingPatch, 'function')
assert.strictEqual(typeof deps.commitPreAcceptInvitationPatch, 'function')
assert.strictEqual(typeof deps.commitPostAcceptApplicationPatch, 'function')
```

再构造一个 `pending_confirmation` counter-offer，调用 `acceptCounterOfferForUser`，断言 claim 和对应 commit 各执行一次，而不是使用 `Object.assign` 的内存 claim。

- [ ] **Step 2: 运行测试并确认旧实现失败**

Run: `node server/selfcheck/date-coordination-review-followups.js`

Expected: FAIL，指出生产默认依赖缺少 `claimPendingPatch`/`commitPostAcceptApplicationPatch`，或 AI 接受路径没有调用事务依赖。

- [ ] **Step 3: 补齐 `dateCoordination` 默认生产依赖**

在 `defaultDeps()` 中显式接入现有实现，不重写事务逻辑：

```js
const { claimPendingPatch } = require('./dateApplicationPatch')

return {
  // existing dependencies
  claimPendingPatch,
  commitPreAcceptInvitationPatch: db.commitPreAcceptInvitationPatch,
  commitPostAcceptApplicationPatch: db.commitPostAcceptApplicationPatch
}
```

不要向 `createDateApplicationPatchHandlers` 传入值为 `undefined` 的 own property。若依赖不存在，应让子处理器使用自己的生产默认值，不能覆盖成 `undefined`。

- [ ] **Step 4: 给测试模式增加显式标志，删除 CRUD 推断**

将“只要存在 `first/addWithId` 就视为单元测试”的判断改为显式 `unitMode: true`。生产和 AI 会话不得自动获得内存 claim 或 `null` commit：

```js
if (overrides.unitMode === true && !Object.prototype.hasOwnProperty.call(overrides, name)) {
  // only deterministic in-memory test fallback
}
```

更新现有内存自检依赖，让真正需要降级的测试明确传入 `unitMode: true`；更优先的做法是测试直接注入可观察的事务 stub。

- [ ] **Step 5: AI 会话注入完整协调依赖**

`agent.js` 构造协调处理器时必须传入：

```js
const coordinationHandlers = createDateCoordinationHandlers({
  first: dep('first'),
  list: dep('list'),
  byId: dep('byId'),
  addWithId: dep('addWithId'),
  updateByDoc: dep('updateByDoc'),
  claimPendingPatch: dep('claimPendingPatch'),
  commitPreAcceptInvitationPatch: dep('commitPreAcceptInvitationPatch'),
  commitPostAcceptApplicationPatch: dep('commitPostAcceptApplicationPatch'),
  publishCoordinationEvent: dep('publishCoordinationEvent'),
  now: dep('now')
})
```

如果 `writeInboxNotification` 是接受流程的依赖，也从 `agent.defaultDeps()` 注入实际生产函数，不能靠测试型 fallback。

- [ ] **Step 6: 验证直调与 AI 会话两条路径**

Run:

```powershell
node server/selfcheck/date-coordination-review-followups.js
npm --prefix server run selfcheck:date-counter-offer
node server/selfcheck/agent-chat.js
```

Expected: 全部 PASS；重复接受同一个 token 返回幂等结果或明确 stale，不得二次应用版本。

- [ ] **Step 7: 提交独立修复**

```powershell
git add miniprogram/cloudfunctions/api/handlers/dateCoordination.js miniprogram/cloudfunctions/api/handlers/agent.js server/selfcheck/date-coordination-review-followups.js server/selfcheck/date-counter-offer.js
git commit -m "fix(date): keep counter offer acceptance atomic"
```

---

### Task 2: 恢复 AI 报告留存期限并补行为测试

**Files:**
- Modify: `miniprogram/cloudfunctions/api/handlers/reportTask.js:173-219`
- Modify: `server/selfcheck/ai-report-retention.js`

**Interfaces:**
- Consumes: `retentionDates(generatedAt)` 返回 `input_expires_at` 与 `report_expires_at`。
- Produces: 每个成功报告任务都有可被 `cleanupExpiredReportData()` 查询的两个过期字段。

- [ ] **Step 1: 用行为测试代替字符串存在性检查**

在自检中注入可记录更新数据的任务集合，执行一次成功的 `processOne`，断言：

```js
assert(saved.input_expires_at instanceof Date)
assert(saved.report_expires_at instanceof Date)
assert(saved.input_expires_at > saved.generated_at)
assert(saved.report_expires_at > saved.input_expires_at)
```

测试还要验证 `cleanupExpiredReportData()` 使用相同字段清除 `input_snapshot` 和 `reports_json`。

- [ ] **Step 2: 运行并确认旧实现失败**

Run: `npm --prefix server run selfcheck:ai-report`

Expected: FAIL，明确指出生成后的任务缺少过期时间，而不是仅检查源码字符串。

- [ ] **Step 3: 在成功写入和审计写入中保存期限**

最小实现：

```js
await col('ai_report_task').where({ _id: task._id, attempt_id: attemptId }).update({ data: {
  status: STATUS.SUCCEEDED,
  reports_json: JSON.stringify(databaseSafe(result.reports)),
  report_expires_at: retention.report_expires_at,
  // existing fields
} })

await col('ai_report_task').where({ _id: task._id, attempt_id: attemptId }).update({ data: {
  input_snapshot: databaseSafe(result.input_snapshot),
  input_expires_at: retention.input_expires_at,
  update_time: generatedAt
} })
```

若可选审计快照保存失败，报告主体仍可成功，但 `report_expires_at` 必须已落库。

- [ ] **Step 4: 验证并提交**

Run: `npm --prefix server run selfcheck:ai-report`

Expected: PASS。

```powershell
git add miniprogram/cloudfunctions/api/handlers/reportTask.js server/selfcheck/ai-report-retention.js
git commit -m "fix(report): restore generated data retention deadlines"
```

---

### Task 3: 统一邀请提醒产品语义与契约测试

**Files:**
- Modify: `miniprogram/cloudfunctions/api/agent/notificationJobs.js:1-25`
- Modify: `server/selfcheck/date-coordination-cloud.js:340-365`
- Modify: `server/selfcheck/agent-operations.js`

**Interfaces:**
- Consumes: `createReminderJob({ coordinationId, userId, stage, deadlineAt, now })`。
- Produces: 邀请创建时由站内通知立即告知；提醒任务只在截止前 24 小时触发，避免同一时刻重复消息。

- [ ] **Step 1: 固化新语义测试**

测试使用固定 `now` 和 `deadlineAt = now + 48h`，断言：

```js
assert.strictEqual(job.scheduled_at.toISOString(), addHours(now, 24).toISOString())
assert.strictEqual(job.deadline_at.toISOString(), addHours(now, 48).toISOString())
```

再覆盖 `deadlineAt <= now + 24h` 时返回 `null`，因为立即站内通知已经承担首次提醒。

- [ ] **Step 2: 运行旧测试确认失败原因只来自契约漂移**

Run: `node server/selfcheck/date-coordination-cloud.js`

Expected: 旧断言失败，实际时间为截止前 24 小时。

- [ ] **Step 3: 统一所有调用方和断言**

保留 `REMINDER_HOURS.invitation_created = 24`。同步更新 `date-coordination-cloud.js` 与 `agent-operations.js`，不要把实现改回立即提醒，也不要删除短截止期测试。

- [ ] **Step 4: 验证并提交**

Run:

```powershell
node server/selfcheck/date-coordination-cloud.js
node server/selfcheck/agent-operations.js
```

Expected: 两项 PASS。

```powershell
git add miniprogram/cloudfunctions/api/agent/notificationJobs.js server/selfcheck/date-coordination-cloud.js server/selfcheck/agent-operations.js
git commit -m "test(date): align invitation reminder contract"
```

---

### Task 4: 将站内通知幂等改为数据库原子操作

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/db.js`
- Modify: `miniprogram/cloudfunctions/api/lib/coordinationInbox.js:76-96`
- Modify: `server/selfcheck/coordination-notification-concurrency.js`

**Interfaces:**
- Produces: `db.createCoordinationNotificationOnce(notification)` 返回 `{ created: boolean, notification }`。
- Consumes: `notification.idempotency_key`，相同 key 的并发调用只能产生一条业务通知。

- [ ] **Step 1: 增加真正并发的失败测试**

不要顺序调用。使用屏障让两个 Promise 同时进入创建逻辑：

```js
const [left, right] = await Promise.all([
  notifyInbox(input, deps),
  notifyInbox(input, deps)
])
assert.strictEqual(rows.coordination_notification.length, 1)
assert.strictEqual([left, right].filter((item) => item.duplicate).length, 1)
```

内存依赖也必须模拟同一个幂等 key 的唯一写入冲突，避免测试继续掩盖竞态。

- [ ] **Step 2: 运行并确认 check-then-insert 失败**

Run: `node server/selfcheck/coordination-notification-concurrency.js`

Expected: FAIL，产生两条相同 `idempotency_key` 的通知。

- [ ] **Step 3: 在数据库层实现原子创建**

在 `db.js` 中使用 CloudBase `runTransaction` 完成幂等键占用与通知创建；不得继续在 `coordinationInbox.js` 中执行 `first()` 后再 `addWithId()`。事务必须满足：

```js
async function createCoordinationNotificationOnce(notification) {
  // 事务内读取稳定幂等锁；已存在则返回对应通知。
  // 不存在则创建锁和通知，并在同一事务提交。
  // 锁记录保存完整 idempotency_key，用于检测哈希碰撞。
  return { created, notification: stored }
}
```

幂等锁使用独立集合 `coordination_notification_dedupe`，文档 ID 使用 `sha256(idempotency_key)`；锁中保存 `notification_id` 和原始 key。不要用非单调哈希替代通知自身的数字 `id`，否则会破坏未读游标语义。

- [ ] **Step 4: Inbox 只消费原子接口**

`coordinationInbox.js` 调用 `createCoordinationNotificationOnce`。`created === false` 时返回 `duplicate: true` 且不增加未读数；`created === true` 时才更新未读游标。

- [ ] **Step 5: 验证并提交**

Run:

```powershell
node server/selfcheck/coordination-notification-concurrency.js
npm --prefix server run selfcheck:agent
```

Expected: 并发只创建一条通知，完整 Agent 自检保持 PASS。

```powershell
git add miniprogram/cloudfunctions/api/lib/db.js miniprogram/cloudfunctions/api/lib/coordinationInbox.js server/selfcheck/coordination-notification-concurrency.js
git commit -m "fix(notification): make inbox delivery idempotent"
```

---

### Task 5: 允许同一协调版本更新到场位置

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/meetingCheckInService.js:112-140`
- Modify: `server/selfcheck/date-coordination-review-followups.js`
- Modify: `server/selfcheck/meeting-plan-coordination.js`

**Interfaces:**
- Consumes: `applyMeetingCheckIn({ action: 'arrived', arrival_position }, user, deps)`。
- Produces: 相同位置的重复提交幂等；位置内容改变时产生一个新的安全摘要事件并通知对方。

- [ ] **Step 1: 增加“吧台 → 靠窗”失败测试**

```js
await applyMeetingCheckIn({ action: 'arrived', arrival_position: '星巴克吧台旁' }, user, deps)
await applyMeetingCheckIn({ action: 'arrived', arrival_position: '星巴克靠窗位置' }, user, deps)
assert.strictEqual(partnerNotifications.length, 2)
assert.ok(partnerNotifications[1].body.includes('靠窗'))
```

再重复提交“星巴克靠窗位置”，断言第三条通知不会产生。

- [ ] **Step 2: 运行并确认旧幂等键吞掉更新**

Run: `node server/selfcheck/meeting-plan-coordination.js`

Expected: FAIL，第二次位置更新未产生新通知或复用了旧事件。

- [ ] **Step 3: 让事件身份包含安全的位置修订**

对 `arrived` 使用规范化后位置的不可逆短摘要，而不是直接把位置原文放进键：

```js
const suffix = action === 'arrived'
  ? `${action}:${version}:${safeDigest(arrivalPosition)}`
  : `${action}:${version}`
```

`safeDigest` 使用 Node `crypto.createHash('sha256')`，截取固定长度十六进制。相同位置保持幂等，不同位置生成新事件。`set_arrival_hint` 同样不得把用户原文直接拼入持久化键。

- [ ] **Step 4: 验证并提交**

Run:

```powershell
node server/selfcheck/meeting-plan-coordination.js
node server/selfcheck/date-coordination-review-followups.js
```

Expected: 两项 PASS，伙伴通知只包含允许公开的到场位置摘要，不包含其他私密输入。

```powershell
git add miniprogram/cloudfunctions/api/lib/meetingCheckInService.js server/selfcheck/meeting-plan-coordination.js server/selfcheck/date-coordination-review-followups.js
git commit -m "fix(date): deliver updated arrival positions"
```

---

### Task 6: 完整回归、提交审计和 CloudBase 可复现部署

**Files:**
- Modify only if a failing test reveals a real regression; do not weaken release gates.
- Record: commit history and deployment output in the final execution report; do not add credentials or user data to docs.

**Interfaces:**
- Consumes: Tasks 1-5 的独立 commits。
- Produces: 一个测试全绿、工作树范围清晰、云函数部署可映射到 commit SHA 的候选版本。

- [ ] **Step 1: 检查变更范围和敏感信息**

Run:

```powershell
git status --short
git diff --check
git diff -- miniprogram/project.config.json
git diff -- . | rg -n "OPENID|SECRET|PASSWORD|PRIVATE KEY|Bearer "
```

Expected: `git diff --check` 无错误；没有密钥、OpenID、手机号、私密聊天原文；`project.config.json` 的纯换行变化不进入提交。

- [ ] **Step 2: 运行专项门禁**

Run:

```powershell
npm --prefix server run selfcheck:date-counter-offer
npm --prefix server run selfcheck:date-qa-reset
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:agent
```

Expected: 全部退出码 0。保存每条命令最后的 PASS 摘要；任何非 `MANUAL_REQUIRED` 失败都必须回到对应 Task 修复。

- [ ] **Step 3: 运行语法与发布保护检查**

Run:

```powershell
node --check miniprogram/cloudfunctions/api/handlers/dateCoordination.js
node --check miniprogram/cloudfunctions/api/handlers/agent.js
node --check miniprogram/cloudfunctions/api/handlers/reportTask.js
node --check miniprogram/cloudfunctions/api/lib/coordinationInbox.js
node --check miniprogram/cloudfunctions/api/lib/meetingCheckInService.js
npm --prefix server run selfcheck:release-guard
```

Expected: 全部退出码 0。

- [ ] **Step 4: 审核最终 diff 并形成 Git 提交**

```powershell
git status --short
git diff --stat
git log --oneline -8
```

确认所有业务文件都属于 5.1 优化或本计划修复；不要使用 `git add -A`。逐文件加入，确保 `miniprogram/project.config.json` 未被暂存。若 Tasks 1-5 已分别提交，只为必要的测试/文档补充创建最后提交：

```powershell
git add docs/superpowers/plans/2026-09-03-wefinally-51-review-remediation.md
git commit -m "docs: record 5.1 remediation and release gates"
```

- [ ] **Step 5: 从干净 commit 部署 API 云函数**

部署前记录：

```powershell
git status --short
git rev-parse HEAD
```

Expected: 除明确排除的用户本地文件外无未提交业务修改。使用仓库既有 CloudBase CLI 流程部署 `miniprogram/cloudfunctions/api`；不得从临时 staging 目录混入其他代码，不得修改环境变量。部署命令完成后记录环境 `cloud1-d4gy8l52g08bba326`、函数 `api`、commit SHA、CLI 成功结果。

- [ ] **Step 6: 部署后做最小真实路径冒烟**

用现有两个 QA 账号验证：

1. 男方或女方提交约会偏好不再出现 `SERVER_ERROR`。
2. 一方通过 AI 提议修改日期/时间/活动，另一方接受后只应用一次，并看到最新共同方案。
3. 对方“吧台 → 靠窗”更新到场位置时，另一台手机能收到第二条更新。
4. 新生成 AI 报告不再显示技术性“数据限制”，数据库任务包含两个过期字段。
5. 重复刷新或重复确认不会生成重复通知。

任何一项失败都停止合并，不删除旧数据掩盖问题；记录协调 ID、时间和公开错误码后回到对应 Task 定位。

## Final Acceptance Checklist

- [ ] API 直调与 AI 会话接受 counter-offer 都走数据库原子 claim/commit。
- [ ] 新 AI 报告写入 `input_expires_at` 和 `report_expires_at`，清理行为测试有效。
- [ ] 邀请立即站内通知与截止前 24 小时提醒不会重复，契约测试一致。
- [ ] 同一幂等 key 并发写入只产生一条通知、一次未读增量。
- [ ] 到场位置改变会通知对方，相同位置重试保持幂等。
- [ ] 所有专项门禁与完整 `selfcheck:agent` 通过。
- [ ] 当前部署能够映射到明确 Git commit，未提交脏代码不再直接部署。
- [ ] 不包含 `project.config.json` 纯本地变化、凭证或用户隐私数据。
