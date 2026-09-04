# WeFinally 发布候选审查整改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变婚恋产品安全边界的前提下，修复双真机匹配、第一次约会、LangGraph 协调、到场通知及发布流程中已审查确认的可靠性与可测试性问题。

**Architecture:** 业务事实始终由确定性 CloudBase 服务和版本化状态机持有，LangGraph 只做意图识别、澄清和工具编排。跨集合写入采用事务提交业务事实、Outbox 异步投影消息；QA 清理采用双账号级互斥锁、分页清理和可恢复任务，不依赖一次云函数调用完成全部删除。

**Tech Stack:** 微信小程序、CloudBase 云函数、CloudBase NoSQL 事务、Node.js、TypeScript、LangGraph、GitHub Actions。

**Spec:** `docs/superpowers/plans/2026-09-04-wefinally-release-review-remediation.md` 第 2 节“审查结论”及第 4 节“验收场景”。

## Global Constraints

- 模型不得直接写数据库，所有修改必须经过白名单业务服务。
- 不向模型或另一方暴露 OpenID、手机号、联系方式、精确住址、单位、账号、密钥或私钥。
- 业务状态不得依赖模型供应商的 `conversation_id`。
- QA 清理只能作用于同一隔离测试组内恰好两名真实 QA 账号，并保留注册资料、画像/RAG、会员、订单和推广归属。
- “部署云函数”和“上传小程序客户端”必须分别记录提交号和验证结果。
- 不直接修改生产数据库；集合、索引及迁移使用可审计的 CloudBase 管理流程。

---

## 1. 审查范围与基线

审查对象为 PR #10 的发布快照 `748d091`，重点文件：

- `miniprogram/cloudfunctions/api/handlers/user.js`
- `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- `miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js`
- `miniprogram/cloudfunctions/api/lib/db.js`
- `miniprogram/cloudfunctions/api/lib/meetingPlanPolicy.js`
- `miniprogram/cloudfunctions/api/lib/meetingCheckInService.js`
- `miniprogram/cloudfunctions/api/lib/qaPairResetService.js`
- `miniprogram/cloudfunctions/api/agent/dateCoordinationEvents.js`
- `miniprogram/cloudfunctions/agent-graph/src/graphs/dateCoordination.ts`
- `miniprogram/pages/chat/chat.js`
- `miniprogram/pages/date-coordination/date-coordination.js`
- `miniprogram/components/qa-match-panel/qa-match-panel.js`
- `.github/workflows/selfcheck.yml`

已通过但不能覆盖以下缺口的现有证据：九组 server selfcheck、LangGraph TypeScript 构建、41 个图测试、GitHub CI、正式代码敏感信息扫描。

## 2. 审查结论

### P0：微信身份仍存在客户端 OpenID 回退

`handlers/user.js` 的注册使用 `wxContext.OPENID || data.openid`，离婚材料查询/提交甚至优先读取 `data.openid`。这违反“调用者身份只取云函数微信上下文”的边界；客户端可构造另一个 OpenID，属于越权读写风险。

### P0：QA 双账号清理没有账号对级互斥，且单次查询最多 200 条

`qaPairResetService.collect()` 对每个条件只调用一次 `list(..., 200)`。高频测试产生超过 200 条消息、通知或事件时，旧数据会残留。幂等任务按 `pair_hash + request_id` 加锁，而客户端每次点击生成新 request ID；两台手机或重复点击可以并发启动两个清理任务，清理期间另一台手机仍可能开始新匹配。

### P1：发起方提交表单是多段写入，后半失败会让 UI 报错但数据其实已保存

`saveApplicationForUser()` 先写申请和协调事件，再更新协调主记录、提醒任务和站内通知。任一步骤失败都会让请求返回 `SERVER_ERROR`，但此前写入不会回滚。重试时状态可能已从 `collecting_initiator` 改变，用户看到“提交失败”，实际却已发送邀请。这与男方失败、女方正常的角色差异高度吻合。

### P1：大量可预期业务错误被降级成 `SERVER_ERROR`

日期协调代码中的“状态不能提交”“无权操作”“等待发起方”“邀请已回应”等预期分支仍抛出普通 `Error`。统一出口只允许声明过的 public code，其余全部映射为 `SERVER_ERROR`，导致用户无法知道应刷新、补字段、等待对方还是联系人工。

### P1：旧会话或清理后的空历史不会覆盖手机中的旧消息

`chat.js` 的轮询在服务端返回空数组时直接退出，不会清空本地旧消息；历史签名只包含 `id/status/content`，未包含协调版本、方案卡片和修改预览状态。同一消息内容不变但卡片更新时，界面可能继续显示旧方案。QA 清理或升级旧会话后尤其明显。

### P1：到场“已通知”没有可观测的双端投递结果

到场动作同步写协调事件、两端 Agent 消息和站内通知，但返回给发起手机的文案直接说“已通知对方”。当前接口没有区分“状态已记录”“对方会话投影成功”“对方已读取”；任一投影异常只会表现为整个请求失败或另一端暂时看不到，无法定位丢在哪一层。

### P1：GitHub CI 没有构建真实 LangGraph 云函数，也没有执行双账号清理专项测试

现有 workflow 安装 server 与 api 依赖，只运行 server 自检。它没有安装 `agent-graph` 依赖并运行 `npm run check`，也没有运行 `selfcheck:qa-pair-reset`。本地通过不等于后续 PR 自动守住这两条链路。

### P1：正式真源和本地执行目录文档已经漂移

`AGENTS.md` 声明唯一分支是 `feature/ai-agent-system`，指定工作树当前实际处于 `experiment/match-native-id-v1.5.2`；而最新可发布代码在 PR #10 的干净发布分支。继续按旧交接开发容易在错误基线上修改、部署或上传客户端。

### P2：约会协调模块职责过大且存在双重规则源

`dateCoordination.js`、`dateApplicationPatch.js`、页面 JS 均接近或超过 800 行。时间、活动、场地和方案完整性分别散落在 API policy、handler、LangGraph prompt 和前端派生逻辑中。当前“20:00 必须是 night”“电影不能以星巴克作为活动场地”等测试已补上，但新增表达方式时仍容易发生规则漂移。

### P2：CloudBase SDK 传递依赖存在安全告警

当前最新 CloudBase Node SDK 依赖链仍带入旧 Axios/Database 依赖。不能直接用强制 override 覆盖生产 SDK；需要隔离验证兼容性，并把可接受告警锁定到具体包、版本和使用边界，禁止无限期忽略。

## 3. 实施任务

### Task 1: 收紧微信身份信任边界

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/wxIdentity.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/user.js`
- Test: `server/selfcheck/wx-identity-boundary.js`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `requireWxOpenid(wxContext): string`
- Consumes: CloudBase `cloud.getWXContext()` 传入 handler 的上下文。

