# WeFinally 邀请、定时匹配与测试画像治理执行计划

你是 Cursor 中负责实现的工程代理。严格按本文件和关联规格执行；不得把历史对话、旧归档计划或猜测当作需求真源。

## 1. 唯一工作目录

第一条命令必须是：

```powershell
Set-Location 'D:\wefinal\.worktrees\wefinally-ai-agent'
(Get-Location).Path
```

实际开发只能发生在 `D:\wefinal\.worktrees\wefinally-ai-agent`。禁止在外层 `D:\wefinal` 修改文件。

## 2. 开始前必须完整阅读

1. `AGENTS.md`
2. `PROJECT_HANDOFF.md`
3. `CONTRIBUTING.md`
4. `project-docs/NEXT_THREAD_HANDOFF_2026-08-12_AI_MATCHING_PARTNER_DASHBOARD.md`
5. `specs/2026-08-14-invitation-match-testing-governance/requirements.md`
6. `specs/2026-08-14-invitation-match-testing-governance/design.md`
7. `specs/2026-08-14-invitation-match-testing-governance/tasks.md`
8. 本文件

不要从头扫描项目；只围绕规格列出的邀请、注册、匹配调度、测试身份、后台投影、Agent/约会边界和对应 selfcheck 做定点检查。

## 3. Git 与并发改动保护

开始后立即运行：

```powershell
git status --short --branch
git rev-parse --short HEAD
```

当前已知并发/用户改动至少包括：

```text
M server/public/partner/index.html
M server/selfcheck/cloudbase-partner-connection.js
M server/selfcheck/customer-service-browser-fixture.js
?? server/selfcheck/customer-service-browser-host.js
?? specs/2026-08-12-partner-gated-launch/
```

规则：

- 所有开始前存在或实施中并发出现的改动均归用户所有。
- 禁止 `reset`、`clean`、`checkout`、`restore`、覆盖、删除、搬移或顺手格式化用户文件。
- 如任务必须接触已有 dirty 文件，只能做 hunk 级审查和暂存；无法安全拆分时停止报告。
- 不 push、不 amend、不 rebase、不改写历史、不自动合并或删除分支。
- 每个实现批次只提交本批文件/hunk，并立即报告 commit hash。

## 4. 不可改变的产品决策

1. 合伙人公开邀请码可重复使用，可发送给多人；保留微信分享和复制功能。
2. 公开邀请码只做首次有效邀请归因，不授予合伙人角色。
3. 合伙人身份只来自后台认可名单、手机号核验和后台审核。普通用户暂不申请合伙人。
4. 当前用户不是 Grace。运行时不得把 Grace 当作当前用户/合伙人的默认姓名；缺失姓名显示“合伙人”。生产姓名修改等待用户给出正确姓名并单独确认。
5. 正式真人账号仍只能成功匹配一次；内部测试运行不得消耗正式 match claim。
6. `real_user/internal_qa` 是真人内部测试账号；`synthetic_fixture/matching` 是合成测试画像。二者不能混为“测试用户”。
7. 合成画像只对其所属 QA 账号可见，过期后不可匹配，永远禁止真实约会协调。
8. 真人对真人流程绝不自动拒绝。只有 QA 真人对自己的合成画像表达约会意愿时，才创建 2—6 小时的幂等测试拒绝任务。
9. “10 秒测试匹配”只是隔离的 UI/后端测试运行，不改系统时间、不运行正式批次、不删除正式记录。

## 5. 已知现状与首要诊断

- 公开邀请码当前已有多人归因基础，先写回归测试再调整文案，禁止重写整套邀请系统。
- 首页已有 `devStartMatch`/开发按钮，必须演进为 10 秒可恢复状态机，禁止另造重复入口。
- 本地 Node 有 Asia/Shanghai 周三/周五 cron。
- 仓库中目前只发现 CloudBase `report-worker` timer，没有正式 `match-worker` 配置。这是“周五没有自动匹配”的主要代码侧证据，但实现前仍须核对 CloudBase 现状与批次记录，不能无证据宣称唯一根因。
- 已有 test fixture/owner/expiry/date block 基础策略，必须兼容扩展，禁止推倒重写。

## 6. 严格执行顺序

按照 `tasks.md` 执行，不得跳批：

1. 保护现场、运行交接规定的六组基线 selfcheck、记录真实失败。
2. 公开邀请码语义、注册说明和非 Grace 运行时展示。
3. 真人 QA 与合成画像的数据语义、后台徽标和候选隔离。
4. CloudBase 正式匹配 worker、Asia/Shanghai 业务时钟、批次幂等与零结果状态。
5. 首页 10 秒内部测试运行及 matched/no_match/blocked/failed 可恢复状态。
6. 合成画像的 2—6 小时确定性延迟拒绝任务与 worker。
7. 测试资料补标 dry-run planner、全量验证与最终 Review。

每个批次都必须：

```text
写失败测试并运行得到真实 RED
→ 最小实现
→ 运行相称专项测试
→ 审查 git diff 与 git diff --check
→ 只暂存本批文件/hunk
→ 审查 staged diff
→ 独立 commit
→ 报告 commit hash
```

禁止先写实现再补一个永远不会失败的测试。

## 7. 关键实现约束

### 7.1 邀请与权限

- 不新增 `used=true` 或剩余次数；公开码不消费。
- 被邀请用户是归因幂等边界，首次有效归因不可覆盖。
- `promote_code`、签名 attribution token、partner activation credential 必须保持三个不同安全概念。
- 后端必须证明邀请码注册不会创建 partner、partner token/session 或 partner role。

### 7.2 正式匹配调度

