# WeFinally 小程序继续开发交接（2026-07-26）

## 1. 必须先遵守的工作目录和 Git 边界

实际工作目录：

```text
D:\wefinal\.worktrees\wefinally-ai-agent
```

当前分支：

```text
feature/ai-agent-system
```

该工作树有大量尚未提交改动。接手后禁止执行：

```text
git reset
git clean
git checkout
git restore
```

不要切回 `D:\wefinal` 下的主项目目录开发，不要覆盖用户改动，暂时不要提交 Git。

当前 `git diff --stat` 仅统计已跟踪文件约为：

```text
63 files changed, 3107 insertions(+), 358 deletions(-)
```

此外还有多项未跟踪的新页面、云函数模块、自检和文档。必须先读本交接文档，禁止从头大范围扫描项目。

## 2. 当前产品和架构原则

- 小程序主链使用微信云开发，环境：

  ```text
  cloud1-d4gy8l52g08bba326
  ```

- 主云函数目录：`miniprogram/cloudfunctions/api`。
- AI 报告异步任务：`miniprogram/cloudfunctions/report-worker`。
- MiniMax 负责真实自然语言回复；业务 Agent、状态机、知识库和工具权限属于 WeFinally 自身。
- 模型不能直接写数据库。所有新增、修改、删除必须经过白名单业务服务，并具备身份校验、幂等和审计。
- 不依赖供应商 `conversation_id`。A/B 双方必须使用独立 session，并通过内部 `coordination_id` 关联业务任务。
- 不向模型或另一方暴露手机号、OpenID、联系方式、精确地址、收入原文、内部管理员凭证等信息。
- 不在日志、回复或文档中打印 API Key、微信支付 APIv3 密钥、商户私钥或管理员 token。

## 3. 当前本地和云端状态

### 3.1 已部署

2026-07-24 已通过已授权 CloudBase MCP 从当前工作树更新云端 `api` 云函数，并通过 ping 验证可用。该次部署包含当时工作树内的：

- 会员审核业务路由；
- 内测 VIP 业务服务；
- A/B 匹配测试夹具；
- 当前 AI Agent、约会协调、AI 报告、订单和支付相关云函数代码。

不要因为“云函数已部署”就认为“小程序客户端已上传”。小程序 JS/WXML/WXSS 需要微信开发者工具或 CI 单独上传，当前体验版是否包含所有最新客户端改动仍需核对。

### 3.2 CloudBase MCP

CloudBase MCP 已完成用户授权，可以用于只读查询、云函数管理和部署验证。任何生产数据写入仍必须调用项目业务接口，禁止为了省事直接改文档数据库。

### 3.3 管理后台

本地管理后台入口：

```text
http://127.0.0.1:3000/admin/
```

Docker MySQL 需启动，否则会出现：

```text
connect ECONNREFUSED 127.0.0.1:3306
```

管理员 `grace` 已同步过，但不要在交接文档中记录密码。会员审核已增加“查看资料”、通过、补资料、拒绝、停用、恢复和转交等流程。

## 4. 已完成的重要功能

### 4.1 AI 客服与约会协调

- 平台客服、恋爱助手、约会协调员的 Agent 路由和上下文。
- MiniMax 真实回复和失败分类。
- A/B 独立会话、`coordination_id`、参与者身份校验。
- 约会申请修改预览、确认、版本、幂等、重算和脱敏通知。
- 无交集协调和重新协调状态。
- 人工客服/企微适配接口与后台工单基础结构。
- 知识库种子、后台知识入口和隐私安全边界。

重点文件：

```text
miniprogram/cloudfunctions/api/agent/
miniprogram/cloudfunctions/api/handlers/agent.js
miniprogram/cloudfunctions/api/handlers/dateCoordination.js
miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js
miniprogram/pages/chat/
miniprogram/pages/date-coordination/
```

### 4.2 AI 匹配报告

- 报告任务状态机、重试、保留策略和异步 worker。
- MiniMax 报告提示词已禁止输出具体分数、身份原文、联系方式和颜值判断。
- 小程序报告 UI 已做温柔粉色高级感方向的优化。

仍需真实云端验证报告任务从 `queued/generating` 最终进入 `succeeded/failed`，尤其检查云函数执行时间与 MiniMax 最长响应时间之间的差异。不要把临时婚恋参考文案标成正式 AI 报告。

### 4.3 会员审核、内测 VIP 和 A/B 测试夹具

新增：

```text
miniprogram/cloudfunctions/api/handlers/internalTestVip.js
miniprogram/cloudfunctions/api/handlers/abMatchFixture.js
server/selfcheck/internal-test-vip.js
server/selfcheck/internal-test-vip-route.js
server/selfcheck/ab-match-fixture.js
server/selfcheck/ab-match-fixture-route.js
```

规则：

- 仅超级管理员可操作。
- A 必须审核通过、状态有效并持有有效内测 VIP。
- 创建一次性合成 B，不修改霞姐或其他真实会员。
- 通过 `is_test_fixture`、`ab_test_run_id` 和 `ab_test_owner_user_id` 三重标记。
- 清理必须精确绑定 owner、run 和 fixture 标记，只删除对应测试候选、偏好和匹配日志，审计记录保留。

内测 A 用户 ID：

```text
1784818962143965
```

A 已授权内测 VIP。本轮已创建测试 B 并完成一次真实“立即匹配”；后台按钮应显示“清理A/B测试”，说明当前测试夹具仍可能处于活动状态。完成诊断后必须从后台业务按钮安全清理，不能直接删库。

### 4.4 订单、发票和支付

