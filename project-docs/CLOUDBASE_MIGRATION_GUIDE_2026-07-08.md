# WeFinally 微信云开发数据库迁移指南（2026-07-08）

## 目标

把本地 MySQL `wefinally` 导出为微信云开发数据库可导入的 JSON，云环境：

```text
cloud1-d4gy8l52g08bba326
```

体验版/审核版不再依赖本地 `3000`、局域网 IP 或本机 MySQL。

## 导出

在项目根目录执行：

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
node tools/cloudbase/export-mysql-to-cloud-json.js
```

输出目录：

```text
cloudbase-export/
```

每个 MySQL 表会生成一个 collection JSON 文件，并生成 `manifest.json`。

微信云开发控制台导入通常要求 JSON Lines（一行一条记录），请继续执行：

```bash
node tools/cloudbase/convert-export-to-jsonl.js
```

导入时优先选择：

```text
cloudbase-export-jsonl/<collection>.json
```

## 表到集合映射

| MySQL 表 | 云开发集合 |
|---|---|
| `user` | `users` |
| `user_match_setting` | `user_match_settings` |
| `user_match_log` | `user_match_logs` |
| `occupation_circle` | `occupation_circles` |
| `user_order` | `user_orders` |
| `marry_report` | `marry_reports` |
| `system_stat` | `system_stats` |
| `ai_chat_log` | `ai_chat_logs` |
| `ai_knowledge` | `ai_knowledge` |
| `meet_report` | `meet_reports` |
| `meet_location_log` | `meet_location_logs` |
| `sos_log` | `sos_logs` |
| `free_whitelist` | `free_whitelist` |
| `free_whitelist_import_batch` | `free_whitelist_import_batches` |
| `match_handoff_ticket` | `match_handoff_tickets` |
| `partner` | `partners` |
| `partner_withdraw` | `partner_withdrawals` |
| `admin` | `admins` |
| `openid_blacklist` | `openid_blacklist` |
| `user_privacy_auth_log` | `user_privacy_auth_logs` |
| `partner_user_audit_log` | `partner_user_audit_logs` |

额外建议创建内部集合：

| 内部集合 | 用途 |
|---|---|
| `system_counters` | 云函数生成递增数字 id，不需要导入数据 |

## 导入微信云开发

1. 打开微信开发者工具。
2. 进入云开发控制台。
3. 选择环境 `cloud1-d4gy8l52g08bba326`。
4. 数据库中新建上表对应的集合。
5. 逐个集合选择“导入”，上传 `cloudbase-export-jsonl/<collection>.json`。
6. 导入格式选择 JSON / JSON Lines，冲突处理第一次选 Insert。
7. 导入后抽查 `users`、`occupation_circles`、`user_match_settings`、`user_match_logs`。

## 权限建议

云开发数据库不要设置为“所有用户可读写”。建议：

- 用户端所有读写都经过 `cloudfunctions/api`。
- 数据库集合权限选“仅云函数可读写”或等价安全模式。
- `users`、`meet_reports`、`sos_logs`、`free_whitelist`、`admins` 不允许客户端直连写入。

## MiniMax AI 报告配置

AI 匹配报告在 `cloudfunctions/api` 云函数内生成，不要把 API Key 写进小程序代码或云数据库。

在微信开发者工具/云开发控制台给 `api` 云函数配置环境变量：

```text
MINIMAX_API_KEY=<MiniMax Key>
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
MINIMAX_TIMEOUT_MS=12000
MINIMAX_MATCH_REPORT_ENABLED=true
```

改完环境变量后，重新上传并部署 `cloudfunctions/api`。如果 MiniMax 超时、Key 未配置或返回异常，匹配仍会成功，系统会写入一份确定性兜底报告，并在 `score_detail_json.report_fallback_used` 标记为 `true`。

如果控制台版本找不到云函数环境变量入口，也可以在 `system_configs` 集合新增以下记录作为 demo 兜底：

```json
{"_id":"minimax_api_key","key":"minimax_api_key","value":"<MiniMax Key>","enabled":true}
{"_id":"minimax_base_url","key":"minimax_base_url","value":"https://api.minimaxi.com/anthropic","enabled":true}
{"_id":"minimax_model","key":"minimax_model","value":"MiniMax-M3","enabled":true}
{"_id":"minimax_timeout_ms","key":"minimax_timeout_ms","value":"12000","enabled":true}
{"_id":"minimax_match_report_enabled","key":"minimax_match_report_enabled","value":"true","enabled":true}
```

数据库兜底只建议演示期使用；正式上线仍建议放云函数环境变量。

## 字段说明

导出脚本会保留原 MySQL 字段，并补充：

- `_id`：稳定云数据库文档 ID，例如 `users_1`。
- `legacyId`：原 MySQL `id`。
- `createdAt`：由 `create_time` 转换。
- `updatedAt`：由 `update_time` 转换。

云函数仍优先使用原来的数字 `id` 字段，降低前端改动。

## 注意

- 云函数不能访问本机 `127.0.0.1` MySQL。
- 如果导入后集合为空，新注册流程仍可创建用户，但圈层只会使用云函数内置兜底选项。
- 明天 demo 若需要手动匹配和免支付开通 VIP，可把 `cloudbase-export-jsonl/system_configs.json` 导入 `system_configs`；演示结束后删除或关闭。
- 支付、后台、定时任务仍需要后续继续云化；本次优先保证小程序体验版不再请求本地后端。
