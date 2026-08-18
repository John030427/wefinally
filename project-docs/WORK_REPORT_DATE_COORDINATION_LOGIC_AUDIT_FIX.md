# WeFinally Date Coordination Logic Audit & Fix

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `e3077fe1670d42cee7e1653080c0e22219d83e2c` |
| Upstream HEAD | `e3077fe1670d42cee7e1653080c0e22219d83e2c` (HEAD 与 origin 一致后开始修改) |
| Remote | `https://github.com/John030427/wefinally.git` |

Dirty files treated as user-owned and not staged:

- `server/public/partner/index.html`
- `server/selfcheck/cloudbase-partner-connection.js`
- `server/selfcheck/customer-service-browser-fixture.js`
- `.cursor/`
- `config/`
- `project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md`
- `server/selfcheck/customer-service-browser-host.js`
- `specs/2026-08-12-partner-gated-launch/`

AGENTS.md 中的旧 branch 名 `feature/ai-agent-system` 已滞后；本轮未 checkout / switch / reset / rebase。安全、测试、提交、发布边界仍按 AGENTS.md 执行。

## 2. Bugs Confirmed

### BUG-01 Pre-accept AI CTA missing

**Confirmed.**  
Evidence: `date-coordination.js` 的 `activeCoordinatorStatuses` 原先不含 `inviting_partner`。A 发送邀请后页面只有「开启提醒 / 刷新」，没有主 CTA「和 AI 约会协调员沟通」。  
Fix: 权限改为 role-aware。`inviting_partner` + initiator + `my_application` → `can_open_coordinator_chat` / `showCoordinatorCta`。Invitee 仍只有接受/拒绝。填写阶段 `collecting_initiator` 不展示 AI CTA（先填表）。

### BUG-02 Pre-accept patch corrupts invitation state

**Confirmed.**  
Evidence: `dateApplicationPatch.confirmForUser()` 在双方 application 未齐时把 status 写成 `COLLECTING_PREFERENCES`。`nextStatus` 只允许 `INVITING_PARTNER` → `accept_invitation`。A 先改条件后，B 的 accept 会失败。  
Fix: `INVITING_PARTNER` 下只更新 A 的 preference / version，status 保持 `INVITING_PARTNER`，`business_state` 保持 `waiting_partner`，保留 `invitation_deadline_at`，不伪造 `invitation_responded_at`，不向 B 发偏好变更 inbox。

### BUG-03 Terminal state write guards incomplete

**Confirmed.**  
Evidence: patch 未拦截 `ARRANGED`；agent `createSession` 只拦截 `invitation_declined`。  
Fix: 统一 `dateCoordinationAccessPolicy.js`：`WRITE_BLOCKED_STATUSES` 含 ARRANGED / DECLINED / EXPIRED / CANCELLED / CLOSED / MANUAL_HANDOFF。patch / recoordinate / agent send / createSession 共用该 policy。

### BUG-04 LangGraph E2E test actually disabled graph

**Confirmed.**  
Evidence: `real-ui-fixture-date-langgraph-e2e.js` / `synthetic-coordination-bilateral-e2e.js` 走确定性 backend + scripted decision，不是 `LANGGRAPH_ENABLED=true` 的 graph runtime。  
Fix: 保留这些确定性 E2E，并在文件头标明 **Deterministic Coordination E2E**。真正 Graph 覆盖放在 `agent-chat.js` 与新增 `date-coordination-logic-audit.js`（注入 `invokeGraphFunction`，断言 `provider === 'langgraph'`）。

### BUG-05 Graph duplicates overlap truth

**Confirmed.**  
Evidence: backend `computeOverlap()` 看 time/area/activity/budget/payment/duration；Graph `computeSafeOverlap()` 用 dateWindows/regions/venueTypes/budgetBand。`50-100` vs `100-200` 在 backend 于 100 相交，Graph 会判 low vs medium 冲突。  
Fix: Graph 输入带 `canonicalOverlap.source = 'backend'`。`resolveOverlap()` 优先使用 backend 结论。`computeSafeOverlap` 仅作为无 snapshot 时的遗留单元测试路径。

### BUG-06 Partner structured preference overexposed to model

**Confirmed.**  
Evidence: `buildDateCoordinationGraphInput` 同时发送 `partyAState` 与 `partyBState`。  
Fix: 当前用户只收到 `ownPreference`；对侧 slot 为空 preference。`sharedState` 只含确定性交集摘要。模型 context 不再传入两侧 raw prefs。

### BUG-07 Graph confirmation state duplicates DB

