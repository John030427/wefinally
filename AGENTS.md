# AGENTS.md — WeFinally 执行边界

## 唯一工作目录

- 仓库根目录：`D:\wefinal\.worktrees\wefinally-ai-agent`
- 当前整合分支：`feature/ai-agent-system`
- 禁止在外层 `D:\wefinal` 直接开发。

当前工作树包含大量未提交和未跟踪的产品改动。未经用户明确授权，禁止执行 `git reset`、`git clean`、`git checkout`、`git restore`、提交、强推或覆盖其他人的改动。

## 每次接手先读

1. `PROJECT_HANDOFF.md`
2. `CONTRIBUTING.md`
3. `project-docs/NEXT_THREAD_HANDOFF_2026-07-26_MINIPROGRAM_CONTINUATION.md`
4. `project-docs/DEVELOPMENT_LOG.md`
5. 与任务直接相关的 `project-docs/MODULES/`、`project-docs/REQUIREMENTS.md` 和自检脚本

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
```

失败时依据实际证据修复，不能通过回滚现有改动“让测试变绿”。非平凡逻辑应保留可重复运行的自检，并更新 `project-docs/DEVELOPMENT_LOG.md`。

## 发布边界

“部署 `api` 云函数”和“上传小程序客户端”是两个独立动作。任何发布前都要记录源分支、提交号、自检结果和目标环境；未明确授权不得部署、上传或修改生产数据。

## 文件变更与 Git 收尾

- 每个会修改文件的实现任务，最终回复前必须产生一个 Git commit；纯只读核对或没有文件变化的任务不得创建空提交。
- 编辑前先运行 `git status`，把已经存在或并发出现的修改视为用户所有，禁止顺手整理、覆盖或打包提交。
- 每个开发批次使用独立任务分支；开始前记录基线分支和提交号，未经用户确认不得自动合并、推送、变基、改写历史或删除分支。
- 提交前审阅最终 diff，运行与风险相称的自检，并只暂存属于当前任务的文件或 hunk。
- commit message 应简短、可描述结果。仓库当前不存在 `main` 分支时，提交到用户指定的当前任务分支，不得为满足名称要求擅自新建或切换 `main`。
- 最终回复必须报告分支名、提交 hash、验证结果，以及仍未提交的用户改动；不得泄露提交中排除的凭据或隐私数据。
