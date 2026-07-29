# WeFinally AI Agent 云开发部署清单

本文只记录部署前检查，不包含任何密钥，也不代表已经部署。

## 云数据库集合

需要创建：`agent_sessions`、`agent_messages`、`agent_runs`、`agent_tool_calls`、
`agent_human_tickets`、`agent_notification_jobs`、`knowledge_articles`、
`user_agent_memories`、`date_coordinations`、`date_participants`、
`date_applications`、`date_proposals`、`date_confirmations`。

集合权限应统一设为仅云函数读写。小程序端不得直接读取这些集合。

建议唯一索引：

- `agent_notification_jobs.idempotency_key`
- `date_coordinations.pair_key`
- `user_agent_memories(user_id, category, status)`

## 云函数环境变量

- `AGENT_LLM_ENABLED`：灰度前保持 `false`，Mock 与状态机仍可验收。
- `AGENT_PROVIDER`：`minimax` 或 `deepseek`。
- `MINIMAX_API_KEY` / `MINIMAX_BASE_URL` / `MINIMAX_MODEL`
- `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`
- `AGENT_MESSAGE_RETENTION_DAYS`：默认 180。
- `AGENT_TOOL_RETENTION_DAYS`：默认 365。
- `AGENT_MEMORY_RETENTION_DAYS`：默认 365。

密钥只放云函数环境变量，不写入仓库、日志或小程序包。

## 定时触发器

增加短时定时任务（建议每 15 分钟）扫描 `agent_notification_jobs`：仅处理
`status=pending` 且已到 `scheduled_at` 的记录，发送一次订阅消息后标记完成；超过
`deadline_at` 则标记过期。订阅消息模板 ID 和接收规则需经霞姐确认后启用。

增加每日低峰期清理任务，按 `agent/retentionPolicy.js` 的截止日期分批清理聊天、
工具审计和已过期长期记忆。每批限制数量并记录清理审计，避免云函数超时。

## 发布顺序

1. 创建集合、权限和索引。
2. 配置非密钥参数及模型密钥。
3. 部署 `api` 云函数并保持 `AGENT_LLM_ENABLED=false`。
4. 导入已审核知识文章，后台审核后发布。
5. 真机完成平台客服、恋爱助手和双用户协调验收。
6. 小范围开启模型调用，再配置订阅消息模板和定时触发器。

## 上线前负责人确认

客服响应时限、知识审核人、高风险工单接收人、订阅消息模板、用户额度、日志保留期、
MiniMax/DeepSeek 主备顺序均未由代码锁死，必须由业务与合规负责人确认。