- 新建 CloudBase `match-worker` 前必须查官方 timer 文档，确认 cron 字段和时区；禁止猜测或直接复制 node-cron 表达式。
- 所有正式批次以 `formal:<Asia/Shanghai business date>` 为唯一 key。
- matched、completed_no_match、blocked、failed 都必须写 `match_batch_runs`。
- 重复 timer、函数重试和并发触发只能产生一个有效批次。
- 正式 worker 与测试 route 必须复用共享匹配服务，不复制算法。

### 7.3 10 秒测试运行

- 只有后端确认 `account_mode=internal_qa` 才能创建/执行。
- 全局 feature flag 不是授权；前端隐藏也不是授权。
- 只匹配 owner 相同、未过期的 synthetic fixture。
- 不写正式 match claim；不消耗正式一生一次资格；不使用删除正式日志的 reset 参数。
- 页面必须持久呈现 countdown/running/matched/no_match/blocked/failed。

### 7.4 测试资料与 Agent

- 使用规范字段 `profile_origin`、`account_mode`、`test_scope`、`fixture_owner_user_id`、`fixture_run_id`、`fixture_expires_at`、`allow_date_coordination`，并兼容旧字段读取。
- 不得仅凭姓名、手机号格式或文本内容推断 synthetic。
- 延迟拒绝时间由 interaction ID 的稳定哈希映射到 2—6 小时；AI 不决定对象身份、权限或时间。
- 测试拒绝事件必须标记 `source_type=fixture_simulation`，不得发送真实短信/订阅消息、建立人工工单或进入真实线下协调。

## 8. UI 约束

- 复用现有首页 `match-stage` 和 `dev-match-row`，不新增独立测试页面。
- 复用现有品牌色、字体、间距和组件 token；不引入新字体/图标库。
- 测试状态不能只靠 Toast，必须在页面有持久文本和操作。
- 邀请文案明确“公开邀请码（可多人使用）”以及“只用于确认邀请来源，不会自动成为合伙人”。
- 不改造无关页面，不趁机重做全站设计。

## 9. Review 门禁

每批完成后自审；全部完成后再做一次独立最终 Review，至少回答：

1. 是否存在公开邀请码提权路径？
2. 同一用户的首次邀请归因是否可能被覆盖或重复计数？
3. CloudBase 周五批次是否有真实 worker、时区证据、唯一 batch key 和可观测结果？
4. 无候选是否明确显示为完成，而非永远等待？
5. 非 QA 是否能通过直接 API 调用测试匹配？
6. 测试运行是否可能写正式 claim 或消耗正式资格？
7. synthetic fixture 是否可能进入普通正式候选池、客服真人视图、支付或佣金？
8. 真人对真人是否存在任何自动拒绝分支？
9. 延迟任务是否幂等、确定性、可审计且不会真实通知？
10. 是否泄漏手机号、OpenID、微信号、自由文本、模型输入、密钥或后台 token？
11. 是否保留并隔离了所有已有/并发用户改动？

按 `cloudbase-code-review` 做 CloudBase 专项审查，重点检查 NoSQL 写入结果、全局权限路径、SDK/API 使用、索引/集合前置条件和 worker 配置。

## 10. 最低测试矩阵

```text
同一公开邀请码被 2 个不同用户使用
同一用户重复/改填邀请码，首次归因不变
公开邀请码不能创建合伙人权限
姓名缺失不显示 Grace
周三、周五 Asia/Shanghai 与 UTC 跨日
重复/并发 timer 只运行一个正式 batch
正式 batch 有匹配、无候选、blocked、failed
非 QA 不显示按钮且 API 403
10 秒倒计时重复点击、离开恢复、网络失败重试
测试 run matched/no_match/blocked/failed
测试 run 不产生正式 match claim
真人 QA 只能看到自己的未过期 synthetic fixture
正式用户看不到任何 synthetic fixture
真人→真人绝不创建自动拒绝
QA 真人→自己的 fixture 创建 2—6 小时任务
重复 interaction 只创建一个任务
fixture 过期/非 owner/普通用户全部拒绝
测试事件不会产生真实通知、工单或线下协调
```

## 11. CloudBase、生产与停止条件

- CloudBase 管理、查询、写入、部署只允许 MCP。
- Cursor 默认只做本地代码和本地测试，不得写生产数据、部署函数、上传体验版/正式版小程序。
- 现有测试库生产补标必须先提交 dry-run（数量、文档 ID、变更字段、冲突），再等用户逐批确认。
- 需要正确姓名、QA 用户 ID、CloudBase 新集合/索引、worker/API 部署、小程序上传时分别停止请求确认。
- 必须使用 Computer Use、人工控制台、微信后台或缺少 MCP 能力时立即停止并报告。
- 不得修改生产权限、支付、佣金或真实用户正式 match claim。

## 12. 成功完成标准

只有以下全部满足才能报告本地实现完成：

1. `tasks.md` 所有本地任务完成并勾选。
2. 六组基线 selfcheck 无新增失败，专项测试全绿。
3. 公开邀请码多人可用且无法提权。
4. CloudBase worker 代码、时区策略、批次幂等和零结果状态在本地验证通过。
5. 10 秒测试运行只对 QA 开放且不污染正式匹配资格。
6. 后台和数据库投影能区分真人、真人 QA 与合成画像。
7. 合成画像延迟拒绝只在隔离测试边界内生效。
8. 最终安全、隐私、CloudBase 和 diff Review 通过。
9. 每批独立提交并报告全部 commit hash。
10. 明确列出仍待用户授权的生产动作和未提交用户改动。
