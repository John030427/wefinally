# Cursor Implementation Plan

> Cursor 必须按顺序执行。每个批次先写失败测试，再实现，再审查 diff，只提交本批文件。生产部署、生产数据写入和小程序上传不在本计划的自动执行权限内。

## 0. 保护现场并复现

- [ ] 0.1 进入唯一工作目录并阅读项目规则
  - `Set-Location 'D:\wefinal\.worktrees\wefinally-ai-agent'`，打印当前位置。
  - 完整阅读根目录 `AGENTS.md`、`PROJECT_HANDOFF.md`、`CONTRIBUTING.md`、交接文档、`plan.md`、本规格三份文档。
  - 运行 `git status --short --branch`；记录并保护所有已有/并发改动。
  - _Requirements: 全部_

- [ ] 0.2 按交接运行六组基线 selfcheck
  - 严格记录真实通过/失败，不为变绿而回滚用户改动。
  - 定点确认：当前公开邀请码是否多用、注册是否只归因、首页测试按钮状态、CloudBase 是否缺少匹配 worker。
  - _Requirements: R1, R3, R4_

## 1. 公开邀请码语义与身份展示

- [ ] 1.1 先补失败测试
  - 覆盖多人使用同一公开邀请码、同用户首次归因不可覆盖、无效码拒绝、邀请码不创建合伙人权限。
  - 覆盖合伙人姓名缺失时显示“合伙人”，运行时不得默认 Grace。
  - 覆盖 UI 文案“公开邀请码（可多人使用）”“用于确认邀请来源，不会自动成为合伙人”。
  - _Requirements: R1, R2_

- [ ] 1.2 最小实现
  - 复用现有 `promote_code` 与签名 attribution token，不创建一次性消费字段。
  - 保留分享和复制按钮，修正文案与注册说明。
  - 确认后端角色授权只来自 roster activation/session；若发现公开码提权路径立即修复并加安全测试。
  - 移除运行时 Grace 默认值；不要修改 fixture 名称来伪造测试通过。
  - _Requirements: R1, R2_

- [ ] 1.3 Review 与提交
  - 检查 role escalation、归因幂等、签名 token/公开码边界、敏感信息泄漏。
  - 运行邀请、注册、合伙人 UI/权限相关 selfcheck。
  - 只提交本批文件，commit 建议：`fix(partner): clarify reusable referral codes`。
  - _Requirements: R1, R2_

## 2. 测试身份规范化与后台标记

- [ ] 2.1 先补失败测试
  - 覆盖 `real_user/production`、`real_user/internal_qa`、`synthetic_fixture/matching` 三类投影。
  - 覆盖 legacy `is_test_fixture`/owner 字段兼容。
  - 覆盖默认列表排除 synthetic、管理员显式筛选、fixture owner/expiry/date 禁用。
  - _Requirements: R5_

- [ ] 2.2 实现共享策略
  - 新增集中式 test identity policy，禁止页面、后台和 Agent 各自发明判断。
  - 扩展 user projection 和后台徽标/筛选。
  - synthetic fixture 固定 `allow_date_coordination=false`；正式用户匹配排除全部 synthetic。
  - QA 测试候选只允许 owner 相同且未过期。
  - _Requirements: R5_

- [ ] 2.3 只生成 dry-run 补标方案
  - 对本地/fixture 数据生成待补标 ID、依据、冲突和数量。
  - 不直接修改生产 CloudBase；生产补标留到明确授权后的 MCP 操作。
  - _Requirements: R5_

- [ ] 2.4 Review 与提交
  - 检查真人不会被误标 synthetic，测试数据不会进入生产候选/客服/支付/佣金。
  - 运行 admin identity、match fixture safety、admin customer context 相关 selfcheck。
  - commit 建议：`feat(testing): distinguish qa accounts from synthetic profiles`。
  - _Requirements: R5_

## 3. 正式 CloudBase 匹配 worker 与批次状态

- [ ] 3.1 先补失败测试
  - business clock：Asia/Shanghai 周三/周五、UTC 跨日。
  - batch key：重复/并发 timer 只执行一次。
  - 结果：matched、completed_no_match、blocked、failed。
  - 错误重试上限和脱敏日志。
  - _Requirements: R3_

- [ ] 3.2 抽取共享匹配运行服务
  - 不复制现有硬筛、评分、语义重排和 claim 逻辑。
  - 将正式 run 的生命周期写入 `match_batch_runs`。
  - `completed_no_match` 作为正常完成结果。
  - _Requirements: R3_

- [ ] 3.3 新建 `match-worker`
  - 先查 CloudBase 官方 timer 文档，验证 cron 与时区，记录来源和测试证据。
  - timer handler 只负责业务日期门禁、幂等批次创建和调用共享服务。
  - 不在本地阶段部署。
  - _Requirements: R3_

