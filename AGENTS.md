# AGENTS.md — WeFinally 执行边界

## 唯一工作目录

发布修复与合并后的真源：

- 当前发布修复工作树：`D:\wefinal\.worktrees\wefinally-release-20260904`
- 当前任务分支：`fix/release-review-remediation-2026-09-04`
- 远端安全基线：GitHub `main`（私有仓库 `John030427/wefinally`）
- 禁止在外层 `D:\wefinal` 直接开发。

历史实验工作树 `D:\wefinal\.worktrees\wefinally-ai-agent`（及旧分支 `feature/ai-agent-system`、`experiment/*`）视为**只读历史**，不得部署、不得作为发布候选，不得未经审计地合并进 `main`。

未经用户明确授权，禁止执行 `git reset`、`git clean`、`git checkout`、`git restore`、提交、强推或覆盖其他人的改动。

## 每次接手先读

1. `PROJECT_HANDOFF.md`
2. `CONTRIBUTING.md`
3. `project-docs/RELEASE_MANIFEST_TEMPLATE.md`
4. `project-docs/NEXT_THREAD_HANDOFF_2026-07-26_MINIPROGRAM_CONTINUATION.md`
5. `project-docs/DEVELOPMENT_LOG.md`
6. 与任务直接相关的 `project-docs/MODULES/`、`project-docs/REQUIREMENTS.md` 和自检脚本

`project-docs/archive/` 只保存历史快照，不作为当前需求真源。

## 产品与安全边界

- 无头像、无用户私聊、无社交动态；官方客服协调线下见面。
- LBS 必须由用户主动授权，不后台静默采集；不宣称“直连 110”。
- Agent/模型不能扫描全库、直接写数据库或绕过确定性权限与安全规则。
- 不向模型发送手机号、OpenID、精确住址、单位、联系方式、密钥或私钥。
- 云端写入必须经过白名单业务服务；测试数据清理必须走有审计的后台业务按钮。
- 不依赖模型供应商 `conversation_id` 保存业务状态。
- 不直接批量修改生产数据库；表结构变更使用新迁移文件。
- 支付、会员、匹配和分润改动必须有专项自检与人工复核。

## 凭据

本地环境变量只保存在已忽略的 `.env` 文件或云端密钥配置中。文档、日志、截图、提交和聊天回复均不得记录真实密码、Token、API Key、微信支付 APIv3 密钥、商户私钥或管理员凭据。

历史提交曾包含本地测试凭据。接入 GitHub 前必须采用经确认的历史清理方案或建立经过审计的全新基线，不能直接推送现有历史。

## 基线验证

按顺序运行：

```powershell
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
npm --prefix server run selfcheck:qa-pair-reset
npm --prefix server run selfcheck:wx-identity
npm --prefix miniprogram/cloudfunctions/agent-graph run check
node server/selfcheck/release-workflow-contract.js
```

失败时依据实际证据修复，不能通过回滚现有改动“让测试变绿”。非平凡逻辑应保留可重复运行的自检，并更新 `project-docs/DEVELOPMENT_LOG.md`。

依赖升级（CloudBase SDK、Axios 传递依赖、数据库驱动等）必须在独立分支完成 `agent-graph` build、checkpoint 恢复、数据库事务自检和云端 smoke；禁止 `npm audit fix --force` 直接进入发布线。基线字段见 `project-docs/RELEASE_MANIFEST_TEMPLATE.md` 的 `dependency_baseline`。

## 发布边界

“部署 `api` 云函数”、“部署 `agent-graph` 云函数”和“上传小程序客户端”是三个独立动作。任何发布前都要按 `project-docs/RELEASE_MANIFEST_TEMPLATE.md` 记录 `source_commit`、各产物 commit、`cloud_env`、`test_results` 和 `rollback_commit`；未明确授权不得部署、上传或修改生产数据。
