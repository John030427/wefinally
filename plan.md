# WeFinally RAG 匹配、可信报告 UI 与约会测试闭环执行计划

你是 Cursor 中负责实现的工程代理。本文件是下一阶段唯一执行计划；不要重新实现已经完成的邀请、合伙人、VIP、测试池、正式匹配调度和 AI 报告队列工作，也不要把历史聊天或归档方案当作当前需求真源。

## 1. 本阶段目标

本阶段只解决四件事：

1. 将当前“字符重合度 + 固定字段分 + LLM 重排”升级为“确定性硬条件 + 双向语义检索/RAG + 受约束 Prompt 精排”。
2. 消除匹配详情里大量字段接近满分、缺失数据仍给默认分、报告措辞过度肯定造成的虚假精确感。
3. 重做小程序匹配详情的信息层级、字体、颜色和操作区，让报告可快速判断、证据可展开、算法细节默认收起。
4. 在页面底部恢复约会申请入口；真人匹配走真实协调，QA 真人匹配自己的 synthetic fixture 时走完全隔离的模拟约会流程，并在确定性的数小时后收到模拟婉拒。

最终必须额外提交一份独立工作报告：

```text
project-docs/WORK_REPORT_2026-08-15_RAG_MATCH_REPORT_DATE_SIMULATION.md
```

没有这份报告，不得宣称本阶段完成。

## 2. 唯一工作目录与第一条命令

第一条命令必须是：

```powershell
Set-Location 'D:\wefinal\.worktrees\wefinally-ai-agent'
(Get-Location).Path
```

实际开发只能发生在 `D:\wefinal\.worktrees\wefinally-ai-agent`。禁止在外层 `D:\wefinal` 修改文件。

## 3. 开始前必须完整阅读