- [ ] **Step 1: 写越权失败测试**

```js
assert.throws(() => requireWxOpenid({}), /微信身份/)
assert.strictEqual(requireWxOpenid({ OPENID: 'wx_actor' }), 'wx_actor')
assert.ok(!userSource.includes('wxContext.OPENID || data.openid'))
assert.ok(!userSource.includes('data.openid || wxContext.OPENID'))
```

- [ ] **Step 2: 运行测试并确认当前实现失败**

Run: `node server/selfcheck/wx-identity-boundary.js`

Expected: FAIL，指出注册或离婚材料接口仍信任 `data.openid`。

- [ ] **Step 3: 实现唯一身份入口**

```js
function requireWxOpenid(wxContext = {}) {
  const openid = String(wxContext.OPENID || '').trim()
  if (!openid) throw businessError('AUTH_REQUIRED', '无法获取微信身份，请重新进入小程序')
  return openid
}
```

注册、材料查询和材料提交全部调用该函数；内部任务如需代办，使用独立 worker 路由、worker secret 与明确 `actor_user_id`，不复用用户路由。

- [ ] **Step 4: 运行身份、会员和注册回归**

Run: `node server/selfcheck/wx-identity-boundary.js && npm --prefix server run selfcheck:member`

Expected: PASS；伪造 payload OpenID 不影响实际调用者。

- [ ] **Step 5: 提交独立安全修复**

```bash
git add miniprogram/cloudfunctions/api/lib/wxIdentity.js miniprogram/cloudfunctions/api/handlers/user.js server/selfcheck/wx-identity-boundary.js server/package.json
git commit -m "fix(auth): trust only CloudBase WeChat identity"
```

### Task 2: 将表单保存改为原子业务提交和可重试投影

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/dateApplicationSubmission.js`
- Modify: `miniprogram/cloudfunctions/api/lib/db.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- Test: `server/selfcheck/date-application-submission-atomicity.js`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `commitDateApplicationSubmission(input): { coordination, application, outbox }`
- Produces: `projectDateSubmission(outboxId): Promise<{ projected: boolean }>`
- Consumes: `coordination_id`, `actor_user_id`, `expected_version`, `request_id`, normalized application。

