# WeFinally UI/UX Refactor Goal V1

> 状态：执行中
> 分支：`feature/ui-ux-refactor-goal-v1`
> 基线：`codex/cloud-backoffice-rbac-final` @ `534e3c9`（当前最新、包含全部目标页面的整合分支）
> 工作目录：`D:\wefinal\.worktrees\wefinally-ui-ux-refactor-goal-v1`（独立 worktree，不污染其他分支）
> 日期：2026-08-24 起

---

## 0. 执行摘要

在不改变 WeFinally 核心业务逻辑（认真婚恋 / AI 辅助匹配 / 无私聊 / 官方协调奔现 / 平台一对一对接）的前提下，
对小程序前端做一轮系统性 UI/UX 重构：

1. 把 baoyu design skill 改造成本机 DSH 可复用的 skill，并在本轮真实使用；
2. 建立 design tokens（颜色/字体/间距/圆角/阴影）与统一组件（AI thinking、状态视图、新匹配弹窗等）；
3. 重构 P0 页面：首页、新匹配弹窗、匹配记录、匹配详情、第一次约会/AI 协调、AI 恋爱助手、AI 报告（详情页报告区）、我的页；
4. 统一图标体系（线性圆角 SVG mask 图标替代 emoji 混排）；
5. 全部产出 review 文档并 push GitHub。

红线（不可违反）：

- 不部署生产、不上传微信体验版；
- 不做后端/云函数大改，UI 重构只动 `miniprogram` 客户端层（新增组件/样式/页面 WXML/WXSS/必要 JS 展示态）；
- 不破坏现有安全、权限、AI 合规标识（🤖 AI 生成内容标注必须保留且更醒目）；
- 不引入大规模风险依赖（纯原生小程序能力，零 npm 新依赖）。

## 1. 现状盘点（Stage 0 完成）

### 1.1 页面清单与角色映射

| Goal 要求 | 实际页面 | 现状评估 |
|---|---|---|
| 首页（AI匹配首页） | `pages/index` | 已有 journey 进度带 + 下一次介绍卡 + VIP 卡 + 安全求助 + AI恋爱助手入口 + 最近匹配 + 快捷入口；视觉仍偏"卡片堆叠"，缺主视觉与新匹配仪式感 |
| 新匹配结果弹窗 | （不存在） | 打开小程序有新匹配时无任何仪式感提示；需新增 client-only 弹窗（基于本地 last-seen match id，不改 API） |
| 匹配记录页 | `pages/match-list` | 列表信息平铺，状态不清晰；QA 面板置顶混入正式视图 |
| 匹配详情页 | `pages/match-detail` | 信息全但主线感弱：匹配对象卡→结论卡→AI报告卡→反馈卡→算法细节→CTA；需按决策顺序重排+强化 CTA |
| 第一次约会/AI协调 | `pages/date-coordination`（+`date-feedback`） | 状态流完整（collecting_initiator/inviting_partner/waiting_confirmations/arranged/no_overlap/declined/expired），但状态表达分散在多个卡片，需要状态卡统一叙事 |
| AI恋爱助手 | `pages/love-advisor`（入口）+ `pages/chat?agentType=love_advisor` | 入口页轻量；chat 页已有 generating/error/retry 气泡态，但视觉未统一、用户ID卡突兀 |
| AI 报告页 | `pages/match-detail` 内 report-card（structured report） | 已结构化分段；阅读密度高，标题层级/分组/留白需优化 |
| 我的页 | `pages/profile` | 菜单 emoji 混排 13 项平铺；资料就绪度卡已有；合伙人工作台保留 |
| AI loading 统一 | chat 页局部有 gen-ring | 需抽成全局组件覆盖 chat/date-coordination/match-detail 报告生成 |
| 图标系统 | emoji 为主（⚙️📜🛡️💗🎧🔔…） | 需统一线性圆角图标 |

### 1.2 关键技术事实

- 原生微信小程序（WXML/WXSS/JS），无 npm 前端依赖、无构建链；
- 全局样式 `app.wxss`（280 行）已有一批约定类（card/btn-primary/tag/state-wrap 等），页面全部依赖它们 —— 重构必须保持这些类名兼容，采用「token 化改造 + 追加体系」而非推倒重来；
- 组件机制可用（已有 `components/qa-match-panel` 先例，usingComponents 注册）；
- tabBar：匹配 / 记录 / 我的，主色 `#FF6B8A`；
- 导航栏底色 `#FF6B8A`、页面底色 `#F8F4F5`；
- `utils/productExperience.js` 提供 readiness/journeyState/matchSummary 三个人才体验函数（保留复用）；
- chat 页 JS（673 行）含 agentType 分支：love_advisor / date_coordinator / platform_service，含 patch preview（约会申请确认流）——展示逻辑不动，只重塑视觉。

