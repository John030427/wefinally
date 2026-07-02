# 匹配实验对比：算法+AI报告 vs AI加权

## 结论先行

| 方案 | 分支 | 匹配决策 | AI用途 | 默认成本 | 适合阶段 |
| --- | --- | --- | --- | --- | --- |
| 算法 + AI报告 | `feature/match-algo-ai-report` | 可解释算法决定 | 只生成双方报告 | 0，开启后约 1 次 LLM / 成功匹配 | 当前优先 |
| AI加权 | `feature/match-ai-weighted` | 算法 Top K 后 AI 重排 | 参与最终排序 + 报告 | 0，开启后约 1 次 rerank / 用户批次 + 1 次 report / 成功匹配 | 给霞姐评估 |

## 方案 A：算法 + AI报告

- 算法字段：年龄、身高、学历、圈层、城市、婚育节奏、三观文本、轻量关系偏好。
- AI 不参与排序，只读取脱敏资料和分数拆解，生成 A/B 两份报告。
- 默认关闭：`LLM_MATCH_REPORT_ENABLED=false`。
- 成本口径：关闭时 0；开启后每成功匹配调用一次 DeepSeek，返回双方报告。
- 风险：低。匹配逻辑可解释，AI 失败不影响匹配。

## 方案 B：AI加权

- 先按方案 A 算出候选并排序。
- 开启 `AI_MATCH_WEIGHT_ENABLED=true` 后，对 Top K 候选调用 DeepSeek 生成 `ai_score`。
- 最终分：`final_score = algorithm_score * 0.7 + ai_score * 0.3`。
- 默认 Top K：`AI_RERANK_TOP_K=5`。
- AI 失败、超时、返回非 JSON 时自动回退方案 A。
- 风险：中。排序受模型稳定性影响，需要更明确的用户授权和预算控制。

## 成本展示口径

| 项目 | 方案 A | 方案 B |
| --- | --- | --- |
| 默认关闭 | 0 | 0 |
| 报告调用 | 1 次 / 成功匹配 | 1 次 / 成功匹配 |
| 重排调用 | 0 | 最多 1 次 / 当前用户候选 Top K |
| token 统计 | 读取 DeepSeek `usage` | 读取 DeepSeek `usage` |
| 估算方式 | 按控制台单价 × 实际 input/output tokens | 同左 |

## 当前验收

- `npm run selfcheck` 已覆盖默认关闭回退。
- `match-psych-report.js` 验证心理维度分数、综合分、报告关闭状态。
- `ai-weighted-default-off.js` 验证 AI 加权默认关闭时不改变算法排序。

## 给霞姐看的建议

先上线方案 A：稳定、成本低、解释清楚。方案 B 可以作为内部 A/B 演示，用少量测试用户打开开关看匹配排序是否明显更符合人工判断，再决定是否投入预算和隐私授权流程。
