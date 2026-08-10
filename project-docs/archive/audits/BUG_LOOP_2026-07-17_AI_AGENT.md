# WeFinally AI Agent P0/P1 Bug Loop（2026-07-17）

工作树：`D:\wefinal\.worktrees\wefinally-ai-agent`
分支：`feature/ai-agent-system`

## 基线

- `selfcheck:agent`：PASS（exit 0）
- `selfcheck:safety`：PASS（exit 0）
- `selfcheck:ai-report`：PASS（exit 0）
- `selfcheck:cloudpay`：PASS（exit 0）
- 基线失败证据：无

## BL-001 并发确认约会修改预览会重复执行（P1）

- 复现：将 `date-application-patch` 的重复确认改为两个并发 `confirmForUser` 调用。
- 失败命令：`node server/selfcheck/date-application-patch.js`
- 失败证据：exit 1；v2 双方应用快照期望 2 条，实际 4 条；断言 `4 !== 2`，位置 `server/selfcheck/date-application-patch.js:129`。
- 影响：弱网重试或快速重复点击可能重复生成版本快照、事件和对方通知。
- 根因修复：确认入口先以 `pending_confirmation -> applying` 条件更新原子抢占；未抢到的并发请求不得执行写入链，完成后的顺序重试仍返回已应用结果。
- 回归：并发请求 1 成功、1 明确返回处理中；v2 快照 2 条、事件 1 条、通知任务 1 条；专项及 `selfcheck:agent` PASS。
- 状态：已修复。

## BL-002 弱网下网络探测无回调会永久挂起（P1）

- 复现：模拟 `wx.getNetworkType` 不触发 success/fail，而现有 `app.checkNetwork()` 可返回离线结果。
- 失败命令：`node server/selfcheck/request-resilience.js`
- 失败证据：exit 1；50ms 有界检查先超时，`offline.timeout` 实际为 `true`。
- 根因修复：请求层复用已有、带超时兜底的 `app.checkNetwork()`；离线、探测失败和登录过期均保证 Promise 结束并正确清理 loading/login 状态。
- 回归：`PASS request weak-network and expired-login recovery`；已纳入 `selfcheck:agent`。
- 状态：已修复。

## 并发所有权观察

- 订单/发票、VIP 支付实现及其两项专项自检未修改。

## BL-003 MiniMax 临时网络中断被误判为不可重试（P1）

- 复现：`classifyError(new Error('socket hang up'))` 的 `retryable` 实际为 `false`；专项 exit 1，断言 `false !== true`。
- 影响：TLS 连接重置或 `EAI_AGAIN` 临时 DNS 故障会让 AI 报告提前进入失败态，跳过现有自动退避恢复。
- 根因修复：在既有临时网络错误分类中补充 `socket hang up`、`EAI_AGAIN` 和 HTTP 408，不改变重试次数或状态机。
- 回归：`PASS ai report task policy`。
- 状态：已修复。

## 结束条件

- 无新增 P0/P1 第 1 轮：四项总自检全部 PASS；变更文件语法检查与 `git diff --check` 无错误。
- 无新增 P0/P1 第 2 轮：四项总自检全部 PASS；分支仍为 `feature/ai-agent-system`。
- 已修复：BL-001、BL-002、BL-003、BL-004。
- 未修复：可编辑范围内未发现仍可复现的 P0/P1。
- 阻塞：订单/发票、VIP 支付实现属于并发主任务所有权，本轮仅执行既有自检，不做独立修复；真实云端/真机并发未部署验证。
- 风险：云函数部署状态可能仍落后于本地工作树；支付密钥轮换与真实支付验证仍按 handoff 执行，禁止在日志中暴露密钥材料。
- 操作确认：未 reset、clean、checkout、commit、部署或修改生产数据。

## BL-004 方案确认并发会重复记录或丢失双方完成状态（P1）

- 复现一：同一用户两个并发确认写出 2 条记录，断言 `2 !== 1`。
- 复现二：A、A 重复与 B 同时确认后，两方记录均存在但状态仍为 `waiting_confirmations`，期望 `arranged`。
- 根因修复：确认记录使用“协调 + 用户 + 版本”的确定性文档；写后重读本版本确认集合；协调状态更新禁止从 `arranged` 降级；完成后的同方案重试幂等返回。
- 回归：同方仅 1 条、双方并发最终 `arranged`、完成后重试仍为 `arranged`；`PASS date coordination cloud`。
- 状态：已修复。
