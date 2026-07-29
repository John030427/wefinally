# WeFinally AI 客服与约会协调 Agent 交接（2026-07-16）

## 1. 下一会话必须使用的工作目录

当前微信开发者工具实际打开的是：

```text
D:\wefinal\.worktrees\wefinally-ai-agent
```

Git 分支：

```text
feature/ai-agent-system
```

不要切回主项目目录继续改 AI 客服，也不要新建空工作树。当前工作树包含大量尚未提交的 AI Agent、约会协调、安全定位和 AI 报告修改。不要 reset、checkout、clean 或覆盖这些改动。

主项目目录 `D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目` 只额外保留了本会话的微信支付请求头修复；微信开发者工具没有打开该目录。这曾导致“本地修了但云端仍是旧代码”。

## 2. 当前架构与锁定原则

- 小程序用户主链使用微信云开发：`miniprogram/cloudfunctions/api` + 云数据库，不依赖本地 3000。
- AI 模型供应商当前按 MiniMax 接入；WeFinally 的 Agent 规则、工具、知识、状态机和安全策略独立于模型供应商。
- 三类 Agent：平台客服、AI 恋爱助手、AI 约会协调员。
- AI 只能理解意图、生成预览和自然语言；数据库写入必须由后端白名单工具执行。
- A/B 会话必须隔离，通过同一个 `coordination_id` 共享业务任务；不得把一方原话或隐私暴露给另一方。
- 约会修改流程：自然语言 -> 结构化修改预览 -> 用户确认/明确发送 -> 后端修改 -> 版本加一 -> 旧方案失效 -> 必要时向另一方生成脱敏通知。
- 第一版继续使用云函数、云数据库、非流式 LLM 调用和确定性状态机，不引入 LangChain、Redis、消息队列或独立服务器。

## 3. 当前未提交改动概况

交接时工作树约有 44 个已修改文件、1670 行新增、229 行删除，并有未跟踪的新模块。重点文件如下。

### Agent Core 与客服

- `miniprogram/cloudfunctions/api/agent/AGENT.md`
- `miniprogram/cloudfunctions/api/agent/context.js`
- `miniprogram/cloudfunctions/api/agent/provider.js`
- `miniprogram/cloudfunctions/api/agent/notificationJobs.js`
- `miniprogram/cloudfunctions/api/agent/humanService.js`（新）
- `miniprogram/cloudfunctions/api/agent/knowledgeSeeds.js`（新）
- `miniprogram/cloudfunctions/api/handlers/agent.js`
- `miniprogram/pages/chat/chat.js|wxml|wxss`

### 约会协调与自然语言修改

- `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- `miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js`（新）
- `miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy.js`
- `miniprogram/cloudfunctions/api/lib/dateApplicationPatchPolicy.js`（新）
- `miniprogram/pages/date-coordination/date-coordination.js|wxml|wxss`
- `miniprogram/pages/match-detail/match-detail.js|wxml|wxss`
- `server/selfcheck/date-application-patch.js`（新）

### 人工客服与安全定位

- `miniprogram/cloudfunctions/api/handlers/meet.js`
- `miniprogram/utils/meetLocation.js`（新）
- `miniprogram/pages/meet-safety/meet-safety.js|wxml|wxss`
- `server/selfcheck/human-service-handoff.js`（新）
- `server/selfcheck/meet-safety-map.js`（新）

### AI 匹配报告

- `miniprogram/cloudfunctions/api/handlers/reportTask.js`
- `miniprogram/cloudfunctions/api/lib/reportTaskPolicy.js`
- `miniprogram/cloudfunctions/api/lib/reportSchema.js`（新）
- `miniprogram/cloudfunctions/api/lib/minimax.js`
- `miniprogram/cloudfunctions/report-worker/config.json`
- `server/selfcheck/ai-report-*.js`

相关实施计划：

- `docs/superpowers/plans/2026-07-14-date-preference-natural-language-patch.md`
- `docs/superpowers/plans/2026-07-14-initiator-first-date-form.md`
- `docs/superpowers/plans/2026-07-15-date-coordination-form-ui-fix.md`

## 4. 下一会话先做的验证

先在当前工作树运行，不要先部署：

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
```

若失败，按单个自检脚本定位，禁止用大范围回滚解决。

随后重点人工审查：

