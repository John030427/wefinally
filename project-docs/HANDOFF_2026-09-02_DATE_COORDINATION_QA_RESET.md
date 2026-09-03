# 2026-09-02 约会协调修复与 Cursor Review 交接

## 本轮结论

本轮故障不是“旧匹配记录继续生效”。线上只读排查确认，两个 QA 真机账号已进入新的约会协调轮次；失败发生在受邀方用自然语言修改日期或时间段时：新 `availability` 覆盖了日期/时段，但合并逻辑仍继承发起方的旧 `start_time`，于是确定性校验得到“具体时间与所选时间段不一致”。

男方表单显示 `SERVER_ERROR` 是第二个问题：后端原本把可修正的表单校验错误统一隐藏成服务错误。现在仅对声明过的安全业务错误返回用户可读文案，内部异常仍不泄露。

## 已完成的修复

- 修改日期或时间段但没有同时提供具体时刻时，清空继承的 `start_time`，要求用户补充“晚上 8 点”等明确时刻。
- 约会申请校验失败返回 `DATE_APPLICATION_INVALID` 和限定长度的安全提示；小程序优先显示该提示。
- 页面加载到新的 `coordination_id` 时从空表单开始，不继承上一轮日期、时间、场地或见面提示。
- 为 `qa-real-device-registration-v1` 测试账号开放“重置本轮”按钮。它会软关闭本轮协调、会话、通知任务和待确认补丁；历史聊天和审计数据保留，随后可重新申请第一次约会。
- QA 重置必须同时满足：当前用户属于指定 QA cohort、是协调参与者，并提交固定确认文本。

## 业务与数据边界

- QA 重置只按精确 `coordination_id` 操作，不批量删库，也不删除用户、匹配或历史消息。
- 关闭动作目前是可重试的顺序写入，不是跨集合事务。协调主记录最后关闭；重复请求对已终态记录返回幂等结果。
- LangGraph 负责理解“改到周日晚上”“问对方是否方便”等意图和生成待确认草案；权限、版本校验、字段归一化、时间一致性、确认与数据库写入必须继续由确定性服务端完成。
- 对方原始回答不直接暴露。双方能看到结构化变更、待确认方案和最终方案。

## 回归场景

1. A 提交 9 月 7 日 22:04 的方案；B 说“改到周日晚上”。系统应要求 B 补充具体开始时间，不能继承 22:04。
2. B 再说“周日晚上 8 点”。系统应生成待确认变更，并在确认后通知 A。
3. B 说“看电影”，旧场地是咖啡店。系统应提示选择影院/具体活动场地，不能静默保留不相容场地。
4. 进入新的协调轮次，页面不应出现上一轮日期、时间、活动场地或到达提示。
5. 任一 QA 真机账号点击“重置本轮”后，当前轮次关闭；另一账号刷新后不能继续旧轮次，可重新发起约会。
6. 普通用户详情中不出现 QA 卡片，直接调用重置接口也应失败。

## Cursor Fable 5.1 Review 任务

请基于当前分支 `fix/date-counter-offer-negotiation` 做只读代码审查，不要直接改代码。结果按 P0/P1/P2/P3 排序，必须包含文件与行号；如果没有发现也要明确写“无发现”。重点检查：

### AI 协调流程

- LangGraph 是否只做意图编排，是否存在模型绕过权限、版本/CAS、确认步骤直接写业务结果的路径。
- 日期、时段、具体时刻之间的依赖是否完整；修改一个维度时是否清理失效的派生字段。
- “看电影/吃饭/咖啡”等活动与具体场地是否会产生语义冲突，系统是否会澄清而非静默继承。
- 对方修改、询问、接受、拒绝、到达地点、穿搭/现场识别提示是否同时有结构化状态和双方可见通知。
- 旧协调/旧会话升级到新 contract 时的读兼容、写隔离与迁移策略。
- 通知任务是否有稳定幂等键；重点排查同一邀请通知重复写入。

### AI 报告

- 对照当前报告 schema、worker/task 和小程序展示，检查字段漂移与新旧版本兼容。
- 用户界面不得显示 `null`、`completeness`、模型字段名等实现细节；已移除的“数据限制”不得从其他渲染路径重新出现。
- AI 文案需标注仅供参考；核心匹配结论应保留确定性证据与可追溯版本。

### UI/UX

- 当前方案与待确认方案应位于首屏主要层级；聊天用于解释上下文和提醒，不承担唯一事实来源。
- 检查真机窄屏换行、按钮触控高度（至少 88rpx）、安全区、加载/空态/错误态和双击防护。
- QA 控件必须弱化且仅测试账号可见，不得误导正式用户。
- 统一 WeFinally 设计 token，避免 emoji 与正式图标体系混用。

## Git 与 CloudBase 工具说明

工作目录：`D:\wefinal\.worktrees\wefinally-qa-replay-global`

提交前必须排除用户本机文件：

```powershell
git status --short
git diff --check
git add <本轮明确文件>
git diff --cached --check
git diff --cached
```

不得提交 `miniprogram/project.config.json`。CloudBase 正式环境为 `cloud1-d4gy8l52g08bba326-1451453378`（上海）。常用只读发现命令：

```powershell
npx mcporter list
npx mcporter describe cloudbase --all-parameters
npx mcporter call cloudbase.auth --args '{"action":"status"}'
npx mcporter call cloudbase.envQuery --args '{"action":"list"}'
```

实际函数名、参数和部署动作必须以 `describe` 返回为准，不凭记忆猜测。部署前重新核对环境 ID、函数清单、数据库/权限变更、密钥来源、回滚 commit 和 smoke test。云函数部署与微信“小程序测试版上传”是两个独立动作：后端部署成功不会自动让真机获得新页面；小程序端仍需使用正确目录构建并上传测试版。

## 当前验证命令

```powershell
npm --prefix server run selfcheck:date-qa-reset
npm --prefix server run selfcheck:agent
npm --prefix server run selfcheck:safety
npm --prefix server run selfcheck:ai-report
npm --prefix server run selfcheck:cloudpay
npm --prefix server run selfcheck:member
git diff --check
```

本交接文档记录代码状态，不代表云函数已部署，也不代表微信测试版已上传。
