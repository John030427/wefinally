# WeFinally Date Coordination Review Fix Round

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `34ee3ec59de11c54adbbc668de6badb3118e9234` |
| Remote HEAD (start) | `34ee3ec59de11c54adbbc668de6badb3118e9234`（与本地一致） |
| Dirty files（任务开始前，未改动） | `miniprogram/project.config.json`；`server/public/partner/index.html`；`server/selfcheck/cloudbase-partner-connection.js`；`server/selfcheck/customer-service-browser-fixture.js`；`?? .cursor/`；`?? config/`；`?? project.config.json`；`?? project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md`；`?? server/selfcheck/customer-service-browser-host.js`；`?? specs/2026-08-12-partner-gated-launch/` |

## 2. Review Findings

| Finding | Severity | Fix |
|---|---|---|
| Direct accept implicit first option（`availability[0]` / `areas[0]` / …） | P0 | Preference 与 Primary Invitation Proposal 拆分；Direct Accept 只接受完整 primary |
| Payment perspective bug（`self_pays` / `partner_pays` 共享） | P0 | Shared proposal 使用中性 `payment_mode` + `payer_user_id` |
| Missing strict invitation_version | P0 | accept 缺 version → `INVALID_INVITATION_VERSION`；不再默认服务器版本 |
| Direct accept concurrency | P0 | `commitDirectInvitationAccept` 事务 / CAS + 稳定 proposal key |
| Pre-accept round consumption | P1 | `INVITING_PARTNER` 下 patch 不增加 `recoordination_count` |
| Date formatting | P2 | 统一 `formatDatePeriod` → `8月22日（周六）下午`；Proposal Card 不再重复 period |
| LangGraph mock-vs-live | P2 | mock 明确为 Graph Contract Test；Live smoke 单独标记 |

## 3. Primary Invitation Proposal

- **Preference**：多值可调范围（多日期 / 多区域 / 多活动等），仍存 `invitation_proposal` + application。
- **Primary Invitation Proposal**：单值明确建议，存 `invitation_primary_proposal`：

```json
{
  "date": "2026-08-22",
  "period": "afternoon",
  "area": "南山",
  "activity": "咖啡",
  "budget": "100-200",
  "duration": "1-2h",
  "payment_mode": "aa",
  "payer_user_id": 0
}
```

- 每个维度仅一个 Preference 时可自动推导 primary。
- 多选时 A 必须在 UI「本次建议安排」中显式选择；否则 `PRIMARY_PROPOSAL_REQUIRED`。
- 旧 coordination 无 primary：禁止 unsafe Direct Accept（`PRIMARY_PROPOSAL_INCOMPLETE`），可走 AI 协调或等发起方更新。

## 4. Direct Accept

1. B 提交 `decision=accept` + **mandatory** `invitation_version`
2. Backend 校验 primary 完整
3. 构造 `proposal_key = direct:{coordination_id}:v{invitation_version}`
4. `commitDirectInvitationAccept`（生产事务；自检内存 CAS）
5. 写入稳定 proposal + A/B confirmations
6. CAS 更新：`status=arranged`，`accepted_base_invitation_version`，`final_proposal_id`
7. Final proposal **完全等于** B 看到的 Primary

## 5. Concurrency

- **CAS**：事务内二次 reload，要求仍为 `inviting_partner` 且 `invitation_version` 未变且未回应。
- **Stale**：`STALE_INVITATION_VERSION` + `refresh_invitation=true`。
- **Idempotent**：同一 coordination/version 再次 accept → 返回当前 arranged detail，不重复 event / notification / proposal。
- Race：A 升 version 与 B accept v1 不能同时成功。

## 6. Payment

| Layer | 语义 |
|---|---|
| Personal preference | `aa` / `self_pays` / `partner_pays` / `flexible`（用户视角） |
| Shared proposal | `payment_mode`: `aa` \| `flexible` \| `single_payer` + `payer_user_id` |

映射：A `self_pays` → payer=A；A `partner_pays` → payer=B。卡片文案对 A/B 一致（「本次由发起方请客」/「本次由受邀方请客」/「AA」），禁止双边都显示「对方请客」。

## 7. Coordination Versions

| Field | Meaning |
|---|---|
| `coordination_version` | Patch CAS / 申请快照版本，可在邀请阶段 +1 |
| `invitation_version` | 邀请方案版本；Direct Accept 必须匹配 |
| `preference_version` | 单方 preference 版本 |
| `recoordination_count` | 真实协商轮次；**仅双方已参与后的 replan 才 +1**；pre-accept 邀请编辑保持不变 |

## 8. State Machine

未改变：

