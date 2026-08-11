# WeFinally AI 匹配与合伙人能力交接（2026-08-12）

## 1. 下一任务唯一入口

下一任务不要重新从头扫描项目。必须依次完整阅读：

1. `D:\wefinal\.worktrees\wefinally-ai-agent\AGENTS.md`
2. `D:\wefinal\.worktrees\wefinally-ai-agent\PROJECT_HANDOFF.md`
3. `D:\wefinal\.worktrees\wefinally-ai-agent\CONTRIBUTING.md`
4. 本交接文档
5. `D:\wefinal\.worktrees\wefinally-ai-agent\plan.md`

`plan.md` 是本轮实现范围、验收和整个 Project 停止条件的唯一执行 Prompt。历史 `project-docs/archive/` 仅供查证，不是当前需求真源。

## 2. 工作目录、分支和 Git 状态

唯一允许开发的目录：

```text
D:\wefinal\.worktrees\wefinally-ai-agent
```

编写本交接时的实际分支：

```text
feature/partner-gated-aigc-plan
```

编写前 HEAD：

```text
6b92a153ceee9a9b662e3b0dece9e06ca8d088e9
```

根 `AGENTS.md` 和旧交接中仍有 `feature/ai-agent-system` 的历史描述；下一任务以 `git branch --show-current` 的实际输出为准，未经用户授权不要切分支、合并或改写历史。

编写本交接前已经存在的用户改动：

```text
M  server/public/partner/index.html
M  server/selfcheck/cloudbase-partner-connection.js
M  server/selfcheck/customer-service-browser-fixture.js
?? server/selfcheck/customer-service-browser-host.js
?? specs/2026-08-12-partner-gated-launch/
```

这些文件/目录均为用户所有，本次文档提交不包含它们。下一任务必须再次运行 `git status --short --branch`，不得 reset、clean、checkout、restore、覆盖、删除或顺手提交这些改动。

## 3. 最新确认的产品决策

### 3.1 一个小程序，多角色能力

不做两个小程序。普通会员和合伙人使用同一 AppID、同一代码库，根据后端角色显示不同入口；服务端必须同时鉴权。

### 3.2 只增加“其他补充需求”

最新决定是不单独增加期望地区字段，而是在匹配设置最底部增加一个选填的“其他补充需求”文本框。用户可在其中表达城市、未来生活规划、三观、生活方式、外貌气质偏好和其他具体要求。

现有未跟踪 `specs/2026-08-12-partner-gated-launch/requirements.md` 仍写有独立地区字段，这是较早方案；实现前应以最新决定为准，除非用户再次确认独立地区字段。

### 3.3 AI 匹配是产品核心

最终主链：

```text
确定性硬筛
→ 双向结构化评分和质量门槛
→ 脱敏 Top-K
→ DeepSeek 理解三观、择偶观、生活规划、外貌气质偏好和补充文字
→ 双向语义重排
→ 后端复核与唯一匹配占用
→ 双方独立报告
```

Top-K 是硬筛和结构化评分后排名靠前的 K 个候选，不是最终一个人。AI 不扫描全库、不直接写数据库、不接触手机号、OpenID、微信号、精确地址、密钥或私钥。

匹配不是纯 RAG，也不需要为了匹配引入 LangGraph。RAG 只适合审核过的客服知识；LangGraph 更适合客服和约会协调等可暂停、可恢复的多轮流程。

### 3.4 两种 AI 意图交互模式

共用一套后端，通过配置切换：

- `automatic`：AI 后台生成画像，只有严重歧义时追问；
- `confirm`：展示“我对你的理解”卡片，由用户确认或修改。

两个版本都需本地跑通，供老板判断确认操作是否繁琐。

### 3.5 所有正式账号只能成功匹配一次

这是正式业务规则，不是内测开关。成功匹配会同时占用 A、B；双方以后不能再次发起或成为候选。无候选、模型失败或未正式落库不消耗资格。必须由后端原子约束和并发测试保证，不能只禁用前端按钮。

