# Date Venue AI Clarification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许用户以“区域 + 活动/餐饮类型”发起第一次约会邀请，由 AI 继续澄清具体场地，同时禁止未明确场地的草案进入最终确认。

**Architecture:** 后端以确定性 `venueResolution()` 将自由文本拆为 `area_hint`、`activity_detail`、`activity_venue` 和 `status`；LangGraph/LLM 只生成修改预览，不能绕过确认与版本状态机。初始邀请允许 `needs_specific_venue`，直接接受和最终 proposal 仍要求 `resolved`。

**Tech Stack:** WeChat Mini Program、CloudBase Node.js 16 云函数、CommonJS、自包含 Node selfcheck、现有 LangGraph `date_coordinator` 桥接。

**Spec:** `docs/superpowers/specs/2026-09-03-date-venue-ai-qa-pair-reset-design.md`

## Global Constraints

- “大运中心”只能作为区域提示，“椰子鸡”只能作为活动细节；二者都不得产生 `SERVER_ERROR`。
- 初始邀请可以处于 `needs_specific_venue`，最终候选方案必须有明确 `activity_venue`。
- AI 不能直接写数据库；修改必须经过结构化预览、用户确认、版本校验和白名单服务。
- 不向模型发送手机号、OpenID、精确住址、单位、联系方式或凭据。
- 不自动启用 CLS，不修改运行时、权限、触发器或计费配置。

---

### Task 1: 场地语义分类合同

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/meetingPlanPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/lib/publicErrorCodes.js`
- Test: `server/selfcheck/meeting-plan-coordination.js`

**Interfaces:**
- Produces: `venueResolution(activity: string, input: string): { status, area_hint, activity_detail, activity_venue, missing_fields }`
- Produces: `planReadiness(input).venue_resolution`

- [ ] **Step 1: 写失败测试**

```js
assert.deepStrictEqual(venueResolution('吃饭', '大运中心'), {
  status: 'needs_specific_venue', area_hint: '大运中心', activity_detail: '吃饭',
  activity_venue: '', missing_fields: ['activity_venue']
})
assert.strictEqual(venueResolution('吃饭', '椰子鸡').activity_detail, '椰子鸡')
assert.strictEqual(venueResolution('电影', '深圳仁恒梦中心英皇电影城').status, 'resolved')
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/meeting-plan-coordination.js`
Expected: FAIL，提示 `venueResolution is not a function`。

- [ ] **Step 3: 实现最小确定性分类器**

```js
function venueResolution(activity, input) {
  const value = text(input, 80)
  const cuisine = /椰子鸡|火锅|烤肉|烧烤|粤菜|川菜|湘菜|日料|西餐|披萨|牛排|茶饮|咖啡$/
  const concrete = /(?:店|餐厅|饭店|餐馆|影城|影院|电影院|美术馆|博物馆|桌游馆)$/
  if (!value) return { status: 'needs_specific_venue', area_hint: '', activity_detail: text(activity, 20), activity_venue: '', missing_fields: ['activity_venue'] }
  if (concrete.test(value)) return { status: 'resolved', area_hint: '', activity_detail: text(activity, 20), activity_venue: value, missing_fields: [] }
  if (cuisine.test(value)) return { status: 'needs_specific_venue', area_hint: '', activity_detail: value, activity_venue: '', missing_fields: ['activity_venue'] }
  return { status: 'needs_specific_venue', area_hint: value, activity_detail: text(activity, 20), activity_venue: '', missing_fields: ['activity_venue'] }
}
```

将 `planReadiness()` 的 `ready` 改为要求 `venue_resolution.status === 'resolved'`；保留活动与具体场地冲突检查。

- [ ] **Step 4: 运行专项测试**

Run: `node server/selfcheck/meeting-plan-coordination.js`
Expected: PASS，三种语义均被正确分类。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/cloudfunctions/api/lib/meetingPlanPolicy.js miniprogram/cloudfunctions/api/lib/publicErrorCodes.js server/selfcheck/meeting-plan-coordination.js
git commit -m "feat(date): classify incomplete venue intent"
```

### Task 2: 初始邀请与最终方案分离

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/lib/invitationCoordination.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- Test: `server/selfcheck/first-date-invitation-coordination.js`
- Test: `server/selfcheck/date-coordination-policy.js`

