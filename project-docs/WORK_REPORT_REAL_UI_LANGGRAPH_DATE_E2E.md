# WeFinally 真实 UI / LangGraph 约会协调 E2E 修复报告

## 1. Baseline

| 项 | 值 |
|---|---|
| Branch | `feature/ai-profile-bilateral-coordination` |
| Start HEAD | `24de5a9` |
| Dirty files (保留、未提交) | `server/public/partner/index.html`；`server/selfcheck/cloudbase-partner-connection.js`；`server/selfcheck/customer-service-browser-fixture.js`；`server/selfcheck/customer-service-browser-host.js`；`project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md`；`specs/2026-08-12-partner-gated-launch/` |

## 2. Root Cause

先前 fixture 自检可以 PASS，但微信开发者工具里仍看到「虚拟体验对象 / AI 排队 / 刷新协调进度」，根因是 **UI 与业务路径分叉**：

1. **Match Detail**：同一套 `match-detail.wxml`，但 fixture 曾插入大面积「虚拟体验对象」文案，并用 `fixtureSimulation=1` 进入测试专用约会路径。
2. **Date Coordination `create()`**：对 synthetic partner 优先走 `test_simulation + await_application`，**从不创建** `date_coordination` 行 → 没有真实 `coordinationId`。
3. **客户端**：无 `coordinationId` 时渲染 `fixture-simulation` 排队 UI；`goCoordinator` 因空 ID 无法进入真实 `date_coordinator`。
4. **Synthetic B**：只有 polite_decline 队列任务，没有通过真实 `respondInvitation` / `confirmProposal` 的 ACCEPT 旅程。

结论：fixture 测试文件验证的是「模拟婉拒队列」，不是「真实产品 Match → Date → LangGraph」主路径。

## 3. UI Before / After

| 页面 | Before | After |
|---|---|---|
| Match Detail | 「虚拟体验对象」大卡片 + 测试专用导航 | 与生产相同的报告结构 + CTA「申请约会」；仅右上角弱「测试数据」badge |
| Date Coordination | `fixture-simulation`：排队 / 刷新 | 真实状态机 UI；ACCEPT 后主 CTA「和 AI 约会协调员沟通」；REJECT 显示安全文案且无 AI CTA |
| Chat | 常因空 coordinationId 进不去 | `agentType=date_coordinator&coordinationId=<真实ID>` |
| 记录 Tab | 未读红点未稳定接线 | `GET /api/notifications/unread` → `wx.showTabBarRedDot` / badge |
| Notifications | 基础设施已有 | REJECT 写入 inbox「对方暂未接受本次约会邀请。」 |

## 4. Fixture Architecture

```
Synthetic Data (profile / prefs / fixture_journey)
        ↓
Same Match UI (match-detail)
        ↓
Same Coordination API (date_coordination create / invite / respond / patch / confirm)
        ↓
Same LangGraph Agent (date_coordinator + coordinationId thread)
        ↓
Same State Machine + Notifications
```

与真实产品的唯一差异：

- 数据带 `is_test_fixture` / `is_test_data` / `fixture_journey`
- synthetic partner 由 `advanceSyntheticPartner` **调用同一套 business handlers** 推进（禁止直接 UPDATE 业务结果）
- 生产用户不可匹配到 formal_match_hidden / expired fixture

`fixture_journey=legacy_queue` 仍保留旧排队模拟，仅作兼容，不再是默认主路径。

## 5. ACCEPT Scenario

```
A (internal_qa)
 → formal/ab match → B_ACCEPT (fixture_journey=accept)
 → Match Detail（真实 UI）
 → 申请约会 → create date_coordination (真实 id, is_test_data=1)
 → A 填写偏好并邀请
 → synthetic B: respondInvitation(accept) + 提交冲突偏好（周六下午/福田）
 → NO_OVERLAP
 → Chat date_coordinator：NL「周六下午也可以」→ patch preview → 确认 → version+1
 → 区域继续协调 → proposal
 → A confirm → 非 arranged
 → detail 刷新时 synthetic B: confirmProposal → arranged
```

