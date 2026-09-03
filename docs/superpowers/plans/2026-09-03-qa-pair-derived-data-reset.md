# QA Pair Derived Data Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为双真机 QA 增加幂等、可审计的一键重置，删除两个 QA 账号参与的匹配与约会协调衍生数据，同时保留身份、注册、画像/RAG、会员、支付和邀请归因。

**Architecture:** 新建专用 `qaPairResetPolicy` 解析服务端 pair/cohort 和删除图，新建 `qaPairResetService` 按控制记录阶段执行精确硬删除。客户端只提交 request id 与固定确认文字，不提交 partner id；失败可从控制记录恢复。

**Tech Stack:** CloudBase NoSQL、Node.js 16 CommonJS、WeChat Mini Program QA component、自包含 Node selfcheck。

**Spec:** `docs/superpowers/specs/2026-09-03-date-venue-ai-qa-pair-reset-design.md`

## Global Constraints

- 只能通过带审计的后台业务接口清理，不直接在控制台批量删除生产数据。
- 服务端解析另一名 QA 用户，不能信任客户端 partner id。
- 确认文字必须完全等于 `彻底清空本对测试数据`。
- 保留 users、注册资料、择偶设置、身份标签、画像/RAG、VIP、订单、支付、邀请和佣金归因。
- 删除仅覆盖匹配/约会协调派生数据与 `date_coordinator` 会话；普通恋爱助手聊天必须保留。
- 跨集合执行必须幂等、分阶段、可恢复并保留脱敏审计。

---

### Task 1: 删除图与权限策略

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/qaPairResetPolicy.js`
- Test: `server/selfcheck/qa-pair-reset-policy.js`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `QA_PAIR_RESET_CONFIRM_TEXT`
- Produces: `resolveQaPair(actor, users): { userIds, pairKey, pairHash }`
- Produces: `buildDeletionGraph(seed): { matchIds, coordinationIds, sessionIds }`
- Produces: `preservedCollections()`

- [ ] **Step 1: 写失败测试**

```js
assert.throws(() => resolveQaPair(actor, [actor]), /恰好两名/)
assert.throws(() => assertConfirmText('重新开始本轮测试'), /彻底清空/)
assert.deepStrictEqual(resolveQaPair(a, [a, b]).userIds, [1, 2])
assert(preservedCollections().includes('user_evidence_chunk'))
assert(preservedCollections().includes('user_order'))
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/qa-pair-reset-policy.js`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯策略**

```js
const QA_PAIR_RESET_CONFIRM_TEXT = '彻底清空本对测试数据'
function assertConfirmText(value) {
  if (String(value || '') !== QA_PAIR_RESET_CONFIRM_TEXT) throw businessError('QA_PAIR_RESET_CONFIRM_REQUIRED', `请输入“${QA_PAIR_RESET_CONFIRM_TEXT}”`)
}
function pairKey(ids) { return ids.map(Number).sort((a, b) => a - b).join(':') }
```

`resolveQaPair()` 只接受同一 `qa_match_cohort`、均有 QA 权限、恰好两名的真实账号；`buildDeletionGraph()` 只接受服务端查询结果。

- [ ] **Step 4: 运行测试**

Run: `node server/selfcheck/qa-pair-reset-policy.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/cloudfunctions/api/lib/qaPairResetPolicy.js server/selfcheck/qa-pair-reset-policy.js server/package.json
git commit -m "feat(qa): define pair reset safety policy"
```

### Task 2: 幂等分阶段重置服务

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/qaPairResetService.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collections.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/lib/db.js`
- Test: `server/selfcheck/qa-pair-reset-service.js`

**Interfaces:**
- Consumes: `resolveQaPair()`、`removeByDoc()`、`updateByDoc()`
- Produces: `executeQaPairReset({ actor, requestId, confirmText }, deps): ResetResult`
- Produces collections: `qa_pair_reset_run`, `qa_pair_reset_audit`

- [ ] **Step 1: 写失败服务测试**

