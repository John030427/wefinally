# WeFinally 约会地点引导与双机 QA 重置交接

日期：2026-09-04  
开发分支：`fix/date-counter-offer-negotiation`  
部署代码提交：`afcdcd6b743297660f57cdcee04df178d9b1916e`

## 本轮结果

- 初次邀请允许先填写大致区域、活动或菜系，再由 AI 追问具体门店。
- 最终方案和直接接受仍要求具体活动场地，避免“看电影但场地仍是星巴克”。
- “大运中心”“椰子鸡”等不完整地点返回可执行引导，不再作为通用 `SERVER_ERROR`。
- QA 面板增加“清空双机匹配与协调数据”。清空范围包括：
  - 双方匹配记录、claim、AI 报告任务和匹配体验反馈；
  - 第一次约会协调、方案、确认、变更、事件、通知；
  - 仅与这些协调关联的 `date_coordinator` 会话、消息、运行和工具审计；
  - 测试见面报备、到场轨迹及关联 SOS 记录。
- 明确保留账号、注册资料、择偶配置、身份标签、画像/RAG 证据、VIP、订单、推广/佣金数据和普通恋爱助手会话。
- 重置使用稳定幂等请求、租约恢复和脱敏审计，不记录 OpenID、聊天原文或其他敏感内容。

## CloudBase 部署

- 环境：`cloud1-d4gy8l52g08bba326`
- 云函数：`api`
- 类型/运行时：Event / Nodejs16.13
- 状态：`Active` / `Available`
- 云端更新时间：`2026-09-04 01:51:53`
- 新集合：`qa_pair_reset_runs`、`qa_pair_reset_audits`
- 函数环境变量、运行时、网关和权限均未修改。
- `ping` 调用成功并返回目标 EnvId。

## 验证

以下命令均通过：

```text
npm --prefix server run selfcheck:cloud-match
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:qa-pair-reset
node server/selfcheck/miniprogram-source-syntax.js
git diff --check
```

独立架构审查中的两个旧 P0 已在当前代码中关闭：现场不符会暂停会合并阻止继续确认；确认后的方案修改通过事务/CAS 提交。具体时间会复用 `periodForStartTime()`，带精确方案时只允许单日期、单时段、单区域和单活动；到场识别提示已改为确认后可选信息。

## 小程序体验版

云函数部署不会更新客户端 JS/WXML/WXSS。要在真机看到新地点引导和 QA 清空按钮，需要从本工作树的 `miniprogram` 目录重新编译并上传体验版：

```text
D:\wefinal\.worktrees\wefinally-qa-replay-global\miniprogram
```

本轮未使用 computer use，也没有擅自修改微信开发者工具设置。仓库未配置 `miniprogram-ci` 私钥，无法在不确认上传 IP 白名单和密钥的情况下安全自动上传。

## GitHub 集成阻塞

分支已推送到 `origin/fix/date-counter-offer-negotiation`。GitHub 拒绝创建到 `main` 的 PR，原因是两者没有共同提交历史：

- 当前功能分支根提交：`0efeb8d8b159d4530ed6b1aa31665a13153623de`
- 当前 `main` 根提交：`7d8d7549b5a5e5e4cd8905c44a7b47906e3d614e`

`main` 是经过清理后重新建立的协作基线。不要直接使用 `--allow-unrelated-histories` 把旧历史并回主线。推荐另建一个基于 `origin/main` 的发布分支，只迁移经过审查的当前树差异或选择的提交，并在敏感信息扫描与完整 CI 通过后创建 PR。

## 真机复测顺序

1. 从上述 `miniprogram` 目录上传体验版，两台手机打开同一体验版。
2. 任一测试账号点击“清空双机匹配与协调数据”，确认成功提示。
3. 两台手机依次点击“两台真机互配测试”。
4. 一方发起约会：可先填“大运中心 + 吃饭/椰子鸡”，确认 AI 会继续追问具体门店。
5. 补充具体餐厅或影城后，双方确认最终方案。
6. 检查双方协调会话能看到对方的修改摘要与最终方案卡。