```
INVITING_PARTNER
├ direct accept → ARRANGED
├ coordinate → COLLECTING_PREFERENCES
├ decline → INVITATION_DECLINED
└ timeout → EXPIRED
```

No Response ≠ Decline。

## 9. UI

- Invitation Card：时间 / 区域 / 活动 / 预算 / **费用方式** / 时长；可有「对方还有其他可调整范围」。
- Shared Coordination Card：中性费用事实。
- Proposal / Result Card：`time_text` 单源，含费用方式；不再拼接 `period` 英文。
- A 表单：多选 Preference 时显示「本次建议安排」单选。
- Direct Accept 按钮：仅 `primary_complete` 时显示。

## 10. LangGraph

| Test | Result |
|---|---|
| Graph Contract Test（mock `invokeGraphFunction`，原 TEST 18） | PASS |
| Graph Privacy（TEST 17 / 43） | PASS |
| Live CloudBase Graph Smoke（真实 api→agent-graph→checkpoint） | **MANUAL_REQUIRED**（未用正式用户跑 fixture NL；不伪造 PASS） |
| Live Patch Preview | **LIVE_PATCH_MANUAL_REQUIRED** |

agent-graph 本轮未改 runtime 源码，未重新部署；health 仍 `ok` / `langgraph`。

## 11. Tests

新增 / 覆盖：TEST 25–44（`server/selfcheck/first-date-invitation-coordination.js`）。

Regression：

```text
npm --prefix server run selfcheck:agent          PASS
npm --prefix server run selfcheck:langgraph      PASS
npm --prefix server run selfcheck:synthetic-coordination PASS
npm --prefix server run selfcheck:ai-profile-bilateral PASS
npm --prefix server run selfcheck:cloud-match    PASS
npm --prefix server run selfcheck:member         PASS
npm --prefix server run selfcheck:ai-report      PASS
npm --prefix server run selfcheck:safety         PASS
node server/selfcheck/first-date-invitation-coordination.js PASS
node server/selfcheck/date-coordination-logic-audit.js PASS
```

## 12. CloudBase

| Item | Value |
|---|---|
| Environment | `cloud1-d4gy8l52g08bba326` |
| Deployment method | **Official tcb CLI**（本会话无 CloudBase MCP） |
| api before | 上一轮 Active；contract v3 |
| api after | code update SUCCESS；`date_coordination_contract_version: 4`；capabilities 含 `invitation_primary_proposal` / `direct_accept_cas` / `neutral_payment_proposal`；Runtime 仍 Nodejs16.13；`LANGGRAPH_ENABLED` 等 env 保留 |
| agent-graph before/after | 未改代码，未重新部署；health PASS |

**Deploy note：** `tcb fn code update --dir <path>` 在 CLI 3.7.3 下会把 `functionPath='.'` 解析为 `process.cwd()`，导致从仓库根目录「假成功」上传。正确做法：在函数目录（或无 node_modules 的干净副本）内执行 `tcb fn code update api`。

Smoke：

| Check | Result |
|---|---|
| api ping | PASS pong |
| GET /api/common/config | PASS contract **4** + 新 capabilities |
| agent-graph health | PASS `{status:ok,runtime:langgraph}` |

## 13. Database

| Item | Value |
|---|---|
| Migration | **NO** |
| Additive fields | `invitation_primary_proposal`；proposal 上 `payment_mode` / `payer_user_id` |
| Destructive | 无 |

## 14. Git

| Item | Value |
|---|---|
| Start HEAD | `34ee3ec59de11c54adbbc668de6badb3118e9234` |
| Final HEAD | `74c1b95d0b1082c1550b742395ebdc3df2c8a552` |
| Remote HEAD | `74c1b95d0b1082c1550b742395ebdc3df2c8a552` |
| Commits | `74c1b95` fix(date): make direct invitation acceptance deterministic |
| Push status | Pushed to `origin/feature/ai-profile-bilateral-coordination` |
| Merge main | NO |
| Force push | NO |

用户 dirty files 仍保留未提交（partner / project.config / .cursor / specs 等）。

## 15. Manual Verification

请在微信开发者工具检查：

1. A 多选 Preference + 明确 Primary Proposal  
2. B Direct Accept（费用方式可见）  
3. B AI Coordinate（无需重填全表）  
4. A edit vs B accept stale  
5. No Response / Decline  
6. Final Payment / Final Date 展示一致  

## 16. Remaining External Work

- 真实 CloudBase LangGraph / NL Patch live smoke（internal QA + synthetic fixture）  
- 微信开发者工具视觉验收  
- 微信订阅消息 Template ID（如仍缺）  
- 体验版上传（需另授权）  
