# CloudBase 云端只读安全巡检（2026-07-17）

## 范围与边界

- 工作树：`D:\wefinal\.worktrees\wefinally-ai-agent`
- 分支：`feature/ai-agent-system`
- 环境：`cloud1-d4gy8l52g08bba326`，状态 `NORMAL`，地域 `ap-shanghai`，主业务后端为 NoSQL。
- 本轮云端操作全部为查询；未写数据库、未改集合或索引、未部署、未改云函数配置、未修改生产数据。
- 报告只记录内部状态、计数和脱敏标识，不包含完整 openid、手机号、邮箱、税号、聊天正文、支付交易号或密钥。
- 订单/发票实现文件未修改。

## 云函数与日志

| 项目 | api | report-worker |
| --- | --- | --- |
| 状态 | Active | Active |
| 运行时 | Nodejs16.13 | Nodejs16.13 |
| 内存 | 256 MB | 256 MB |
| 云端超时 | 60 秒 | 20 秒 |
| 云端更新时间 | 2026-07-17 23:39:59 | 2026-07-14 19:32:28 |
| 本地期望超时 | 60 秒 | 60 秒 |

- `report-worker` 存在确定的代码/配置漂移；本地本轮修复均未部署。
- CLS 未开通。使用单函数日志分页检查近 24 小时元数据：`api` 1454 次、`report-worker` 1425 次，均未见非零 RetCode。
- 退出前两个独立小时窗口复核中，两函数仍为 Active，未见非零 RetCode；只统计执行元数据，未输出日志正文。
- 云端触发器查询返回空数组，但 `report-worker` 每分钟均有执行日志，且本地配置包含定时器。该结果可能是查询接口语义差异，不能据此判断定时器不存在。

## NoSQL 结构、索引与权限

- 关键集合均只有默认 `_id_` 与 `_openid_1` 索引，尚无业务查询复合索引。当前数据量很小，属于 P2 扩容风险。
- `agent_messagesagent_runs` 与 `date_participantsdate_applications` 均为空集合；本地代码没有引用，判断为外部初始化/手工操作造成的疑似拼接产物。未删除。
- `users`、Agent 相关集合、约会相关集合、`user_orders`、`ai_report_tasks`、`system_counters` 均为 `ADMINONLY`。
- `api` 与 `report-worker` 函数权限为 `CUSTOM`。`api` 只有 `/wxpay/notify` 公网网关入口，未开启网关鉴权；该入口由支付签名校验保护，专项自检通过。`report-worker` 无公网网关入口。
- 会话、消息、Run、工具调用与约会协调的最小字段关系检查未发现跨用户归属错配；结合 `ADMINONLY` 和服务端归属校验，当前没有 IDOR 证据。

## 数据一致性结论

| 检查项 | 结果 | 级别 |
| --- | --- | --- |
| `date_coordinations` | 3 条；1 条 arranged 一致，2 条已过截止时间仍停留在中间态 | P1 |
| `date_application_patches` | 0 条，无 pending/applying 卡死 | 正常 |
| `agent_runs` | 16 条：13 completed、3 fallback，无 queued/generating/running | 无当前卡死 |
| `ai_report_tasks` | 6 条：3 succeeded、3 达最大尝试后 failed；无运行态卡死；1 条历史手工重试次数异常偏高 | P1 漂移证据 |
| `agent_notification_jobs` | 3 条：2 pending、1 sent；无重复幂等键 | P1 |
| `user_orders` | 9 条；1 条支付成功且已授予 VIP；未见支付/VIP、币种或交易状态矛盾；此前检查未见交易号重复 | 正常 |
| `system_counters` | 集合为空；日志确认至少发生过 1 次 fallback ID 分配（RequestId `a2c2…f78f`） | P1 待诊断 |

## 已确认并完成的本地修复

### 1. 通知任务没有消费入口

- 云端证据：2 条通知长期 pending，代码仅创建任务，没有通用消费者。
- RED：`selfcheck/agent-operations.js` 先断言消费者和统一 Worker action，初次失败。
- 修复：新增有界通知消费者，处理 wait/expired/send/failed，复用或创建收件人的隔离约会协调会话，以 `notification_job_id` 做消息幂等检查，只写固定安全提示，不复制用户原文；Worker 统一调用 `processWorkerTasks`。
- GREEN：专项和四项总自检通过。

### 2. 约会协调截止时间没有后台收敛

- 云端证据：2 条协调记录在截止时间后仍处于中间态。
- RED：`selfcheck/date-coordination-cloud.js` 先覆盖过期转换，初次因缺少处理器失败。
- 修复：Worker 按四种中间态分别做有界查询，将已过截止时间的记录收敛到 `expired`。
- 额外 RED：加入“前 100 条均为终态”的饥饿场景，原始无状态 limit 扫描失败；改为按中间态分别查询后转绿。
- GREEN：专项和四项总自检通过。

### 3. 截止扫描可能覆盖并发完成态

- 本地审查证据：扫描先读后写且原实现无状态条件；若用户在两步之间完成确认，扫描可能把新的 `arranged` 覆盖为 `expired`。
- RED：模拟记录在写入前并发进入 `arranged`，禁止处理器执行无条件更新，初次按预期失败。
- 修复：用 `_id + 原状态` 作为原子更新条件；只有状态仍未变化时才写入 `expired` 并增加成功计数。
- GREEN：并发回归、专项和四项总自检通过。

## 仅云端待处理 / 部署阻塞

1. 受控发布当前 `api` 与 `report-worker`，把 Worker 超时从 20 秒对齐到本地 60 秒；发布前复核差异，发布后观察错误率和任务收敛情况。
2. 发布后让 Worker 受控消费 2 条历史 pending 通知并收敛 2 条过期协调；先小批量验证，不直接手工改生产记录。
3. 针对 `system_counters` fallback 事件读取对应脱敏日志详情，确认是集合权限、SDK 行为、初始化竞态还是短暂错误；根因明确前不改 ID 生成器。
4. 评估开通 CLS，以支持跨函数错误类别、重试与时延聚合。
5. 为高频状态/归属查询设计并压测复合索引；当前低数据量下不紧急。
6. 两个疑似拼接空集合保持不动；经备份、责任人确认和引用复核后，另走受控清理流程。

## 两轮退出验证

- 并发竞态修复后重新计数。第 1 轮：已知的 2 条过期协调与 2 条 pending 通知保持不变；未发现新的 P0/P1。
- 第 2 轮：按中间态分别查询，结果相同；报告任务、Run、补丁队列无运行态卡死，订单最小字段复核正常；未发现新的 P0/P1。
- 两轮均通过：`selfcheck:agent`、`selfcheck:safety`、`selfcheck:ai-report`、`selfcheck:cloudpay`。

## 剩余风险

- P1：本地修复未部署，云端积压与过期状态不会自动收敛。
- P1：Worker 云端超时和代码版本漂移，历史报告任务出现超出本地限制的重试记录。
- P1：fallback ID 的底层错误尚未归因。
- P2：通知消费者使用“先查后写”幂等检查；在并发或重叠 Worker 执行时仍有极小重复消息窗口。部署前建议增加原子 claim 或唯一文档键。
- P2：缺少业务复合索引，数据量增长后可能出现扫描和超时风险。
- P2：CLS 未开通，故障归因依赖单函数日志。
