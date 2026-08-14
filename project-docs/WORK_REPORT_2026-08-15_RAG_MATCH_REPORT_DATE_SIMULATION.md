# 工作报告：RAG 匹配、可信报告 UI 与约会测试闭环

- **日期**：2026-08-15
- **工作树**：`D:\wefinal\.worktrees\wefinally-ai-agent`
- **分支**：`feature/partner-gated-aigc-plan`
- **计划起点**：`0368fc7`（`docs(plan): define RAG matching and date simulation`）
- **终点提交**：见下方（本报告独立提交后更新）
- **需求真源**：根目录 `plan.md`
- **未做**：真实 embedding provider、CloudBase 集合创建、生产回填、部署、小程序上传、开发者工具截图

---

## 1. 目标与范围

本阶段完成：

1. 缺失字段不再默认正分；契合度与完整度分离（`algo_evidence_v3`）。
2. Evidence chunk + embedding provider adapter（stub/none）。
3. 双向语义检索（hybrid：stub cosine + 同义扩展 lexical）。
4. 受约束 Prompt 精排接入检索 evidence key；版本化最终分（未校准）。
5. 报告在无心理证据时降语气。
6. 匹配详情 editorial 层级与底部 sticky CTA。
7. QA→自有 fixture：完整表单后再调度模拟婉拒。

明确未做：真实向量服务密钥、生产 chunk/embedding 回填、微信开发者工具真实机截图验证。

---

## 2. 批次 Commit 与文件

| Batch | Hash | Message |
|------|------|---------|
| 0 | `79545e3` | `test(match): characterize default scores and jaccard gaps` |
| 1 | `bf18438` | `feat(match): treat missing fields as unknown not default fit` |
| 2 | `e858566` | `feat(match): add evidence chunks and embedding provider adapter` |
| 3 | `3ae0047` | `feat(match): add bidirectional semantic evidence retrieval` |
| 4 | `0343227` | `feat(match): blend retrieval into constrained prompt final score` |
| 5 | `427d465` | `feat(report): soften claims when psych evidence is missing` |
| 6 | `ba19ef9` | `feat(match-ui): editorial detail hierarchy and sticky date CTA` |
| 7 | `d9be41c` | `feat(testing): require fixture form before simulated decline` |
| 8 | `6148e03` | `chore(match): add RAG migration dry-run and observability projection` |
| 9 | （本报告 + agent-ui 文案断言） | `docs(match): add RAG match report and date simulation work report` |

主要新增：

- `matchEvidenceChunks.js` / `embeddingProvider.js` / `matchSemanticRetrieval.js`
- `matchFinalScore.js` / `matchRagMigrationPlan.js`
- selfcheck：`match-score-truthfulness` / `match-evidence-embedding` / `match-semantic-retrieval` / `match-jaccard-synonym-gap` / `match-final-score` / `match-report-trust` / `match-rag-migration-plan`

---

## 3. RAG 实际架构

```text
硬条件过滤
 → buildEvidenceChunks（脱敏 + content_hash）
 → embeddingProvider（默认 stub；none → semantic_retrieval_unavailable）
 → retrieveBidirectional（A→B / B→A 分别检索，Top-K=3）
 → semanticRerank（只重排；evidence_key 白名单）
 → computeFinalMatchScore（structured 0.55 + retrieval 0.25 + prompt 0.2）
```

- **Provider**：`MATCH_EMBEDDING_PROVIDER=stub|none|<pending>`；未配置真实厂商。
- **Chunk schema**：`evidence_chunk_v1`（categories 见 plan §7.2）。
- **检索**：函数内 cosine + 同义扩展 lexical hybrid；候选池上限 50；Top-K 3。
- **失败模式**：`none` → `semantic_retrieval_unavailable`；非法 evidence_key / 未知 candidate_ref 拒绝。
- **权重未校准**：`final_score_v1.calibrated=false`。

---

## 4. 评分变化前后

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| 空婚育/年龄/身高/学历/圈层偏好 | 默认正分（10/5/3/2/满圈层） | `null` / `not_compared`，不计契合 |
| 空圈层偏好 UI | 满格进度条 | `资料不足`，percent=0 |
| 归一化分 | total/maxTotal | 仅对已比较维度归一化 + 单独 `completeness` |
| Jaccard 质量门 | 可直接淘汰 | 仅 diagnostic，不进 `quality.reasons` |
| Schema | `algo_evidence_v2` | 新写 `algo_evidence_v3`（旧 log 仍可读） |

