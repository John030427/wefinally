# WeFinally 测试入口收口与正式上线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留独立 QA 环境完整测试能力的同时，确保正式微信小程序、正式 CloudBase API 和普通管理后台均不暴露测试按钮、模拟接口或公共测试开关，并建立可重复、可审计、可回滚的正式上线流程。

**Architecture:** 测试能力按部署环境隔离，而不是依赖前端 `wx:if` 或用户字段隐藏。生产客户端由确定性打包脚本生成并剔除 QA 模块；生产 API 不挂载测试路由并在服务层二次拒绝；测试数据和测试操作只存在于独立 QA 环境及超级管理员测试控制台。CI 同时检查源码、生产包、路由表和远端 CloudBase 开关，任何一层失败都阻止上传或部署。

**Tech Stack:** 微信原生小程序、CloudBase 云函数与 NoSQL、Node.js、GitHub Actions、CloudBase CLI、微信开发者工具 CLI。

**Spec:** 本文第 2 节“测试入口清单与上线决策”、第 3 节“正式上线判定标准”和第 5 节“发布及回滚 Runbook”。

## Global Constraints

- 本计划只定义整改与发布步骤；执行计划前不得修改生产数据、部署云函数或上传小程序。
- “按钮不可见”不等于“能力已关闭”。正式环境必须同时满足客户端剔除、路由不挂载、服务层拒绝、公共开关关闭四项条件。
- 正式环境不得通过 `qa_test_run_enabled`、`is_test`、内部 OpenID 或数据库公共开关临时放行测试接口。
- 测试环境与正式环境使用不同 CloudBase 环境；测试数据不得复制到正式环境，正式用户数据不得导入 QA 环境。
- 微信调用者身份只来自 `cloud.getWXContext()`；云函数初始化使用 `cloud.DYNAMIC_CURRENT_ENV`。
- Agent/模型不得直接写数据库，也不得获得 OpenID、手机号、联系方式、精确地址、单位或密钥。
- 测试数据清理只能走具备鉴权、确认、幂等、审计和范围校验的业务服务，禁止直接批量改生产数据库。
- 正式上传物必须来自已审查且 CI 全绿的不可变 Git commit；`api`、`agent-graph`、后台和小程序版本必须记录同一 release manifest。
- 生产发布禁止携带真实凭据；本地 `.env`、管理员令牌和 CloudBase 密钥不得进入 Git、构建产物或日志。

---

## 1. 当前基线与风险结论

本清单依据发布候选快照 `748d091` 的代码盘点，并在实施时以待发布 commit 重新扫描确认。当前测试能力散落在小程序页面、组件、API 路由、后台页面和系统开关中。

当前 `server/selfcheck/formal-client-release.js` 并未证明“正式客户端无测试入口”；它反而明确允许首页、匹配列表和 `qa-match-panel` 保留测试能力。因此现有 `selfcheck:cloud-match` 通过，不能作为正式包无 QA 功能的证据。

当前主要风险：

1. 首页和匹配列表直接注册并渲染 `qa-match-panel`，正式包仍包含重新注册、双机互配、清空记录和合成匹配等破坏性入口。
2. 约会协调页仍包含 fixture 模拟、重置本轮和推进测试对象入口。
3. `/api/match/test-runs` 等测试路由始终挂载；部分权限还接受公共数据库开关或用户级 QA 字段。
4. 管理后台混合了正式运营能力与测试 VIP、A/B 合成候选能力，误操作边界不够清晰。
5. 当前 release guard 只检查两个公共开关中的一部分状态，且未证明生产路由和生产包均不含测试能力。

---

## 2. 测试入口清单与上线决策

### 2.1 微信小程序用户侧

