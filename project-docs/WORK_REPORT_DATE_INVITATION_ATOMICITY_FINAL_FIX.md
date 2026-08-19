# WeFinally Date Invitation Atomicity Final Fix

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `4babf4d2c0c29986e243d3779e919d5e656170a2` |
| Remote HEAD (start) | `4babf4d2c0c29986e243d3779e919d5e656170a2`（fetch 后与本地一致） |
| Dirty files（任务开始前，未改动） | `miniprogram/project.config.json`；`server/public/partner/index.html`；`server/selfcheck/cloudbase-partner-connection.js`；`server/selfcheck/customer-service-browser-fixture.js`；`?? .cursor/`；`?? config/`；`?? project.config.json`；`?? project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md`；`?? server/selfcheck/customer-service-browser-host.js`；`?? specs/2026-08-12-partner-gated-launch/` |

未 reset / clean / restore / stash 用户文件；未 rebase；未 force push；未 merge main。

## 2. Findings

### Patch vs Accept race

B Direct Accept 已走 transaction。A 在 `INVITING_PARTNER` 确认 AI Patch 仍可能先写 application version，再用普通 `updateByDoc` 把 coordination 写回 `INVITING_PARTNER` + 新 `invitation_version`，覆盖 B 已经完成的 `ARRANGED`。

### Patch vs Coordinate race

B「和 AI 协调」原先普通 update。A 的迟到 patch 可以把 `COLLECTING_PREFERENCES` 写回 `INVITING_PARTNER`。

### Patch vs Decline race

B「这次暂不方便」同样不是 CAS。迟到 patch 可以把 `INVITATION_DECLINED` 撕回 inviting。

### Primary payment consistency

`primaryFitsPreference()` 已检查 time/area/activity/budget/duration，但 payment 未严格对齐 Neutral `payment_mode` + `payer_user_id`。AA Primary 在 A 改成 `self_pays` 后可能被错误保留。

### Deadline transaction validation

`respondInvitation()` 在 transaction 前检查 deadline 必要但不充分。Deadline 边界必须在 transaction 内用当时 timestamp 再判一次，否则可能 deadline 后 arranged / coordinate / decline / patch。

## 3. Atomic Model

`INVITING_PARTNER` 阶段所有写操作争夺同一份 Invitation State：

```
INVITING_PARTNER
├ A pre-accept patch  → 仍 INVITING_PARTNER，invitation_version +1
├ B direct accept     → ARRANGED
├ B coordinate        → COLLECTING_PREFERENCES
├ B decline           → INVITATION_DECLINED
└ expire              → EXPIRED
```

CAS 统一 expected：

| 操作 | status | coordination_version | invitation_version | invitation_responded_at | deadline |
|---|---|---|---|---|---|
| A patch | `inviting_partner` | 必须匹配 preview base | 必须匹配 | 必须为空 | 未过期 |
| B accept / coordinate / decline | `inviting_partner` | — | 提交 version 必须等于当前 | 必须为空 | 未过期 |
| expire | `inviting_partner` | — | — | — | 已过期 |

成功方独占 transition。失败方不得覆盖终态。A patch 在 inviting 路径**不再**于 CAS 前 supersede proposal/confirmation，避免撕掉 B 刚写入的 Direct Accept 单据。

## 4. Transactions

| Function | Role | Production | Selfcheck |
|---|---|---|---|
| `commitDirectInvitationAccept` | B Direct Accept | CloudBase `db.runTransaction` + `transactionAdapter` | `memoryCommitDirectAccept` |
| `commitInvitationResponse` | B coordinate / decline | 同上 | `memoryCommitInvitationResponse` |
| `commitPreAcceptInvitationPatch` | A pre-accept patch | 同上 | `memoryCommitPreAcceptInvitationPatch` |

Production 复用既有 `transaction()` / `transactionAdapter()`，没有第二套 DB 抽象。

Transaction 内只做 DB read/write。禁止 LLM、订阅消息、外部 event、云函数互调。

Event / inbox notification 在 commit 成功且 `idempotent !== true` 后发送。

## 5. Expected State

Transaction 内重新读取 `date_coordination` 后校验：

- `status == inviting_partner`
- A patch：`user_a_id == actor`；B response：`user_b_id == actor`
- `invitation_responded_at` 为空
- `invitation_version` 使用 `invitationVersionOf` / `invitationVersionFromRow` 回退（兼容旧文档缺字段，禁止把 `undefined` 当成 NaN 误判 stale）
- A patch 另校验 `coordination_version`
- `invitation_deadline_at` 与 transaction timestamp 比较；过期则 CAS 标记 `EXPIRED` 并抛 `INVITATION_EXPIRED`

B 已响应（`ARRANGED` / `COLLECTING_PREFERENCES` / `INVITATION_DECLINED` / `EXPIRED`）时 A patch 返回 `INVITATION_ALREADY_RESPONDED`。

