# WeFinally 新会话交接：云开发体验版与 AI 报告问题暂停点（2026-07-08）

## 0. 当前口径

本会话已经太长，用户明确表示：

> 还是不对，不修了先，现在就是写一下交接文档，我们重新开始新对话。

所以新会话不要继续沿着上一轮惯性直接改代码。第一步应先读取本交接文档，重新梳理真实用户期望、当前代码状态、云端部署状态和截图表现，再决定是否修。

## 1. 项目路径

```text
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
```

小程序目录：

```text
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\miniprogram
```

主要测试指南：

```text
project-docs\USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md
project-docs\CLOUDBASE_MIGRATION_GUIDE_2026-07-08.md
project-docs\NEXT_THREAD_HANDOFF_2026-07-08_CLOUDBASE.md
```

本交接：

```text
project-docs\NEXT_THREAD_HANDOFF_2026-07-08_RESTART_AI_REPORT.md
```

## 2. 大背景

项目是 WeFinally 婚恋微信小程序，近期已从本地 Express/MySQL 方案迁到微信云开发方案 A：

```text
微信小程序 -> wx.cloud.callFunction -> cloudfunctions/api -> 云开发数据库
```

云环境：

```text
cloud1-d4gy8l52g08bba326
```

目标是让体验版和真机 demo 不再依赖本地电脑 `3000`、局域网 IP、Docker 或本地 MySQL。

## 3. 当前已实现的主功能

- 微信云开发登录、注册、用户资料。
- 云数据库版择偶配置、匹配列表、匹配详情。
- 首页演示入口“开发测试：立即匹配”，由 `system_configs.cloud_demo_match_enabled=true` 控制。
- VIP 演示开通，由 `system_configs.cloud_demo_vip_grant_enabled=true` 控制。
- 匹配详情展示综合匹配、字段拆解、外貌匹配参考、三观契合度。
- 字段拆解已恢复：云端 demo 匹配会写 `score_detail_json.side`，旧空记录读取时会兜底补字段。
- 官方奔现对接：匹配详情进入客服页，并携带 `handoffTicketId / matchLogId / matchUserId`。
- 见面安全按匹配对象管理：首页“安全求助”进入安全记录列表。
- 广东110不是拨号，是尝试 `wx.navigateToMiniProgram` 拉起 `wxf654be7f2931bfcb`。

## 4. 当前重要代码位置

云函数 API：

```text
miniprogram\cloudfunctions\api
```

匹配云函数逻辑：

```text
miniprogram\cloudfunctions\api\handlers\match.js
```

MiniMax 调用：

```text
miniprogram\cloudfunctions\api\lib\minimax.js
```

匹配详情前端：

```text
miniprogram\pages\match-detail\match-detail.js
miniprogram\pages\match-detail\match-detail.wxml
miniprogram\pages\match-detail\match-detail.wxss
```

首页立即匹配：

```text
miniprogram\pages\index\index.js
miniprogram\pages\index\index.wxml
```

字段拆解工具：

```text
miniprogram\utils\matchReport.js
```

云路由：

```text
miniprogram\cloudfunctions\api\handlers\route.js
```

## 5. AI 报告：用户真正想要的行为

用户刚刚明确纠正了之前的方向：

1. 图一已经有一段“临时婚恋参考”，但那不是用户想要的 AI 报告。
2. 旧匹配记录如果没有 AI 报告，应该可以点按钮调用 API 生成真正 AI 报告。
3. 新匹配完成后，最好自动生成 AI 报告。
4. 如果 AI 报告不能秒出，应先完成匹配，进入详情页显示“报告生成中 / 刷新进度 / 稍后重试”之类状态。
5. 不能把兜底文案或临时参考当成“已生成 AI 报告”。
6. 用户认为上一轮改完“还是不对”，因此新会话要重新审查，而不是默认当前代码就是正确方案。

## 6. 当前代码对 AI 报告的最后状态

注意：以下是代码最后状态，不代表用户满意。

### 6.1 云函数 `generateReport`

位置：

```text
miniprogram\cloudfunctions\api\handlers\match.js
```

当前思路：

- `POST /api/match/report` 调用 `match.generateReport`。
- 如果 MiniMax 返回成功：
  - `ai_report_text` 写入真实 AI 文本。
  - `ai_report_status=1`。
  - `score_detail_json.report_fallback_used=false`。
- 如果 MiniMax 超时/失败：
  - `ai_report_text=''`。
  - `local_report_text` 写兜底文案。
  - `ai_report_status=2`。
  - `score_detail_json.report_fallback_used=true`。
  - 期望前端仍显示“生成失败，可重试”按钮。

### 6.2 匹配详情页

位置：

```text
miniprogram\pages\match-detail\match-detail.js
miniprogram\pages\match-detail\match-detail.wxml
```

当前思路：

- 如果 `ai_report_text` 有内容，显示“已生成”，隐藏按钮。
- 如果没有 `ai_report_text`，显示临时参考和按钮。
- URL 带 `autoReport=1` 时，详情页加载完成后自动调用一次 `requestAiReport({ silentReport: true })`。

### 6.3 首页立即匹配

位置：

```text
miniprogram\pages\index\index.js
```

当前思路：

- 匹配成功后：

```js
wx.navigateTo({ url: `/pages/match-detail/match-detail?id=${result.match_id}&autoReport=1` })
```

## 7. 为什么用户仍觉得“不对”

需要新会话重新验证，可能原因包括：

