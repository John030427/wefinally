# QA 与 UI 发布加固验证记录

验证日期：2026-08-30
分支：`codex/tab-icons-admin-chat-domain`
实现基线：`315f9fd docs(plan): define QA and UX hardening tasks`
验证时实现 HEAD：`cf60075 test(e2e): freeze invitation date baseline`

最终 `docs(review)` 证据提交位于本文件所在提交；为避免自引用哈希不稳定，以 `git log -1 --oneline` 为准。

## 自动验证

| 命令 | 结果 | 说明 |
|---|---|---|
| `node server/selfcheck/qa-registration-match-reveal.js` | PASS / exit 0 | QA 重录轮次、匹配资料、揭晓语义与源码合同 |
| `node server/selfcheck/secondary-identity-picker.js` | PASS / exit 0 | 搜索、分组、主身份排除、已选保留、最多两个、抽屉合同 |
| `node server/selfcheck/custom-tab-bar.js` | PASS / exit 0 | 三个固定路由、图标类、品牌色、页面选中态同步 |
| `node server/selfcheck/backoffice-simple-web-final.js` | PASS / exit 0 | 会话列表/详情/回复入口及 lower-role 脱敏/RBAC |
| `node server/selfcheck/miniprogram-source-syntax.js` | PASS / exit 0 | 51 个小程序 JavaScript 文件语法通过 |
| `npm --prefix server run selfcheck:release-guard` | PASS / exit 0 | QA 发布开关逻辑 |
| `npm --prefix server run selfcheck:cloud-match` | PASS / exit 0 | 完整 Cloud 匹配、RAG 降级、QA 跨轮、claim 并发与迁移合同 |
| `npm --prefix server run selfcheck:agent` | PASS / exit 0 | Agent、LangGraph 客户端/工具桥、协调、隐私、并发、UI 合同；live graph smoke 为 `MANUAL_REQUIRED` |
| `npm --prefix server run selfcheck:match-staging-v18` | PASS / exit 0 | 双向排序、方向不变性、模型载荷去手机号/OpenID/地址/私密 canary |
| `npm --prefix server run selfcheck:member` | PASS / exit 0 | 会员、邀请归属、审核、A/B fixture、后台 token |
| `npm --prefix server run selfcheck:safety` | PASS / exit 0 | 见面安全、人工转接、微信客服入口 |
| `npm --prefix server run e2e:wefinally` | PASS / exit 0 | 14/14；`LIVE-AI-SMOKE` 明确 skipped，未触发真实外部 AI |
| `git diff --check` | PASS / exit 0 | 无空白错误 |

补充回归：`formal-matching.js`、`match-cycle.js`、`match-claim-concurrency.js`、`match-claim-audit-policy.js`、`match-batch-worker.js` 均 exit 0。

## CloudBase Admin 只读验收

- 地址：`https://cloud1-d4gy8l52g08bba326-1451453378.tcloudbaseapp.com/admin/`
- `curl -I`：`200 OK`、`Content-Type: text/html`。
- 远端静态 HTML 字符串核对：`客服工作台`、`选择左侧会话后查看真实用户—AI聊天`、`/admin/agent/conversations`、`serviceConversationReplyText` 均存在。
- 未登录、未读取真实会话、未发送客服回复、未改生产配置。

## 视觉与真机状态

| 项目 | 状态 | 证据/阻塞 |
|---|---|---|
| 注册身份抽屉静态合同 | PASS | WXML 不再平铺 `secondaryIdentityOptions`；存在入口、搜索、已选区、分组、空态和关闭动作 |
| custom tabBar 静态合同 | PASS | 无 WXML SVG/网络图片；三枚 CSS mask 图标、固定白名单和安全区 |
| 匹配揭晓静态合同 | PASS | 日期门槛、永久 view、会话级 dismiss、storage 异常继续导航 |
| 微信开发者工具模拟器渲染 | PENDING_MANUAL | 本机发现 `D:\微信web开发者工具\cli.bat`，但 IDE 安全设置中的 CLI 服务端口关闭；未擅自修改该设置 |
| 两台真实微信账号完整回归 | PENDING_MANUAL | 需要真实账号、实际匹配窗口/受控执行与人工观察；操作资料见 `project-docs/REAL_DEVICE_REGISTRATION_MATCH_TEST.md` |
| 底部安全区与不同机型手势 | PENDING_MANUAL | 需要至少一台有 Home Indicator 的真机和一台安卓机 |

## 变更边界

- 未部署 Cloud Function、Agent Graph、静态站点。
- 未上传微信小程序体验版或正式版。
- 未写生产数据库，未删除或重写历史 match claim。
- 未购买/绑定域名，未修改 DNS、证书、CORS 或生产环境变量。
- 未 push、未 merge。

## 提交序列

```text
5eca6d0 fix(qa): allow rematch after fresh replay runs
f863530 feat(register): simplify secondary identity selection
b31501c feat(nav): add WeFinally tab icons
f077de9 fix(match): preserve reveal until viewed
843d872 docs(admin): record conversation and domain readiness
303d1b4 fix(qa): scope same-day claims by replay run（subagent 审查后由 238c910 加强为 user-run 原子互斥）
b885aaa fix(register): keep identity drawer within viewport
238c910 fix(qa): preserve atomic replay isolation
4e67841 test(match): align atomic history contract
cf60075 test(e2e): freeze invitation date baseline
docs(review): verify QA and UI hardening（本文件所在最终证据提交）
```