Version 已变化时返回 `STALE_INVITATION_VERSION` 或 `STALE_COORDINATION_VERSION`。

coordinate / decline 采用 **mandatory invitation_version**：B 看着 v1 点击时，若 A 已到 v2，一律 stale，不能覆盖 A 的 pre-accept edit。

## 6. Idempotency

| Action | Retry-safe when | Events / notifications |
|---|---|---|
| Direct Accept | 已 `ARRANGED` 且 `accepted_base_invitation_version` 与 submitted version 相同、final proposal key 相同 | `idempotent=true` 不重复 arranged event / inbox |
| Coordinate | 已 `COLLECTING_PREFERENCES` 且 `invitee_intent=coordinate` 且 version 相同 | 不重复 `invitation_accepted` |
| Decline | 已 `INVITATION_DECLINED` 且 `invitee_intent=decline` 且 version 相同 | 不重复 `invitation_declined` |

客户端双击或丢响应后重试返回当前 detail，不报「当前状态不能回应邀请」。

## 7. Payment

`primaryFitsPreference(primary, prefs, { user_a_id, user_b_id })` 在原有 time/area/activity/budget/duration 之外：

1. `personalPaymentToNeutral(payment_preference)`
2. 比较 `primary.payment_mode` 与 `primary.payer_user_id`

A 在 INVITING_PARTNER 把 `aa` 改成 `self_pays` 时：

- old AA primary 不再 fits
- Patch Preview 展示 `费用方式：AA → 本次由发起方请客`（`primary_payment_before_text` / `primary_payment_after_text`）
- 确认后 Primary 写成 `payment_mode=single_payer`，`payer_user_id=A`
- Invitation Card：`本次由发起方请客`

`partner_pays` → `payer_user_id=B`，Card：`本次由受邀方请客`。

## 8. Deadline

所有 invitation transaction（accept / coordinate / decline / patch）在 hook 之后、最终写之前再次检查 `invitation_deadline_at`。

过期：

- 拒绝该操作（`INVITATION_EXPIRED`）
- CAS 将 status 标为 `EXPIRED`（与 deadline worker 并存；worker 仍负责扫描通知）
- **deadline 后不能 arranged / coordinate / decline / patch**

## 9. Race Tests

TEST 45–60 使用真实 `createDateCoordinationHandlers` / `createDateApplicationPatchHandlers`，通过 injectable `beforeCommitHook` + `createBarrier()` 精确交错。不是把内存字段改成 `invitation_version = 2` 冒充 race（旧 TEST 36 仍保留，但不替代本轮）。

| TEST | Name | Result | Method |
|---|---|---|---|
| 45 | REAL_PATCH_VS_DIRECT_ACCEPT_RACE | PASS | handlers + barrier：B accept first，A patch resume → ARRANGED，patch `INVITATION_ALREADY_RESPONDED` |
| 46 | PATCH_FIRST_ACCEPT_STALE | PASS | A patch first v2，B accept v1 → `STALE_INVITATION_VERSION`，仍 INVITING v2 |
| 47 | PATCH_VS_COORDINATE_RACE | PASS | Case1 B coordinate first；Case2 A patch first，B coordinate v1 stale |
| 48 | PATCH_VS_DECLINE_RACE | PASS | B decline first，A patch rejected，终态 DECLINED |
| 49 | COORDINATE_IDEMPOTENT | PASS | 两次 coordinate；1 event + 1 notification |
| 50 | DECLINE_IDEMPOTENT | PASS | 两次 decline；不重复 event / notification |
| 51 | COORDINATE_STALE_VERSION | PASS | A v2 后 B coordinate v1 → STALE |
| 52 | DECLINE_STALE_VERSION | PASS | 同理 |
| 53 | PAYMENT_PRIMARY_STALE | PASS | self_pays → single_payer / A；Card「本次由发起方请客」 |
| 54 | PAYMENT_PRIMARY_PARTNER_PAYS | PASS | payer=B；Card「本次由受邀方请客」 |
| 55 | PRIMARY_FITS_PAYMENT | PASS | old AA vs self_pays → false |
| 56 | ACCEPT_AFTER_DEADLINE | PASS | 不能 ARRANGED |
| 57 | COORDINATE_AFTER_DEADLINE | PASS | 不能 COLLECTING_PREFERENCES |
| 58 | DECLINE_AFTER_DEADLINE | PASS | 不能 DECLINED |
| 59 | PATCH_AFTER_DEADLINE | PASS | 不能改 expired invitation |
| 60 | INVITATION_STATE_NO_TEARING | PASS | ARRANGED / COLLECTING / DECLINED / EXPIRED 后旧 patch 不能写回 INVITING_PARTNER |