- 体验版或云函数没有重新上传部署，用户手机跑的仍是旧代码。
- 云函数 `api` 的 MiniMax 调用仍受 3 秒云调用限制影响，导致经常走失败/兜底。
- `local_report_text` 和 AI 报告文案太像，用户肉眼觉得“点按钮没有变化”。
- UI 状态不够明确：临时参考、生成中、生成失败、真实 AI 报告需要视觉上更分开。
- 自动生成逻辑可能只对“首页开发测试立即匹配”有效，不覆盖定时匹配或历史记录入口。
- 真实 AI 返回内容可能被前端判空、被后端解析失败，或者被 `report_fallback_used` 逻辑隐藏。
- 旧记录中可能已有 `score_detail_json.report_fallback_used=true` 和旧 `ai_report_text`，格式混杂，导致展示异常。

新会话请优先从真实数据和页面状态反推，不要只看代码自检。

## 8. MiniMax 状态和安全提醒

当前 `miniprogram\cloudfunctions\api\lib\minimax.js` 为了 demo 曾经硬编码了 MiniMax Key 兜底。不要在回复里打印完整 Key。正式上线前必须移除硬编码，改成云函数环境变量或安全配置。

当前默认：

```text
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
```

代码里有 `CLOUD_FUNCTION_SAFE_TIMEOUT_MS=1800`，是为了避免微信云函数调用在前端 3 秒左右超时。这个可能导致 AI 报告很容易失败，需要重新设计为异步任务或云端后台生成。

## 9. 新会话建议优先路线

### P0：先别大改，先查清楚

1. 读取本交接文档。
2. 读取：

```text
project-docs\NEXT_THREAD_HANDOFF_2026-07-08_CLOUDBASE.md
project-docs\USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md
miniprogram\cloudfunctions\api\handlers\match.js
miniprogram\cloudfunctions\api\lib\minimax.js
miniprogram\pages\match-detail\match-detail.js
miniprogram\pages\match-detail\match-detail.wxml
```

3. 不要立刻修改；先画出当前 AI 报告状态机：

```text
ai_report_status: 0/1/2/3/4
ai_report_text
local_report_text
score_detail_json.report_fallback_used
前端按钮显示
前端文案显示
```

4. 给用户一个最小修复建议，确认后再改。

### P1：推荐的实际修法

把 AI 报告拆成“真实报告”和“临时参考”两个视觉模块：

- 真实 AI 报告：
  - 只展示 `ai_report_text`。
  - 只有 MiniMax 真成功才显示“已生成”。
  - 无内容时显示按钮。
- 临时婚恋参考：
  - 永远标注“非AI报告，仅临时参考”。
  - 不影响 AI 报告状态。
- 生成中：
  - 显示“正在生成，可先查看匹配详情”。
  - 提供“刷新进度”。
- 失败：
  - 显示“生成失败，可重试”，保留按钮。

如果要彻底解决 3 秒超时，应做异步方案：

1. 用户点击生成。
2. 云函数立即把记录改成 `ai_report_status=4`。
3. 返回前端。
4. 另一个云函数/定时轮询/后台任务实际调用 MiniMax。
5. 前端轮询 `/api/match/detail`。

微信云函数是否能方便后台继续执行，需要查 CloudBase 能力；如果不能，短期 demo 可以降低报告长度、缩短 prompt、继续同步调用但必须清晰显示失败可重试。

## 10. 当前自检结果

最近一次本地跑过：

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\server
npm run selfcheck
git diff --check
```

结果：通过。`git diff --check` 只有大量 LF/CRLF warning，不是错误。

但注意：自检通过不等于用户体验正确。用户刚刚说“不对”，下一轮要以截图和真机表现为准。

## 11. 当前工作区状态

工作区有大量未提交改动和新增文件，来自本轮云开发迁移、UI、后台、测试、样本库等。不要 `git reset --hard`，不要回滚用户或前面会话改动。

新会话若要改，请只改相关文件，并先用 `git diff -- <file>` 看清楚。

## 12. 下一会话可直接使用的 prompt

```text
你现在继续接手 WeFinally 婚恋微信小程序项目。项目路径：
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目

请先读取并严格参考：
project-docs\NEXT_THREAD_HANDOFF_2026-07-08_RESTART_AI_REPORT.md
project-docs\NEXT_THREAD_HANDOFF_2026-07-08_CLOUDBASE.md
project-docs\USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md

当前不要急着继续乱修。上一会话已经做了云开发迁移和 AI 报告多轮修改，但我刚刚测试后仍觉得“不对”。我的真实需求是：
1. 旧匹配记录如果没有真正 AI 报告，应显示按钮，点击后调用 MiniMax/API 去生成真正 AI 报告。
2. 新匹配完成后，最好自动生成 AI 报告；如果不能秒出，先完成匹配并进入详情页，显示生成中/刷新进度/稍后重试。
3. 临时婚恋参考不能冒充“已生成 AI 报告”；只有真实 AI 文本才显示“已生成”。
4. 请先审查当前代码和状态机，解释为什么现在体验仍像“点按钮没有区别”，再给最小修复方案。方案确认后再动代码。

重点阅读：
miniprogram\cloudfunctions\api\handlers\match.js
miniprogram\cloudfunctions\api\lib\minimax.js
miniprogram\pages\match-detail\match-detail.js
miniprogram\pages\match-detail\match-detail.wxml
miniprogram\pages\index\index.js

注意：
- 不要打印 MiniMax Key。
- 不要回滚大量已有改动。
- 用户端已经迁到微信云开发，体验版不应该再依赖本地 3000。
- 先做 root-cause review，再决定是否修。
```