- [ ] 3.4 Review 与提交
  - 审查时区、重复触发、租约/锁、零结果、错误分类、隐私日志和正式 claim 原子性。
  - 运行新增 worker 自检、match claim 并发、scheduler 相关 selfcheck。
  - commit 建议：`feat(match): add idempotent CloudBase schedule worker`。
  - _Requirements: R3_

## 4. 10 秒内部测试运行

- [ ] 4.1 先补失败测试
  - 后端拒绝非 QA，即使全局开关开启。
  - create/execute/get API 幂等，测试运行不写正式 claim。
  - UI 倒计时与 matched/no_match/blocked/failed 状态恢复。
  - _Requirements: R4, R5_

- [ ] 4.2 实现隔离 test run API
  - 使用 `match_batch_runs` 的 `mode=internal_test` 或独立受控投影。
  - 只匹配 requester 自己的未过期 synthetic fixture。
  - 同一 request ID 返回原运行，不重复生成结果。
  - 禁止 `reset_user_batch` 删除正式数据；禁止正式 route 中的危险测试参数向客户端开放。
  - _Requirements: R4, R5_

- [ ] 4.3 实现首页状态条
  - 复用现有 `dev-match-row`，改为“10 秒测试匹配”。
  - 倒计时期间禁止重复点击；离开页面后可恢复。
  - 结果持久显示，成功可进入测试详情，无结果/拦截/失败显示原因和下一步。
  - 非 QA 不渲染。
  - _Requirements: R4_

- [ ] 4.4 Review 与提交
  - 审查前后端双重权限、request ID、正式 claim 隔离、页面生命周期和错误文案。
  - 运行小程序首页、real-device 模拟、测试运行并发相关 selfcheck。
  - commit 建议：`feat(match): add isolated ten-second QA run`。
  - _Requirements: R4, R5_

## 5. 合成画像延迟拒绝

- [ ] 5.1 先补失败测试
  - 真人→真人不创建 job。
  - QA 真人→自己的 synthetic fixture 创建 2—6 小时 job。
  - 非 owner、过期 fixture、普通用户、synthetic actor 全部拒绝。
  - 同 interaction 幂等；并发只能一条；延迟确定性。
  - _Requirements: R6_

- [ ] 5.2 实现任务策略与存储
  - 新增 `fixture_response_jobs` 和唯一 interaction ID。
  - 用稳定哈希/HMAC 映射 2—6 小时，不让模型随机决定。
  - 任务事件明确 `source_type=fixture_simulation`。
  - _Requirements: R6_

- [ ] 5.3 实现 worker
  - lease/compare-and-set 领取到期任务，最多一次有效投递。
  - 只写测试事件，不发真实通知、不建人工工单、不进入线下协调。
  - 失败保持 failed 可观测，不回退为真人流程。
  - _Requirements: R6_

- [ ] 5.4 Review 与提交
  - 审查真人流程零影响、身份边界、幂等、延迟范围、文案来源和隐私。
  - 运行 Agent、date coordination、notification job 和新增 fixture response selfcheck。
  - commit 建议：`feat(testing): schedule synthetic-profile decline responses`。
  - _Requirements: R6_

## 6. 数据迁移工具、文档与最终 Review

- [ ] 6.1 增加 migration planner（仅本地 dry-run）
  - 输出规范字段补标计划；不按姓名猜测、不自动写生产。
  - 覆盖只升不降/不覆盖已明确来源/重复运行为空计划。
  - commit 建议：`chore(testing): add profile provenance migration plan`。
  - _Requirements: R5_

- [ ] 6.2 全量相称验证
  - 重跑交接六组 selfcheck。
  - 运行邀请、注册、partner、match、agent、admin、mini program 专项测试。
  - 检查 `git diff --check`、最终 diff、未提交用户改动清单。
  - _Requirements: 全部_

- [ ] 6.3 CloudBase 专项代码审查
  - 按 `cloudbase-code-review` 检查 NoSQL 写入结果、权限、全局写入路径、SDK/API 使用、worker 配置。
  - 安全 Review：公开邀请码不能提权；测试 route 不能被正式用户调用；synthetic 不能进入正式候选；真人不能被自动拒绝。
  - _Requirements: 全部_

- [ ] 6.4 停止并报告外部动作
  - 报告本地 commit hash、测试、未解决项和生产变更清单。
  - 等待用户分别确认：正确姓名、QA 用户 ID、CloudBase 新集合/索引、生产数据补标、worker/API 部署、小程序上传。
  - 未确认前不得部署或写生产。
  - _Requirements: 全部_
