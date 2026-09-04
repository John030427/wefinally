# WeFinally 约会活动修改与 AI 协调交接

## 状态

- 工作树：`D:\wefinal\.worktrees\wefinally-release-20260904`
- 当前分支：`fix/flexible-date-location-2026-09-04`
- 本次代码提交：`5215cd6`（在 `1c7c8fa` 基础上补充模型不可用时的确定性活动修改兜底）
- 本次范围：复核并修复活动修改、餐饮意图、方案预览和回归测试；不删除生产记录，不修改密钥/运行时/权限。
- CloudBase 环境：`cloud1-d4gy8l52g08bba326`（ap-shanghai）。此前已部署的 api / agent-graph 代码为 `8f929f0`；本次修复在 Git 上传前尚未部署。
- `AGENTS.md` 中列出的期望分支为 `fix/release-review-remediation-2026-09-04`，但本工作树实际检出的是上面的发布分支；本次不擅自改名或切换分支。

## 用户现象与根因

### “改为吃饭”方案不变

旧的自然语言合约只覆盖“活动改成/只改活动”等较长表达，没有覆盖短句“改为吃饭”。模型在未产生结构化 patch 工具请求时会退回普通答复，因此旧方案卡仍显示原活动。

### “我想吃大二酸菜 / 问对方想不想吃酸菜鱼”被当成泛聊

这类消息同时包含活动变更、菜品说明和对方询问。若只走通用模型路径，容易返回“请补充一项”的泛化提示，不能生成可确认的方案。

### 方案卡显示“可以赴约”但协调未完成

`meeting_ready` 只表示字段齐全，不等于双方当前版本都确认。最终成约必须由服务端当前版本确认事务判定。截图中的旧卡片来自旧客户端/旧会话状态；当前源代码的协调状态仍以 `arranged` 或 `待双方确认` 为准，不会把字段齐全冒充双方确认。

## 本次修复

1. `interpretNlPlanUtterance` 支持“改为/调整为/换成”等直接活动修改，并取最后一个活动词，避免“取消电影，改成咖啡”误取前一个词。
2. agent 在模型结果之后增加确定性兜底：明确的活动变更统一进入 `create_date_application_patch` 预览，用户确认前不写入、不通知对方。
3. 餐饮表达生成同一套可确认 patch：活动设为“吃饭”，菜品写入 `activity_detail`（例如“酸菜鱼”“大二酸菜”），并保留用户已填写的商圈/商场/场地。
4. 对“问对方是否接受”的表达先生成修改预览，确认后才沿用现有隐私安全通知和双方版本校验；不会把一句询问直接当作对方同意。
5. `activity_detail` 只在有值时加入归一化结果，保持旧记录字段形状兼容；公开变更维度去重，避免“活动/活动说明”重复显示。
6. 方案卡和对方询问卡增加“活动说明”展示，例如“吃饭（酸菜鱼）”，避免只看到泛化的“吃饭”。
7. 模型暂时不可用时，明确活动修改仍走安全预览；餐饮预览无变化时返回可读错误，不冒泡成 `SERVER_ERROR`。
8. 未改写历史消息、未删除匹配/聊天记录、未改变 LangGraph 状态存储和安全边界。

## 预期交互

| 输入 | 预期结果 |
|---|---|
| `改为吃饭` | 生成活动修改预览，显示前后活动，等待“确认修改” |
| `不想看电影了，帮我改成咖啡` | 只把活动改成咖啡，原地点/时间保留 |
| `我想吃大二酸菜` | 生成“吃饭 + 大二酸菜”的预览，不自动通知 |
| `时间我ok，问对面想不想吃酸菜鱼` | 生成“吃饭 + 酸菜鱼”的预览；用户确认后才询问对方 |
| `大运中心` / `万象城` | 作为宽泛活动地点保留，不要求伪造具体门店 |
| `椰子鸡`（没有地点） | 作为活动说明，要求补充活动地点，不返回未处理的服务器异常 |
| `星巴克 + 电影` | 先澄清“先碰面还是影院”，未澄清不能最终成约 |
| 旧版本确认或双方只确认字段 | 拒绝过期版本；只有双方当前版本确认后才 `arranged` |

## 自动化验证

以下命令在本工作树均通过：

```powershell
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
git diff --check
```

新增断言覆盖：`改为吃饭`、取消旧活动后改成新活动、菜品说明和对方询问的可确认 patch。`agent-graph` 构建及 42 项测试通过；`LIVE_GRAPH_SMOKE` 仍按发布协议标记为 `MANUAL_REQUIRED`，不能用单测代替真实模型双设备验收。

## Git 交接

- 远端：`https://github.com/John030427/wefinally.git`
- 推送命令：`git push origin fix/flexible-date-location-2026-09-04`
- 本次代码修复提交：`5215cd6`；交接文档提交后，分支最新提交可用 `git log --oneline --max-count=1` 查看。推送后用 `git ls-remote --heads origin fix/flexible-date-location-2026-09-04` 核对远端哈希。
- 不执行 force push，不合并 `main`，不把历史实验工作树当发布源。

## 真机验收

1. 在微信开发者工具打开 `D:\wefinal\.worktrees\wefinally-release-20260904\miniprogram`，重新编译并上传测试版；旧开发者工具缓存/已上传版本不会自动包含本次修复。
2. 两个真实账号进入同一个协调会话。先输入“改为吃饭”，确认看到修改预览；再输入“我想吃大二酸菜”，应看到“吃饭 + 大二酸菜”，点击确认后才产生对方侧通知。
3. 对方侧检查消息卡的变更摘要和当前版本；不同意或旧版本确认不能直接成约。
4. 输入“问对方想不想吃酸菜鱼”时，检查先预览、后确认、再通知的三步顺序；任一方修改时间/地点后，旧预览应失效并要求刷新。
5. 最后用“星巴克 + 电影”和“大运中心 + 吃饭”各测一次，确认地点不会被清空，也不会把集合点误报为最终影院。

失败时只记录客户端版本、操作时间、协调编号和截图，不上传手机号、OpenID、Token 或登录凭据。

## 后续发布边界

本次用户请求是复核、修复、写交接并上传 Git 分支，因此本次不自动部署 CloudBase，也不上传小程序。部署 api、部署 agent-graph、上传小程序是三个独立动作；需要发布时应以本文件记录的代码提交为 source commit，重新生成发布清单并在用户确认后执行。