- [ ] **Step 1: 写三类失败注入测试**

测试事务前失败不写任何记录；事务成功但消息投影失败仍返回保存成功并留下 `pending` outbox；相同 request ID 重试只产生一份申请和一份邀请。

```js
assert.strictEqual(result.saved, true)
assert.strictEqual(rows.date_coordination_application.length, 1)
assert.strictEqual(rows.date_submission_outbox.length, 1)
assert.strictEqual(rows.date_submission_outbox[0].status, 'pending')
```

- [ ] **Step 2: 运行测试并确认多段写入暴露部分成功**

Run: `node server/selfcheck/date-application-submission-atomicity.js`

Expected: FAIL；注入提醒任务或事件写入失败后出现部分数据。

- [ ] **Step 3: 在 CloudBase 事务内提交业务事实**

事务必须校验参与者、状态和 `expected_version`，然后一次写入申请、协调主状态及 `date_submission_outbox`。事务外只消费 outbox；投影失败不得把已保存表单回复成失败。

```js
return transaction(async (tx) => {
  const current = await tx.byId('date_coordination', coordinationId)
  assertSubmissionVersion(current, expectedVersion)
  const application = await upsertApplication(tx, normalized)
  const coordination = await advanceCoordination(tx, current, application)
  const outbox = await createSubmissionOutboxOnce(tx, requestId, coordination)
  return { coordination, application, outbox }
})
```

- [ ] **Step 4: 将客户端 request ID 和 expected version 加入提交协议**

`date-coordination.js` 在一次用户操作期间持久复用同一 request ID；超时重试不生成新业务提交。返回值明确包含 `saved: true` 与 `notification_status: pending|projected`。

- [ ] **Step 5: 运行原子性及原有协调回归**

Run: `node server/selfcheck/date-application-submission-atomicity.js && npm --prefix server run selfcheck:agent`

Expected: PASS；男方和女方走同一提交语义，只有状态迁移不同。

- [ ] **Step 6: 提交业务原子性修复**

```bash
git add miniprogram/cloudfunctions/api/lib/dateApplicationSubmission.js miniprogram/cloudfunctions/api/lib/db.js miniprogram/cloudfunctions/api/handlers/dateCoordination.js miniprogram/pages/date-coordination/date-coordination.js server/selfcheck/date-application-submission-atomicity.js server/package.json
git commit -m "fix(date): make application submission atomic and retryable"
```

### Task 3: 建立完整的公开错误分类

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/dateCoordinationErrors.js`
- Modify: `miniprogram/cloudfunctions/api/lib/publicErrorCodes.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js`
- Modify: `miniprogram/pages/date-coordination/date-coordination.js`
- Test: `server/selfcheck/date-public-errors.js`

**Interfaces:**
- Produces: `dateError(code, message, recovery): BusinessError`
- Produces recovery values: `refresh`, `complete_form`, `wait_partner`, `open_coordinator`, `contact_support`。

- [ ] **Step 1: 写错误契约测试**

覆盖状态过期、版本过期、等待对方、场地需补充、重复确认、权限不足和内部异常。前六类不得返回 `SERVER_ERROR`；真正未知异常必须保持通用错误且不泄露堆栈。

- [ ] **Step 2: 运行测试并确认预期错误当前被压成 SERVER_ERROR**

Run: `node server/selfcheck/date-public-errors.js`

Expected: FAIL，至少命中 `CURRENT_STATE_INVALID`、`WAITING_PARTNER` 或 `DATE_APPLICATION_INVALID` 的缺失映射。

- [ ] **Step 3: 替换所有用户可恢复的普通 Error**

```js
throw dateError('WAITING_PARTNER', '请等待对方完成回应', 'wait_partner')
```

内部数据库、事务和投影异常仍写脱敏日志并返回 `SERVER_ERROR`，日志附带 request ID、route、coordination ID 和阶段，不记录 OpenID 或表单原文。

- [ ] **Step 4: 客户端按 recovery 执行动作**

`refresh` 自动刷新；`complete_form` 聚焦缺失字段；`open_coordinator` 打开 AI 协调；`wait_partner` 仅提示并保持页面；`contact_support` 展示人工客服入口。

- [ ] **Step 5: 运行错误契约与全量 Agent 回归**

Run: `node server/selfcheck/date-public-errors.js && npm --prefix server run selfcheck:agent`

Expected: PASS；测试中不存在把业务分支断言为 `SERVER_ERROR` 的情况。

- [ ] **Step 6: 提交错误语义修复**

```bash
git add miniprogram/cloudfunctions/api/lib/dateCoordinationErrors.js miniprogram/cloudfunctions/api/lib/publicErrorCodes.js miniprogram/cloudfunctions/api/handlers/dateCoordination.js miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js miniprogram/pages/date-coordination/date-coordination.js server/selfcheck/date-public-errors.js
git commit -m "fix(date): expose recoverable coordination errors"
```

### Task 4: 把 QA 双账号清理改为可分页、互斥、可恢复任务

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/qaPairResetService.js`
- Modify: `miniprogram/cloudfunctions/api/lib/qaPairResetPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/lib/db.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/qaPairReset.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/match.js`
- Modify: `miniprogram/components/qa-match-panel/qa-match-panel.js`
- Test: `server/selfcheck/qa-pair-reset-pagination.js`
- Test: `server/selfcheck/qa-pair-reset-concurrency.js`