TEST 25–44：无回归，全部继续 PASS（含 Primary Proposal、Neutral Payment、mandatory Direct Accept version、Direct Accept idempotency、pre-accept 不耗轮次、日期格式、Graph privacy）。LIVE_GRAPH_SMOKE：`MANUAL_REQUIRED`。

## 10. Regression

| Command | Result |
|---|---|
| `node server/selfcheck/first-date-invitation-coordination.js` | PASS（LIVE_GRAPH_SMOKE: MANUAL_REQUIRED） |
| `node server/selfcheck/date-coordination-logic-audit.js` | PASS |
| `npm --prefix server run selfcheck:agent` | PASS |
| `npm --prefix server run selfcheck:langgraph` | PASS |
| `npm --prefix server run selfcheck:synthetic-coordination` | PASS |
| `npm --prefix server run selfcheck:ai-profile-bilateral` | PASS |
| `npm --prefix server run selfcheck:cloud-match` | PASS |
| `npm --prefix server run selfcheck:member` | PASS |
| `npm --prefix server run selfcheck:ai-report` | PASS |
| `npm --prefix server run selfcheck:safety` | PASS |

未跑完整 `npm --prefix server run selfcheck`（成本高于本轮范围；已覆盖任务列出的全部专项）。

## 11. CloudBase

| Item | Value |
|---|---|
| Environment | `cloud1-d4gy8l52g08bba326` |
| Deployment method | **Official tcb CLI 3.7.3**（本会话无 CloudBase MCP） |
| api before | Review Fix Round；contract **4** |
| api after | code update SUCCESS；Runtime 仍 Nodejs16.13；`LANGGRAPH_ENABLED` / `DEEPSEEK_API_KEY` 等 env 保留 |
| contract version | **5** |
| capabilities | `invitation_atomic_transitions` / `invitation_response_version_cas` / `pre_accept_patch_cas` 均为 true |

**Deploy note：** `tcb fn code update --dir <path>` 在 CLI 3.7.3 会把 `functionPath='.'` 解析为 `process.cwd()`。本轮在无 `node_modules` 的干净 staging 目录内执行 `tcb fn code update api -e cloud1-d4gy8l52g08bba326 --deployMode cos`。

Smoke：

| Check | Result |
|---|---|
| api ping | PASS `pong` / env `cloud1-d4gy8l52g08bba326` |
| GET `/api/common/config` | PASS contract **5** + 上述 capabilities |
| agent-graph health | PASS `{status:ok,runtime:langgraph}`（不是 Live LangGraph E2E） |
| Live invitation write（A 邀请 / B accept / coordinate / decline） | `tcb fn invoke` 无微信 OPENID，`currentUser` 无法冒充用户；未对真实用户写库。同代码路径由 TEST 04/06/09/19/20/22 与 TEST 45–60 覆盖。微信开发者工具手测见 §15。 |

## 12. agent-graph

| Item | Value |
|---|---|
| Modified | **NO** |
| Deployed | **NO** |

本轮 runtime 只改 `miniprogram/cloudfunctions/api/**`。agent-graph 保持 health check，不把 health ok 称为 Live LangGraph E2E。

## 13. Database

| Item | Value |
|---|---|
| Migration | **NO** |
| Additive | 使用已有 `invitation_version` / `invitation_responded_at` / `invitation_primary_proposal` |
| Destructive | 无 |

## 14. Git

| Item | Value |
|---|---|
| Start HEAD | `4babf4d2c0c29986e243d3779e919d5e656170a2` |
| Business Commit | `12e07d5fbf17a6bf33e3770ffcaaf404a210cade` `fix(coordination): make invitation transitions atomic` |
| Docs Commit | `7d3eb1192166ac33e22800af90984e80cea2cd04` `docs: record invitation atomicity fix round` |
| Final Remote HEAD | `7d3eb1192166ac33e22800af90984e80cea2cd04` |
| Push status | 待 push；成功后以 origin HEAD 为准 |

未纳入用户 dirty files。

## 15. Manual Verification

微信开发者工具后续手测（本轮未上传体验版）：

1. A patch vs B accept：B 先接受 → ARRANGED；A 确认旧 preview → 「协调状态刚刚发生变化」并刷新，不能写回 INVITING
2. A patch vs B coordinate：B 先 coordinate → COLLECTING_PREFERENCES；旧 A patch 失败
3. A patch vs B decline：终态保持 DECLINED
4. Payment patch：AA → 我请客；Preview 显示 AA → 本次由发起方请客；Card 与 DB 一致
5. Deadline：过期后 accept / coordinate / decline / patch 均不可改写为成功态

## 16. Remaining Work

只允许：

- Live LangGraph manual smoke
- 微信视觉验收
- Subscribe Template ID
- 体验版上传

不能再把 invitation race / CAS 列为 future work。