---

## 5. 固定案例（前后）

1. **高契合**：scenario `high_fit` → pass，normalized ≈97–99。
2. **不对称**：异侧三观/城市 → A→B 与 B→A retrieval score/evidence 可不同。
3. **同义表达**：Jaccard≈36；retrieval mutual ≥60（踏实/稳重、担当/责任心）。
4. **明确冲突**：丁克 vs 要孩子 → `marriage_and_baby_conflict`。
5. **资料不足**：空偏好 → completeness 低；UI 不画伪满格。

---

## 6. UI

- 规格：plan §8（暖白 `#FFF9F7`、品牌 `#FF6B8A`、正文 `#2B2729`）。
- 结构：结论摘要 → 报告 → 可折叠算法 → sticky「申请约会」/「发起测试约会申请」。
- **缺口**：未使用微信开发者工具做真实尺寸截图；仅代码与 selfcheck 验证。标记：`ui_device_screenshot=pending_tooling`。

---

## 7. 真人约会 vs Fixture 模拟

| | 真人 | Fixture 模拟 |
|--|------|----------------|
| 入口 | 「申请约会」 | 「发起测试约会申请」+ 测试徽章 |
| create | 真实 `date_coordination` | `await_application`，不写真实协调 |
| 提交 | 正常 application | `POST .../fixture-applications` → `fixture_response_job` |
| 结果 | 双方确认 / arranged | 2–6h 后 `fixture_simulation` 婉拒 |
| 副作用 | 正常业务 | 无短信/订阅/工单/arranged/支付/claim |

---

## 8. 模拟拒绝证据

- 延迟：HMAC(`interaction_id:fixture_run_id`) → 2–6h，确定性。
- 幂等键：`interaction_id=match:{matchLogId}`。
- 事件：`source_type=fixture_simulation`，`notify_sms/subscribe/create_human_ticket=false`。
- selfcheck：`fixture-response-job.js`、`match-only-fixture-safety.js`。

---

## 9. 集合 / 环境 / Flag（pending）

见 `matchRagMigrationPlan.planMatchRagInfrastructure()`：

- `user_evidence_chunks` / `user_evidence_embeddings` → **pending_user_confirmation**
- `MATCH_EMBEDDING_PROVIDER` 默认 stub
- 回填 job 仅 dry-run

---

## 10. 测试

2026-08-15 本地：

```text
PASS selfcheck:safety
PASS selfcheck:ai-report
PASS selfcheck:cloudpay
PASS selfcheck:member
PASS selfcheck:cloud-match
PASS selfcheck:agent
```

---

## 11. Review 结论（plan §13）

1. RAG：有 stub embedding + evidence retrieval；非仅改 Prompt。真实 provider 未接。
2. 硬条件仍由确定性代码；LLM 不可增候选。
3. A→B / B→A 分别检索评分。
4. 缺失字段不再默认契合。
5. 满格来自无证据的情况已去掉。
6. final/canonical 同源 `computeFinalMatchScore`。
7. 无心理证据时降语气；判断需 evidence_key。
8. chunk 经 `sanitizeSupplement`；禁手机号/openid 等。
9. fixture 不触发真实约会副作用。
10. 真人无自动拒绝。
11. 婉拒由后端 job 决定，非 LLM。
12. interaction 幂等。
13. UI 缺真实尺寸截图。
14. 用户 dirty 文件未纳入提交。

CloudBase：本阶段无新部署；NoSQL 写入仍走云函数；新集合仅 dry-run。

---

## 12. 风险与待确认

1. 真实 embedding provider / API key  
2. CloudBase 集合与索引创建  
3. 历史 chunk/embedding 回填  
4. 部署 `api` / worker；小程序上传  
5. 微信开发者工具视觉验收  
6. 最终分权重真实约会校准  

---

## 13. 未提交用户改动（未碰）

```text
M  server/public/partner/index.html
M  server/selfcheck/cloudbase-partner-connection.js
M  server/selfcheck/customer-service-browser-fixture.js
?? project-docs/WORK_REPORT_2026-08-14_INVITATION_MATCH_TESTING.md
?? server/selfcheck/customer-service-browser-host.js
?? specs/2026-08-12-partner-gated-launch/
```