1. `agent/provider.js` 是否只使用 MiniMax 配置，模型失败时是否明确报错而不是伪装成知识库答案。
2. `handlers/agent.js` 的路由、工具权限、会话隔离、修改预览、确认执行和脱敏通知是否完整。
3. A/B 是否各自持有独立 `session_id`，所有读取都校验 `coordination_id`、当前 OpenID 和参与者身份。
4. 用户明确说“发送吧/帮我发送”且上一轮已经展示完整预览时，不应重复无意义确认；仍需由后端校验待执行预览、版本和幂等键。
5. 无交集、临时修改、重新协调、方案失效、人工接管是否都有确定状态。
6. 人工转接只保留微信/企微适配接口，不硬编码个人客服号。
7. 真机聊天中文输入不能再次出现 URL 编码乱码。

## 5. 云数据库与云端状态

已使用或新增的集合包括 Agent 会话、消息、运行记录、工具审计、知识、人工工单、约会协调、参与者、申请、提案、确认和修改预览相关集合。集合不存在时曾造成 `collection not exists: agent_sessions`；不要再依赖人工逐个建集合的临时做法，代码需要明确初始化/缺失提示策略。

约会相关线上记录已确认存在：`date_coordinations`、`date_applications` 等。历史上出现过无效 `user_b_id=118` 的测试协调记录，读取必须依赖真实匹配关系和双方用户映射，不能仅信任前端传入 ID。

## 6. 微信支付插曲（AI 会话也需要知道）

本会话定位并修复了支付请求缺少 `User-Agent` 的代码问题：

```js
'User-Agent': 'WeFinally-WeChatMiniProgram/1.0'
```

修复已同步到当前 AI 工作树：

- `miniprogram/cloudfunctions/api/lib/wechatpay.js`
- `server/selfcheck/cloudbase-wechatpay.js`

本地 `selfcheck:cloudpay` 四组通过；使用真实微信支付只读查询验证得到：

```text
status=404
code=ORDER_NOT_EXIST
public key id matched=true
signature valid=true
```

这证明本地商户证书、公钥和验签逻辑正确。

但是交接时云端 `api` 仍是旧代码。已下载云函数核验，云端 `wechatpay.js` 没有上述 `User-Agent`。原因是开发者工具之前部署了错误目录。下一步必须从当前工作树右键 `cloudfunctions/api`，选择“上传并部署：云端安装依赖”，成功后再次下载云函数或查看云端文件确认该请求头存在，再进行 1 分钱真机支付。

HTTP 回调配置：

```text
https://cloud1-d4gy8l52g08bba326-1451453378.ap-shanghai.app.tcloudbase.com/wxpay/notify
```

路由 `/wxpay/notify` 已启用、路径透传开启、身份认证关闭，公网 POST 已能进入回调处理器。

支付环境当前应保持：

```text
WXPAY_ENABLED=true
PAYMENT_STAGE=test
PAYMENT_TEST_AMOUNT_FEN=1
```

APIv3 密钥曾出现在用户截图中，禁止在回复、日志或交接文档中打印；正式支付前必须在商户平台轮换并更新云函数环境变量。

## 7. 下一阶段 AI 客服优先级

1. 先让全部 Agent/Safety/AI Report 自检通过，并记录失败根因。
2. 完成平台客服真实状态工具：会员审核、VIP、匹配、约会协调、人工工单；工具失败时禁止猜测。
3. 完成任务型约会修改闭环：预览、确认、版本、幂等、重算、另一方脱敏通知和双方确认。
4. 验证 MiniMax 真实回复、上下文压缩、最近消息、摘要和 Token 预算；不得依赖供应商 conversation_id。
5. 完成知识库审核与缺失降级；正常恋爱问题不能再被关键词种子机械拦截。
6. 完成人工客服微信/企微适配接口和云数据库工单工作台数据结构。
7. 真机完成 A/B 双方端到端测试后再按主题分组提交；当前不要提交或清理已有改动。

## 8. 安全与操作边界

- 不打印 MiniMax Key、DeepSeek Key、APIv3 Key、商户私钥或 Base64 私钥。
- 不回滚或覆盖当前大量未提交改动。
- 不把临时婚恋参考标记成真实 AI 报告。
- 不允许模型自由修改数据库。
- 不向另一方展示原始申请、原始聊天、内部 ID、OpenID、联系方式或精确住址。
- 不要把本地 Express/MySQL 当成体验版真实数据源。
- 用户未要求时不要提交 Git；部署前先跑对应自检。