1. `AGENTS.md`
2. `PROJECT_HANDOFF.md`
3. `CONTRIBUTING.md`
4. `project-docs/NEXT_THREAD_HANDOFF_2026-08-12_AI_MATCHING_PARTNER_DASHBOARD.md`
5. `project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md`（若仍为未跟踪文件，只读，不纳入本任务提交）
6. `plan.md`
7. 下列已实现代码及其直接 selfcheck，不要从头扫描项目：
   - `miniprogram/cloudfunctions/api/lib/matchPolicy.js`
   - `miniprogram/cloudfunctions/api/lib/intentProfile.js`
   - `miniprogram/cloudfunctions/api/lib/semanticMatchService.js`
   - `miniprogram/cloudfunctions/api/lib/matchSemanticRerank.js`
   - `miniprogram/cloudfunctions/api/lib/deepseek.js`
   - `miniprogram/cloudfunctions/api/lib/fixtureResponseService.js`
   - `miniprogram/cloudfunctions/api/handlers/match.js`
   - `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
   - `miniprogram/pages/match-detail/*`
   - `miniprogram/pages/date-coordination/*`
   - 与上述模块同名或直接引用的 `server/selfcheck/*`

先审查最近两个相关提交，禁止重复或回退其中的修复：

```text
f60114f feat(match): require AI rerank for test matching
0bd642a fix(match): harden AI rerank response contract
```

## 4. Git 与并发改动保护

阅读完成后立即运行：

```powershell
git status --short --branch
git rev-parse --short HEAD
```

当前已知用户/并发改动至少包括：

```text
M server/public/partner/index.html
M server/selfcheck/cloudbase-partner-connection.js
M server/selfcheck/customer-service-browser-fixture.js
?? project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md
?? server/selfcheck/customer-service-browser-host.js
?? specs/2026-08-12-partner-gated-launch/
```

规则：

- 所有开始前已存在或实施中并发出现的改动均归用户所有。
- 禁止 `reset`、`clean`、`checkout`、`restore`、覆盖、删除、搬移、顺手格式化或混入提交。
- 如必须接触 dirty 文件，只能做 hunk 级审查和暂存；无法安全拆分时立即停止报告。
- 不 push、不 amend、不 rebase、不改写历史、不自动合并或删除分支。
- 每个交付批次只提交本批文件/hunk，并在当批完成后报告 commit hash。

## 5. 已确认的现状与问题证据

### 5.1 当前匹配不是 RAG

- `matchPolicy.js` 的三观相似度当前主要依赖中文单字/双字 token 的 Jaccard 重合度。
- 当前没有向量 embedding、语义检索索引或按 evidence chunk 检索的 RAG 层。
- DeepSeek 当前接收 Top-K 脱敏摘要并做 Prompt 重排，属于 LLM rerank，不应宣传成 RAG。

### 5.2 分数字段“太满”不是单纯 UI 问题

必须先写 characterization test 证明并修复根因：

- 缺失婚育偏好、年龄、身高、学历、城市等字段时，现有规则可能仍写入默认正分。
- `circleMatches` 在未配置圈层偏好时可能返回命中，从而显示接近满分。
- UI 将缺失证据、默认分、真实命中分都画成相似的进度条，造成“字段全部很好”的假象。
- 报告可能在心理测评或文本证据缺失时仍使用“高度一致”“高度契合”等肯定措辞。

禁止通过随机扣分、硬编码一批不同数字或只缩短进度条解决。

### 5.3 约会测试基础已经存在

- 真人正式匹配已有完整 `dateCoordination` 流程。
- synthetic fixture 当前在匹配详情中被直接阻止发起约会。
- `fixtureResponseService` 已有 owner、expiry、`allow_date_coordination=false`、稳定哈希延迟和 `fixture_response_job` 基础。
- 本阶段应复用并打通这些能力，不能另造一套平行约会系统。

## 6. 不可改变的产品与安全决策

1. 硬条件由确定性代码和数据库字段执行，LLM/RAG 不能绕过、修改或“酌情放宽”硬条件。
2. 双向匹配必须保留：A 的期待对 B 的自述、B 的期待对 A 的自述分别计算。
3. 缺失信息等于“未知”，不是默认契合，也不是默认冲突。
4. AI 只能在硬条件通过的候选中召回和重排，不能新增候选。
5. 最终报告必须能追溯到脱敏 evidence key；禁止模型凭空补充用户未提供的事实。
6. 外貌只匹配用户主动填写的文字描述/标签与文字偏好；不推断颜值，不做人脸、照片吸引力或敏感属性判断。
7. 真人对真人约会流程不得自动拒绝，不得因本阶段测试规则改变真实业务状态。
8. 只有 `account_mode=internal_qa` 的真人对其 owner 相同、未过期的 `synthetic_fixture/matching` 发起测试约会时，才允许进入模拟流程。
9. 模拟约会最终结果由后端确定性规则决定为婉拒；LLM 只负责在安全模板边界内组织客服表达，不能决定身份、权限、延迟、接受/拒绝结果。
10. synthetic fixture 永远不能产生真实通知、短信、订阅消息、人工客服工单、线下安全确认或真实 `arranged` 状态。
11. 不得让测试画像伪装成真人；匹配详情和协调页必须持续显示“测试画像/模拟流程”标识。
12. 不得通过删除记录、改系统时间或污染正式 match claim 来加速测试。

## 7. 目标架构

```text
候选池
  → 双方确定性硬条件过滤
  → 资料分块与脱敏 evidence
  → 双向语义检索/召回
  → Top-K 候选及每对 Top evidence
  → 受约束 Prompt 双向精排
  → 可信度/完整度门槛
  → 最终匹配结果与证据化报告
```

### 7.1 硬条件层

至少覆盖已有的性别、年龄、明确城市、婚育、婚史、吸烟、明确身高范围、安全账号、历史 match claim/blocked 状态。双方硬条件分别执行，任一方向失败即不进入语义召回。

硬条件结果使用有限枚举 reason code；客户端只显示适当文案，不泄露对方原始硬条件。

### 7.2 Evidence chunk 模型

将用户主动提供的资料拆成可审计的脱敏语义块，至少包括：

```text
values_self
values_target
relationship_style
life_plan
city_plan
marriage_and_baby
appearance_self
appearance_target
other_requirements
deal_breakers
```

每个 chunk 至少包含：

```text
evidence_key
owner_user_id（仅内部映射，不进模型输出）
category
sanitized_text
source_field
content_hash
updated_at
completeness
```

禁止 chunk 包含手机号、微信号、OpenID、UnionID、精确地址、单位、收入原文、密钥或后台 token。

### 7.3 Embedding/检索提供方边界

- 必须先建立 provider adapter，不得把某家 embedding API 写死在业务服务中。
- 本地测试使用确定性 fake/stub embedding；禁止拿随机向量冒充真实验证。
- Cursor 不得猜测 DeepSeek 提供 embedding，也不得根据聊天模型密钥推断 embedding 可用。
- 如需选择 CloudBase 托管模型、第三方向量服务、创建集合/索引或填写新密钥，先完成只读能力检查和价格/配额说明，然后停止等待用户确认。
- 未配置真实 embedding provider 时，线上必须返回明确的 `semantic_retrieval_unavailable`，不得把旧 Jaccard 静默宣传为 RAG。
- MVP 可在硬筛选后的有限候选池中加载已生成 embedding 并在函数内计算 cosine；必须记录规模上限、超时和后续迁移向量索引的边界。

### 7.4 双向语义召回

每对候选分别执行：

```text
A.values_target / A.other_requirements → B.values_self / B.life_plan / B.appearance_self
B.values_target / B.other_requirements → A.values_self / A.life_plan / A.appearance_self
```

输出 A→B、B→A 的 evidence refs、相似度、缺失项和明确冲突。不能先把双方全部文字拼成一个向量再给一个总相似度。

### 7.5 Prompt 精排

Prompt 输入只能包含：

- 匿名 `candidate_ref`
- 硬条件已通过的有限枚举结果
- 双向结构化基础信号
- 双向检索命中的脱敏 evidence 与相似度
- 数据完整度

Prompt 输出必须是严格 JSON，至少包含：

```text
candidate_ref
rank
a_to_b_semantic_score
b_to_a_semantic_score
mutual_semantic_score
strength_evidence_keys
risk_evidence_keys
missing_categories
confirmation_questions
confidence
```

响应必须校验候选引用、数量、rank 唯一性、分数范围、evidence key 白名单、隐私文本和置信度。模型输出失败时不得写正式匹配结论。

### 7.6 最终评分与校准

- 保留双向思想，但不要把未经校准的字符相似度放进硬门槛。
- Jaccard 只允许作为兼容/诊断信号，不能作为 RAG 或主要三观语义分。
- 最终分必须区分：硬条件结果、结构化契合、语义契合、证据完整度和置信度。
- 缺失字段记为 `null/unknown/not_compared`，不发默认正分。
- 不允许用“所有维度加起来刚好 100”制造虚假精确度；内部原始分、归一化分和 UI 展示分必须含义一致。
- 评分权重先写成版本化配置，并在工作报告中注明“尚未经过真实约会结果校准”。
- 不得为了让截图好看而调整用户数据或 synthetic fixture 的真实字段。

## 8. 匹配报告 UI 设计规格

目标平台：微信原生小程序。

### 8.1 Purpose

把当前长篇灰色正文和大量满格进度条，改成可快速判断、可追溯证据、可继续操作的匹配档案。用户先看到结论、为什么、哪些待确认，再决定是否展开算法细节或申请约会。

### 8.2 Aesthetic Direction

采用 `Editorial / magazine`：温和、克制、有编辑层级，像一份可信的关系评估档案。禁止套用通用 AI 卡片墙、彩虹渐变或所有模块同样重量的布局。

### 8.3 Color Palette

```text
品牌强调：#FF6B8A
正文墨色：#2B2729
次级文字：#746B70
暖白背景：#FFF9F7
可信状态：#2F8A68
待确认状态：#A86F32
弱分隔线：#EDE4E6
```

### 8.4 Typography

- 原生小程序优先 `PingFang SC`，Android 回退 `Noto Sans CJK SC`/平台中文无衬线字体。
- 这是对通用 UI skill“避免系统字体”的窄范围例外：原因是微信小程序包体积、离线稳定性和中英文渲染一致性；禁止为视觉噱头加载远程字体。
- 建议层级：核心结论 44rpx/700，页面标题 34rpx/650，分组标题 28rpx/600，正文 26—28rpx/400，辅助信息 22—24rpx/400。
- 正文行高不少于 1.65；禁止截图中大面积低对比度灰字。

### 8.5 Layout Strategy

1. 顶部：对象基础信息、匹配结论、最终参考分、证据完整度/置信度。
2. 首屏：最多 3 条“为什么值得了解”和最多 3 条“见面前要确认”。
3. 中段：AI 报告按摘要、契合证据、差异/风险、沟通建议分组；使用短段落或有语义的列表，不渲染一整块作文。
4. 算法与字段拆解默认折叠；展开后缺失字段显示“资料不足”，有证据才显示分数/条形，不允许每行都满格。
5. 页面底部：独立行动区，主按钮是约会申请/测试约会申请，次操作为安全记录、反馈和客服。
6. 支持底部安全区；主 CTA 不得因报告过长而不可发现。

禁止使用 emoji 作为状态图标；现有 loading/error/empty emoji 应在本批用项目已有图标资产、CSS 几何标识或统一文本状态替换，不新增大型图标库。

## 9. 约会申请与模拟失败设计

### 9.1 真人匹配

- 匹配未锁定且满足真实业务条件时，底部显示“申请约会”。
- 继续走现有 `dateCoordination` 状态机和双方真实确认流程。
- 本阶段不得加入任何真人自动拒绝规则。

### 9.2 QA 真人对 synthetic fixture

- 匹配详情不再只显示“不能发起约会”；改为明确标记的“发起测试约会申请”。
- 点击后进入复用的约会协调 UI，但页面和后端都必须处于 `fixture_simulation` 模式。
- 用户可以完整填写偏好并提交，以测试真实交互体验。
- 提交成功后创建幂等 simulation interaction 和 `fixture_response_job`，延迟由 interaction ID + fixture run ID 的稳定哈希映射到 2—6 小时。
- 到期前状态显示“等待测试对象回应”；不得提前显示接受，也不得暗示 AI 正在自主决定。
- 到期后 worker 写入 `source_type=fixture_simulation` 的婉拒事件，状态显示“测试对象未接受本次约会申请”。
- AI 客服只可依据已确定的拒绝事件生成简短、礼貌、非归因式文案；不能编造具体拒绝理由、对方原话、联系方式或人格判断。
- 重复提交、页面重试、worker 重试只能产生一个有效任务和一个最终事件。

### 9.3 隔离要求

模拟流程绝对禁止：

```text
真实 date coordination arranged
真实 partner 通知
短信/订阅消息
人工客服工单
线下安全确认
真实约会后反馈资格
正式佣金、支付或 match claim 变化
```

fixture 过期、owner 不符、普通用户、真人对真人、`allow_date_coordination` 语义异常时必须拒绝模拟 API 调用。

## 10. 严格 TDD 交付批次

不得跳批。每批执行固定闭环：

```text
写失败测试并运行得到真实 RED
→ 最小实现
→ 运行专项验证
→ 审查 git diff 与 git diff --check
→ 只暂存本批文件/hunk
→ 审查 staged diff
→ 独立 commit
→ 报告 commit hash
```

### 批次 0：基线与 characterization

- 运行交接规定的六组 selfcheck 并保存结果。
- 新增能够证明“缺失字段仍给默认正分/满格显示”的失败测试。
- 新增能够证明 Jaccard 对同义表达误判的固定案例；不能用随机文本。
- 只写测试与必要 fixture，不改实现。

### 批次 1：分数真实性与未知值语义

- 调整 `matchPolicy`，将无证据字段从默认正分改为 `null/not_compared`。
- 将“契合度”和“数据完整度”分离。
- 修复质量门槛：自由文本字符重合度不得直接淘汰语义上可能匹配的用户。
- 保留明确硬冲突淘汰与双向硬条件。
- 版本化 score schema，兼容读取旧 match log，不批量回写生产历史。

### 批次 2：脱敏 evidence 与 embedding provider adapter

- 建立纯函数 chunk builder、PII sanitization、content hash 和版本字段。
- 建立 embedding provider interface、确定性测试 stub、错误分类、超时与限流边界。
- 不配置真实 provider 时明确失败，不伪造 RAG 成功。
- 为 chunk 更新、字段删除、重复保存和脱敏失败写测试。

### 批次 3：双向语义检索/RAG

- 硬过滤之后才运行检索。
- 分别实现 A→B、B→A evidence retrieval。
- 返回 top evidence refs、missing categories、conflict signals 和 retrieval version。
- 为 owner 隔离、fixture expiry、未知 evidence、零命中、同义表达和反向不满足写测试。
- 记录候选池规模、Top-K、超时和缓存策略。

### 批次 4：Prompt 精排与最终分

- Prompt 只接受匿名候选和白名单 evidence。
- 模型只能重排，不能增删候选或推翻硬条件。
- 严格校验 JSON、候选引用、evidence refs、隐私、置信度和数据完整度。
- 最终分使用版本化配置，报告/数据库/UI 使用同一 canonical 值。
- 模型低置信度、非法输出、超时、限流、鉴权失败分别可诊断，不统一吞成 fallback。

### 批次 5：可信 AI 报告

- 报告完全基于匹配时保存的 evidence snapshot，不能从后来变化的用户资料重新推断。
- 报告按摘要、证据、待确认、建议、局限生成，禁止一整段模板作文。
- 数据不完整时主动降低语气强度；没有心理测评不得写“心理高度一致”。
- 报告中的每个实质判断必须引用允许的 evidence key。
- 旧报告保持可读，新 schema 有明确版本。

### 批次 6：匹配详情 UI 重做

- 先在实现记录中输出并确认第 8 节设计规格，再修改 WXML/WXSS/JS。
- 重做字体层级、正文对比度、报告分组、缺失字段状态和折叠算法区。
- 只展示有证据的维度分；未知字段不画伪进度条。
- 保留总匹配参考分，但去掉伪精确小数和满屏“高度契合”。
- 加入页面级 loading/error/empty/report queued/failed 状态视觉回归。
- 使用真实小程序尺寸做截图或开发者工具验证；若 Cursor 无法使用开发者工具，明确记录未验证缺口，不得声称视觉完成。

### 批次 7：底部约会 CTA 与 fixture 模拟协调

- 真人详情显示真实“申请约会”。
- fixture 详情显示明确的“发起测试约会申请”，不能伪装真人。
- 复用 date coordination 页面和现有 fixture response service。
- 创建 2—6 小时稳定延迟任务、等待态、到期婉拒事件和 AI 客服安全文案。
- 为重复点击、离开恢复、任务重试、fixture 过期、owner 不符、普通用户直调 API 写测试。
- 证明不会产生任何真实协调/通知/工单/安全确认/支付/佣金副作用。

### 批次 8：后台可观测性与迁移计划

- 后台只读展示 retrieval version、score version、report version、fixture simulation 状态和失败 reason code。
- 不展示完整 prompt、自由文本、embedding、密钥或联系方式。
- 如需新 CloudBase 集合/索引，先给出 dry-run 清单、字段、索引、预计文档量和回滚方案；等待用户确认后才允许 MCP 创建。
- 历史用户 chunk/embedding 补建必须是幂等、可分页、可暂停的 job；本任务默认只实现 dry-run 与本地测试。

### 批次 9：最终 Review、全量验证与工作报告

- 重新运行六组 selfcheck 与全部新增专项测试。
- 运行 `cloudbase-code-review`，完成安全、隐私、NoSQL、函数超时、外部模型调用和 UI 审查。
- 审查全部本批 commit，不以“测试通过”代替 diff review。
- 创建并提交第 1 节指定的工作报告 MD。

## 11. 最低测试矩阵

```text
同义不同字的三观表达能够进入语义召回
文字相似但立场相反不会被判定高度契合
缺失字段显示 unknown，不获得默认正分
未比较字段不画满格进度条
证据完整度与契合度分别计算
A 满足 B、B 不满足 A 时双向结果明确不对称
硬条件任一方向失败时不调用 embedding/LLM
LLM 不能返回候选池外 candidate_ref
LLM 不能引用检索结果外 evidence_key
低置信度/超时/限流/鉴权/非法 JSON 可区分
报告无心理证据时不写心理高度一致
报告所有实质判断可追溯 evidence snapshot
旧 match log 与旧报告仍可打开
报告页面文字对比度、字号、行高和折叠状态符合设计规格
底部约会 CTA 在长报告后仍可发现
真人→真人进入真实协调且绝不自动拒绝
QA 真人→owner fixture 可提交完整测试约会表单
模拟任务延迟稳定落在 2—6 小时
重复提交/重试只有一个 job 和一个最终事件
到期前等待，到期后模拟婉拒
模拟婉拒不编造具体理由
fixture 过期/非 owner/普通用户直调全部拒绝
模拟流程不产生真实通知、工单、arranged、安全确认、支付、佣金或正式 claim
```

## 12. 每批验证与全量门禁

每个批次运行相称的专项测试。最终至少完整运行：

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
```

并运行：

```powershell
git diff --check
git status --short --branch
```

不得删除、跳过或弱化现有测试来获得绿色结果。

## 13. 最终 Review 必答问题

1. 所谓 RAG 是否真的调用了 embedding 和 evidence retrieval，还是只改了 Prompt 文案？
2. 硬条件是否仍由确定性代码控制，LLM 是否存在绕过路径？
3. A→B 与 B→A 是否分别检索和评分？
4. 缺失字段是否仍被当作默认契合？
5. 字段满分是否来自真实证据，还是 fixture/默认值/展示逻辑？
6. 最终分、报告分和 UI 展示分是否来自同一 canonical score？
7. 报告是否存在无证据推断、过度肯定或隐私泄漏？
8. embedding/chunk 是否可能包含手机号、OpenID、微信号、精确地址、密钥或后台 token？
9. synthetic fixture 是否能触发任何真实约会副作用？
10. 真人对真人是否存在自动拒绝分支？
11. 模拟拒绝是否由后端确定性任务控制，而不是由 LLM 自主决定？
12. 重复请求和 worker 重试是否幂等？
13. UI 是否通过真实尺寸验证，而不是只看 WXML/WXSS？
14. 是否保留并隔离所有已有/并发用户改动？

## 14. CloudBase、生产与停止条件

- CloudBase 管理、查询、数据库结构、配置和部署只允许 MCP。
- Cursor 默认只做本地代码、本地测试和 dry-run，不得写生产数据、部署函数、上传体验版/正式版小程序。
- 当前生产 `api` 已部署到提交 `0bd642a`；不得把后续本地代码误报为已部署。
- 需要新 embedding provider、API key、CloudBase 托管模型、集合/索引、批量 embedding 回填、worker/API 部署或小程序上传时，分别停止并请求用户明确确认。
- 必须使用 Computer Use、人工控制台、微信后台或缺少 MCP 能力时立即停止并报告。
- 不得修改生产权限、支付价格、佣金、VIP、真人正式 match claim 或历史报告数据。
- 同一路径连续失败 3 次时停止补丁循环，提交根因、影响范围和整体修复建议。

## 15. 强制最终工作报告

Cursor 完成最后一个本地批次后，必须创建：

```text
project-docs/WORK_REPORT_2026-08-15_RAG_MATCH_REPORT_DATE_SIMULATION.md
```

报告不得只是“已完成”。至少包括：

1. 目标、范围、明确未做事项。
2. 开始与结束 commit、每批 commit hash、每批文件清单。
3. RAG 实际架构：embedding provider、chunk schema、检索方式、Top-K、双向证据、缓存与失败模式。
4. 评分变化前后对照，特别说明缺失字段、默认分、完整度与最终分。
5. 至少 5 个固定匹配案例的前后结果，包含高契合、不对称、同义表达、明确冲突、资料不足。
6. UI 设计规格、页面结构变化、真实尺寸截图路径或无法截图的明确缺口。
7. 真人约会与 fixture 模拟约会的状态机对照。
8. 模拟拒绝延迟、幂等键、事件字段和“无真实副作用”证据。
9. 新增/修改的集合、索引、环境变量、feature flag；未实际创建的必须标记 `pending_user_confirmation`。
10. 六组 selfcheck 与专项测试的命令、结果和时间。
11. CloudBase code review、隐私审查、diff review 结论。
12. 所有仍存在的风险、尚未校准项、生产部署步骤和所需用户确认。
13. 工作区中保留的既有/并发 dirty 文件清单。

工作报告必须作为独立最终批次提交，并报告 commit hash。禁止把用户已有的 `WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md` 混入或覆盖。

## 16. 完成标准

只有以下全部满足，Cursor 才能报告“本地实现完成”：

1. 所有交付批次均按 RED→GREEN→Review→独立 commit 执行。
2. 硬条件、双向 RAG、Prompt 精排和报告 evidence 形成真实闭环。
3. 缺失字段不再获得默认正分，UI 不再出现无证据满格。
4. 匹配详情符合第 8 节设计规格并完成真实尺寸验证，或明确记录工具阻塞。
5. 真人约会保持真实流程；fixture 测试约会可完整操作且最终隔离婉拒。
6. 六组 selfcheck 与新增专项测试全部通过。
7. 最终安全、隐私、CloudBase、UI 和 diff Review 通过。
8. 每批 commit hash 已报告。
9. 强制工作报告已创建、审查并独立提交。
10. 生产资源、部署、小程序上传和历史数据均未在无授权情况下修改。
