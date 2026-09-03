# WeFinally 第一次约会邀请 / AI协调改造报告

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `3d481ebc3a77cc1176ec572ff7157e0424f631dc` |
| Upstream at start | `origin/feature/ai-profile-bilateral-coordination` @ `3d481ebc3a77cc1176ec572ff7157e0424f631dc` |
| Dirty files at start (user-owned, not committed) | `miniprogram/project.config.json`, `server/public/partner/index.html`, `server/selfcheck/cloudbase-partner-connection.js`, `server/selfcheck/customer-service-browser-fixture.js`, `.cursor/`, `config/`, `project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md`, `project.config.json`, `server/selfcheck/customer-service-browser-host.js`, `specs/2026-08-12-partner-gated-launch/` |

未 reset / clean / restore / stash 用户文件。未 merge `main`。未 force push。

## 2. Product Model

最终产品不是「双方各填一张完整约会申请，再让机器比两张表」。

A Invitation Proposal：A 填写可约时间、区域、活动、预算、费用方式、时长、交通限制、其他要求后提交。生成真实 `coordination_id`，写入 `invitation_proposal` / `invitation_version`。语义是「A 愿意按当前建议方案参加」，状态进入 `INVITING_PARTNER`，不是立刻 `ARRANGED`。

B Direct Accept：B 看完 Invitation Card 后点「接受这个安排」。不需要再填完整表。校验 `invitation_version`；一致则生成 `source=direct_accept` 的 backend proposal，A 对该版本的发出视为同意，B 的点击视为确认，直接 `ARRANGED`。

B AI Coordinate：B 点「和 AI 协调其他安排」。愿意继续这次第一次约会，但不接受当前完整方案。进入 `COLLECTING_PREFERENCES` + `invitee_intent=coordinate`。不把 A 整份 preference 永久复制成 B 明确填写。B 可以只 override 冲突维度，也可以完整提交自己的 Preference。

B Decline：主文案是「这次暂不方便」，不是「拒绝」。deterministic `INVITATION_DECLINED`。A 只看到「对方暂未接受本次约会邀请。」，不展示 B raw reason。

B No Response：NO RESPONSE ≠ DECLINE。B 不操作时保持 `INVITING_PARTNER`。A 看到「正在等待对方回应」。deadline 后 `EXPIRED`，文案是「本次约会邀请暂未得到回应，协调已结束。」，不会说「对方拒绝了你」。

B 接受邀请但还没提供调整：A 看到「对方已接受约会邀请，目前正在补充自己的安排。」Worker 不会替 B 编条件（`accept_no_prefs`）。

## 3. UI Architecture

事实 → Card。沟通 → AI。

同一页面 `pages/date-coordination/date-coordination`，按 status / role / preference / proposal / confirmation 渲染。不另做 A/B/Fixture/Real 四套 UI。Chat 继续复用 `pages/chat/chat`（`agentType=date_coordinator&coordinationId=`）。

Invitation Card：时间、区域、活动、预算、时长，来自 backend `invitation_proposal`。

Coordination Card：共同时间 / 活动 / 区域 / 预算等 agreed vs conflict。冲突只写「还没有找到双方都接受的位置」，不把对方未同意的具体值泄露给另一边。

Proposal Card：来自 backend proposal（direct_accept 或 worker 计算），不是聊天文本。

Result Card：arranged / declined / expired。

ViewModel 字段：`role`、`status`、`invitation_card`、`shared_coordination_card`、`proposal_card`、`show_coordinator_cta`、`show_accept_invitation`、`show_coordinate_instead`、`show_decline`、`show_confirm_proposal`、`read_only`。

覆盖 STATE 1–7：draft 表单 → A waiting Invitation Card + AI CTA → B 收到三按钮 → active coordination Shared Card → proposal confirm → arranged Final Card → declined/expired Result Card。

## 4. State Machine

```
A submit
↓
INVITING_PARTNER
├─ A AI edit → INVITING_PARTNER（invitation_version +1）
├─ B direct accept（current version）→ ARRANGED
├─ B coordinate → COLLECTING_PREFERENCES（active bilateral）
├─ B decline → INVITATION_DECLINED
└─ no response → 保持 waiting；deadline → EXPIRED

ACTIVE COORDINATION
↓
Shared State（A Preference Version N + B Preference / Overrides Version M，互不覆盖）
↓
Proposal（backend）
↓
A confirm  → 你已确认，正在等待对方（not arranged）
↓
B confirm  → ARRANGED
```

Stale protection：B 打开页时 `invitation_version = 3`，A 之后改到 4，B 再用 3 接受 → `STALE_INVITATION_VERSION`：「对方刚刚更新了约会安排，请查看最新方案后再确认。」并刷新 Invitation Card。

