# WeFinally 当前交接

> 更新时间：2026-07-29
> 本文件是仓库根目录的当前交接入口；详细技术证据见下方链接。

## 1. 仓库状态

- 唯一工作目录：`D:\wefinal\.worktrees\wefinally-ai-agent`
- 当前分支：`feature/ai-agent-system`
- 当前工作树包含大量未提交和未跟踪改动，尚未形成可追溯的发布候选版本。
- 本地代码、已部署云函数和微信体验版可能不是同一版本。
- 已创建空的私有仓库 `John030427/wefinally`，本地 `origin` 已绑定；尚未推送任何提交。
- 历史提交曾包含本地测试凭据。当前文档已删除明文，但远端建库前仍需选择“清理历史”或“审计后建立全新基线”。

## 2. 产品现状

当前小程序已覆盖注册、资料、会员审核、匹配、匹配详情、AI 报告、AI 客服、约会协调、见面安全、订单和发票等主要链路，但仍属于待验证的发布候选，而非可直接上架的成熟产品。

2026-07-26 已完成并留有自检证据：

- 修复匹配详情把 128 分制原始 `total_score` 当成百分制的问题；历史记录依次读取 `normalized_total`、`normalizedTotal`、`total/max_total`，最后才兼容旧值。
- A/B 实证确认 A 侧关系偏好和外貌偏好两项 0 分的真实字段原因。
- 一次性测试 B 已通过后台审计业务流程清理，未直接改生产数据库。
- 建立 `high_fit`、`medium_fit`、`edge_pass`、`hard_reject`、`missing_data` 五类离线场景。
- 收紧脱敏 Top-K Agent 重排策略；模型不读写全库、不接触直接身份信息、不直接落库。
- 六组总自检全部通过，小程序开发者工具本地编译通过；当时未部署云函数、未上传客户端。

详细证据：

- [`project-docs/NEXT_THREAD_HANDOFF_2026-07-26_MINIPROGRAM_CONTINUATION.md`](project-docs/NEXT_THREAD_HANDOFF_2026-07-26_MINIPROGRAM_CONTINUATION.md)
- [`project-docs/DEVELOPMENT_LOG.md`](project-docs/DEVELOPMENT_LOG.md)
- [`project-docs/MATCH_SCENARIO_FIXTURES_2026-07-26.md`](project-docs/MATCH_SCENARIO_FIXTURES_2026-07-26.md)
- [`project-docs/MATCH_AGENT_TOPK_RERANK_2026-07-26.md`](project-docs/MATCH_AGENT_TOPK_RERANK_2026-07-26.md)

## 3. 当前风险与下一步

按优先级处理：

1. 把当前巨大工作树拆成可审阅的变更清单，排除凭据、部署产物和个人配置。
2. 决定 GitHub 历史策略。在首次推送前对历史凭据做专项审计；若无法可靠清洗，建立经过审计的新基线。
3. 建立可复现的发布候选：记录提交号，重新运行六组总自检、客户端编译、关键真机主链路。
4. 完成支付上线核验：环境密钥轮换、回调验签、主动查单、幂等开通、1 分钱真机支付与订单/VIP 一致性。任何密钥不得进入仓库或日志。
5. 验证 AI 报告 worker 的云端超时、重试和最终状态；清理历史积压必须走业务服务。
6. 对隐私政策、个人信息单独授权、定位权限、模型数据出境/第三方处理和算法审核材料做发布前复核。
7. Agent 重排先做离线 A/B 评估，不直接接生产匹配落库。

## 4. 发布判定

必须分别记录：

| 发布物 | 验证方式 | 当前结论 |
|---|---|---|
| CloudBase `api` / worker 云函数 | 下载或版本信息核对源代码、运行 ping/专项自检 | 曾部署过旧工作树版本；需对当前候选重新核对 |
| 微信小程序客户端 | 开发者工具编译、真机、体验版版本号与上传记录 | 本地编译曾通过；不能据此认定体验版已更新 |

任何人准备部署时，先在 PR 中写明目标环境、提交号、测试证据和回滚方案，由指定发布负责人执行。

## 5. 接手命令

```powershell
Set-Location 'D:\wefinal\.worktrees\wefinally-ai-agent'
git status --short
git branch --show-current
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
npm --prefix server run selfcheck:cloud-match
```

协作与 PR 规则见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。