**Interfaces:**
- Produces: `acquireQaPairResetLease(pairHash, requestId)`，锁粒度为 pairHash。
- Produces: `listPage(name, query, afterId, limit)`。
- Produces: `getQaPairResetStatus(pairHash)`。
- Consumes: 客户端持久化的单次 `request_id`。

- [ ] **Step 1: 写 501 条消息/通知/事件的分页失败测试**

```js
assert.strictEqual(remainingForPair('agent_message'), 0)
assert.strictEqual(remainingForPair('coordination_notification'), 0)
assert.strictEqual(remainingForPair('date_coordination_event'), 0)
```

- [ ] **Step 2: 写两台手机并发清理和清理期间匹配测试**

同一 pairHash 的第二个 request ID 必须返回同一个运行任务；清理状态为 `deleting` 时，两端匹配接口返回 `QA_PAIR_RESET_IN_PROGRESS`。

- [ ] **Step 3: 运行测试并确认当前 200 条上限和 request 级锁失败**

Run: `node server/selfcheck/qa-pair-reset-pagination.js && node server/selfcheck/qa-pair-reset-concurrency.js`

Expected: FAIL；至少有第 201 条以后残留，或出现两个活动清理任务。

- [ ] **Step 4: 实现稳定游标分页和双账号级租约**

每批最多 100 条，按 `_id` 或稳定业务 `id` 升序；删除后继续查询直到空页。租约记录固定文档 ID `qa_pair_reset_active_<pairHash>`，完成后写 `completed_at`，失败可按同一个任务恢复。

- [ ] **Step 5: 清除幂等锁的关联残留**

删除业务记录前收集 `idempotency_key`、`coordination_event_key`、session key 和 notification key，计算原有 SHA-256 文档 ID并删除对应 dedupe 文档。新建 dedupe 记录同时保存 `coordination_id`/`session_id` 以便后续精确清理。

- [ ] **Step 6: 客户端复用 request ID 并轮询任务状态**

按钮按下后在本地保存 request ID，只有收到 `completed` 才清除。返回 `processing` 时展示进度并禁用匹配按钮；另一台手机加载 QA 面板时也读取同一 pair 任务状态。

- [ ] **Step 7: 明确清理边界文案**

文案统一为：“清空本测试对的匹配记录、第一次约会数据、约会协调会话和相关通知；保留注册资料、画像/RAG、会员、订单、推广归属及普通恋爱助手聊天。”

- [ ] **Step 8: 运行分页、并发及现有清理测试**

Run: `node server/selfcheck/qa-pair-reset-pagination.js && node server/selfcheck/qa-pair-reset-concurrency.js && npm --prefix server run selfcheck:qa-pair-reset`

Expected: PASS；重复执行 completed 任务返回同一删除统计，不删除保留集合。

- [ ] **Step 9: 提交 QA 清理修复**

```bash
git add miniprogram/cloudfunctions/api/lib/qaPairResetService.js miniprogram/cloudfunctions/api/lib/qaPairResetPolicy.js miniprogram/cloudfunctions/api/lib/db.js miniprogram/cloudfunctions/api/handlers/qaPairReset.js miniprogram/cloudfunctions/api/handlers/match.js miniprogram/components/qa-match-panel/qa-match-panel.js server/selfcheck/qa-pair-reset-pagination.js server/selfcheck/qa-pair-reset-concurrency.js
git commit -m "fix(qa): make pair reset complete and mutually exclusive"
```

### Task 5: 修复旧会话、空历史和方案卡片刷新

