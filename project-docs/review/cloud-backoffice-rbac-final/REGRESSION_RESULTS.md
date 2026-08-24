# Regression Results

执行日期：2026-08-24（Asia/Shanghai）。

| 命令 | 结果 |
|---|---|
| `node server/selfcheck/cloud-backoffice-rbac-final.js` | PASS |
| `node server/selfcheck/codex-release-adversarial.js` | PASS；18,000 fuzz；外部 AI=0，CloudBase AI=0 |
| `node server/selfcheck/backoffice-simple-web-final.js` | PASS；Express route/response RBAC PASS |
| `npm --prefix server run selfcheck:member` | PASS |
| `npm --prefix server run selfcheck:safety` | PASS |
| `npm --prefix server run selfcheck:agent-core` | PASS |
| `npm --prefix server run e2e:wefinally` | PASS；14/14，live AI smoke 按默认配置跳过 |
| `node server/selfcheck/admin-user-cloud-service.js` | PASS |
| `node server/selfcheck/agent-backoffice.js` | PASS |
| `node server/selfcheck/partner-admin-service.js` | PASS |
| `node server/selfcheck/cloudbase-admin-connection.js` | PASS |
| 受影响 JS `node --check` | PASS |
| `git diff --check` | PASS |

Live MySQL：`BLOCKED_ENVIRONMENT`。本机 `127.0.0.1:3306` 在 1.5 秒连接窗口内未监听；未尝试启动、修改或写入数据库。

依赖安装按锁文件执行。`server` 审计报告 1 个 low，Cloud API 依赖树报告 1 moderate / 5 high；本任务没有改依赖版本，且未以破坏性 `npm audit fix` 扩大变更范围。