**Interfaces:**
- Consumes: `venueResolution()` 和 `planReadiness().venue_resolution`
- Produces: application fields `venue_resolution`, `area_hint`, `activity_detail`, `activity_venue`
- Produces: invitation card fields `venue_status`, `venue_guidance`, `final_ready`

- [ ] **Step 1: 写失败测试**

```js
const draft = normalizeApplication(Object.assign(validInput(), { activities: ['吃饭'], activity_venue: '大运中心' }), NOW)
assert.strictEqual(draft.venue_resolution.status, 'needs_specific_venue')
assert.doesNotThrow(() => resolvePrimaryInvitationProposal({ invitation_primary_proposal: primary(draft) }, draft, IDS))
assert.strictEqual(buildInvitationCard(primary(draft), 1, IDS).final_ready, false)
assert.throws(() => acceptDirectIncompleteVenue(), /具体门店/)
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/first-date-invitation-coordination.js && node server/selfcheck/date-coordination-policy.js`
Expected: FAIL，当前 `normalizeApplication()` 将“大运中心 + 吃饭”视为冲突或不完整 primary。

- [ ] **Step 3: 实现双阶段合同**

```js
const resolution = venueResolution(normalized.activities[0], meetingPlan.activity_venue)
Object.assign(normalized, {
  contract_version: PLAN_CONTRACT_VERSION,
  start_time: meetingPlan.start_time,
  activity_venue: resolution.activity_venue,
  area_hint: resolution.area_hint,
  activity_detail: resolution.activity_detail,
  venue_resolution: resolution
})
```

`resolvePrimaryInvitationProposal()` 允许 primary 具有完整日期、时间段、区域、活动、预算、费用和时长但 `final_ready=false`；`respondInvitation(decision='accept')` 对 `final_ready=false` 返回 `DATE_VENUE_NEEDS_CLARIFICATION`，而 `coordinate` 仍可进入 AI 协调。

- [ ] **Step 4: 运行专项测试**

Run: `npm --prefix server run selfcheck:date-qa-reset && npm --prefix server run selfcheck:langgraph`
Expected: PASS；旧完整门店流程不回归，待完善邀请无法直接 ARRANGED。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy.js miniprogram/cloudfunctions/api/lib/invitationCoordination.js miniprogram/cloudfunctions/api/handlers/dateCoordination.js server/selfcheck/first-date-invitation-coordination.js server/selfcheck/date-coordination-policy.js
git commit -m "feat(date): separate invitation draft from final venue"
```

### Task 3: AI 协调上下文和修改预览

**Files:**
- Modify: `miniprogram/cloudfunctions/api/handlers/agent.js`
- Modify: `miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/agent/langgraphClient.js`
- Test: `server/selfcheck/agent-chat.js`
- Test: `server/selfcheck/date-application-patch.js`
- Test: `server/selfcheck/langgraph-client.js`

**Interfaces:**
- Consumes: current application `venue_resolution`
- Produces: redacted graph payload `venueStatus`, `areaHint`, `activityDetail`, `missingFields`
- Produces: confirmed patch fields `area_hint`, `activity_detail`, `activity_venue`, `venue_resolution`

- [ ] **Step 1: 写失败测试**

```js
assert.deepStrictEqual(graphPayload.partyAState.missingFields, ['activity_venue'])
assert(!JSON.stringify(graphPayload).includes('openid'))
assert.strictEqual(preview.after.venue_resolution.status, 'resolved')
assert.strictEqual(storedVersion, previousVersion + 1)
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/agent-chat.js && node server/selfcheck/date-application-patch.js && node server/selfcheck/langgraph-client.js`
Expected: FAIL，当前 payload 与 patch 不携带场地澄清状态。

- [ ] **Step 3: 实现脱敏上下文和确认门禁**

```js
venue: {
  status: app.venue_resolution && app.venue_resolution.status,
  areaHint: app.area_hint || '',
  activityDetail: app.activity_detail || '',
  missingFields: app.venue_resolution && app.venue_resolution.missing_fields || []
}
```

AI 回复模板必须说明“已记录大致区域/活动，具体门店待确认”；模型输出只进入 patch preview，调用既有 confirm 后才写新版本。

- [ ] **Step 4: 运行专项测试**

Run: `npm --prefix server run selfcheck:agent && npm --prefix server run selfcheck:langgraph`
Expected: PASS，隐私断言、旧版本失效和确认后写入均通过。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/cloudfunctions/api/handlers/agent.js miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy.js miniprogram/cloudfunctions/api/agent/langgraphClient.js server/selfcheck/agent-chat.js server/selfcheck/date-application-patch.js server/selfcheck/langgraph-client.js
git commit -m "feat(agent): clarify unresolved date venues"
```