```js
const first = await executeQaPairReset(request, deps)
assert.strictEqual(first.status, 'completed')
assert.strictEqual(rows.user.length, 2)
assert.strictEqual(rows.user_order.length, 1)
assert.strictEqual(rows.user_evidence_chunk.length, 2)
assert.strictEqual(rows.user_match_log.length, 0)
assert.strictEqual(rows.date_coordination.length, 0)
assert.strictEqual(rows.agent_message.filter(m => m.session_id === DATE_SESSION).length, 0)
assert.strictEqual(rows.agent_message.filter(m => m.session_id === LOVE_SESSION).length, 1)
assert.deepStrictEqual(await executeQaPairReset(request, deps), first)
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/qa-pair-reset-service.js`
Expected: FAIL，服务模块不存在。

- [ ] **Step 3: 实现状态机与精确删除**

```js
const STAGES = ['pending', 'deleting', 'resetting_users', 'completed']
async function removeRows(name, rows, deps) {
  let removed = 0
  for (const row of rows) { await deps.removeByDoc(name, row); removed += 1 }
  return removed
}
```

先创建稳定 `_id = sha256(pairHash + requestId)` 的 run；收集 match ids → coordination ids → session ids 后删除子记录，再删除父记录。删除图必须显式覆盖：

```js
const CHILD_COLLECTIONS = [
  'match_experience_feedback', 'ai_report_task', 'match_claim_audit', 'match_claim',
  'date_experience_feedback', 'date_coordination_confirmation', 'date_coordination_proposal',
  'date_application_patch', 'date_coordination_event_dedupe', 'date_coordination_event',
  'fixture_response_job', 'date_coordination_application', 'date_participant',
  'agent_message_dedupe', 'agent_message', 'agent_tool_audit', 'agent_run',
  'agent_notification_job', 'coordination_notification_dedupe', 'coordination_notification',
  'agent_session_dedupe', 'agent_session', 'date_coordination', 'user_match_log'
]
```

查询必须使用实际关联字段（match log id、pair key、coordination id、session id 和两名 user id），不能做空条件删除。最后只更新两名用户的 `match_status/matched_partner_id/matched_at/qa_match_run_*`，并重新计算 `user_notification_cursor`；每阶段写计数，异常标记 `failed_retryable`，同 request id 恢复。

- [ ] **Step 4: 运行测试**

