# WeFinally Date Invitation Prelaunch Final

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `892435a5aa11b1cc55f4e4322bb7faf52ec4aa27` |
| Remote HEAD (start) | `892435a5aa11b1cc55f4e4322bb7faf52ec4aa27`（fetch 后与本地一致） |
| Dirty files（任务开始前，未改动） | `miniprogram/project.config.json`；`server/public/partner/index.html`；`server/selfcheck/cloudbase-partner-connection.js`；`server/selfcheck/customer-service-browser-fixture.js`；`?? .cursor/`；`?? config/`；`?? project.config.json`；`?? project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md`；`?? server/selfcheck/customer-service-browser-host.js`；`?? specs/2026-08-12-partner-gated-launch/` |

未 reset / clean / restore / stash 用户文件；未 rebase；未 force push；未 merge main。

## 2. Expiration Transaction Bug

CloudBase `db.runTransaction` 回调里抛异常会 **rollback 整个事务**。

旧行为：

```
transaction
  update status=expired, business_state=expired
  throw INVITATION_EXPIRED
→ rollback
```

客户端收到 `INVITATION_EXPIRED`，数据库可能仍是 `INVITING_PARTNER`。现有 memory `updateByDoc` 不会 rollback，所以 TEST 56–59 证明不了这个生产缺陷。

新行为：事务内只 **写 EXPIRED 并 return `{ expired: true, coordination }`**，让事务 commit；handler 在事务成功返回之后再 `throw invitationExpiredError()`。

## 3. Expiration Contract

`persistExpiredInvitationRecord()` 是唯一 EXPIRED 写入入口。

Production（`commitDirectInvitationAccept` / `commitInvitationResponse` / `commitPreAcceptInvitationPatch`）：

```
txn: deadline passed or status already expired
  → persist EXPIRED
  → return { expired: true, coordination, idempotent }
txn commits
handler: if (committed.expired) throw INVITATION_EXPIRED
```

`db.js` 生产事务回调内不再出现 `INVITATION_EXPIRED` throw。

Handler 入口若请求到达时 deadline 已过、仍为 `INVITING_PARTNER`：先用普通 `updateByDoc` 落 EXPIRED（非事务，写即提交），再 throw。这样缺 `invitation_version` 的过期请求也会把库写成 EXPIRED，而不是卡在 `INVALID_INVITATION_VERSION`。

已是 `EXPIRED` 的重试：直接 `INVITATION_EXPIRED`，不会变成 `INVITATION_ALREADY_RESPONDED`。

**Notification：** 请求路径在 persist 成功且 `idempotent !== true` 后调用 `notifyInvitationExpiredOnce`（`event_type=invitation_expired`，先 `first()` 查重）。Deadline worker 仍只在 `expireIfCurrent` 成功（当时还是 `inviting_partner`）时发信。正常顺序不会双发 unread。事务内不发通知。

## 4. Primary Proposal Resolution

Preference = 可接受范围。Primary = 这次真正建议给 B 的单值方案。

`resolvePrimaryAfterPreferenceChange()`：

| 维度 | 旧 Primary 仍合法 | 失效且只剩 1 个选项 | 失效且多个选项 |
|---|---|---|---|
| time / area / activity | 保留 | 自动用唯一值 | `primary_resolution_required` |
| budget / duration | 直接同步新单值 | 同左 | 同左 |
| payment | `syncPrimaryPaymentFromPreference()` | 同左 | 同左 |

不把 `invitation_primary_proposal` 整对象加入 `PATCHABLE_FIELDS`。客户端只能传 `primary_selection: { area, date, period, activity }`。`payment_mode` / `payer_user_id` 忽略，由 backend 生成。

不在 range 内的 selection → `INVALID_PRIMARY_SELECTION`。

多选未确认：Preview `pending_primary_selection`，**不** `invitation_version+1`，不写新 application，不改 DB Primary。

## 5. Resolution UX

继续使用 `pages/chat/chat`，无新页面。

Chat 收到 `primary_resolution_required`：

- 显示轻量选择卡（区域 / 时间 / 活动 options）
- AI 回复用 `resolution_prompt`（例如「你这次更希望先建议福田还是罗湖？」）
- 选择后 POST 同一 Patch Preview API，带 `primary_selection` + 原 `changes`
- 完成后展示修改前 / 修改后，用户点【确认修改】才 CAS apply

`PRIMARY_RESOLUTION_REQUIRED` 不 Toast「系统错误」。`INVITATION_EXPIRED` Toast「本次约会邀请已结束，请查看最新状态。」并刷新 / 打开约会页。

## 6. Payment / Budget / Duration

- Payment：AA → `self_pays` 仍同步 Primary `single_payer` / 发起方；Preview 文案「本次由发起方请客」
- Budget / duration：Primary 直接覆盖为新 Preference 单值
- 不回归 TEST 53–55 / TEST 73

## 7. Tests