### 3.6 合伙人能力

合伙人需要：

- 微信一键分享和备用邀请码；
- 注册后不可覆盖的单一合伙人归因；
- 一个单页 Dashboard，展示分成规则、累计/待结算/已结算/可用金额、归因注册人数、资料/审核/付费漏斗和 7/30 日趋势。

“分享人数”以实际归因注册的去重用户数为准，分享按钮触发次数只能作为单独行为指标。佣金只由服务端验证的支付事件产生，前端不计算钱；本轮不做复杂提现。

### 3.7 人工客服

小程序通过微信官方 `<button open-type="contact">` 接入人工客服。用户个人微信号不得写死在代码里；后续由用户在微信小程序后台把自己的微信账号添加为客服人员。需要控制台人工配置时必须停止并给出清单。

## 4. 已知基础能力与不要重复做的工作

- 匹配详情对 128 分制历史数据的归一化读取逻辑和相关自检此前已经完成，继续保留并回归，不要重新批量改历史生产数据。
- 已有 `high_fit`、`medium_fit`、`edge_pass`、`hard_reject`、`missing_data` 五类离线场景基础。
- 已有脱敏 Top-K Agent 重排策略，下一步应定向复用、补强和接入，不要让模型扫描全库或任意落库。
- LangGraph 本地候选已经有客服、双向约会协调、checkpoint、安全桥接和回退测试；匹配主链不依赖它。
- 管理后台已具备部分 CloudBase 接入；合伙人后台相关代码和自检当前存在用户未提交改动，先定向审查，禁止重写 UI。
- 旧交接记载的云函数部署和小程序客户端上传不是同一动作；任何发布都必须分别验证和授权。

## 5. 下一任务第一步

不要先改代码、部署或打开浏览器控制台。按顺序运行：

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
```

记录每组实际输出。失败时根据证据处理，不得通过回滚用户改动让测试变绿。

完成基线后，只做与 `plan.md` 第一可交付批次直接相关的定向检查。推荐第一批：

1. 核对现有匹配设置、画像 Schema、匹配服务和相关自检的真实字段；
2. 先写“其他补充需求 + AI 意图画像 automatic/confirm”失败测试；
3. 实现最小本地闭环并提交；
4. 再进入全局一次成功匹配的原子约束和并发测试。

## 6. 整个 Project 的停止边界

成功停止、外部配置停止、工具停止、安全停止和防无限循环规则均已写入根 `plan.md` 第 11 节，下一任务必须严格执行。

尤其注意：

- 本地先跑通；
- CloudBase 管理优先且仅在授权范围内使用 CloudBase MCP；
- MCP 无权限/不支持且必须人工控制台操作时停止；
- 禁止使用 Computer Use、浏览器自动化或模拟鼠标键盘操作 CloudBase、微信公众平台或腾讯云控制台；
- 需要用户填写环境 ID、生产密钥、客服人员、支付、域名、备案或部署配置时停止并列出明确步骤；
- 不直接写生产数据库；
- 达到本轮验收条件后停止，不继续扩张运营功能。

## 7. 新任务启动语

新任务可直接使用：

```text
继续 WeFinally 开发。不要从头扫描项目，先完整阅读根目录 AGENTS.md、PROJECT_HANDOFF.md、CONTRIBUTING.md、project-docs/NEXT_THREAD_HANDOFF_2026-08-12_AI_MATCHING_PARTNER_DASHBOARD.md 和 plan.md。实际工作目录必须是 D:\wefinal\.worktrees\wefinally-ai-agent。先检查 git status 并保护所有已有用户改动，再按交接文档运行六组 selfcheck，之后严格按 plan.md 从第一个可交付批次开始测试驱动开发。CloudBase 只允许使用 MCP；如果必须由用户填写内容或必须使用 Computer Use/人工控制台操作，立即停止并报告。
```