Run: `node server/selfcheck/qa-pair-reset-service.js`
Expected: PASS，包含中途失败恢复和并发同 request id 断言。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/cloudfunctions/api/lib/qaPairResetService.js miniprogram/cloudfunctions/api/lib/collections.js miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js miniprogram/cloudfunctions/api/lib/db.js server/selfcheck/qa-pair-reset-service.js
git commit -m "feat(qa): add resumable pair data reset"
```

### Task 3: API 路由与公共错误合同

**Files:**
- Create: `miniprogram/cloudfunctions/api/handlers/qaPairReset.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/route.js`
- Modify: `miniprogram/cloudfunctions/api/lib/publicErrorCodes.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/common.js`
- Test: `server/selfcheck/qa-pair-reset-route.js`
- Test: `server/selfcheck/agent-route-contract.js`

**Interfaces:**
- Produces: `POST /api/match/qa-pair-reset`
- Returns: `{ request_id, status, stage, deleted_counts, preserved_summary }`

- [ ] **Step 1: 写失败路由测试**

```js
assert(routeSource.includes("'POST /api/match/qa-pair-reset'"))
await assert.rejects(() => handler({ confirm_text: '错' }, actor), /彻底清空/)
assert.strictEqual((await handler(validRequest, actor)).status, 'completed')
assert(!JSON.stringify(result).includes('openid'))
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/qa-pair-reset-route.js && node server/selfcheck/agent-route-contract.js`
Expected: FAIL，路由不存在。

- [ ] **Step 3: 接入服务与 capability**

```js
'POST /api/match/qa-pair-reset': qaPairReset.execute
```

公共错误只允许 `QA_PAIR_RESET_FORBIDDEN`、`QA_PAIR_RESET_CONFIRM_REQUIRED`、`QA_PAIR_RESET_AMBIGUOUS`、`QA_PAIR_RESET_RETRYABLE`；`/api/common/config` 仅向合格 QA 返回 `qa_pair_reset_enabled=true`。

- [ ] **Step 4: 运行路由测试**

Run: `node server/selfcheck/qa-pair-reset-route.js && node server/selfcheck/agent-route-contract.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/cloudfunctions/api/handlers/qaPairReset.js miniprogram/cloudfunctions/api/handlers/route.js miniprogram/cloudfunctions/api/lib/publicErrorCodes.js miniprogram/cloudfunctions/api/handlers/common.js server/selfcheck/qa-pair-reset-route.js server/selfcheck/agent-route-contract.js
git commit -m "feat(api): expose audited QA pair reset"
```

### Task 4: QA 面板危险操作 UI

**Files:**
- Modify: `miniprogram/utils/constants.js`
- Modify: `miniprogram/components/qa-match-panel/qa-match-panel.js`
- Modify: `miniprogram/components/qa-match-panel/qa-match-panel.wxml`
- Modify: `miniprogram/components/qa-match-panel/qa-match-panel.wxss`
- Test: `server/selfcheck/qa-frontend-modules.js`
- Test: `server/selfcheck/qa-registration-match-reveal.js`

**Interfaces:**
- Consumes: `POST /api/match/qa-pair-reset`
- Produces: `onResetQaPair()` and `resetStageText`

- [ ] **Step 1: 写失败 UI 测试**

```js
assert(constants.includes("MATCH_QA_PAIR_RESET: '/api/match/qa-pair-reset'"))
assert(wxml.includes('彻底重置双机测试'))
assert(js.includes("confirm_text: '彻底清空本对测试数据'"))
assert(wxml.includes('注册资料、画像/RAG、VIP 和订单会保留'))
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/qa-frontend-modules.js && node server/selfcheck/qa-registration-match-reveal.js`
Expected: FAIL，入口不存在。

- [ ] **Step 3: 实现二次确认与阶段反馈**

在“两台真实微信账号”区域新增独立红色次按钮；模态框明确删除/保留范围。客户端发送 `request_id` 和固定确认文字，不发送 partner id；完成后清除 QA access 缓存、刷新匹配页并将 `realMatchCompleted=false`。

- [ ] **Step 4: 运行 UI 测试**

Run: `npm --prefix server run selfcheck:qa-frontend && node server/selfcheck/miniprogram-source-syntax.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/utils/constants.js miniprogram/components/qa-match-panel server/selfcheck/qa-frontend-modules.js server/selfcheck/qa-registration-match-reveal.js
git commit -m "feat(miniprogram): add QA pair reset control"
```

### Task 5: 回归、发布记录与部署

**Files:**
- Modify: `project-docs/DEVELOPMENT_LOG.md`
- Create: `project-docs/WORK_REPORT_2026-09-03_QA_PAIR_RESET.md`

**Interfaces:**
- Produces: 删除矩阵、保留矩阵、测试证据、部署 SHA 与回滚 SHA

- [ ] **Step 1: 运行专项与六组基线**

Run: `node server/selfcheck/qa-pair-reset-policy.js; node server/selfcheck/qa-pair-reset-service.js; node server/selfcheck/qa-pair-reset-route.js; npm --prefix server run selfcheck:agent; npm --prefix server run selfcheck:safety; npm --prefix server run selfcheck:ai-report; npm --prefix server run selfcheck:cloudpay; npm --prefix server run selfcheck:member; npm --prefix server run selfcheck:cloud-match`
Expected: 全部 PASS。

- [ ] **Step 2: 确认保留边界**

Run: `node server/selfcheck/qa-pair-reset-service.js --preservation-audit`
Expected: users、settings、evidence/RAG、VIP/orders、referral/commission、普通 AI 会话数量不变；匹配/协调派生集合归零。

- [ ] **Step 3: 写报告并提交**

```powershell
git add project-docs/DEVELOPMENT_LOG.md project-docs/WORK_REPORT_2026-09-03_QA_PAIR_RESET.md
git commit -m "docs: record QA pair reset release"
```

- [ ] **Step 4: 从干净提交部署 API**

Run: 从 release SHA 建立不含 `node_modules` 的干净 staging，在 staging 的 `miniprogram/cloudfunctions/api` 目录执行 `tcb fn code update api -e cloud1-d4gy8l52g08bba326 --deployMode cos`。
Expected: `api` Active；不修改环境变量、运行时、权限、触发器或日志服务。

- [ ] **Step 5: 真机验收顺序**

两台手机刷新体验版 → 点击“彻底重置双机测试”一次 → 确认两边旧匹配和协调聊天不可见 → 两边重新点击“双机互配测试” → 产生一条新匹配。保留资料、画像/RAG、VIP 与订单必须仍可见。