## 5. Permission Matrix

| Status | A chat | B chat | Patch | Accept | Decline | Confirm | Recoordinate |
|---|---|---|---|---|---|---|---|
| collecting_initiator | A 可 | 否 | 仅 A | 否 | 否 | 否 | 否 |
| inviting_partner | A 可写 | 否（先选三按钮） | 仅 A 自己 preference；状态仍 inviting | 仅 B | 仅 B | 否 | 否 |
| collecting_preferences | 可 | 可（即使 B 尚未填表） | 双方自己的 | 否 | 否 | 否 | 否 |
| computing / no_overlap / replanning | 可 | 可 | 可 | 否 | 否 | 否 | no_overlap / replanning |
| waiting_confirmations | 可 | 可 | 可（会作废当前方案） | 否 | 否 | 双方分别确认 | 否 |
| arranged | 只读解释 | 只读解释 | 否 | 否 | 否 | 幂等已确认 | 否 |
| invitation_declined | 只读解释 | 只读解释 | 否 | 否 | 否 | 否 | 否 |
| expired | 只读解释 | 只读解释 | 否 | 否 | 否 | 否 | 否 |
| cancelled / closed / manual_handoff | 按 terminal 守卫 | 按 terminal 守卫 | 否 | 否 | 否 | 否 | 否 |

## 6. Data Model

Invitation Proposal：`date_coordination.invitation_proposal` 公开快照（availability / areas / activities / budget / payment / duration）。不含 share_message、other_requirements 私有字段。

A Preference：`date_coordination_application`（initiator）。`preference_version` 独立递增。A 发出当前建议视为对该 invitation version 同意（`initiator_agreed_invitation_version`）。

B Preference / Overrides：B 完整表 → `application_source=invitee_full_form` + 全字段 `explicit`。B 只改局部 → merge invitation + overrides，`preference_evidence` 区分 `explicit` / `inherited`，`accepted_base_invitation_version` 记录基于哪一版邀请。不把 A 整表永久当成 B 明确填写。

Shared State：`buildSharedCoordinationState` 用 deterministic `computeOverlap`。双方都有 application 才 `ready`。

Proposal：`date_coordination_proposal`。direct accept 的 `source=direct_accept`；AI 多轮后的 `source=backend`。

Confirmation：direct accept 写入 A implicit + B confirm 后 ARRANGED。AI 新 proposal 必须 A confirm + B confirm。

Version：`coordination_version` 管 overlap/proposal 轮次；`invitation_version` 管邀请方案 stale check；每方 `preference_version` 独立。

## 7. LangGraph

AI 负责：理解自然语言、长期会话、下一步协调策略、Patch preview、解释 shared state、resume summary。已经一致的维度不再追问「你什么时候有空」。

Backend 负责：invitation、preference、version、stale check、overlap、proposal、confirmation、status、permission、notification、privacy。Graph checkpoint 不是第二套业务库。

模型收到的 safe context：当前用户 `ownPreference` + safe shared state + partner progress / invitation card 公开字段。A Graph payload 没有 B raw preference / raw chat / private requirements。B 同理。

## 8. Privacy

B raw input 不能给 A。A raw input 不能给 B。

`buildDateCoordinationGraphInput` 对侧 `party*State.regions` 为空。shared conflict 文案不暴露对方具体区域。Declined 不回传 B reason。站内通知只用安全摘要。

## 9. Fixture

| Journey | AUTO | MANUAL_STEP |
|---|---|---|
| B_ACCEPT_DIRECT (`accept_direct`，alias `accept`) | A 提交后真实 `respondInvitation(accept)` → ARRANGED，B 不填表 | 停在 WAITING_B，QA `advance-synthetic` 推进 |
| B_COORDINATE (`coordinate`) | coordinate + 再提交冲突偏好，进入 shared state / AI | 可停在 WAITING_B / B_COORDINATING |
| B_DECLINE (`decline`，alias `reject`) | 真实 decline + 站内通知 | 可停在 WAITING_B 再推进 |
| B_NO_RESPONSE (`no_response`) | 不推进，保持 waiting，到期 EXPIRED | 稳定停留 |
| B_ACCEPT_NO_PREFS (`accept_no_prefs`) | 只 coordinate，Worker 不编 B 条件 | 停在 B 已参与、等待 clarification |

生产用户看不到 QA 分步按钮。Admin A/B fixture 下拉里可选上述旅程与 `auto` / `manual_step`。

## 10. Tests