## 6. REJECT Scenario

```
A → match B_REJECT
 → 申请约会 → invite
 → synthetic B: respondInvitation(decline)
 → status=invitation_declined
 → A inbox + unread
 → 公开文案：对方暂未接受本次约会邀请。
 → 禁止继续 patch / AI 协调 CTA
```

## 7. LangGraph

- Thread：按 `user + agentType + coordinationId` 持久化（既有实现）
- Private A/B：各会话私有；共享层只放 overlap / safe summary
- Resume：同 coordinationId 恢复同一 `agent_session`（E2E 断言）
- Patch：NL → tool preview → 用户确认后 business apply；确认前不写 preference
- Declined：`createSession` / `send` / patch preview 均拒绝继续协调

## 8. Deterministic State

LangGraph **不是** DB truth。下列由 business service 负责：

- invitation accept/decline
- preference / preference_version / coordination_version
- overlap recompute / proposal
- double confirmation → arranged
- inbox notifications

## 9. Concurrency

复用既有 preference_version + coordination_version + CAS/claim；stale notification 不因过期版本增加 unread（既有 bilateral E2E 覆盖）。

## 10. Notifications

- 记录 Tab：`match-list` `loadUnread` → redDot/badge
- 入口：「消息通知」→ `/pages/notifications`
- REJECT：`invitation_declined` inbox，公开安全文案
- 我的 Tab：新增「AI 对你的理解」→ 择偶配置页 `#ai-profile`

## 11. Privacy

| 内容 | 规则 |
|---|---|
| A raw chat | B 不可见 |
| B raw chat | A 不可见 |
| reject reason | A 只见安全摘要 |
| AI prompt | 不注入手机号/OpenID/精确住址等 |

## 12. E2E Tests

| 用例 | Command | Result |
|---|---|---|
| ACCEPT + NL PATCH + DOUBLE CONFIRM + PRIVACY + thread resume | `node selfcheck/real-ui-fixture-date-langgraph-e2e.js` | PASS |
| REJECT + unread + declined guard（含禁止进入 coordinator） | 同上 | PASS |
| B 接受车公庙走真实 patch confirm（无直接 UPDATE） | 同上 | PASS |
| Bilateral / concurrent / stale | `node selfcheck/synthetic-coordination-bilateral-e2e.js` | PASS |
| Legacy queue isolation | `node selfcheck/match-only-fixture-safety.js` | PASS |
| Legacy fixture-response | `node selfcheck/fixture-response-job.js` | PASS |

npm：`npm --prefix server run selfcheck:synthetic-coordination`

## 13. Manual Verification

`pending_manual_visual_verification`

本环境未调用微信开发者工具真机编译。建议手测：

1. 匹配 B_ACCEPT → 真实 Match Detail → 申请约会 → AI CTA → NL patch → 双确认  
2. 匹配 B_REJECT → 记录红点 → 安全婉拒文案 → 无 AI 协调

## 14. Git

| 项 | 值 |
|---|---|
| Start HEAD | `24de5a9` |
| New commits | `de5b699` fixture real services；`0e645e8` production UI；`8ab3453` Records badge；`9b21048` E2E；`d9ffc42`/`a4c28af` report + log |
| Final HEAD | `a4c28af` |
| Original dirty files | 已保留、未纳入本轮 commit |
| No push / merge / deploy / mini-program upload / production migration | 确认 |

## 15. External Blockers

- 微信订阅消息 Template ID（可选提醒）
- 真实微信订阅发送
- production migration approval（若需新字段落库）
- DevTools 真机视觉验收

不可再列为 blocker：fixture UI 未统一、AI CTA 无入口、E2E 未做——本轮已在代码中完成。
