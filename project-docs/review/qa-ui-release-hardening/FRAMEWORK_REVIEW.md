# WeFinally 当前框架独立审查

日期：2026-08-30
审查方式：按用户要求启动了一个只读 subagent；它没有修改文件。subagent 在给出三项可复现 P1 后因额度限制中止，主 Agent 逐条检查源码、补测试并复跑完整基线。下列结论只保留有本地证据的项目。

## 总结

- 最终状态未发现仍未处理的 P0。
- subagent 指出的三项本轮 P1 均已修复：同日 QA claim 原子 scope、手动匹配路径漂移、UI 合同未进 CI。
- RAG/“特调”当前不能表述为线上模型训练完成：代码中真实 embedding provider 默认 `none`，不可用时走确定性降级；现有数据集和评估脚本是离线评测/特征校准，不是训练流水线。
- LangGraph 是可选编排层，`LANGGRAPH_ENABLED` 默认关闭；自动测试覆盖客户端、工具桥、恢复与确定性 E2E，但真实 graph smoke 仍是 `MANUAL_REQUIRED`。

## 本轮已修 P1

### 1. QA 同日跨轮与单用户原子互斥

subagent 首先发现：预筛允许旧 claim 后，真实文档仍按 production cycle 命名，同一匹配日的新 QA 轮次会在原子层被旧文档拦截。第一次修法把双方 pair run key 同时用于两个 user marker，又会让 A-B 与 A-C 产生不同的 A marker，形成双重交付空洞。

最终修法：

- pair marker 使用双方 canonical `qa_match_run_key`。
- 两个 user marker 分别使用服务端生成的 `qa_user_run_id` / `qa_match_user_run_id`。
- 固定 `pair_hist_<pair>` 在事务内做最后历史判定；同轮幂等先于历史检查，新轮只有双方重录时间都晚于旧 claim 才放行。
- 测试覆盖同日 run1→run2，以及同一 A 同时尝试 A-B/A-C 只能有一个交付成功。

证据：

- `miniprogram/cloudfunctions/api/lib/matchClaim.js`
- `miniprogram/cloudfunctions/api/lib/qaRegistrationReplayPolicy.js`
- `server/selfcheck/match-claim-concurrency.js`
- `server/selfcheck/formal-matching.js`

### 2. 正式 worker 与手动 Cloud 匹配合同统一

subagent 发现 `handlers/match.js` 仍用旧的永久 `historicalPairKeys.has(...)`，会让真机手动触发和正式 worker 得到不同结果。

现已统一复用 `shouldExcludeHistoricalClaims`、`shouldBlockUserForClaim` 和 `qaRunKey`；手动交付同样传入 pair/user/partner run scope，格式异常时 fail-closed。

证据：

- `miniprogram/cloudfunctions/api/handlers/match.js`
- `miniprogram/cloudfunctions/api/lib/formalMatching.js`
- `server/selfcheck/qa-registration-match-reveal.js`
- `server/selfcheck/cloudbase-migration.js`

### 3. 新 UI 合同进入 PR 门禁

subagent 发现新增测试虽然可单独运行，但 GitHub Actions 没有调用。现已在 `Selfchecks` workflow 增加 `Mini program UI contract checks`，运行身份抽屉和 custom tabBar 两组测试。

证据：`.github/workflows/selfcheck.yml`。

## 路线图 P1

### 1. match claim 预筛仍有 500 条扫描上限

`formalMatching.js` 与手动 `handlers/match.js` 都以 500 条上限加载 claimed 文档；随着每次交付写入 user/pair/history 多个 marker，未分页扫描会漏掉部分历史，造成无效候选重排或降低本轮匹配率。

本轮已用事务内固定 history marker 阻止它演变成重复交付，但还应：

1. 将“当前 cycle 用户占用”与“指定 pair 历史”改为按文档 ID/索引点查，不再全表扫描。
2. 为管理查询保留分页游标，并记录扫描/过滤数量。
3. 建立 `match_claim` 的索引清单和远端一致性检查，至少覆盖 `status + match_cycle_id`；pair/user 的核心互斥继续依赖稳定文档 ID。

证据：`miniprogram/cloudfunctions/api/lib/formalMatching.js` 的 user/claim 500 limit，`miniprogram/cloudfunctions/api/handlers/match.js` 的 claim 500 limit；`collectionBootstrapPolicy.js` 只声明可创建 collection，没有索引合同。

