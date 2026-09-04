# WeFinally 当前交接

> 更新时间：2026-09-04
> 本文件是仓库根目录的当前交接入口；详细技术证据见下方链接。

## 1. 仓库状态

- 当前发布修复工作树：`D:\wefinal\.worktrees\wefinally-release-20260904`
- 当前任务分支：`fix/release-review-remediation-2026-09-04`
- 远端安全基线：GitHub `main`（私有仓库 `John030427/wefinally`）；首次基线提交为 `7d8d7549b5a5e5e4cd8905c44a7b47906e3d614e`。
- 历史实验工作树 `D:\wefinal\.worktrees\wefinally-ai-agent`（旧分支 `feature/ai-agent-system` 等）为**只读历史**，不得部署。
- 本地代码、已部署云函数和微信体验版可能不是同一版本；每次部署/上传必须填写 [`project-docs/RELEASE_MANIFEST_TEMPLATE.md`](project-docs/RELEASE_MANIFEST_TEMPLATE.md)。
- `Todou-er` 已接受协作者邀请并具有 `write` 权限。
- `main` 已开启保护：必须通过 PR、至少 1 人审批、解决对话后才能合并，禁止强推和删除；仓库只允许 Squash 合并。
- 本机旧 Git 历史曾包含本地测试凭据，必须继续留在本地，禁止向新远端推送旧分支或旧标签。

## 2. 产品现状

当前小程序已覆盖注册、资料、会员审核、匹配、匹配详情、AI 报告、AI 客服、约会协调、见面安全、订单和发票等主要链路，但仍属于待验证的发布候选，而非可直接上架的成熟产品。

2026-09-04 发布复核修复分支已收敛：WeChat 身份边界、约会申请原子提交、可恢复公开错误、QA 双机清理分页与互斥、会话历史对账、到场投递可观测、DatePlanV3 确定性契约，以及 CI 全门禁。

详细证据：

- [`docs/superpowers/plans/2026-09-04-wefinally-release-review-remediation.md`](docs/superpowers/plans/2026-09-04-wefinally-release-review-remediation.md)（若未入库则以任务分支说明为准）
- [`project-docs/RELEASE_MANIFEST_TEMPLATE.md`](project-docs/RELEASE_MANIFEST_TEMPLATE.md)
- [`project-docs/NEXT_THREAD_HANDOFF_2026-07-26_MINIPROGRAM_CONTINUATION.md`](project-docs/NEXT_THREAD_HANDOFF_2026-07-26_MINIPROGRAM_CONTINUATION.md)
- [`project-docs/DEVELOPMENT_LOG.md`](project-docs/DEVELOPMENT_LOG.md)

## 3. 当前风险与下一步

按优先级处理：

1. 合并本发布修复分支到 `main` 后，仅从新 `main` 拉工作树继续开发；旧实验工作树保持只读。
2. 双真机场景 A–E（匹配清理、邀请接受、AI 协调、旧会话兼容、到场安全）仍需人工验收；`LIVE_GRAPH_SMOKE: MANUAL_REQUIRED`。
3. 完成支付上线核验：环境密钥轮换、回调验签、主动查单、幂等开通、1 分钱真机支付与订单/VIP 一致性。任何密钥不得进入仓库或日志。
4. 验证 AI 报告 worker 的云端超时、重试和最终状态；清理历史积压必须走业务服务。
5. 对隐私政策、个人信息单独授权、定位权限、模型数据出境/第三方处理和算法审核材料做发布前复核。
6. 依赖告警升级必须走独立分支，禁止 `npm audit fix --force` 进入发布线。

## 4. 发布判定

必须分别记录（见 release manifest）：

| 发布物 | 验证方式 | 当前结论 |
|---|---|---|
| CloudBase `api` 云函数 | manifest `api_deploy_commit` + ping/专项自检 | 待按候选提交部署 |
| CloudBase `agent-graph` 云函数 | manifest `agent_graph_deploy_commit` + graph check | 待按候选提交部署 |
| 微信小程序客户端 | manifest `miniprogram_upload_commit` + 真机/体验版 | 待按候选提交上传 |

任何人准备部署时，先在 PR 中写明目标环境、提交号、测试证据和回滚方案，由指定发布负责人执行。

## 5. 接手命令

```powershell
Set-Location 'D:\wefinal\.worktrees\wefinally-release-20260904'
git status --short
git branch --show-current
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

协作与 PR 规则见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。