| 入口 | 当前位置 | QA 环境 | 正式环境 |
|---|---|---|---|
| 重新注册测试资料 | `components/qa-match-panel/qa-match-panel.wxml` | 保留 | 从生产包剔除 |
| 两台真机互配测试 | 同上 | 保留 | 从生产包剔除 |
| 再来一轮真机互配 | 同上 | 保留 | 从生产包剔除 |
| 清空双机匹配与协调数据 | 同上 | 保留，继续强确认与审计 | 从生产包剔除 |
| 测试场景单选项 | 同上 | 保留 | 从生产包剔除 |
| 测试合成对象匹配 | 同上 | 保留 | 从生产包剔除 |
| 10 秒后模拟匹配 | 同上 | 保留 | 从生产包剔除 |
| 首页“内部测试”面板 | `pages/index/index.wxml` | 保留 | 不注册、不渲染、不打包 |
| 匹配列表 QA 面板 | `pages/match-list/match-list.wxml` | 保留 | 不注册、不渲染、不打包 |
| fixture 协调进度/刷新 | `pages/date-coordination/date-coordination.wxml` | 保留 | 正式包不包含 fixture 页面分支 |
| 重新测试本轮协调 | 同上 | 保留 | 从生产包剔除 |
| 推进测试对象（分步） | 同上 | 保留 | 从生产包剔除 |
| “测试数据”标记 | 匹配详情、协调页 | QA 环境保留 | 普通用户不可获得测试记录；后台审计视图可保留 |

决策：正式包不能只是把 `visible` 设为 `false`。`qa-match-panel`、`qaMatchSimulator.js`、对应 API 常量及测试事件处理代码都不得进入正式上传目录。

### 2.2 CloudBase API 测试路由

| 路由 | 用途 | 正式环境决策 |
|---|---|---|
| `POST /api/user/qa-registration-reset` | 重放注册 | 不挂载；直接访问返回 404/`FEATURE_NOT_AVAILABLE` |
| `POST /api/match/qa-real-device/start` | 双真机测试轮次 | 不挂载；服务层二次拒绝 |
| `POST /api/match/qa-pair-reset` | 清空双账号匹配/协调 | 不挂载；服务层二次拒绝 |
| `POST /api/match/test-runs` | 创建合成测试 | 不挂载；服务层二次拒绝 |
| `POST /api/match/test-runs/:id/execute` | 执行合成测试 | 不挂载；服务层二次拒绝 |
| `GET /api/match/test-runs[/:id]` | 查询合成测试 | 不挂载；服务层二次拒绝 |
| `POST /api/date-coordinations/fixture-applications` | fixture 申请 | 不挂载；服务层二次拒绝 |
| `GET /api/date-coordinations/fixture-responses/:id` | fixture 反馈 | 不挂载；服务层二次拒绝 |
| `POST /api/date-coordinations/:id/advance-synthetic` | 推进合成对象 | 不挂载；服务层二次拒绝 |
| `POST /api/date-coordinations/:id/qa-reset` | 重置协调轮次 | 不挂载；服务层二次拒绝 |

正式环境统一返回不存在或不可用，不向普通调用者透露内部测试功能名称。服务层仍需校验 `DEPLOYMENT_STAGE !== 'production'`，防止未来误将处理器重新接回路由。

### 2.3 管理后台测试操作

| 入口 | 当前位置 | 上线决策 |
|---|---|---|
| 授权/撤销测试 VIP | `server/public/admin/index.html` | 移至独立 QA 控制台；正式后台不显示，正式 API 不接受 |
| 准备 A/B 测试候选 | 同上 | 移至独立 QA 控制台；只连接 QA 环境 |
| 清理 A/B 测试 | 同上 | QA 控制台保留，要求超级管理员、强确认、run ID、原因、审计 |
| “包含测试数据”筛选 | 用户与会话列表 | 正式后台可保留只读审计筛选，但默认关闭；没有测试数据时结果为空 |
| “内部测试账号/合成测试画像”徽标 | 用户列表 | 正式后台只读保留，便于发现污染；不得提供创建或放行操作 |

“包含测试数据”属于审计过滤器，不属于破坏性测试按钮，可以在正式后台保留。测试 VIP 和合成候选生成属于写操作，必须与正式运营页面分离。

### 2.4 非 UI 测试工具

以下工具可以保留在 Git 中，但不能进入生产部署包，也不能默认指向正式环境：

- `server/e2e/wefinally/**`
- `server/sample-data/**`
- `server/tools/seed-qa-fixture-pool.js`
- `server/tools/extend-qa-user-vip.js`
- `server/tools/qa-coordinate-smoke.js`
- `server/tools/verify-qa-fixture-journeys.js`
- `server/selfcheck/**`