### 2. Express 与 Cloud Function 双后端仍有行为漂移

小程序正式路径已经指向 Cloud API；Express `server/src/routes/match.js` 仍保留 dev-only `/match/start`，支持 `allow_rematch`、`reset_user_batch` 和删除本地 match log，与 Cloud 的“不删除历史、QA run 边界”不是同一合同。虽然 production guard 默认阻止该路由，这仍会让本地验收与云端行为产生错觉。

建议把 Cloud matching policy 抽成单一合同包供两端引用，或者明确退役 Express match mutation，仅保留 fixture/E2E adapter。短期在文档和测试名称中标注 Express dev-only，不把它当成生产等价实现。

### 3. 运行时与部署版本缺乏强一致证明

CI 使用 Node 20，本地 `cloudbaserc.json` 声明核心函数 Nodejs20.19；现有远端只读审计却记录 `api` 为 Nodejs16.13。静态后台虽能访问，但页面没有展示 Git SHA/构建时间，无法仅从 UI 判断代码是否与当前分支一致。

建议发布时生成不可变 `release_manifest`（Git SHA、函数版本、schema contract、前端构建 SHA），并增加只读 `/api/version` 与后台页脚展示；部署门禁比较 Cloud runtime、manifest 和目标 commit，不匹配则停止发布。

## 路线图 P2

### 1. 小程序 tab 同步存在三处重复

三个 tab 页面各自写了 `getTabBar()/syncForRoute()`。当前只有三处，风险可控；后续可提取 `syncCurrentTab(page, route)`，避免新增 tab 时漏改页面。不要把业务状态搬进 custom tabBar。

### 2. 注册页状态可进一步组件化

身份搜索/选择已经抽成纯函数，但抽屉 WXML/WXSS 仍位于注册页。若个人资料编辑页或匹配设置页未来复用多身份选择，再抽成 component；当前只有一个消费者，不必立即增加组件层级。

### 3. 训练与评估需要清晰命名

仓库现有 `datasets`、ranking/eval、自检和 AI Match Profile 更接近离线评估、规则/权重校准与运行时画像；没有发现会更新模型参数、产出模型 artifact、登记数据版本/训练 job 的正式训练流水线。

后续若开展“RAG 特调”，建议把状态拆成：数据版本、chunk 版本、embedding provider/model、索引构建版本、检索评估集、线上开关、回滚版本。没有这些证据时，产品和运维界面应写“语义检索未启用/降级”，不要写“训练完成”。

## LangGraph 与 RAG 实际执行真相

```text
Agent 请求
  -> LANGGRAPH_ENABLED=false（默认）: 现有确定性 Agent 路径
  -> LANGGRAPH_ENABLED=true: HMAC actor/thread -> agent-graph
       -> shadow mode: 不执行 graph 请求的工具
       -> timeout/坏响应/不可用: 稳定回退

正式匹配
  -> 确定性硬门槛与双向基础排序
  -> AI Match Profile 双向 fit（资料存在时）
  -> MATCH_EMBEDDING_PROVIDER=none（默认）: semantic_retrieval_unavailable
       -> 保留确定性/双向 profile 分数并标记 degraded
  -> 配置真实 provider: 双向 evidence chunk retrieval -> 受 evidence key 限制的 rerank
```

证据：

- `miniprogram/cloudfunctions/api/agent/langgraphClient.js`
- `miniprogram/cloudfunctions/api/agent/AGENT.md`
- `miniprogram/cloudfunctions/api/lib/semanticMatchService.js`
- `miniprogram/cloudfunctions/api/lib/matchSemanticRetrieval.js`
- `miniprogram/cloudfunctions/api/lib/embeddingProvider.js`
- `server/selfcheck/controlled-date-langgraph-e2e.js`（live graph smoke 为人工项）
- `server/selfcheck/match-semantic-retrieval.js`（stub/selfcheck，不等于线上真实 provider）

## 优先顺序

1. 下一迭代优先消除 claim 全表 500 扫描，并补远端索引/容量特征测试。
2. 发布工程补 runtime + Git SHA manifest，解决“本地已改、线上到底是哪版”的长期问题。
3. 决定 Express matching 的去留，减少双后端语义漂移。
4. 真实启用 RAG 或 LangGraph 前，分别做带开关、provider/model/version 的云端 smoke；不要用 stub 或确定性 E2E 代替。