| Command | Result |
|---|---|
| `node server/selfcheck/first-date-invitation-coordination.js` (TEST 01–24) | PASS |
| `npm --prefix server run selfcheck:agent` | PASS |
| `npm --prefix server run selfcheck:langgraph` | PASS（含 LANGGRAPH_ENABLED=true provider=langgraph） |
| `npm --prefix server run selfcheck:synthetic-coordination` | PASS |
| `npm --prefix server run selfcheck:ai-profile-bilateral` | PASS |
| `npm --prefix server run selfcheck:cloud-match` | PASS |
| `npm --prefix server run selfcheck:member` | PASS |
| `npm --prefix server run selfcheck:ai-report` | PASS |
| `npm --prefix server run selfcheck:safety` | PASS |
| `npm --prefix miniprogram/cloudfunctions/agent-graph run check` | PASS（build + 37 tests） |

无新增 regression。未跑完整 `npm --prefix server run selfcheck` 全量（成本：已覆盖用户点名的相关套件）。

## 11. CloudBase Deployment

Environment ID：`cloud1-d4gy8l52g08bba326`（`tcb env list` 唯一 NORMAL 环境）。

本会话 Cursor MCP catalog 只有 `cursor-app-control` / `cursor-ide-browser`，官方 CloudBase MCP 未挂到此 agent。按用户授权改用已登录的官方 CloudBase CLI `tcb` 审计并做 **code-only** 更新（`tcb fn code update`），不改环境变量、不跑 migration、不上传小程序。

| Function | Before | After | Status |
|---|---|---|---|
| api | 2026-08-15 15:37:13，Active，Nodejs16.13，timeout 60，31 env keys（含 `LANGGRAPH_ENABLED`） | 2026-08-19 03:03:43，Active/Available，env keys 仍 31 | SUCCESS |
| agent-graph | 2026-08-15 16:06:46，Active，Nodejs20.19，timeout 60，3 env keys（含 `DEEPSEEK_API_KEY`） | 2026-08-19 03:03:34，Active/Available，env keys 仍 3 | SUCCESS |

HTTP：`/api` → api；`/wxpay/notify` → api。未改网关。

Smoke Tests：

| Check | Result |
|---|---|
| `api` `{action:ping}` | PASS `pong` / env `cloud1-d4gy8l52g08bba326` |
| `GET /api/common/config` | PASS `date_coordination_contract_version: 3`，`first_date_invitation` / `invitation_direct_accept` / `invitation_coordinate` |
| `GET /api/common/health` | PASS |
| `GET /api/notifications/unread` | PASS 契约存在；无微信上下文返回 401（未用真实用户约真实约会） |
| `GET /api/date-coordinations/1` | PASS 契约存在；401 登录过期 |
| `POST /api/agent/sessions` | PASS 契约存在；401 登录过期 |
| `agent-graph` `{operation:health}` | PASS `{status:ok, runtime:langgraph}` |

## 12. Database

Migration Required: NO

Executed: NO

本轮只在现有 `date_coordination` / application / proposal / confirmation / notification 文档上 additive 写入字段（`invitation_proposal`、`invitation_version`、`invitee_intent`、`preference_evidence`、`accepted_base_invitation_version` 等）。无 DROP、无 DELETE production records、无新 collection 强制迁移。

## 13. Git

| Item | Value |
|---|---|
| Start HEAD | `3d481ebc3a77cc1176ec572ff7157e0424f631dc` |
| Commits | `46e4e83` feat(date): simplify invitation accept and AI coordination flow；`b941c60` feat(date-ui): add invitation, coordination, and proposal cards；`7c6399b` feat(fixture): cover accept, coordinate, decline, and no-response journeys；`cd8db31` docs: add first-date invitation AI coordination product report |
| Final HEAD | `cd8db31659813092a68a044dcfb386cd94cda57c` |
| Remote HEAD | push 后与 Final HEAD 对齐 |
| Push | SUCCESS（见收尾） |

未纳入用户 dirty files。

## 14. Manual WeChat Verification

pending_manual_visual_verification

请用微信开发者工具重新编译后手测：

1. A→B direct accept（Invitation Card → 接受这个安排 → ARRANGED）
2. A→B coordinate（和 AI 协调 → 局部改区域 → Shared Card → proposal 双确认）
3. A→B no response（A 一直看到等待；不要出现「拒绝」）
4. A→B decline（这次暂不方便 → A 站内通知 / 记录 Tab 红点）

## 15. Remaining External Work

- 微信订阅消息 Template ID 仍未配置时，站内通知可用；配置后 invitation_created / invitation_accepted / proposal_generated / arranged 才会走微信
- 微信开发者工具人工验收（上一节）
- 正式体验版上传：本轮未做，需用户另行授权