| TEST | Result |
|---|---|
| 61 EXPIRED_COMMIT_NOT_ROLLBACK_ACCEPT | PASS |
| 62 EXPIRED_COMMIT_NOT_ROLLBACK_COORDINATE | PASS |
| 63 EXPIRED_COMMIT_NOT_ROLLBACK_DECLINE | PASS |
| 64 EXPIRED_COMMIT_NOT_ROLLBACK_PATCH | PASS |
| 65 EXPIRED_RETRY_IDEMPOTENT | PASS |
| 66 PRIMARY_AUTO_SYNC_UNIQUE_AREA | PASS |
| 67 PRIMARY_AUTO_SYNC_UNIQUE_TIME | PASS |
| 68 PRIMARY_AUTO_SYNC_UNIQUE_ACTIVITY | PASS |
| 69 PRIMARY_MULTI_OPTION_REQUIRES_SELECTION | PASS |
| 70 PRIMARY_SELECTION_VALID | PASS |
| 71 PRIMARY_SELECTION_INVALID | PASS |
| 72 PATCH_NOT_APPLIED_BEFORE_PRIMARY_RESOLUTION | PASS |
| 73 PRIMARY_PAYMENT_STILL_SYNC | PASS |
| 74 PRIMARY_BUDGET_DURATION_SYNC | PASS |
| 75 FULL_PRIMARY_PATCH_FLOW | PASS |

TEST 61 另含：假 CloudBase transaction（update+throw 会 rollback）+ `db.js` 源码契约（生产事务内无 `INVITATION_EXPIRED` throw）。

## 8. Regression

TEST 25–60：PASS（含在 `first-date-invitation-coordination`）。

| Check | Result |
|---|---|
| `node server/selfcheck/first-date-invitation-coordination.js` | PASS |
| `node server/selfcheck/date-coordination-logic-audit.js` | PASS |
| `npm --prefix server run selfcheck:agent` | PASS（含 agent-ui） |
| `npm --prefix server run selfcheck:langgraph` | PASS |
| `npm --prefix server run selfcheck:synthetic-coordination` | PASS |
| `npm --prefix server run selfcheck:cloud-match` | PASS |
| `npm --prefix server run selfcheck:member` | PASS |
| `npm --prefix server run selfcheck:ai-report` | PASS |
| `npm --prefix server run selfcheck:safety` | PASS |

并发状态机（A patch vs B accept / coordinate / decline / deadline / CAS）无回归。

## 9. CloudBase

| Item | Value |
|---|---|
| Environment | `cloud1-d4gy8l52g08bba326` |
| Deployment method | **Official tcb CLI 3.7.3**（本会话无 CloudBase MCP） |
| api before | Atomicity round；contract **5** |
| api after | code update SUCCESS；`date_coordination_contract_version: 6` |
| capabilities | `expired_transaction_commit: true`；`primary_proposal_resolution: true` |

**Deploy note：** 在无 `node_modules` 的干净 staging 目录 `Push-Location` 后执行 `tcb fn code update api -e cloud1-d4gy8l52g08bba326 --deployMode cos`。`--dir` 在 CLI 3.7.3 会把 `functionPath='.'` 打成 `process.cwd()`。

Smoke：

| Check | Result |
|---|---|
| api ping | PASS `pong` / env `cloud1-d4gy8l52g08bba326` |
| GET `/api/common/config` | PASS contract **6** + 上述 capabilities |
| agent-graph health | PASS `{status:ok,runtime:langgraph}`（不是 Live LangGraph E2E） |

## 10. agent-graph

| Item | Value |
|---|---|
| Modified | **NO** |
| Deployed | **NO** |

## 11. Database

| Item | Value |
|---|---|
| Migration | **NO** |
| Additive | 无新表；使用已有 coordination / application / patch 字段 |
| Destructive | 无 |

## 12. Git

| Item | Value |
|---|---|
| Start HEAD | `892435a5aa11b1cc55f4e4322bb7faf52ec4aa27` |
| Business commit | `f94c67f0` `fix(coordination): persist expired invitation transactions` |
| Test commit | `6faf87b` `test(date): cover primary resolution and expiration persistence` |
| Docs commit | `93fa5b1` `docs: finalize date invitation prelaunch fixes` |
| Final remote HEAD | （push 后回填） |

未纳入用户 dirty files。未 merge main。未 force push。未上传微信版本。

## 13. Manual Verification

微信开发者工具下一步测试（本轮未上传体验版）：

1. A 修改后唯一 Primary 自动变化（南山/福田 → 只剩福田）
2. A 修改后多选 Primary 提示选择（福田 / 罗湖），不自动取第一个
3. Payment Patch：AA → 我请客，Preview 显示「本次由发起方请客」
4. Expired request：accept / coordinate / decline / patch 均 INVITATION_EXPIRED，库为 EXPIRED
5. B Direct Accept
6. B AI Coordinate
7. B Decline

## 14. Remaining Work

只允许：

- Live LangGraph manual smoke
- 微信视觉验收
- Subscribe Template ID
- 体验版上传

本轮完成后停止后端架构迭代。