### Task 4: 小程序澄清卡和提交体验

**Files:**
- Modify: `miniprogram/pages/date-coordination/date-coordination.js`
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxml`
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxss`
- Test: `server/selfcheck/date-coordination-review-followups.js`
- Test: `server/selfcheck/product-experience-pages.js`

**Interfaces:**
- Consumes: invitation/application `venue_resolution`
- Produces: page data `venueClarificationCard` and dynamic submit label

- [ ] **Step 1: 写失败 UI 合同测试**

```js
assert(wxml.includes('venueClarificationCard'))
assert(wxml.includes('发送邀请并继续完善'))
assert(!js.includes("活动场地是“"))
assert(wxss.includes('.venue-clarification-card'))
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node server/selfcheck/date-coordination-review-followups.js && node server/selfcheck/product-experience-pages.js`
Expected: FAIL，页面仍硬拦截非电影院/非餐厅文本。

- [ ] **Step 3: 实现 UI**

删除客户端正则硬拦截；将“活动场地”改为“想去哪里 / 吃什么”。输入待完善时在表单顶部展示：已理解区域、活动类型、缺失“具体门店”，按钮显示“发送邀请并继续完善”；服务端返回业务错误时使用明确文案而非 `SERVER_ERROR`。

- [ ] **Step 4: 运行 UI 与语法验证**

Run: `node server/selfcheck/miniprogram-source-syntax.js && node server/selfcheck/date-coordination-review-followups.js && node server/selfcheck/product-experience-pages.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add miniprogram/pages/date-coordination server/selfcheck/date-coordination-review-followups.js server/selfcheck/product-experience-pages.js
git commit -m "feat(miniprogram): guide incomplete date venues"
```

### Task 5: 回归、发布记录与 API 部署

**Files:**
- Modify: `project-docs/DEVELOPMENT_LOG.md`
- Create: `project-docs/WORK_REPORT_2026-09-03_DATE_VENUE_CLARIFICATION.md`

**Interfaces:**
- Produces: 可审计的源提交、验证矩阵和回滚提交号

- [ ] **Step 1: 运行完整基线**

Run: `npm --prefix server run selfcheck:agent; npm --prefix server run selfcheck:safety; npm --prefix server run selfcheck:ai-report; npm --prefix server run selfcheck:cloudpay; npm --prefix server run selfcheck:member; npm --prefix server run selfcheck:cloud-match`
Expected: 六组均 PASS。

- [ ] **Step 2: 检查差异和敏感信息**

Run: `git diff --check; git status --short; git diff --stat HEAD~4..HEAD`
Expected: 无空白错误；仅本计划文件。

- [ ] **Step 3: 写发布报告并提交**

报告必须记录分支、完整 SHA、测试命令、目标环境、`api` 是否变更、`agent-graph` 是否变更、客户端尚未上传事实和回滚 SHA。

```powershell
git add project-docs/DEVELOPMENT_LOG.md project-docs/WORK_REPORT_2026-09-03_DATE_VENUE_CLARIFICATION.md
git commit -m "docs: record date venue clarification release"
```

- [ ] **Step 4: 从干净提交归档部署**

Run: 从 release SHA 建立不含 `node_modules` 的干净 staging，在 staging 的 `miniprogram/cloudfunctions/api` 目录执行 `tcb fn code update api -e cloud1-d4gy8l52g08bba326 --deployMode cos`。
Expected: `api` 状态恢复 `Active`；不修改环境变量、运行时或日志服务。仅当 `agent-graph` 源码确有 diff 时才部署该函数。

- [ ] **Step 5: 部署后只读验证**

Run: `tcb fn detail api --envId cloud1-d4gy8l52g08bba326`
Expected: 函数 Active，并以体验版验证“大运中心 + 椰子鸡”进入待完善而非 500。