**Files:**
- Create: `miniprogram/utils/agentHistoryState.js`
- Modify: `miniprogram/pages/chat/chat.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/agent.js`
- Test: `server/selfcheck/agent-history-refresh.js`

**Interfaces:**
- Produces: `historySignature(messages, sessionGeneration, coordinationVersion): string`
- Produces: `reconcileHistory(current, incoming): Message[]`
- 服务端历史响应增加：`session_generation`、`coordination_version`、`session_status`。

- [ ] **Step 1: 写空历史和同文案卡片更新测试**

```js
assert.deepStrictEqual(reconcileHistory(oldMessages, []), [])
assert.notStrictEqual(historySignature(before), historySignature(afterCardChanged))
```

- [ ] **Step 2: 运行测试并确认当前 early return/签名不足**

Run: `node server/selfcheck/agent-history-refresh.js`

Expected: FAIL；空历史保留旧消息或卡片变更未触发刷新。

- [ ] **Step 3: 引入会话代次并完整计算签名**

签名包含消息 ID、状态、正文、patch 状态、协调更新卡片、协调版本及 session generation。服务端返回空历史时客户端必须清空旧记录并展示欢迎语；session 为 closed/cancelled 时清除旧 session ID并重新 ensure。

- [ ] **Step 4: 防止旧客户端修改新版本方案**

所有修改/确认接口要求 `expected_coordination_version`；缺失时只允许读取，不允许按默认当前版本写入。旧客户端收到 `CLIENT_UPGRADE_REQUIRED` 并引导更新测试版。

- [ ] **Step 5: 运行聊天、协调和客户端状态回归**

Run: `node server/selfcheck/agent-history-refresh.js && npm --prefix server run selfcheck:agent`

Expected: PASS；清理后旧页面最多一个轮询周期内消失，卡片版本不会停留在旧方案。

- [ ] **Step 6: 提交会话一致性修复**

```bash
git add miniprogram/utils/agentHistoryState.js miniprogram/pages/chat/chat.js miniprogram/cloudfunctions/api/handlers/agent.js server/selfcheck/agent-history-refresh.js
git commit -m "fix(agent): reconcile reset and versioned chat history"
```

### Task 6: 将到场动作改成可观测的事件投影流程

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/coordinationEventOutbox.js`
- Modify: `miniprogram/cloudfunctions/api/lib/meetingCheckInService.js`
- Modify: `miniprogram/cloudfunctions/api/agent/dateCoordinationEvents.js`
- Modify: `miniprogram/pages/date-coordination/date-coordination.js`
- Modify: `miniprogram/pages/chat/chat.js`
- Test: `server/selfcheck/meeting-delivery-observability.js`

**Interfaces:**
- Produces: `recordMeetingAction(input): { action_recorded, delivery_status, event_id }`
- Produces: `projectCoordinationEvent(eventId, recipientUserId)`。
- Delivery status: `pending`, `projected`, `read`, `failed_retryable`。

- [ ] **Step 1: 写一端成功、另一端投影失败的测试**

发起端必须得到 `action_recorded: true, delivery_status: pending`；失败接收端留下可重试 outbox，不得声称对方已读。

- [ ] **Step 2: 运行测试并确认当前同步投影无法区分状态**

Run: `node server/selfcheck/meeting-delivery-observability.js`

Expected: FAIL；当前返回只有 public meeting state，没有 recipient delivery 状态。

- [ ] **Step 3: 以协调事件作为唯一事实源**

到达、暂未找到、现场不符先原子记录事件和 outbox。投影器幂等写入双方 Agent 会话及接收方站内通知；失败只更新 outbox，不回滚到场事实。

- [ ] **Step 4: 修正文案与已读语义**

发起端成功文案使用“到场状态已记录，对方打开或刷新协调会话后可看到”；只有接收端拉取并标记事件后才显示“对方已查看”。不把站内通知投影成功等同于微信订阅消息送达。

- [ ] **Step 5: 运行到场、安全和通知并发测试**

Run: `node server/selfcheck/meeting-delivery-observability.js && npm --prefix server run selfcheck:safety && node server/selfcheck/coordination-notification-concurrency.js`

Expected: PASS；重复点击“已到达”不重复增加未读数，mismatch 后双方均不能继续确认见面。

- [ ] **Step 6: 提交到场投影修复**

```bash
git add miniprogram/cloudfunctions/api/lib/coordinationEventOutbox.js miniprogram/cloudfunctions/api/lib/meetingCheckInService.js miniprogram/cloudfunctions/api/agent/dateCoordinationEvents.js miniprogram/pages/date-coordination/date-coordination.js miniprogram/pages/chat/chat.js server/selfcheck/meeting-delivery-observability.js
git commit -m "fix(meeting): make cross-device delivery observable"
```

### Task 7: 收敛 LangGraph 与确定性约会规则

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/datePlanContract.js`
- Modify: `miniprogram/cloudfunctions/api/lib/meetingPlanPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/lib/dateCounterOfferPolicy.js`
- Modify: `miniprogram/cloudfunctions/agent-graph/src/contracts.ts`
- Modify: `miniprogram/cloudfunctions/agent-graph/src/graphs/dateCoordination.ts`
- Modify: `miniprogram/cloudfunctions/agent-graph/src/model.ts`
- Test: `miniprogram/tests/agent-graph/datePlanContract.test.ts`
- Test: `server/selfcheck/date-plan-contract.js`

