# WeFinally 双边 AI 约会协调工作报告

日期：2026-08-15
分支：`feature/partner-gated-aigc-plan`
CloudBase 环境：`cloud1-d4gy8l52g08bba326`（上海，NoSQL）

## 1. 本轮完成结果

- 正式匹配池改为失败关闭：synthetic、fixture、internal QA、未知来源和显式隐藏画像均不能进入正式匹配。
- 删除正式小程序“10 秒测试匹配”和注册重置入口；服务端 QA 能力继续受权限保护。
- 新注册用户在注册闭环内获得稳定 `WF-xxxxxx` 客服编号；客服页顶部可查看和复制编号。
- 双方约会申请收齐后只进入持久化队列，不在用户请求内同步计算方案。
- worker 使用版本号与 lease token 领取和完成任务；并发、重试和旧版本回写均受保护。
- A/B 分别使用独立约会协调会话；事件只投递共同进度与安全摘要，不公开对方原始表单、聊天、联系方式或修改原话。
- 支持最多 5 轮：AI 修改预览确认后生成新版本，旧 proposal/confirmation 失效并重新入队；拒绝当前方案进入下一轮，第 5 轮后转人工。
- 同一 active 方案、同一版本的双方确认通过 CloudBase 事务原子进入 `arranged`；不同方案不能拼成约会成功。
- 协调页展示第 N/5 轮、方案版本、待处理/处理中/失败/待确认/已完成/转人工，并在处理期间每 6 秒无闪屏刷新。
- 处理失败可由参与者重新入队；方案卡支持“确认”或“这个方案不合适，继续协调”。
- 约会偏好表单改为每人仅首次填写：发起方提交后不再重复显示；后续重协调沿用原表单并进入 AI 协调员，通过局部修改预览继续沟通。

## 2. 交付提交

| 批次 | Commit | 内容 |
| --- | --- | --- |
| 0 | `fff5b8b` | 异步协调 characterization RED 测试 |
| 1 | `28e9fa9` | 正式候选池失败关闭 |
| 2 | `881c5f1` | 删除正式客户端测试入口 |
| 3 | `573f6f9` | 注册返回稳定客服编号 |
| 4 | `d18fc90` | 客服页展示并复制用户编号 |
| 5 | `fbf779d` | 五轮与处理状态纯策略 |
| 6 | `1801940` | CloudBase 队列、lease 与 CAS worker |
| 7 | `032d239` | 双边私密协调事件与主动反馈 |
| 8 | `5ca79b1` | 多版本修改、拒绝与事务双确认闭环 |
| 9 | `790f7a1` | 真实协调生命周期 UI、轮询与失败重试 |
| 10 | `d42729d`、`b495d9e`、`0c8059e` | 一次性表单与拒绝分支回归测试 |
| 11 | `6bc7f78` | 隐藏重复表单并将后续调整交给 AI 协调员 |

规格提交：`2e49fd3`、`fdc8b90`、`3e54127`、`9ad1663`。

## 3. 最终验证

2026-08-15 在工作树内重新运行并全部通过：

- `npm --prefix server run selfcheck:agent`
- `npm --prefix server run selfcheck:safety`
- `npm --prefix server run selfcheck:ai-report`
- `npm --prefix server run selfcheck:cloudpay`
- `npm --prefix server run selfcheck:member`
- `npm --prefix server run selfcheck:cloud-match`
- 小程序 JavaScript 语法：39 个文件通过。
- `git diff --check`：通过；仅存在 Windows 换行提示。
- 一次性表单专项 RED→GREEN：发起方提交后隐藏表单；`replanning` 禁止整表重提；拒绝方案后进入 AI 协调员。

专项场景已覆盖：直接一轮成功、一次修改后成功、双方修改后成功、拒绝旧方案后成功、第五轮转人工、不同方案不 arranged、并发 worker 单次完成、旧 worker 不覆盖新版本、事件不泄露原始申请。

## 4. CloudBase 发布状态

通过 CloudBase MCP 完成并复核：

- 已于 2026-08-15 通过 CloudBase MCP 再次更新 `api`；函数更新时间为 `2026-08-15 13:58:51`，状态为 Active/Available。
- 线上代码已核验包含 `processCoordinationTasks` 与 `coordinationTasks`，`ping` 实际调用成功。
- `report-worker` 为 Active/Available，每分钟触发一次；受控调用已成功贯通 `report-worker -> api -> coordinationTasks`，无函数错误。
- `MATCH_TEST_RUN_PUBLIC_ENABLED=false`；原有关键环境变量仍保留。
- `cloud_demo_match_enabled=false`、`cloud_demo_vip_grant_enabled=false`。
- 20 个 `wf_public_match_pool_20260814_v1` synthetic 画像已补 `formal_match_hidden=1`，并保持 `allow_date_coordination=0`；没有删除数据。
- 已创建并复核索引：
  - `date_coordinations.coordination_processing_queue`
  - `date_coordination_events.coordination_event_idempotency`（唯一）
  - `agent_messages.coordination_event_message`
  - `agent_sessions.coordination_user_session`

## 5. Review 结论

- 权限：协调读写、重试和确认均校验当前用户是 A/B 参与者。
- 隐私：客户端只返回本人申请、共同 proposal 和双方布尔进度；事件投影不保存另一方原始输入。
- 幂等：worker 使用版本 + lease token；事件有幂等键；确认记录使用确定文档 ID；双方 arranged 在事务中完成。
- 超时：worker 2 分钟 lease，最多 3 次自动尝试；失败后显式由用户重试或转人工。
- 索引：正式队列与事件/会话查询所需索引已在目标环境收敛。
- UI：已完成静态契约、语法和状态测试；未把 loading 文案当成模型已生成结果。

未纳入本轮修改但应在正式审核前单独复核：后台 CORS 当前为宽泛配置；支付处于 production stage。两者未被本轮代码改动。

## 6. 尚未完成与发布门禁

- 尚未上传微信小程序体验版或正式版。
- 尚未用两个独立真实微信账号完成：一轮成功、修改后成功、拒绝方案后成功、明确拒绝邀请四条真机链路。
- 尚未验证体验版页面的真实机型尺寸、前后台切换和弱网恢复。
- 未提交微信正式审核，也未修改支付生产数据。

## 7. 回滚

- 部署前的 `api` 代码下载地址已通过 CloudBase MCP 留存；若线上回归失败，通过 CloudBase MCP 重新部署该部署前代码包。
- 新索引均为附加索引；回滚代码时可保留，不影响旧逻辑。只有确认索引本身导致异常时才单独删除。
- faker 隐藏标记与测试开关属于正式发布安全配置，代码回滚时默认保持关闭；恢复测试能力必须重新获得明确授权。
- 不通过 reset/clean/restore 回滚本地工作树；使用新的反向提交或重新部署已审核 commit。