每个可写工具必须要求显式 `--env`、显式 `--confirm-env`，并在目标为 production 时硬失败。只读 release guard 可以访问生产环境验证状态。

---

## 3. 正式上线判定标准

只有全部满足以下条件，版本才可进入微信正式审核：

- [ ] 正式上传目录中不存在 `qa-match-panel`、`qaMatchSimulator`、fixture 页面分支或 QA API 常量。
- [ ] 正式上传目录文本扫描不存在“内部 QA”“重新注册测试资料”“双机互配测试”“模拟匹配”“重置本轮”“推进测试对象”等禁用文案。
- [ ] 正式 API 路由表不挂载第 2.2 节列出的全部测试路由。
- [ ] 即使直接调用遗留 handler，生产部署策略也返回 `FEATURE_NOT_AVAILABLE`，且不产生任何写入。
- [ ] `match_test_run_public_enabled` 与 `qa_registration_replay_public_enabled` 在云函数环境变量和 `system_configs` 中均为 false 或不存在。
- [ ] 正式用户 profile 响应不再返回可驱动 QA UI 的权限字段。
- [ ] 正式后台不提供测试 VIP、测试候选创建和 QA 清理写按钮。
- [ ] 生产数据库中没有 active synthetic fixture、active QA cohort 或待执行 fixture job；历史记录按审计策略归档/隔离，不直接删除。
- [ ] `api`、`agent-graph`、异步 worker、后台静态站和小程序包均对应 release manifest 中同一 Git commit。
- [ ] GitHub required checks 全绿且 required review 已通过，不允许绕过保护分支。
- [ ] 两台真机在候选正式包完成注册、匹配、AI 报告、第一次约会协调、方案确认、到场通知和人工客服入口烟测。
- [ ] 正式包未开启调试、开发登录、mock 支付、公共 QA 开关或宽松域名校验。
- [ ] 回滚包、上一版云函数代码、配置快照和负责人联系方式已准备完成。

---

## 4. 实施任务

### Task 1: 建立机器可读的测试入口清单

**Files:**

- Create: `config/qa-entry-inventory.json`
- Create: `project-docs/QA_ENTRY_INVENTORY.md`
- Create: `server/selfcheck/qa-entry-inventory.js`
- Modify: `server/package.json`

- [ ] 编写失败自检，扫描小程序 WXML/JSON/JS、API 路由、后台 HTML 和写工具；发现未登记的 `qa`、`fixture`、`synthetic`、`test-run` 写入口时失败。
- [ ] 在 JSON 清单中为每项记录 `id`、`surface`、`files`、`routes`、`writeCapability`、`qaDecision`、`productionDecision` 和 owner。
- [ ] 明确排除普通单元测试、自检文案和只读“测试数据”徽标，避免扫描误报。
- [ ] 运行 `node server/selfcheck/qa-entry-inventory.js`，确认当前基线会因生产允许项过宽而失败。
- [ ] 补齐所有第 2 节入口并让清单完整性检查通过。
- [ ] 在 `server/package.json` 增加 `selfcheck:qa-surface`，只包含确定性本地扫描，不访问云端。
- [ ] Commit: `test: inventory all QA entry points`

### Task 2: 引入统一部署阶段策略

**Files:**

- Create: `miniprogram/cloudfunctions/api/lib/deploymentPolicy.js`
- Create: `server/selfcheck/deployment-policy.js`
- Modify: `miniprogram/cloudfunctions/api/index.js`
- Modify: `server/package.json`

- [ ] 先写矩阵测试：`development`/`qa` 允许测试能力，`production`、空值和未知值均拒绝；生产不得被用户字段或数据库公共开关覆盖。
- [ ] 实现 `resolveDeploymentStage(env)`、`qaFeaturesEnabled(env)` 和 `assertQaFeatureAvailable(env)`。
- [ ] 生产部署要求显式 `DEPLOYMENT_STAGE=production`；运行时空值采用 deny-by-default，不自动当作开发环境。
- [ ] API 启动日志只记录阶段和功能布尔值，不记录凭据、OpenID 或用户资料。
- [ ] 运行 `node server/selfcheck/deployment-policy.js`。
- [ ] Commit: `feat: add deny-by-default deployment policy`

