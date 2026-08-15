# 受控双人约会 LangGraph 端到端验收设计

日期：2026-08-15

## 1. 目标

在 CloudBase 中创建一对不会进入正式匹配池的受控 QA 用户，完整执行“双方匹配 → 各填一次首次约会表单 → A/B 分别与 AI 协调员沟通 → 局部修改 → 生成共同方案 → 双方确认 → `arranged`”闭环，并在客服后台以 A/B 双栏展示两条私密会话。

验收必须证明 LangGraph 真实参与日期协调状态编排，而不是仅验证本地 mock、静态 Prompt 或直接篡改最终状态。

## 2. 已选方案与取舍

### 方案 A：受控 QA 场景执行器（采用）

- 由仅限 `super_admin` 的后台 API 创建和推进场景。
- QA 用户带稳定测试归属标记、正式池隐藏标记与场景运行编号。
- 业务数据通过现有服务写入；禁止直接把协调状态设置为 `arranged`。
- DeepSeek 负责把自然语言变成受限修改意图；LangGraph 负责读取双方脱敏结构化偏好、协调版本和确认状态并编排阶段。
- 每一步持久化运行状态、错误码、Agent run 与工具调用，支持失败后从当前步骤继续。

优点：不需要两台手机，可以重复、审计并覆盖真实 CloudBase/模型/LangGraph 链路。缺点：不覆盖微信 OPENID 与真机交互；真机验证仍是独立发布门禁。

### 方案 B：绑定两个真实微信账号

覆盖真机身份最完整，但需要两个可登录微信身份、人工来回操作且难以稳定重放。本轮不采用。

### 方案 C：直接写最终数据库快照

速度最快，但无法证明 Agent、LangGraph、工具确认与状态机真实运行，因此禁止作为验收方案。

## 3. 安全边界

- QA 用户必须设置 `account_mode=internal_qa`、`profile_origin=controlled_date_scenario`、`is_test_fixture=1`、`formal_match_hidden=1`，并带唯一 `controlled_scenario_run_id`。
- QA 用户只允许与同一运行编号中的对方建立匹配和约会协调；不得进入正式候选池。
- 场景 API 只允许 `super_admin`，每次创建、推进、查看均写审计日志。
- 场景执行不发送短信、不创建真实支付、不触发真人通知、不上传微信小程序。
- A/B 用户侧只返回本人会话和共同安全摘要；只有授权后台角色可并排查看双方记录。
- 双栏后台仍分别标明 A/B 数据边界，不将 B 原始内容注入 A 的模型上下文，反之亦然。

## 4. 架构

### 4.1 受控场景服务

新增独立服务 `controlledDateScenarioService`，负责：

1. 幂等创建 A/B QA 用户、双向匹配记录、日期协调和两条独立 `date_coordinator` 会话。
2. 使用现有日期协调 handler 让 A、B 各提交一次表单。
3. 使用现有协调 worker 生成候选方案。
4. 以 A/B 各自身份调用 Agent handler，执行自然语言修改与确认预览。
5. 重新运行协调 worker，再通过现有事务确认接口让双方确认同一 active proposal。
6. 只有数据库真实返回 `status=arranged` 才把场景标为通过。

场景状态机：

`created → applications_submitted → first_proposal → a_patch_preview → a_patch_applied → revised_proposal → confirmations_submitted → passed`

任一步失败进入 `failed`，保留 `failed_step`、安全错误码和最近一次状态；重新推进时从可恢复步骤继续，禁止重复创建业务数据。

### 4.2 LangGraph 接入

- 日期协调聊天保留现有 DeepSeek 意图解析和确认预览机制。
- 在每次日期协调 Agent turn 中构造双方结构化安全状态：时间窗口、区域、活动类型、预算档、时长、当前版本、A/B 确认布尔值。
- 调用现有 `agent-graph` 的 `mode=date_coordination`；使用不同 session 对应的稳定 thread ID 和匿名 actor ref。
- LangGraph 结果只允许影响回复草稿和 allowlist 工具请求；数据库变更继续由现有 API handler、CAS worker 和事务确认执行。
- graph 不可用时记录明确错误；受控验收场景不得把 legacy fallback 当作通过。

### 4.3 后台 A/B 双栏

扩展会话详情 API，使关联日期协调的会话返回：

- `coordination`：共同状态、版本、轮次与安全事件；
- `sides.a`：A 的用户摘要、session、messages、runs；
- `sides.b`：B 的用户摘要、session、messages、runs。

客服工作台中心区域在存在双边协调时渲染左右等宽列：左 A、右 B。共同进度位于双栏上方；右侧业务上下文继续保留。窄屏按 A 后 B 顺序堆叠。人工回复必须明确选择当前侧，禁止一次回复同时写入两侧。

## 5. 管理 API

- `POST /api/admin/date-scenarios`：创建或返回幂等场景。
- `POST /api/admin/date-scenarios/:runId/advance`：只推进一个持久化步骤。
- `GET /api/admin/date-scenarios/:runId`：返回安全运行摘要、A/B 支持编号、协调编号、当前步骤和断言结果。
- `GET /api/admin/agent/conversations/:sessionId`：在关联协调存在时增加 `paired_conversation`，保留现有单会话字段兼容旧页面。

## 6. 验收标准

1. 当创建场景时，系统必须产生两个正式匹配不可见的 QA 用户，且两者只与彼此关联。
2. 当推进首次申请步骤时，系统必须通过业务服务保存双方各一份表单；任何一方不得产生第二份首次申请。
3. 当 A 提出自然语言调整时，系统必须保存 `provider=langgraph` 的运行证据，并生成需要确认的局部修改预览。
4. 当确认修改后，系统必须提升协调版本、废弃旧方案并重新排队，不得直接写最终状态。
5. 当双方确认同一当前版本方案时，现有事务必须将协调变为 `arranged`；不同 proposal 或旧版本确认不得通过。
6. 当场景标为 `passed` 时，摘要必须同时证明 LangGraph run、工具调用、版本变化、双方确认和 `arranged`。
7. 当客服打开任一侧会话时，后台必须同时展示 A/B 两栏，但用户侧 API 不得获得对方原始会话。
8. 当运行失败时，系统必须保留失败步骤和安全错误码，并允许幂等重试；不得用直接数据库改状态绕过失败。

## 7. 非目标

- 不上传微信小程序体验版或正式版。
- 不让 QA 用户参与正式周三/周五匹配。
- 不测试支付、短信、真实通知或生产约会。
- 不把管理员双栏能力开放给普通用户或合伙人后台。