### 1.3 Git 与安全边界

- 远端 `origin` = github.com/John030427/wefinally（私有）；远端 main 为无旧历史的安全基线 `7d8d754`，但各 feature/codex 分支（含本基线 534e3c9）已在远端存在——本分支 push 不新增历史暴露面；
- 本任务只在独立 worktree + 新分支上进行；不 reset/不 clean 其他工作树；
- 每阶段 checkpoint commit，只暂存本任务文件。

## 2. 阶段计划

### Stage 0 准备（✅）
- [x] worktree + 分支
- [x] 页面盘点（见上）
- [x] 本 plan 文件落库

### Stage 1 研究 + 风格方案
- [ ] RESEARCH_SUMMARY.md（CMB/Hinge/Bumble 借鉴与取舍）
- [ ] baoyu skill → DSH skill 安装（Task A）+ 使用记录
- [ ] 4 套粉色风格方向 HTML 风格板（baoyu-design 产线输出到 `designs/wefinally-uiux-refactor-goal-v1/`）
- [ ] STYLE_DIRECTIONS.md（含选择矩阵与选型结论）

### Stage 2 设计系统
- [ ] `miniprogram/styles/tokens.wxss`：color/typography/spacing/radius/shadow tokens（CSS variables，page 级注入）
- [ ] `miniprogram/styles/icons.wxss`：线性圆角 SVG mask 图标体系（约 20 个基础图标）
- [ ] app.wxss token 化改造（保持旧类名兼容）
- [ ] 组件：`state-view`（empty/error/network/loading）、`ai-thinking`（AI 统一等待态）、`new-match-modal`（新匹配仪式弹窗）
- [ ] DESIGN_SYSTEM.md

### Stage 3 关键页面重构（P0 顺序）
- [ ] index 首页：Hero 区 + 新匹配强提示 + 下一次介绍倒计时 + AI助手入口 + 最近匹配精选化 + QA面板隔离
- [ ] new-match-modal 接入首页（last-seen match id 判定，纯客户端）
- [ ] match-list：列表卡片化 + 状态标签 + QA 面板折叠隔离
- [ ] match-detail：决策顺序重排（状态头→为什么值得了解→亮点→需要确认→AI建议→CTA）+ AI 报告可读性重构
- [ ] date-coordination：顶部状态卡统一叙事（邀请中/待回应/协调中/已有最终安排/本次未成）+ 方案对照卡 + AI 服务位收敛
- [ ] love-advisor + chat：欢迎区自然化 + 用户ID卡收纳 + 气泡/输入区统一 + ai-thinking 组件接入
- [ ] profile：菜单分组（资料与匹配 / 会员与订单 / 安全与服务）+ 图标统一 + 资料就绪度强化

### Stage 4 统一态收口
- [ ] 所有 AI 场景接入 ai-thinking（chat / date-coordination 协调中 / match-detail 报告生成中）
- [ ] error/retry 态统一 state-view
- [ ] empty/skeleton 态补齐

### Stage 5 测试 + 文档 + push
- [ ] JS 语法检查（node --check 全量页面/组件/utils）
- [ ] WXML/WXSS 静态检查（标签配对、花括号平衡、app.json 页面一致性）
- [ ] 微信开发者工具 CLI 编译尝试（若本机 CLI 可用）；否则以静态检查+代码评审代替并在 QA 文档注明
- [ ] 业务回归走查清单（对照 AGENTS.md 安全边界逐条核对）
- [ ] MANUAL_QA_CHECKLIST.md / FINAL_RESULT.md / PAGE_BY_PAGE_CHANGES.md / BAOYU_DSH_PLUGIN_ADAPTATION.md
- [ ] push origin feature/ui-ux-refactor-goal-v1

## 3. 选型预案

主候选 Style A「轻奢柔粉」（奶油粉+玫瑰粉+暖白、大圆角、轻阴影、克制字重），
备选 Style C「极简效率粉」（霞姐"拿起来就能干"优先时切换）。
最终以选择矩阵为准，矩阵见 STYLE_DIRECTIONS.md。

## 4. Definition of Done（同 goal）

1. baoyu skill 已改造为 DSH 可用 skill 且本轮真实使用
2. ≥4 套粉色风格方向 + 选择矩阵
3. 1 套主风格落地
4. P0 八个页面/模块完成重构
5. AI loading/error/retry 统一组件落地
6. 图标体系统一
7. 编译/静态检查通过
8. 业务回归通过（无私聊、无头像、AI 标识保留、安全入口不变）
9. review 文档完整
10. push GitHub 成功
11. 未部署生产、未上传体验版