**Interfaces:**
- Produces canonical `DatePlanV3`：`date`, `period`, `start_time`, `area`, `activity`, `activity_venue`, `meet_point`, `budget`, `payment`, `duration`, `arrival_hint`。
- Produces: `validateDatePlan(plan, stage): { valid, missing, conflicts, clarification }`。

- [ ] **Step 1: 写中文自然语言契约表**

覆盖“周日晚上八点”“7 号周一改成周日”“大运中心附近吃椰子鸡”“看电影但填星巴克”“星巴克只是集合点”“时间不变只改活动”“接受整份方案”“只接受时间调整”。

- [ ] **Step 2: 写 API 与 LangGraph 同输入同输出测试**

```ts
assert.deepEqual(graphPlan, apiPlan)
assert.equal(apiPlan.start_time, '20:00')
assert.equal(apiPlan.period, 'night')
```

- [ ] **Step 3: 运行测试并记录规则分叉点**

Run: `node server/selfcheck/date-plan-contract.js && npm --prefix miniprogram/cloudfunctions/agent-graph test`

Expected: 初次运行至少暴露一处前端/Graph/API 的字段或澄清语义差异。

- [ ] **Step 4: 让 LangGraph 只输出结构化意图**

模型只能输出 `intent`, `changed_dimensions`, `candidate_values`, `confidence`, `needs_clarification`；最终 period、精确时间、场地冲突、版本变化和方案完整性全部由 `datePlanContract` 决定。

- [ ] **Step 5: 明确场地分阶段规则**

邀请草稿允许“大运中心附近”“椰子鸡”，并由 AI 追问具体门店；最终双方确认前必须有与活动一致的具体场地。集合点和活动场地分字段，星巴克可作为集合点，但不能自动覆盖“看电影”的影院。

- [ ] **Step 6: 运行 Graph build、41+ 测试及 Agent 回归**

Run: `npm --prefix miniprogram/cloudfunctions/agent-graph run check && npm --prefix server run selfcheck:agent`

Expected: PASS；业务写入仍只通过白名单工具，模型不能绕过 final-plan gate。

- [ ] **Step 7: 提交规则收敛**

```bash
git add miniprogram/cloudfunctions/api/lib/datePlanContract.js miniprogram/cloudfunctions/api/lib/meetingPlanPolicy.js miniprogram/cloudfunctions/api/lib/dateCounterOfferPolicy.js miniprogram/cloudfunctions/agent-graph/src/contracts.ts miniprogram/cloudfunctions/agent-graph/src/graphs/dateCoordination.ts miniprogram/cloudfunctions/agent-graph/src/model.ts miniprogram/tests/agent-graph/datePlanContract.test.ts server/selfcheck/date-plan-contract.js
git commit -m "refactor(date): centralize deterministic plan contract"
```

### Task 8: 补齐 CI、依赖审计和发布真源

**Files:**
- Modify: `.github/workflows/selfcheck.yml`
- Modify: `AGENTS.md`
- Modify: `PROJECT_HANDOFF.md`
- Modify: `CONTRIBUTING.md`
- Create: `project-docs/RELEASE_MANIFEST_TEMPLATE.md`
- Test: `server/selfcheck/release-workflow-contract.js`

**Interfaces:**
- Produces release manifest fields: `source_commit`, `api_deploy_commit`, `agent_graph_deploy_commit`, `miniprogram_upload_commit`, `cloud_env`, `test_results`, `rollback_commit`。

- [ ] **Step 1: 写 CI 契约测试**

断言 workflow 安装 agent-graph 依赖，并运行 `agent-graph check`、`selfcheck:qa-pair-reset`、`wx-identity-boundary` 和 release guard。