**Confirmed.**  
Evidence: Graph checkpoint 有 `confirmationA/B`，输入未 hydrate DB confirmation，可能与 DB 分叉。  
Fix: 输入增加 `confirmationSnapshot`（`source: 'database'`）。有 DB snapshot 时 Graph 只解释「你已确认 / 等待对方」，不再用 checkpoint 双方确认去决定 arranged。遗留无 snapshot 的单元测试路径仍走旧 confirmationA/B → preview action，避免破坏既有 contract。

### BUG-08 fixture_journey dropped

**Confirmed.**  
Evidence: `abMatchFixture.normalizeInput()` 只返回 `{ action, ownerUserId, reason, requestId, runId }`。  
Fix: normalize 保留 `fixture_journey` / `fixture_mode`。未知值明确报错。`legacy_queue` 仅显式内部值。backoffice 把 `body.fixture_journey` / `fixture_mode` 传给 `changeAbMatchFixture`。

### BUG-09 accept/reject fixture collision

**Confirmed.**  
Evidence: active fixture 按 `owner_user_id + is_test_fixture + status` 查找，同一 A 无法同时拥有 ACCEPT 与 REJECT。  
Fix: 按 `owner + fixture_journey` 区分。Admin 准备弹窗可选 accept/reject 与 auto/manual_step。Match list / coordination 测试数据 badge：`测试 · 接受场景` / `测试 · 拒绝场景`。生产无 badge。

### BUG-10 fixture cleanup orphan data

**Confirmed.**  
Evidence: cleanup 只删 user / setting / match_log，真实 `date_coordination` 会留下 active orphan。  
Fix: `collectTestCoordinations` + `closeTestCoordinations` 只处理 `is_test_data` / `is_test_fixture` / `ab_test_run_id` 关联行；active coordination 置 `closed`，session 关闭。不按 pair_key 删生产数据。

### BUG-11 terminal coordination reused

**Confirmed.**  
Evidence: `dateCoordination.create()` `first(date_coordination, { pair_key })` 会复用 declined/arranged 历史行。  
Fix: 只复用 `ACTIVE_COORDINATION_STATUSES`。terminal 行不再阻止同一 pair 发起新协调。

### BUG-12 synthetic partner auto-advances too fast

**Confirmed.**  
Evidence: A 提交邀请后 `maybeAdvanceSyntheticPartner` 立即 accept + 提交 B 偏好；详情刷新还会继续推进。  
Fix: `fixture_mode=manual_step` 时默认不自动推进。QA 可通过 `POST /api/date-coordinations/:id/advance-synthetic`（仅测试协调 + 发起方 + manual_step）一步一步推进。`auto` 仍供 selfcheck / CI。

### BUG-13 CloudBase notification deployment mismatch

**Confirmed as diagnosis gap.**  
Evidence: GitHub 已有 `GET /api/notifications` 等路由。客户端把 unknown route 显示成笼统「功能服务尚未更新」，无法区分「未部署 api」与前端 bug。  
Fix: `/api/common/config` 增加非敏感 `api_schema_version`、`capabilities.notifications`、`date_coordinator_pre_accept_chat`、`date_coordination_contract_version`。Notifications 页在 `routeMissing` 时明确提示需更新 api 云函数。本轮 **未 deploy**。

## 3. State Machine Before

```
A submit form
  → INVITING_PARTNER
       ├── A AI patch confirm  → COLLECTING_PREFERENCES   [BUG]
       ├── B accept            → COLLECTING_PREFERENCES   [fails if patch already moved status]
       └── B decline           → INVITATION_DECLINED

pair_key first() reused terminal rows
```

## 4. State Machine After

```
A submit invite
  → INVITING_PARTNER  (business_state = waiting_partner)
       ├── A AI edit (preview → confirm)
       │     A preference_version +1
       │     coordination_version +1
       │     status STILL INVITING_PARTNER
       ├── B accept  → COLLECTING_PREFERENCES → bilateral AI
       └── B decline → INVITATION_DECLINED (all writes closed)

A confirm + B confirm → ARRANGED (writes closed)
```

## 5. Permission Matrix

| Status | Initiator chat | Invitee chat | Patch | Respond invitation | Proposal |
|---|---|---|---|---|---|
| collecting_initiator | API 允许起草首份申请；UI 不展示主 CTA | 否 | 仅 initiator | 否 | 否 |
| inviting_partner | 是（需已有自己的 application） | 否，仅 accept/decline | 仅 initiator 改自己的申请 | 仅 invitee | 否 |
| collecting_preferences / computing_overlap / no_overlap / replanning / waiting_confirmations | 是 | 是 | 是 | 否 | waiting_confirmations 可确认 |
| arranged | 只读历史 | 只读历史 | 否 | 否 | 否 |
| invitation_declined | 否 | 否 | 否 | 否 | 否 |
| expired / cancelled / closed / manual_handoff | 否（handoff 可打开只读） | 同左 | 否 | 否 | 否 |

