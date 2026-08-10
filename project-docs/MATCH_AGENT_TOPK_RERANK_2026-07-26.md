# 确定性匹配 + 脱敏 Top-K Agent 重排设计（2026-07-26）

## 结论

采用“确定性硬筛与双向评分为主、Agent 只做脱敏 Top-K 相对重排”的混合架构。
Agent 不是数据库用户、没有数据库工具、不能决定硬条件或质量门槛，也不能直接落库。

本阶段只实现离线策略与安全契约：

```text
miniprogram/cloudfunctions/api/lib/matchAgentRerankPolicy.js
server/selfcheck/match-agent-rerank-policy.js
```

不调用真实模型，不创建云端记录，不接生产匹配链路。

## 数据流

```text
数据库白名单读取服务
→ 年龄等确定性硬条件筛选
→ algo_evidence_v2 双向评分
→ 确定性质量门槛
→ 仅取通过门槛的 Top-K
→ 转换成无用户 ID 的临时 candidate_ref
→ 无状态模型重排
→ 后端校验版本、引用、数量、名次、证据码、风险码和置信度
→ 再次执行硬条件、黑名单、重复匹配和质量门槛
→ 白名单业务服务审计落库
```

## 发给模型的白名单 schema

请求版本为 `match_agent_rerank_v1`，每个候选只包含：

- `candidate_ref`：单次请求内临时引用，如 `candidate_1`；
- `algorithm_rank`；
- `mutual_score_percent`、`side_a_percent`、`side_b_percent`；
- `view_similarity`；
- `quality_gate_pass=true`；
- 双方各维度的 0–100 百分比；
- `missing_dimensions`。

不得包含：

- 内部用户 ID、OpenID、手机号、联系方式；
- 精确地址、单位、收入原文、自由文本身份信息；
- API Key、密钥、私钥、管理员 token；
- 数据库连接或写入工具；
- 供应商 `conversation_id`。

内部用户 ID 与 `candidate_ref` 的映射保存在不可序列化的后端内存映射中，不进入
JSON 请求。离线 `evaluationId` 同样只作为后端不可序列化元数据留存，不发送给模型，
避免调用方误将内部业务标识或用户 ID 带入模型请求。

## 模型输出与后端校验

模型只能返回：

- 已知 `candidate_ref`；
- 唯一且连续的相对名次；
- 0–1 置信度；
- 白名单 `evidence_codes`；
- 白名单 `risk_codes`。

未知引用、重复引用、候选缺失、重复名次、越界置信度或任意自造代码都会被拒绝。
校验函数只返回内存中的重排结果，不包含数据库写入。

## 离线 A/B 评估

- A 组：纯确定性算法顺序；
- B 组：同一批硬筛与质量门槛后的 Top-K，经 Agent 重排；
- 第一批固定夹具：`high_fit`、`medium_fit`、`edge_pass`、`hard_reject`、
  `missing_data`；
- 指标：双方接受率、有效沟通率、见面率、拒绝原因、人工复核一致率、稳定性、
  单次成本和 P95 延迟；
- 上线门槛：安全契约 100% 通过，硬条件淘汰不可被恢复，B 组关键业务指标有明确
  提升，成本与延迟在预算内。

## 部署边界

- 更新 `miniprogram/cloudfunctions/api` 是 `api` 云函数部署；
- 更新 `miniprogram/pages` 或 `miniprogram/utils` 是小程序客户端代码，必须经微信
  开发者工具或 `miniprogram-ci` 单独预览/上传；
- 两者不是同一部署动作。没有完成客户端编译、真机/体验版验证前，不把云函数部署
  视为客户端已发布。