- [ ] **Step 2: 修改 GitHub Actions**

新增 agent-graph npm cache、安装与 check；加入 QA 清理和身份专项。测试作业保持最小 `contents: read` 权限，不在 PR 作业注入生产密钥。

- [ ] **Step 3: 建立依赖告警基线**

记录 CloudBase SDK、Axios、Database 的精确版本、上游约束、可达调用面和缓解措施。升级必须在独立分支完成 agent-graph build、checkpoint 恢复、数据库事务和云端 smoke；禁止 `npm audit fix --force` 直接进入发布线。

- [ ] **Step 4: 修正文档中的唯一真源**

合并 PR #10 后，`AGENTS.md` 和 `PROJECT_HANDOFF.md` 指向基于新 `main` 创建的工作树及分支；旧实验工作树明确标记为只读历史，不得部署。每次客户端上传和云函数部署都填写 release manifest。

- [ ] **Step 5: 运行工作流契约和全部发布门禁**

Run: `node server/selfcheck/release-workflow-contract.js && npm --prefix server run selfcheck:agent && npm --prefix server run selfcheck:safety && npm --prefix server run selfcheck:ai-report && npm --prefix server run selfcheck:cloudpay && npm --prefix server run selfcheck:member && npm --prefix server run selfcheck:cloud-match && npm --prefix server run selfcheck:qa-pair-reset && npm --prefix miniprogram/cloudfunctions/agent-graph run check`

Expected: PASS；PR 检查页面能直接看到 Graph 和 QA reset 两项结果。

- [ ] **Step 6: 提交发布治理修复**

```bash
git add .github/workflows/selfcheck.yml AGENTS.md PROJECT_HANDOFF.md CONTRIBUTING.md project-docs/RELEASE_MANIFEST_TEMPLATE.md server/selfcheck/release-workflow-contract.js
git commit -m "ci: enforce full WeFinally release gates"
```

## 4. 双手机验收场景

所有场景只使用两个已标记的真实 QA 账号，不直接编辑云数据库。每一步记录两台手机时间、账号角色、协调 ID、协调版本、页面截图和结果；不记录 OpenID、手机号或表单私密原文。

### 场景 A：双账号重新匹配

1. 手机 A 点击“清空双机匹配与协调数据”。
2. 等待页面明确显示 completed；手机 B 刷新后也应显示可以重新匹配。
3. A 点击“两台真机互配测试”，应显示等待另一台。
4. B 点击同一按钮，应生成双方匹配记录和匹配结果动画。
5. A/B 分别打开匹配详情，双方指向彼此，分数和 AI 报告状态一致。

可能结果：

- `waiting_partner`：另一台尚未加入本轮，正常。
- `profile_incomplete`：资料或择偶配置缺字段，应列出字段，不应显示 SERVER_ERROR。
- `member_not_approved` / `vip_inactive`：审核或 VIP 条件不满足。
- `new_round_required`：已有一轮完成，应选择再来一轮或先清理。
- `QA_PAIR_RESET_IN_PROGRESS`：清理尚未完成，禁止同时开始匹配。
- `no_match`：硬条件确实冲突；记录双方硬筛选原因，不把它当系统故障。

### 场景 B：发起方直接邀请，受邀方完整接受

1. A 打开匹配详情，进入第一次约会。
2. A 填写 `2026-09-06`、`20:00`、南山区、电影、具体影院、预算、AA、约 1 小时并发送。
3. A 应看到“已保存/等待对方”，不得出现保存成功后又 SERVER_ERROR。
4. B 刷新协调页，应看到完整方案卡片，选择“接受完整方案”。
5. 双方确认同一版本后状态进入 arranged。

可能结果：

- 场地只有“大运中心附近”或“椰子鸡”：允许发送邀请草稿，但进入 AI 补充具体门店流程，不能直接最终确认。
- 电影配“星巴克”：AI 应询问星巴克是集合点还是要改具体影院，不得静默把活动改成咖啡。
- B 使用旧页面确认旧版本：返回 `STALE_INVITATION_VERSION` 并刷新，不生成重复约会。
- 通知投影失败：A 仍看到保存成功和“通知处理中”，后台 outbox 可重试。

### 场景 C：双方分别填写后由 AI 协调

1. A 提议 `2026-09-07` 周一晚上、电影。
2. B 选择“只调整部分安排”，填写 `2026-09-06` 周日 `20:00`，活动和区域不变。
3. B 的会话应展示修改预览，只标出时间变化；确认后才写入。
4. A 会话应出现“对方希望调整时间”的脱敏摘要和新完整方案，不展示 B 原话。
5. A 接受调整后，双方确认 V2；V1 的确认必须失效。

