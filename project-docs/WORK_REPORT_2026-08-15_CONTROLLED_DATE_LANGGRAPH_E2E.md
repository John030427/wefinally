# WeFinally 受控双用户约会协调与 LangGraph 部署报告

日期：2026-08-15  
环境：`cloud1-d4gy8l52g08bba326`  
分支：`feature/partner-gated-aigc-plan`

## 结论

受控 A/B 用户链路已在 CloudBase 真实环境通过：创建双方用户与匹配关系、首次填写双方约会偏好、生成首版方案、A 方通过 AI 生成修改预览、确认修改、重新计算方案、双方确认，最终场景状态为 `passed`，协调状态为 `arranged`。

该验收同时要求并验证：

- 至少一条成功的 `provider=langgraph` 运行记录；
- 至少一条 `create_date_application_patch` 工具调用记录；
- 受控用户、匹配和通知保持内部 QA 标记，不进入正式匹配池，不发送真实通知；
- A/B 对话分别保存，后台共享进度只呈现一次，不泄露另一方原始回答。

## 云端验收记录

- 场景编号：`wf_date_e2e_20260815_02f420f6`
- A 方用户：`1786777970115807`
- B 方用户：`1786777970264620`
- 协调编号：`1786777970711875`
- A 方会话：`1786777970861796`
- B 方会话：`1786777971001823`
- AI 修改预览：`1786778338515237`
- 最终 API 请求：`5a121ab9-ddd7-4fbd-b554-5f9063981e02`
- 最终结果：HTTP 200，`status=passed`，`step=passed`

## 部署内容

- CloudBase Event Function `agent-graph`：Node.js 20，`index.main`，健康检查返回 `status=ok / runtime=langgraph`。
- CloudBase Event Function `api`：已启用 LangGraph 正式路径并保留 DeepSeek/后端安全回退；图调用冷启动预算为 30 秒，API 总超时仍为 60 秒。
- NoSQL 集合：`controlled_date_scenario_runs`、`langgraph_checkpoints`，均为管理端权限。
- CloudBase 静态托管：`admin/index.html` 已更新为 A/B 双栏约会协调工作台。
- 后台地址：<https://cloud1-d4gy8l52g08bba326-1451453378.tcloudbaseapp.com/admin/>

## 关键修复与提交

- `e4a3c1e`：约会协调接入 LangGraph 安全上下文。
- `6be41c0`：增加受控双用户场景服务与管理 API。
- `5a981ef`、`e5dd5fc`：后台 A/B 会话投影与双栏工作台。
- `f637bb6`、`87a8470`、`5f7eb94`：CloudBase 图函数入口、CommonJS/ESM 桥接。
- `1b8ab25`：修复 worker 并发完成误判及旧步骤响应。
- `482ab86`：明确受控 AI 修改工具意图。
- `73193bc`、`261ec26`：持久化图回退证据，并在通过前主动核验真实图运行。
- `31972e6`、`1d537ca`、`57bc98a`：兼容 CloudBase 注入元数据并提供安全验证诊断。
- `7b56640`：将云内 LangGraph 冷启动预算提高到 30 秒。

## 同日追加变更

- `875d173`：移除 `wx.getLocation`、连续定位和位置监听；仅保留用户主动地图选点 `chooseLocation`。
- `da63111`：取消邀请码硬条件。邀请码为空可注册并进入平台人工审核；有效合伙人邀请继续保留归因，签名分享仍可自动审核。

## 验证

- `npm run selfcheck:agent`：通过。
- `npm run selfcheck:member`：通过。
- `npm run selfcheck:safety`：通过。
- `agent-graph npm run check`：33 项测试通过。
- CloudBase `api` ping：通过。
- CloudBase `agent-graph` health：通过。
- CloudBase 受控场景最终推进：通过。

## 已知事项

- 小程序源码已修改，但未上传体验版或正式版；需由项目方在微信开发者工具中重新构建并提交审核。
- `wx-server-sdk@4.0.2` 的依赖树仍有 npm audit 报告的传递性安全告警；未执行可能引入破坏性降级的自动修复。
- 全量真机脚本当前会被既有的开发者工具基础库版本检查提前阻断；本次定位契约测试和 JS 语法检查均已单独通过。