- 新增“我的订单”页面：`miniprogram/pages/orders/`。
- 新增个人/企业开票申请页面：`miniprogram/pages/invoice/`。
- 企业发票填写抬头、纳税人识别号和接收邮箱；电子发票通常不需要用户提供公司章，最终开票主体和税务合规仍由公司财务/开票平台负责。
- 微信支付已出现过真实 1 分钱成功订单，数据库证据包含 `notify_received_at`、`pay_status=1` 和 `pay_time`。
- 另有 188 元预支付记录曾停留在 `PREPAY_CREATED/pay_status=0`，不能把预支付创建等同于支付成功。
- 微信支付请求已补充明确 `User-Agent`；禁止泄露商户配置和密钥材料。

## 5. 当前最优先 Bug：综合分显示错误

用户刚完成 A/B 匹配后发现“多数项目满分，但有两项 0 分，综合却显示 100”。

已定位根因：

1. 匹配算法权重总满分不是 100，而是 128：

   ```text
   婚育30 + 三观25 + 关系偏好18 + 外貌10 + 年龄15
   + 身高12 + 学历8 + 圈层6 + 城市4 = 128
   ```

2. `matchPolicy.scorePair()` 已计算：

   ```js
   normalizedTotal = total / maxTotal * 100
   ```

3. 但 `miniprogram/pages/match-detail/match-detail.js` 当前直接把数据库 `total_score` 原始分当百分制：

   ```js
   totalScorePercent: Math.min(100, Math.round(Number(totalScore) || 0))
   ```

4. 当前测试样本若“关系偏好 0 + 外貌偏好 0”，其他维度满分正好得到原始总分 100；UI 因而错误显示成 100%，实际应约为：

   ```text
   100 / 128 ≈ 78%
   ```

5. 两项 0 分的常见原因：

   - A 没有填写 `psych_profile_json`，测试 B 复制后仍为空；
   - 双方外貌描述与期待没有可识别关键词交集。

下一任务先为该问题写失败自检，再修复。推荐兼容历史记录的展示顺序：

```text
score_detail.normalized_total
→ score_detail.normalizedTotal
→ 根据 total/max_total 计算
→ 旧记录最后才回退 total_score
```

不要直接把数据库历史 `total_score` 批量改成百分制，因为质量门槛和后台诊断仍可能依赖 128 分制原始分。

同时调整 `getTotalMatchDisplayText()` 阈值，使其基于归一化百分比，而不是 128 分制原始分。

## 6. A/B 测试夹具的局限与下一步

当前 `abMatchFixture.fixtureProfile()` 为了保证链路必定成功，会：

- 将 A 的自我三观与择偶期待互换复制给 B；
- 主动让年龄、身高、学历、城市和婚育等字段满足 A；
- 将 A 的关系偏好复制给 B。

因此“大量满分”是测试夹具偏置，不代表真实用户都会满分，也不适合用来评估算法区分能力。

下一步建议把测试夹具扩展成明确场景：

```text
high_fit     高契合但不全满
medium_fit   中等契合
edge_pass    刚好通过质量门槛
hard_reject  硬条件淘汰
missing_data 资料缺失
```

每个场景必须有固定期望分数范围、双向质量门槛结果和可解释原因。不要生成真实手机号、OpenID 或可识别个人信息。

## 7. Agent 参与匹配的产品决策

用户正在评估“算法筛选 + Agent API”混合匹配。推荐架构：

```text
数据库硬条件筛选
→ 确定性算法双向评分
→ 只向 Agent 提供脱敏 Top-K 候选
→ Agent 语义重排并给出证据/风险/置信度
→ 确定性安全和质量门槛
→ 后端业务服务审计落库
→ AI 生成双方独立脱敏报告
```

禁止：

- 让 Agent 扫描全库；
- 让 Agent 直接写数据库；
- 把手机号、OpenID、精确住址、单位或联系方式发给模型；
- 让模型输出任意用户 ID 直接落库；
- 用模型回复代替硬条件、黑名单、重复匹配和权限判断；
- 依赖供应商 conversation ID 维持业务状态。

实施前先建立离线 A/B 评估集，对比：

```text
A：纯算法排序
B：算法硬筛 + Agent 重排
```

指标至少包括双方接受率、有效沟通率、见面率、拒绝原因、人工复核一致率、稳定性、成本和延迟。

## 8. 接手后先运行的验证

不要先改代码或部署。依次运行：

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
```

上次已知这些总自检曾全部通过，但交接日没有重新运行；必须以新任务的实际输出为准。若失败，记录单个失败脚本和根因，不得通过回滚用户改动解决。

建议第一轮任务：

1. 为综合分归一化显示建立失败测试并修复。
2. 验证当前 A/B 匹配双方记录、两项 0 分的实际字段和 AI 报告状态。
3. 从后台业务按钮清理当前一次性 B。
4. 扩展多场景 A/B 夹具，但先写计划并说明影响。
5. 设计 Agent Top-K 重排接口和脱敏 schema，先做离线评估，不直接接生产落库。
6. 完成小程序客户端编译、真机和体验版验证后，再决定上传；部署前执行 CloudBase deployment gate。

## 9. 关键安全与操作要求

- 所有代码修改使用小步测试驱动，先失败、再修复、再回归。
- 云端管理优先使用已授权 CloudBase MCP；调用前确认工具参数。
- 数据写入只走项目业务服务，不执行原始数据库增删改。
- 部署前必须验证，且区分“云函数部署”和“小程序客户端上传”。
- 不要删除本地数据库；内测数据清理应使用有标记、可审计的业务清理流程。
- 不提交 Git，除非用户之后明确要求。
- 不修改或删除与当前任务无关的已有改动。