可能结果：

- “周日晚上八点”必须规范化为 `2026-09-06 20:00 / night`，不能只保存 evening。
- 用户只说“对”：AI 必须结合当前唯一待确认卡片；存在多个候选时必须追问，不能猜。
- 用户说“时间不变，只改看电影”：只修改 activity/venue，不能恢复旧时间。
- 双方没有共同时间：显示具体冲突维度并询问一方是否接受对方候选，不能只说“没有交集”。
- 连续 5 轮仍无共识：进入人工协助，不替双方做决定。

### 场景 D：旧会话与小程序升级兼容

1. A/B 在旧协调会话停留，另一台执行 QA 清理。
2. 原页面保持前台，等待一个轮询周期。
3. 旧消息应被清空或页面明确提示该协调已结束；不得继续显示旧方案可确认按钮。
4. 重新匹配并建立新协调后，两端必须进入新 session generation。
5. 使用旧客户端提交不带 expected version 的修改，应只读并提示更新，不写入新方案。

可能结果：

- 空历史：显示新欢迎语，不保留旧消息。
- session closed：重新创建当前协调的 session，不复活旧协调。
- 卡片正文相同但版本变化：仍必须刷新 V 号和按钮状态。
- 客户端与云函数版本不一致：显示“请更新测试版”，不显示 SERVER_ERROR。

### 场景 E：到场、识别与安全暂停

1. arranged 后，A 填写“深色上衣，手持一本书”并同步。
2. A 到场后填写“影院大厅取票机旁”，点击“我已到达”。
3. B 的站内提醒和协调会话均应在刷新后出现到场摘要；B 不应看到 A 的联系方式或精确定位。
4. B 也到达，双方才可以分别点击“已见到对方”。
5. 任一方点击“现场情况不符”，双方会合状态立即 paused，后续 met 操作被拒绝并出现人工客服/安全提示。

可能结果：

- 只写“到了”：允许记录到场但现场位置为空。
- 现场位置含数字、单位或详细地址：返回 `UNSAFE_ARRIVAL_POSITION` 并引导改成公共场所可见位置。
- 穿搭写手机号/微信号：返回 `UNSAFE_ARRIVAL_HINT`。
- 对方会话暂未投影：发起端显示 pending，重试投影后补齐且不重复消息。
- 双方尚未都到达：点击 met 返回可理解提示，不能进入已见面。

### 场景 F：AI 报告与 RAG 降级

1. 匹配成功后分别打开 AI 报告。
2. 报告生成期间显示明确状态，完成后不出现“数据限制”技术字段、null、completeness 等内部术语。
3. 修改用户画像后，旧报告标记为需更新，新任务与画像版本关联。
4. 暂停模型/RAG provider 做降级测试，匹配硬规则仍工作，报告显示友好失败和重试入口。

可能结果：

- `queued/generating`：允许离开页面，worker 继续处理。
- `succeeded`：只展示面向用户的解释，不展示对方原始隐私答案。
- `failed_retryable`：提供重试，不使用伪报告冒充成功。
- RAG 无召回：使用确定性匹配证据并降低结论强度，不显示底层 provider 名或向量字段。

## 5. 发布顺序与停止条件

1. Task 1 身份边界必须先完成并独立 Review。
2. Task 2、3 共同解决 SERVER_ERROR，但分别提交，便于回滚。
3. Task 4 完成前，不用“一键清空成功”作为旧数据已完全删除的证据。
4. Task 5、6 完成后再做双手机场景 D/E。
5. Task 7 完成后运行全部 Graph/API 契约，禁止只根据模型对话观感验收。
6. Task 8 合并后，创建唯一发布候选提交；从同一提交分别部署 `api`、`agent-graph` 和上传小程序测试版。
7. 任一 P0 测试失败、出现跨账号数据、旧版本写入新方案、支付/会员回归失败或敏感信息进入日志时立即停止发布。

## 6. 本计划自检

- 审查问题均映射到 Task 1-8。
- 每个任务均有先失败、后实现、再回归和独立提交步骤。
- 接口名称在任务内定义，后续步骤使用相同名称。
- 测试覆盖成功、等待、冲突、超时、并发、旧会话、投影失败、安全暂停和 RAG 降级。
- 本文件只新增计划，没有修改任何业务代码、云函数配置或生产数据。
