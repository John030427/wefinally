# 双边 AI 约会协调实施计划

每个代码批次固定执行：失败测试 → 最小实现 → 专项验证 → diff review → 只提交本批文件 → 报告 commit。

## Batch 0：基线与 characterization

- [ ] 运行六组 selfcheck，记录当前基线。
- [ ] 补充失败测试，证明当前协调计算是同步的、缺少 queued/processing 生命周期。
- [ ] 补充第五轮、旧版本 worker 完成、跨用户会话隐私测试。
- [ ] 只提交测试与固定 fixture，不改业务实现。
- _Requirements: R1, R2, R3, R5, R6_

## Batch 1：正式候选池失败关闭

- [ ] 强化 `canEnterFormalCandidatePool`：任何 synthetic/test/hidden 标记均排除。
- [ ] 验证 synthetic 不能作为正式发起方、候选方或产生正式 claim。
- [ ] 保留后台 `include_test=true` 的受控审计入口，默认继续隐藏。
- _Requirements: R7, R8_

## Batch 2：删除正式客户端测试入口

- [ ] 删除首页“10 秒测试匹配”UI、倒计时、恢复、执行和跳转代码。
- [ ] 删除正式客户端对 `MATCH_TEST_RUNS` 和测试本地存储的引用。
- [ ] 保留服务端权限保护、离线 fixture 和 selfcheck。
- [ ] 增加“正式客户端无测试入口/API 引用”契约测试。
- _Requirements: R7, R8_

## Batch 3：注册用户公开编号闭环

- [ ] 先写并发唯一、重试不变、注册成功必有编号测试。
- [ ] 新注册响应前完成 `support_code` 分配；失败不返回伪成功。
- [ ] 保持既有 `WF-xxxxxx` 编号不变，不暴露数据库内部 ID。
- _Requirements: R9_

## Batch 4：客服页用户ID

- [ ] 聊天页加载本人 `support_code`，顶部展示说明和复制操作。
- [ ] 覆盖平台客服、恋爱助手和约会协调员三种会话。
- [ ] 添加加载失败/重试状态；不得显示 OpenID、手机号或内部数值 ID。
- [ ] 完成小程序语法和 UI 契约测试。
- _Requirements: R9, R10_

## Batch 5：协调处理状态与 5 轮策略

- [ ] 为协调纯策略增加 `round_number/max_rounds` 和处理状态规则。
- [ ] 定义 queued → processing → completed/failed 合法转换。
- [ ] 明确拒绝约会立即停止；拒绝当前方案进入下一轮；第 5 轮后转人工。
- [ ] 旧 proposal/confirmation 在版本变化后失效。
- _Requirements: R2, R3, R5_

## Batch 6：CloudBase 协调队列与 CAS worker

- [ ] 两份当前版本申请齐全后只入队，不在请求内同步生成方案。
- [ ] 实现版本 + lease token 原子领取、完成、失败重试和过期恢复。
- [ ] 把协调任务接入现有 `processWorkerTasks`。
- [ ] 证明重复请求、并发 worker、旧版本完成不会重复写方案或覆盖新版本。
- _Requirements: R1, R2, R3, R6_

## Batch 7：双边 Agent 主动反馈

- [ ] 为 A/B 建立或复用各自独立的 date coordinator session。
- [ ] 在申请、入队、方案生成、无交集、修改、同意、拒绝和转人工时投递脱敏事件。
- [ ] 模型只润色确定性安全摘要，不决定交集、轮数或同意/拒绝。
- [ ] 测试另一方原始表单、聊天和联系方式不可见。
- _Requirements: R1, R2, R4, R5_

## Batch 8：多轮 AI 修改闭环

- [ ] 复用 `date_application_patch` 的预览—确认流程。
- [ ] 用户确认修改后递增版本/轮次、使旧方案失效并重新入队。
- [ ] 双方确认同一 active 版本才原子进入 `arranged`。
- [ ] 覆盖直接成功、一次修改成功、双方修改成功、方案拒绝后成功和 5 轮转人工。
- _Requirements: R3, R4, R5, R6_

## Batch 9：真实协调 UI

- [ ] 协调页展示第 N/5 轮、方案版本和待处理/处理中/待确认/完成/失败。
- [ ] 页面恢复、自动刷新、失败重试和人工入口与后端状态一致。
- [ ] 不展示另一方原始回答；不以 loading 冒充 AI 正在处理。
- [ ] 完成真实小程序尺寸检查；工具不可用时记录缺口。
- _Requirements: R2, R3, R4, R5_

## Batch 10：CloudBase 正式发布准备

- [ ] 使用 MCP 只读核对目标环境、api/worker、正式 flags 和 synthetic 用户标记。
- [ ] 输出 faker 标记修复和队列索引 dry-run；仅执行用户已确认的字段修复。
- [ ] 通过 MCP 创建/核对 `coordination_processing_queue` 索引。
- [ ] 关闭公开测试匹配 flag，不删除测试数据。
- _Requirements: R7, R8, R11_

## Batch 11：最终 review 与工作报告

- [ ] 运行六组 selfcheck、新增专项测试、小程序语法检查和 `git diff --check`。
- [ ] 执行 CloudBase code review、权限/隐私/幂等/超时/索引/UI review。
- [ ] 创建最终工作报告，列出每批 commit、验证、未完成真机项和回滚步骤。
- _Requirements: R6, R11_

## Batch 12：分阶段发布

- [ ] 基于已审核 commit 通过 CloudBase MCP 部署 `api`，验证 ping、路由和 worker。
- [ ] 用户单独确认“上传体验版”后上传客户端。
- [ ] 使用两个独立微信账号完成四条真机协调场景并记录结果。
- [ ] 支付、隐私和发布材料复核完成后，用户单独确认“提交正式审核”。
- [ ] 未满足任一门禁时停止，不把体验版或本地结果称为正式版已上线。
- _Requirements: R6, R11_