## 6. LangGraph Architecture

LangGraph：理解用户、长期会话、按安全状态决定下一句怎么问、解释进度、resume、生成建议。

Deterministic Backend：权限、邀请状态、偏好版本、Patch apply、Overlap、Proposal、并发、Notification、Confirmation、Arrangement、Privacy boundary。

模型真正收到：

- `ownPreference`
- `canonicalOverlap` / `sharedState`（backend 生成）
- `partnerProgress`
- `confirmationSnapshot`（DB）
- 对侧 raw windows/areas/activities **不发送**

## 7. Privacy Boundary

| Side | Payload |
|---|---|
| A AI | A ownPreference + safe shared state |
| B AI | B ownPreference + safe shared state |
| Shared state | commonTime / commonArea / commonActivity / budget/payment/duration compatibility / missingDimensions / activeProposalSummary |
| Forbidden | 对侧 raw application、raw chat、share_message、private other_requirements、transport_constraints 原文 |

## 8. Fixture Architecture

| Piece | Behavior |
|---|---|
| ACCEPT | `fixture_journey=accept`，可与 REJECT 共存 |
| REJECT | `fixture_journey=reject` |
| AUTO | selfcheck / CI 自动推进 synthetic B |
| MANUAL | `fixture_mode=manual_step`，停在 WAITING_PARTNER 等关键步，由 advance-synthetic 推进 |
| cleanup | 只 close/remove 带测试标记的行；生产 seed 不删 |

## 9. Notification / Deployment

**CODE_READY ≠ CLOUD_DEPLOYMENT_REQUIRED**

本地 GitHub 代码：`capabilities.notifications = true`，route 已存在。

若体验版仍报「功能服务尚未更新」，应视为当前 CloudBase **api 云函数版本落后于 GitHub**，不是前端随机 bug。本轮未部署。

Tab index **1** 仍是「记录」。`refreshNotificationBadge()` 供 match-list / notifications / App.onShow 使用。

## 10. Tests

| Command | Result |
|---|---|
| `npm --prefix server run selfcheck:agent` | PASS |
| `npm --prefix server run selfcheck:langgraph` | PASS |
| `npm --prefix server run selfcheck:synthetic-coordination` | PASS |
| `npm --prefix server run selfcheck:ai-profile-bilateral` | PASS |
| `npm --prefix server run selfcheck:cloud-match` | PASS |
| `npm --prefix server run selfcheck:member` | PASS |
| `npm --prefix server run selfcheck:safety` | PASS |
| `npm --prefix server run selfcheck:ai-report` | PASS |
| `npm --prefix miniprogram/cloudfunctions/agent-graph run check` | PASS (build + 37 tests) |

`npm --prefix server run selfcheck`（run-all.js）依赖本地 HTTP `/api/common/health`，本轮未启动该服务器，未跑。不属于新增 regression。

新增：`server/selfcheck/date-coordination-logic-audit.js` 覆盖 Tests 1–19 的服务端/契约部分。

## 11. Manual Verification

`pending_manual_visual_verification`

未打开微信开发者工具，未做真机视觉验收。不要把本轮 selfcheck PASS 当成体验版已更新。

建议人工路径：

1. 准备 ACCEPT fixture，`fixture_mode=manual_step`
2. A 发送邀请 → 应看到「等待对方回应」+「和 AI 约会协调员沟通」
3. 输入「周六下午也可以」→ 预览 → 确认后仍等待对方
4. 再测 REJECT fixture：B 拒绝后 A 不能继续写协调

## 12. Git

| Item | Value |
|---|---|
| Start HEAD | `e3077fe1670d42cee7e1653080c0e22219d83e2c` |
| New commits | `ca63546` fix(coordination): keep pending invitations stable for pre-accept AI edits |
| Final HEAD | see following docs commit |
| Original dirty files preserved | YES |
| No push | YES |
| No merge | YES |
| No deploy | YES |
| No mini-program upload | YES |
| No production migration | YES |

New commits listed in the agent reply after commit.

## 13. Remaining External Work

- CloudBase **api** 云函数部署（notifications + pre-accept chat + capabilities）
- CloudBase **agent-graph** 云函数部署（canonical overlap / privacy payload）
- 真实微信 Template ID
- 体验版上传
- 真机验收
- 生产 migration approval（本轮无 schema migration 文件需要上生产）

本轮能在代码层完成的状态机、权限、Graph 边界、Fixture、诊断文案均已修，不留到 Remaining Work。