### Task 3: 从生产 API 路由表移除测试端点

**Files:**

- Modify: `miniprogram/cloudfunctions/api/handlers/route.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/user.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/match.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- Modify: `miniprogram/cloudfunctions/api/lib/matchTestRunService.js`
- Modify: `miniprogram/cloudfunctions/api/lib/qaPairResetService.js`
- Create: `server/selfcheck/production-qa-routes.js`

- [ ] 先写失败测试，构造 production 路由表并逐个断言第 2.2 节路由不可解析。
- [ ] 将 route map 改为根据 `qaFeaturesEnabled` 有条件注册，而不是注册后只依赖 profile 鉴权。
- [ ] 在每个测试写服务入口调用 `assertQaFeatureAvailable`，形成第二道保护。
- [ ] 对生产直接调用断言：返回 404 或稳定的 `FEATURE_NOT_AVAILABLE`，数据库 mock 的 create/update/remove 调用次数均为 0。
- [ ] 对 QA 阶段回归断言：现有重新注册、双机互配、清空、合成匹配、协调重置和分步推进仍可工作。
- [ ] 从正式 profile 响应移除 `qa_test_run_enabled` 和 `qa_registration_replay_enabled`；QA 阶段保持兼容。
- [ ] 运行 `node server/selfcheck/production-qa-routes.js`、`npm --prefix server run selfcheck:qa-access` 和 QA 专项自检。
- [ ] Commit: `fix: unmount QA routes in production`

### Task 4: 生成不含 QA 代码的正式小程序目录

**Files:**

- Create: `config/miniprogram-production.json`
- Create: `tools/release/build-miniprogram-production.js`
- Create: `server/selfcheck/production-client-bundle.js`
- Modify: `.gitignore`
- Modify: `server/selfcheck/formal-client-release.js`
- Modify: `server/package.json`

- [ ] 先改写失败测试：现有正式客户端检查必须因 QA 面板仍被允许而失败。
- [ ] 打包脚本将源目录复制到 `.release/miniprogram-production/`，禁止原地修改工作树。
- [ ] 打包阶段删除 `components/qa-match-panel/**`、`utils/qaMatchSimulator.js`，并从首页/匹配列表 JSON、WXML、JS 中删除注册、节点和处理器。
- [ ] 从协调页生产版本剔除 fixture simulation、QA reset、advance synthetic 的模板、状态和调用代码。
- [ ] 生成生产专用 API 常量，不包含第 2.2 节路由。
- [ ] 将 production allowlist 和 forbidden token 列表放入 `config/miniprogram-production.json`，打包遇到未知 QA 引用时硬失败。
- [ ] 扫描生产目录的 WXML/JSON/JS/WXSS，断言没有测试组件、QA 路由和禁用文案。
- [ ] 解析所有页面 JSON，断言引用组件实际存在；运行现有小程序源码语法检查。
- [ ] `.release/` 加入 `.gitignore`，构建产物不提交 Git。
- [ ] 运行 `node tools/release/build-miniprogram-production.js` 与 `node server/selfcheck/production-client-bundle.js`。
- [ ] Commit: `build: create QA-free mini program package`

### Task 5: 分离管理后台的测试写操作

**Files:**

- Modify: `server/public/admin/index.html`
- Create: `server/public/qa-console/index.html`
- Modify: `miniprogram/cloudfunctions/api/handlers/admin.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/abMatchFixture.js`
- Create: `server/selfcheck/admin-qa-surface.js`

- [ ] 先写失败检查，断言正式 admin 页面仍含 `adminTestVip`、`adminAbMatchFixture` 或对应写按钮。
- [ ] 从正式 admin 用户列表移除授权测试 VIP、创建/清理 A/B fixture 的写操作。
- [ ] 保留“包含测试数据”和身份徽标为只读审计能力，默认关闭。
- [ ] 建立独立 QA console；它只在 `DEPLOYMENT_STAGE=qa` 可加载，并只允许超级管理员。
- [ ] QA 写操作要求 CSRF/短期能力令牌、原因、request ID、目标 QA 环境确认和审计记录。
- [ ] production 下后端对相同 admin 测试路由二次拒绝，不能依赖页面是否显示。
- [ ] 运行 `node server/selfcheck/admin-qa-surface.js` 及现有 `selfcheck:member`。
- [ ] Commit: `fix: separate QA console from production admin`

### Task 6: 收紧所有本地写测试工具

**Files:**

- Create: `server/tools/lib/target-environment-guard.js`
- Modify: `server/tools/seed-qa-fixture-pool.js`
- Modify: `server/tools/extend-qa-user-vip.js`
- Modify: `server/tools/qa-coordinate-smoke.js`
- Modify: `server/tools/verify-qa-fixture-journeys.js`
- Modify: `server/e2e/wefinally/index.js`
- Create: `server/selfcheck/write-tool-environment-guard.js`

- [ ] 写失败测试，断言缺少 `--env`、缺少一致的 `--confirm-env` 或目标为 production 时工具在任何网络/数据库调用前退出。
- [ ] 所有写工具复用单一环境守卫，不允许每个脚本自行解释环境名称。
- [ ] 对只读验证工具显式标记 `readOnly`；不得因只读检查放宽写工具。
- [ ] 日志打印环境 ID、动作和 request ID，不打印令牌或用户隐私字段。
- [ ] 运行 `node server/selfcheck/write-tool-environment-guard.js`。
- [ ] Commit: `fix: guard QA tools from production targets`

### Task 7: 升级本地与远端发布门禁

**Files:**

- Modify: `server/selfcheck/release-qa-flag-guard.js`
- Modify: `server/selfcheck/release-qa-flag-guard-logic.js`
- Create: `server/selfcheck/release-manifest.js`
- Modify: `server/package.json`
- Modify: `.github/workflows/selfcheck.yml`

- [ ] 扩展 live guard，同时检查 CloudBase `api` 环境变量和 `system_configs` 中的 `match_test_run_public_enabled`、`qa_registration_replay_public_enabled`。
- [ ] 检查正式 API 的 `DEPLOYMENT_STAGE=production`，未知或空值失败。
- [ ] 增加只读探针，逐个请求测试路由并期待 404/不可用；任何 2xx 都阻止发布。
- [ ] GitHub CI 运行 `selfcheck:qa-surface`、部署策略、生产路由、生产客户端包和 admin QA surface 检查。
- [ ] CI 构建真实 `agent-graph`，运行 graph check；运行 QA pair reset 和日期协调专项自检。
- [ ] release manifest 检查所有待部署 artifact 的 Git SHA 一致、工作树干净、required checks 全绿。
- [ ] CI 不持有生产写凭据；远端 live guard 在人工批准的 release job 中以只读凭据运行。
- [ ] Commit: `ci: block release on QA surface leaks`

### Task 8: 清点并隔离正式环境中的测试数据

**Files:**

- Create: `server/tools/audit-production-test-data.js`
- Create: `server/tools/quarantine-test-data.js`
- Create: `server/selfcheck/test-data-quarantine-policy.js`
- Create: `project-docs/PRODUCTION_TEST_DATA_CLEANUP.md`

- [ ] 先实现只读 audit，统计 synthetic fixture、QA cohort、test run、fixture job、测试协调、测试消息和测试通知；只输出内部 ID 摘要与数量。
- [ ] 不把“删除所有匹配和聊天”作为生产上线步骤；历史测试事实应标记隔离、过期或归档。
- [ ] quarantine 工具必须支持 dry-run、分页、幂等、范围校验、审计记录和可恢复状态。
- [ ] 对会员、订单、推广归属、画像/RAG、正式聊天和真人匹配建立不变量测试，确保隔离任务不会触碰。
- [ ] 在 QA 环境用合成数据演练 dry-run、执行、重复执行和中断恢复。
- [ ] 生产执行必须另行取得用户授权并由两人复核；本计划实现阶段不得自动执行。
- [ ] Commit: `feat: audit and quarantine test data safely`

### Task 9: 建立正式上线 manifest 与 Runbook

**Files:**

- Create: `project-docs/PRODUCTION_LAUNCH_RUNBOOK.md`
- Create: `project-docs/RELEASE_MANIFEST_TEMPLATE.md`
- Create: `tools/release/create-release-manifest.js`
- Modify: `project-docs/DEVELOPMENT_LOG.md`

- [ ] manifest 记录 release ID、分支、commit、PR、review、CI URL、CloudBase env ID、各云函数版本、后台版本、小程序体验版/审核版版本和操作人。
- [ ] Runbook 区分“部署 API”“部署 agent-graph/worker”“部署后台”“上传小程序”“提交微信审核”“正式发布”，不得合并成一个模糊动作。
- [ ] 每一步列出前置门禁、命令、期望输出、证据保存位置、失败停止条件和回滚动作。
- [ ] 明确微信开发者工具应打开生产构建目录 `.release/miniprogram-production`，而不是任意历史 worktree 的 `miniprogram`。
- [ ] 写明正式发布前必须重新构建，禁止复用旧体验版缓存；上传备注必须带 release ID 与短 SHA。
- [ ] 记录 CloudBase 配置快照但隐藏值，只保存变量名、启用状态和版本时间。
- [ ] Commit: `docs: add production launch runbook`

### Task 10: 完成上线前全量验证

**Files:**

- Modify only if a genuine defect is discovered; do not weaken assertions to make checks pass.

- [ ] 在干净 worktree checkout 待发布 commit，执行 `npm ci --prefix server --ignore-scripts`。
- [ ] 安装并构建 `miniprogram/cloudfunctions/agent-graph`，执行其类型检查和测试。
- [ ] 按 `AGENTS.md` 顺序运行 agent、安全、AI 报告、支付、会员、云匹配全套自检。
- [ ] 运行新增 QA surface、production route、production bundle、admin surface、write-tool guard 和 release manifest 检查。
- [ ] 对依赖、secret、OpenID/手机号/精确地址泄漏做扫描；结果必须无未解释高危项。
- [ ] 创建正式生产包，使用微信开发者工具的代码质量检查与预览检查。
- [ ] 在候选体验版用两台真实手机完成第 5.2 节烟测；只用专门 QA 环境，不把测试按钮重新开放到生产 API。
- [ ] required reviewer 批准 PR 后合并；以合并 commit 重新生成 manifest 和正式包，不上传 PR 头部旧产物。
- [ ] Commit only if verification uncovered documentation evidence that belongs in the repository.

---

## 5. 发布及回滚 Runbook

### 5.1 发布顺序

1. 冻结 release commit，确认工作树干净、PR 已批准、CI 全绿。
2. 生成 release manifest，并运行本地生产包和远端 QA flag guard。
3. 备份当前生产云函数版本、路由版本和非敏感配置快照。
4. 先部署向后兼容的 `api`、`agent-graph` 和异步 worker；逐一记录版本和健康检查。
5. 部署正式管理后台，确认测试写按钮不存在，用户/会话只读查询正常。
6. 从 `.release/miniprogram-production` 上传微信体验版，备注 release ID 与 commit。
7. 两台真机执行正式用户烟测，确认无 QA UI、无合成数据、无旧缓存错页。
8. 提交微信审核；审核通过后再执行正式发布，不把“上传”误认为“已上线”。
9. 发布后 30 分钟、2 小时、24 小时检查登录、注册、保存资料、匹配、AI 报告、协调、消息投影、云函数错误率和人工客服入口。

### 5.2 两台真机上线烟测

两台手机应使用正式流程创建或准备两名已审核测试用户，但正式包中不出现任何测试按钮。

- 账号 A、B 分别登录，确认首页和匹配列表没有内部 QA 面板。
- 完成资料和择偶条件保存，确认无 `SERVER_ERROR`，刷新后数据一致。
- 通过后台正常业务流程触发一次隔离验收匹配，不调用客户端 QA 接口。
- 双方查看匹配详情和 AI 报告，确认无技术型“数据限制”文案、无测试徽标。
- 一方发起第一次约会，另一方直接接受或提出修改；双方会话均展示对方修改和最新方案版本。
- 测试“周日晚上 8 点”“看电影”“地点尚未确定”等表达，AI 应逐项澄清，不把 evening 当完整时间，不把星巴克硬套为电影院。
- 双方对最后方案卡片分别确认；未双确认前不得生成正式约会。
- 到场前只共享安全的穿搭/现场定位提示；一方发送后另一方刷新或轮询可见，并区分已记录、已投递、已读。
- 验证人工客服入口、安全提示和取消/改期路径。
- 用代理或调试请求直接调用全部 QA 路由，确认均被正式 API 拒绝且数据零变化。

### 5.3 可能发生的情况与处置

| 现象 | 判定 | 处置 |
|---|---|---|
| 正式包仍看到测试按钮 | 阻断发布 | 核对开发者工具打开目录及构建 SHA，重新生成生产包 |
| 按钮不见但 QA 路由返回 2xx | P0 阻断 | 回滚/停发 API，检查路由挂载和部署阶段策略 |
| 公共 QA 开关仍启用 | 阻断发布 | 关闭开关并重新跑 live guard；记录审计 |
| 两个云函数 SHA 不一致 | 阻断发布 | 重新从 manifest 指定 commit 构建部署 |
| 正式库发现 active fixture | 阻断用户匹配 | 先 dry-run 审计，再经批准隔离；禁止临时直删 |
| 体验版正常、正式版出现旧 UI | 客户端版本/缓存问题 | 核对上传版本、审核版本和 release ID，必要时回滚小程序版本 |
| API 新版导致旧客户端异常 | 兼容性缺陷 | 回滚 API；所有 API 变更必须至少兼容当前正式客户端一版 |
| AI 服务不可用 | 可降级但需确认 | 使用确定性协调流程和人工客服，不能开放 QA 工具补救 |
| 到场消息对端不可见 | 业务缺陷 | 保留状态事实，检查 outbox/投影/读取游标；不得宣称已读 |
| 微信审核拒绝 | 未上线 | 保持当前正式版本，修订材料后生成新 release manifest 再提交 |

### 5.4 回滚标准

满足任一条件立即停止灰度或回滚：

- QA 路由在生产可调用或测试数据进入真人候选池。
- 登录/身份边界异常、跨用户读取、隐私字段暴露。
- 保存资料、会员、支付、匹配或第一次约会出现持续性写入失败。
- API 与客户端协议不兼容导致主要路径不可用。
- Agent 绕过确定性业务服务直接写事实状态。

回滚顺序：暂停正式发布/灰度，回滚小程序版本，再按兼容性回滚云函数；恢复前一版非敏感配置快照。不要回滚数据库事实；使用向前修复或可审计补偿任务。

---

## 6. 完成定义

本计划只有在以下证据齐备后才算完成：

- 测试入口机器清单与人工清单一致，新增入口会触发 CI 失败。
- 正式小程序产物不含 QA 组件、路由、文案和事件处理器。
- 正式 API 不挂载测试路由，直接 handler 调用也被生产策略拒绝且零写入。
- 正式后台没有测试写按钮，QA console 只能连接独立 QA 环境。
- 所有公共测试开关关闭，live guard 有可审计输出。
- 生产测试数据审计完成，active fixture/QA job 为零或已有经批准的隔离记录。
- release manifest 能把 Git commit、所有云端 artifact 和微信小程序版本一一对应。
- 两台真机烟测、回滚演练、required review 和 GitHub CI 均有保存证据。

## Self-Review Checklist

- [ ] 所有已知测试按钮、测试路由、后台入口和写工具均已列入清单。
- [ ] 没有把“隐藏按钮”当成唯一安全措施。
- [ ] 没有要求直接删除正式数据或复制正式用户数据到 QA。
- [ ] 每个实施任务都有失败测试、最小实现、验证命令和提交边界。
- [ ] 正式发布、云函数部署和小程序上传被明确区分。
- [ ] Runbook 包含停止条件、回滚标准和旧客户端兼容性。
- [ ] 文档没有真实凭据、OpenID、手机号或其他隐私数据。

## Execution Handoff

执行时从 Task 1 开始，严格按顺序完成。Task 1—7 是正式上传的硬前置；Task 8 的生产隔离执行需要单独授权；Task 9—10 负责形成可发布证据。每个任务完成后更新 checkbox 与 `project-docs/DEVELOPMENT_LOG.md`，不得通过删除测试或放宽断言让 CI 变绿。
