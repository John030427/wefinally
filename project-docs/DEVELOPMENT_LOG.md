# 开发变更日志

> 记录每一次分析、修改、决策和变更，方便后续交接。

---

## 2026-08-20 — Local Multi-User AI E2E Lab

### 类型
本地多用户 E2E 实验室 + 资料编辑/AI 指纹修复 + 回归自检

### 完成
- 新增 `server/e2e/wefinally/`：memoryDb、serviceFactory、18 personas、14 scenarios、artifact reporter
- npm：`e2e:wefinally`、`e2e:wefinally:live`、`selfcheck:e2e-release-guard`
- 产品：profile 页「个人资料」入口；register 编辑 income；`updateProfile` 标记 AI profile stale；扩展 `MEANINGFUL_SOURCE_KEYS`
- 回归：`agent.createSession` 允许 initiator 在 `collecting_initiator` 开协调员会话（UI 策略不变）
- 文档：`.cursor/skills/wefinally-e2e/SKILL.md`、`WORK_REPORT_LOCAL_MULTI_USER_AI_E2E_LAB.md`

### 验证
- `e2e:wefinally` 14/14 PASS；`selfcheck:agent` + baseline selfchecks PASS
- Live hy3 smoke：无 CloudBase 凭据时 BLOCKED（不崩溃）

---

## 2026-08-19 — Date Invitation Prelaunch Final

### 类型
上线前最后一轮后端收尾 + 测试 + CloudBase api 部署 + 文档

### 目的
1. CloudBase transaction 内写 EXPIRED 再 throw 会 rollback，导致客户端 INVITATION_EXPIRED 但库仍 INVITING_PARTNER
2. A 在等待 B 时用 AI 改 Preference，旧 Primary 失效后不能无声错位或只报 PRIMARY_PROPOSAL_REQUIRED

### 完成
- Transaction：deadline 后 `persistExpiredInvitationRecord` 并 **return expired**，handler 在 commit 之后 throw
- 已 EXPIRED 重试仍返回 INVITATION_EXPIRED，不是 ALREADY_RESPONDED
- Preference 变更后逐维同步 Primary；唯一值自动推导；多选 `pending_primary_selection` + Chat 选择卡
- `primary_selection` 后端校验；未完成 resolution 不 apply patch
- Contract v6：`expired_transaction_commit` / `primary_proposal_resolution`
- TEST 61–75；TEST 25–60 无回归
- 报告：`project-docs/WORK_REPORT_DATE_INVITATION_PRELAUNCH_FINAL.md`

### 验证
专项 selfcheck PASS；CloudBase `api` 干净 staging code-only 更新后 config v6 PASS；agent-graph 未改未部署，health PASS

### 未做
- Live LangGraph manual smoke
- 微信视觉验收
- Subscribe Template ID
- 体验版上传
- 未 merge main；未 force push

本轮后停止后端架构迭代。

---

## 2026-08-19 — Date Invitation Atomicity Final Fix

### 类型
上线前并发一致性收尾 + 测试 + CloudBase api 部署 + 文档

### 目的
把 INVITING_PARTNER 阶段变成原子状态机：A pre-accept patch 与 B accept/coordinate/decline/expire 争夺同一份 Invitation State，禁止旧异步写把终态撕回 inviting_partner。

### 完成
- Production：`commitPreAcceptInvitationPatch` / `commitInvitationResponse` / 既有 `commitDirectInvitationAccept` 全部走 `db.runTransaction`
- Selfcheck：in-memory CAS + `beforeCommitHook` barrier；TEST 45–60 用真实 handlers 并发
- `primaryFitsPreference` 校验 payment；payment patch 同步 Neutral Primary
- 所有 invitation transaction 内二次校验 deadline
- Contract v5：`invitation_atomic_transitions` / `invitation_response_version_cas` / `pre_accept_patch_cas`
- 报告：`project-docs/WORK_REPORT_DATE_INVITATION_ATOMICITY_FINAL_FIX.md`

### 验证
相关 selfcheck PASS；CloudBase `api` 从干净 staging 目录 code-only 更新后 config v5 PASS；agent-graph 未改未部署，health PASS；Live Graph Smoke MANUAL_REQUIRED

### 未做
- 微信开发者工具视觉验收
- Live LangGraph NL Patch E2E
- 未上传微信体验/正式版；未 merge main；未 force push

---

## 2026-08-19 — Date Coordination Code Review Fix Round

### 类型
上线前 Code Review 修复 + 测试 + CloudBase 部署 + 文档

### 目的
在不推翻「第一次约会邀请 + AI 协调」产品方向的前提下，修掉 Direct Accept 偷偷选第一个、支付视角歧义、invitation_version 宽松默认、并发非 CAS、pre-accept 消耗协商轮次、时间格式与 LangGraph mock/live 混淆等问题。

### 完成
- Preference vs Primary Invitation Proposal；Direct Accept 只接受完整 primary
- 共享方案中性支付 `payment_mode` / `payer_user_id`；Invitation / Proposal Card 展示费用方式
- accept 强制 `invitation_version`；`commitDirectInvitationAccept` CAS + idempotent
- INVITING_PARTNER 下编辑不增加 `recoordination_count`
- 统一日期格式；TEST 25–44；contract version 4
- 报告：`project-docs/WORK_REPORT_DATE_COORDINATION_REVIEW_FIX_ROUND.md`

### 验证
相关 selfcheck PASS；CloudBase `api` 从函数目录 code-only 更新后 config v4 PASS；agent-graph health PASS；Live Graph Smoke MANUAL_REQUIRED

### 未做
- 微信开发者工具视觉验收
- 真实 CloudBase NL Patch live smoke
- 未上传微信体验/正式版；未 merge main；未 force push

---

## 2026-08-19 — 第一次约会邀请 / AI 双边协调产品化

### 类型
产品化改造 + 测试 + CloudBase 部署 + 文档

### 目的
把约会协调从「双方各填一张完整申请表再比对」改成：A 发出第一次约会邀请 + 建议方案；B 可直接接受、和 AI 协调局部差异、或这次暂不方便。事实用卡片，AI 只负责沟通。

### 完成
- Invitation Proposal + `invitation_version`；A 在 INVITING_PARTNER 可 AI patch，状态不变
- B 直接接受当前 invitation version → ARRANGED；stale version 拒绝并刷新
- B「和 AI 协调」进入双边协调，不复制 A 整表为 B 明确填写；支持 partial override evidence
- B「这次暂不方便」→ INVITATION_DECLINED；NO RESPONSE ≠ DECLINE；超时 EXPIRED
- 同一 Date Coordination 页按 ViewModel 渲染 Invitation / Shared / Proposal / Result Card
- Fixture：`accept_direct` / `coordinate` / `decline` / `no_response` / `accept_no_prefs` + AUTO / MANUAL_STEP
- 报告：`project-docs/WORK_REPORT_FIRST_DATE_INVITATION_AI_COORDINATION.md`

### 验证
selfcheck:agent / langgraph / synthetic-coordination / ai-profile-bilateral / cloud-match / member / ai-report / safety PASS  
agent-graph `npm run check` PASS  
CloudBase `api` / `agent-graph` 代码更新后 ping + health PASS

### 未做
- 微信开发者工具视觉验收（pending_manual_visual_verification）
- 未上传微信正式版 / 体验版
- 未 merge main、未 force push
- 无破坏性 database migration

---

## 2026-08-18 — Date Coordination / LangGraph / Fixture / Notification 逻辑审计修复

### 类型
修复 + 测试 + 文档

### 目的
验证并修复邀请态被 pre-accept patch 破坏、LangGraph 重复业务真相、Fixture 旅程冲突、以及通知部署诊断不清的问题。不是重新设计产品。

### 完成
- 统一 `dateCoordinationAccessPolicy`：inviting_partner 仅 initiator 可 AI chat / 改自己的申请；terminal 全写守卫含 ARRANGED
- A 在 INVITING_PARTNER 确认 patch 后 status 仍为 waiting_partner；B 仍可 accept/reject
- LangGraph 只消费 backend `canonicalOverlap` + `ownPreference` + DB `confirmationSnapshot`
- Fixture：`fixture_journey` 进入 normalize；ACCEPT/REJECT 可并存；cleanup 关闭测试 coordination；`manual_step` 可停步
- `/api/common/config` capabilities；通知页识别 CloudBase route missing
- 报告：`project-docs/WORK_REPORT_DATE_COORDINATION_LOGIC_AUDIT_FIX.md`

### 验证
selfcheck:agent / langgraph / synthetic-coordination / ai-profile-bilateral / cloud-match / member / safety / ai-report PASS  
agent-graph `npm run check` PASS

### 未做
- 微信开发者工具视觉验收（pending_manual_visual_verification）
- 未 push / merge / deploy / 上传小程序 / 生产 migration

---

## 2026-08-18 — 真实 UI + LangGraph 约会协调 Fixture 主路径

### 类型
修复 + E2E + 文档

### 目的
测试用户走与生产一致的 Match Detail → 申请约会 → 真实 coordinationId → LangGraph date_coordinator；取消「虚拟体验 / 排队刷新」作为主路径。

### 完成
- `syntheticPartnerJourney`：accept/reject 调用真实 respondInvitation / saveApplication / confirmProposal；区域妥协走真实 patch
- Match Detail / Date Coordination 统一生产 UI；弱「测试数据」badge
- 记录 Tab 未读红点；REJECT inbox 安全文案；declined 禁止 AI session
- 我的 →「AI 对你的理解」入口
- `selfcheck/real-ui-fixture-date-langgraph-e2e.js` PASS
- 报告：`project-docs/WORK_REPORT_REAL_UI_LANGGRAPH_DATE_E2E.md`

### 未做
- 微信开发者工具真机视觉验收（pending_manual_visual_verification）
- 未 push / merge / deploy / 上传小程序

---

## 2026-06-29 — 第一阶段：文档体系搭建

### 类型
分析 + 文档创建（**未修改业务代码**）

### 完成工作
1. 完整读取项目：miniprogram 15 页、server 全路由/服务、cron、database、admin/partner SPA、docs、老板 PRD docx、豆包早期想法 md
2. 建立 `project-docs/` 全套交接文档（AGENT、README_HANDOVER、BOSS_IDEAS_CHECKLIST、REQUIREMENTS、CODE_REVIEW、UI_REVIEW、CONFIG_DESIGN、AI_MATCHING_*、PROJECT_STRUCTURE、DEVELOPMENT_PROGRESS、TODO、GIT_BRANCH_PLAN、QUESTIONS_TO_BOSS、MODULES/*）
3. 用户确认多项产品决策并写入文档

### 用户确认决策（2026-06-29）
- 商业模式以 PRD 为准（188/月 + 官方客服对接奔现）
- 离婚证明支持 image/pdf，后台审核
- 线下见面安全确认 = 官方对接后附加层
- 配置方案：server/src/config + GET /api/common/config
- 算法 v1 够用
- 被匹配对象不要求 VIP
- 双向互配必须做

### Sub-agent 使用记录

| 时间 | Agent | 任务 | 结论摘要 |
|------|-------|------|----------|
| 2026-06-28 | Backend Code Review | 审计 server 全文件 | MVP ~80%；4 Bug；5 安全项；三观为 Jaccard |
| 2026-06-28 | Frontend Code Review | 审计 miniprogram 15 页 | 大部分 COMPLETE；register 身高、index 倒计时、profile 无编辑 |
| 2026-06-28 | Database/Admin Review | init.sql + admin/partner | 12 表齐全；admin 10+ 模块 |
| 2026-06-29 | UI Review Agent | UI 清单与复用图 | 0 组件；app.wxss 设计系统；新功能接入点已标 |
| 2026-06-29 | Config/Hardcode Audit | 配置散落审计 | 12/23 项缺失；双份 constants 漂移风险 |

### Sub-agent 结论冲突
**无重大冲突。** 各 agent 对完成度判断一致（~80% MVP）。

### 新建文件列表
- `project-docs/AGENT.md`
- `project-docs/README_HANDOVER.md`
- `project-docs/BOSS_IDEAS_CHECKLIST.md`
- `project-docs/REQUIREMENTS.md`
- `project-docs/CODE_REVIEW.md`
- `project-docs/UI_REVIEW.md`
- `project-docs/CONFIG_DESIGN.md`
- `project-docs/AI_MATCHING_RESEARCH.md`
- `project-docs/AI_MATCHING_DESIGN.md`
- `project-docs/PROJECT_STRUCTURE.md`
- `project-docs/DEVELOPMENT_LOG.md`（本文件）
- `project-docs/DEVELOPMENT_PROGRESS.md`
- `project-docs/TODO.md`
- `project-docs/GIT_BRANCH_PLAN.md`
- `project-docs/QUESTIONS_TO_BOSS.md`
- `project-docs/MODULES/*.md`（13 个模块文档）

### 未做
- 未修改 miniprogram/、server/、database/ 任何业务代码
- 未执行 npm install / 本地跑通（留待 R0）

---

## 2026-06-29 — 第一阶段补充：文档复核与代码交叉核对

### 类型
分析 + 文档校正（**仍未修改任何业务代码**）

### 修改目的
应要求「复核并补强现有文档」——把 `project-docs/` 全部文档的每条声明拿去和真实源码逐一核对，纠正与代码不符之处，并把最大的方向风险写醒目。

### 核对结论（22 条声明经源码验证为**准确**）
- 商业硬常量与前后端行号引用（`server/src/config/constants.js`、`miniprogram/utils/constants.js:47/48-49/50-51/59-63`、`common.js:63-68`、`util.js:40-58`）全部对得上
- 4 处确定性 Bug 全部复现：提现驳回 `status=1`（admin.js:284）、注销误用 `report_type=1`（user.js:476）、隐私日志 `auth_time` 取错列（admin.js:503）、`like_circle_ids || prefer_city`（user.js:371）
- 4 处安全隐患全部属实：JWT `dev_secret`（auth.js:5）、CORS `*`（app.js:27）、wxpay `/unified` 无鉴权（wxpay.js:41）、回调无 key 时跳过验签（wxpay.js:133）
- matchService：候选要求 VIP（99-100）、单向写 log（168-173）、权重 30/25/15/12/8/6/4 写死 `scorePair`
- register 身高 150-200 内联（initHeights）、index.wxml 硬编码「188元/30天」（:37）、profile `post`/`USER_PROFILE_UPDATE` 未用
- schema：partner_withdraw 仅 status 0/1 且无 remark、ai_knowledge 无 keywords 列、admin/admin123456、13 条 FAQ 种子——均与文档一致

### 已校正的文档不符之处（6 项）
| # | 问题 | 涉及文档 | 处理 |
|---|------|----------|------|
| 1 | init.sql 实为 **15 表**（含 partner_user_audit_log，:279），文档误记「14 表 + 补丁新增」 | PROJECT_STRUCTURE、MODULES/12 | 已改为 15 表并说明该表 init.sql 与 patch 各一份 |
| 2 | index 下次匹配**已动态计算**（getNextMatchTime，:39），非「静态文字」；缺的是实时滚动倒计时 | CODE_REVIEW、MODULES/01 | 已改为「动态日期 DONE，实时跳秒未做」 |
| 3 | 隐私 auth_time bug 比原描述更重：表**无 create_time 列**，故恒为 null | CODE_REVIEW | 已补充列不存在的事实，修复方向 `row.auth_time` |
| 4 | app.wxss 实为 280 行（原写 281） | UI_REVIEW | 已改 |
| 5 | 项目**尚未 git init**，分支方案为目标态 | GIT_BRANCH_PLAN | 已加前置状态提醒 |
| 6 | 「以 PRD 为准」缺老板本人对放弃咖啡店 OMO 的直接留痕 | README_HANDOVER、QUESTIONS_TO_BOSS | 已新增 **Q0 最高优先级方向确认** + 总交接风险callout |

### 涉及文件（均为文档）
- `QUESTIONS_TO_BOSS.md`（新增 Q0）
- `README_HANDOVER.md`（新增方向风险 callout）
- `PROJECT_STRUCTURE.md`、`MODULES/12-数据库与接口.md`（表数校正）
- `CODE_REVIEW.md`、`MODULES/01-首页与匹配展示.md`（index 倒计时 + 隐私 bug 校正）
- `UI_REVIEW.md`（行数）
- `GIT_BRANCH_PLAN.md`（git 未初始化提醒）
- `DEVELOPMENT_LOG.md`（本条）

### 未做
- 仍未碰 miniprogram/、server/、database/ 任何业务代码
- 未执行本地跑通（R0 待用户放行）

---

## 2026-06-29 — 第二轮：产品决策对齐与入档

### 类型
产品决策 + 文档更新（**仍未修改任何业务代码**）

### 背景
John 以"产品经理/架构师协作"模式逐条拍板：锁定 188 PRD 方向，并答复 Q1~Q5、B-Q1/2/3 共 9 项。Agent 先做概念澄清（尤其区分"LLM 生成画像"vs"LLM 匹配"），再把决策全部落档。

### 已锁定决策（9 点）
1. 方向 = **188 元 PRD 路线**（咖啡店 OMO 不采纳）
2. 非 VIP 匹配详情：模糊提示 + 开通 VIP 引导；完整详情仅有效 VIP
3. 匹配详情字段收紧为最小集（年龄段/学历/职业圈层/婚育计划/基础硬性条件/身高区间/三观契合度）
4. 不展示姓名/照片/联系方式/性别/城市/精确身高
5. 注册身高立即改区间档位 + 旧精确数据兼容迁移
6. 外貌描述 v1：纯文本选填，仅本人+后台可见，不展示给对方、不进打分
7. 见面安全卡仅转发本人好友/家人，不发对方、不公开、v1 不存相册
8. 三观文本选填，但填了校验 20–300 字
9. 安全确认强引导、不阻断其他功能

### 新立项（v2）
- 外貌描述「关键词 → LLM 生成用户画像」列为 v2 专项；启动前须过 5 项确认（模型/展示范围/内容审核/授权/是否改"v1 不接 LLM"）。

### 架构师补充的工程事实
- `normalizeHeightRange()`（user.js:44）只补 `cm` 不分桶 → 身高迁移需**新写分桶逻辑**
- matchService `parseHeightCm` 取首个数字 → 区间化后应改用**中位数**，避免老用户匹配分漂移
- 后端 PUT `/profile`（user.js:250）已可用，前端未接 → 外貌字段可直接挂上去

### 涉及文件（均为文档）
- `QUESTIONS_TO_BOSS.md`（Q0~Q5、B-Q1/2/3 全部关闭）
- `README_HANDOVER.md`（方向 callout 改为"已锁定"）
- `REQUIREMENTS.md`、`BOSS_IDEAS_CHECKLIST.md`（决策登记）
- `MODULES/01、02、03、04、11`、`CONFIG_DESIGN.md`、`TODO.md`（规则落到模块/配置/待办）
- `DEVELOPMENT_LOG.md`、`DEVELOPMENT_PROGRESS.md`（本轮记录）

### 未做
- 仍未碰任何业务代码（miniprogram/server/database）
- 未执行本地跑通（R0 待放行）

---

## 2026-06-29 — 产出第 1 波实施计划 plan.md（交 Cursor/Composer 执行）

### 类型
计划产出（**未修改业务代码**）

### 内容
在代码根目录产出 `plan.md`，交付方式：Cursor（GPT-5.5）+ Composer 实现、GPT 对照检查表 review。

### 范围（第 1 波 = 工程地基 + 确定性 Bug + 安全加固）
- Phase 0：git init + .gitignore + .env + DB 导入 + 本地跑通（R0）
- Phase 1：4 个确定性 Bug（提现驳回 status、注销 report_type=3 分离并修审核端、隐私 auth_time、like_circle_ids 串城市）
- Phase 2：4 处安全加固（JWT 生产校验、CORS 生产限制、wxpay /unified 加 userAuth+归属校验、notify 生产强制验签）+ 默认 admin 密码提醒

### 写计划时新发现并已纳入修复
- 注销 Bug 比原记录更严重：审核通过会把用户置 MARRIED 且 `marry_success_count +1`（污染公示）→ plan 已让审核端按 report_type 分支处理
- 注销落点用 BANNED（guard 已拦截）；专门 CANCELLED 状态属后续（需改 guard 名单）

### 明确不在本波（留后续 plan）
双向互配 + 候选放开非VIP、非VIP模糊+详情收紧(Q1/Q2)、身高区间+迁移(Q3)、外貌描述、见面安全、R2配置化、外貌v2 LLM画像。

### 涉及文件
- 新增 `plan.md`（代码根目录）
- `project-docs/TODO.md`（plan 内 Task 2.5 会补默认密码提醒）

---

## 2026-06-29 — 第 1 波实施：R0 环境检查 + R1 Bug 修复 + R3 安全加固

### 类型
工程地基 + Bug 修复 + 安全加固

### 修改目的
按 `plan.md` 第 1 波执行：建立 git baseline，修复 4 个确定性后端 Bug，完成 4 项安全加固，并记录本地运行阻塞。

### R0 结果
- 已初始化 git 仓库并提交 baseline：`0efeb8d chore: initial commit (baseline before fixes)`
- 已创建 `.gitignore`，`server/.env` 与 `server/node_modules/` 被正确忽略
- 已创建本地 `server/.env`（不提交）
- 数据库导入阻塞：本机没有 `mysql` CLI、没有 MySQL/MariaDB Windows 服务、没有 Docker；`mysql2` 直连 `127.0.0.1:3306` 返回 `ECONNREFUSED`
- 因 DB 服务缺失，无法完成 `SHOW TABLES`、后续 DB 依赖 API 手动验收
- 后端开发服务已启动成功，`GET /api/common/health` 返回 `status: ok`

### 已修改文件
- `server/src/config/constants.js`
- `server/src/routes/user.js`
- `server/src/routes/admin.js`
- `server/src/routes/wxpay.js`
- `server/src/app.js`
- `project-docs/TODO.md`
- `project-docs/DEVELOPMENT_LOG.md`

### 实际修改
1. 新增 `MARRY_REPORT_TYPE` 枚举，区分结婚报备、离异复入、账号注销
2. `/api/user/cancel` 改写 `report_type=3`，避免被当成结婚报备
3. 管理员审核 `report_type=3` 时将用户置为 `BANNED`，不增加 `marry_success_count`
4. 提现驳回写 `partner_withdraw.status=2`，不再误标为 `1`
5. `/api/admin/privacy-logs` 返回 `row.auth_time`
6. 择偶保存不再把 `prefer_city` 写入 `like_circle_ids`
7. 生产环境缺少强 `JWT_SECRET` 时启动失败
8. 生产环境缺少 `CORS_ORIGIN` 时启动失败
9. `/api/wxpay/unified` 增加 `userAuth` 与订单归属校验
10. 生产环境 `WXPAY_API_KEY` 缺失时拒绝处理支付回调
11. TODO 补充上线后立即修改默认管理员密码提醒

### 验收
- [x] 语法级检查：`node --check` 覆盖修改过的后端 JS 文件
- [ ] DB 导入：阻塞（本机无 MySQL 服务）
- [ ] DB 手动验收：阻塞（本机无 MySQL 服务）
- [x] 后端启动 + health：通过
- [ ] DB 依赖链路：阻塞（本机无 MySQL 服务；待安装/启动 MySQL 后执行）

### 备注
未修改 `miniprogram/` 页面 UI、`matchService.js`、`orderService.js`、`database/init.sql`。未新增依赖。

---

## 2026-06-29 — R0 续：本地 MySQL 通过 Docker 落地 + 导库验收通过

### 类型
工程地基（解除此前 DB 阻塞）

### 背景
此前本机无 MySQL/MariaDB/Docker，DB 导入被阻塞。现已安装 Docker Desktop（v29.5.3）。

### 操作
- 起容器 `wefinally-mysql`（mysql:8.0，root 密码 wefinally123，映射 3306，utf8mb4/utf8mb4_unicode_ci，TZ=Asia/Shanghai）
- 导入 `database/init.sql` + `database/patch-002-partner-audit.sql`（exit 0/0）

### 验收（已通过）
- 表数量 = **15**（SHOW TABLES 列全）
- 种子：occupation_circle = **50**（8 板块）、ai_knowledge = **13**、admin = **1**（admin/状态1）、system_stat 领证数 = 0、user = 0
- CJK 完整性：`occupation_circle.id=1` HEX = `E7BBBCE59088E585ACE58AA1E59198`（"综合公务员"，5 字/15 字节）→ 数据按 utf8mb4 正确入库（命令行显示 `?????` 仅为终端编码问题，非存储损坏）
- 列结构抽查：`user_privacy_auth_log` 有 `auth_time`、无 `create_time`（印证 R1 隐私日志 bug 修复方向）；`user` 暂无 `appearance_description`（外貌字段属 wave3）

### 待办
- 把 `server/.env` 的 `DB_PASSWORD` 设为 `wefinally123`（db.js 读 DB_HOST/PORT/USER/PASSWORD/NAME，其余可走默认）
- `npm run dev` → `GET /api/common/health` → 补跑 wave1 四个 Bug 的运行时验收

---

## 2026-06-29 — R0 收尾：后端启动成功 + wave1 四个 Bug 运行时验收全部通过

### 类型
运行时验收（解除最后阻塞）

### 操作
- `server/.env` 填入 `DB_PASSWORD=wefinally123`（其余 DB 变量默认即可）
- `node src/app.js` 启动成功；`GET /api/common/health` = 200 / ok
- DB 连通性：`GET /api/common/circles` 返回 **50** 圈层；`admin-login`（admin/admin123456）成功签发 token

### wave1 运行时验收（全部 PASS）
- **Bug 1.1 提现驳回**：`PUT /admin/withdrawals/:id {status:2}` → `partner_withdraw.status=2` 且 partner.balance 100→150（退款）✅
- **Bug 1.2 注销/结婚分支**：approve `report_type=3` → user.status=BANNED 且 `marry_success_count` 不变；approve `report_type=1` → user.status=MARRIED 且 `marry_success_count +1` ✅（最严重的数据污染 Bug 已修）
- **Bug 1.3 隐私 auth_time**：`/admin/privacy-logs` 返回真实 `auth_time`（注意该接口 `INNER JOIN user`，测试日志须挂真实 user_id 才会出现）✅
- **Bug 1.4 like_circle_ids**：空 `like_circle_ids` + `prefer_city=SZTEST` → 入库 `like_circle_ids` 为空，未写城市 ✅

### 测试数据
已全部清理，DB 回到种子态（users=0…circles=50 / faq=13 / marry_cnt=0）。

### 环境备注
- 本地库 = Docker 容器 `wefinally-mysql`（mysql:8.0 / 3306 / root:wefinally123），**未挂数据卷**（删容器需重导 init.sql）
- 后端以 `node src/app.js` 后台运行（开发态）
- 用户端微信登录仍需真实 `WX_APPID/WX_SECRET`；本次为验证 user 端接口，用同密钥现造了一个 user JWT 绕过登录

### 至此 plan.md 第 1 波（R0 + R1 + R3）全部完成并运行时验收通过

---

## 2026-06-29 — 产出第 2 波实施计划 plan-wave2.md

### 类型
计划产出（**未修改业务代码**）

### 内容
代码根目录新增 `plan-wave2.md`，交 Cursor/Composer 执行、GPT review。范围 = 匹配集群（不含身高区间，后者独立计划）：
- Phase 1：matchService 双向互配 + 候选放开非 VIP（对称写入、每人每批次≤1、互相满足门槛 `MIN_SIDE_SCORE`）+ 自包含 node 验收脚本
- Phase 2：match.js 非 VIP 模糊分级（去 requireVip、handler 内按 VIP 返回完整/模糊）+ 详情字段收紧（去性别/城市/精确身高、年龄改"年龄段"）+ match-detail 前端模糊态

### 关键设计决策（已在计划顶部标注，待老板/John 复核）
- 双向互配语义 = Option C：仅双方择偶互相满足才配、对称两条、每人每批次≤1；非 VIP 被配到看模糊。
- 互相满足判定：双向 scorePair，`min(scoreAB,scoreBA) >= 20`（可调），综合分排序。
- 不新增表/字段；身高展示本波先不做（待身高区间计划）。

### 涉及文件
- 新增 `plan-wave2.md`

---

## 2026-06-29 — 第 2 波：双向互配 + 非 VIP 分级详情

### 类型
功能实现 + 运行时验收

### 完成工作
- `matchService`：候选池放开非 VIP（仍要求正常、异性、非离异、有择偶设置）；双向 `scorePair` 互评；`MIN_SIDE_SCORE=20` 门槛；按综合分排序；对称写入两条 `user_match_log`；每人每批次最多一条。
- `match.js`：`latest/list/detail/:id` 去掉 VIP 硬拦截，改为 handler 内按当前用户 VIP 状态分级返回；非 VIP 返回 `locked:true` + 开通引导且不泄露资料；VIP 返回年龄段/学历/圈层/婚育/契合度最小字段集。
- `match-detail`：支持非 VIP 锁定态；详情标签收紧，不展示性别/城市/精确身高。

### 验收（已通过）
- 临时 `server/test-wave2-match.js`：6 项 PASS（非 VIP 可被配到、双向对称、每人≤1、不满足不配）。
- 临时 `server/test-wave2-api.js`：7 项 PASS（VIP/非 VIP detail/latest/list 分级正确；无 gender/city/height_range/birth_year 泄露）。
- `node --check`：`matchService.js`、`match.js`、`match-detail.js` 均通过。
- `ReadLints`：`match-detail` 三文件无 linter error。

### 范围纪律
- 未改 `orderService` 分润、`matchCron` 节奏、`database/init.sql`、`app.wxss`。
- 未新增依赖；临时验收脚本运行后已删除。
- 身高区间、外貌描述、见面安全、配置化收敛留后续计划。

---

## 2026-06-29 — 第 2 波 review + 修复「双向互配」硬条件

### 类型
代码 Review（带执行证据）+ Bug 修复

### Review 结论
Cursor 按 `plan-wave2.md` 提交 5 个 commit，实现**忠实且干净**。运行时实测通过：
- Phase 1：候选放开非 VIP ✅、双向对称写入 ✅、每人每批次≤1 ✅（seed 脚本跑 runBatchMatch 验证）
- Phase 2：非 VIP 详情 `locked:true`+引导 ✅、VIP 详情收紧为 age_band/education/circle_name/baby_plan、**无性别/城市/身高** ✅（curl VIP vs 非VIP 实测）

### 发现的设计缺陷（属计划本身，非 Cursor 实现）
软分门槛 `min(scoreAB,scoreBA) >= 20` **拦不住硬条件**：D 择偶年龄 18–22，候选 C 实际 31 岁，本应不配，但 D→C 软分 = 52.75（婚育/身高/圈层/同城基础分堆出来），仍被配上 → 用户设的年龄区间形同虚设，违背 B13「双向契合」。

### 修复
`server/src/services/matchService.js`：新增 `hardOk(settings, candidate)`（设了年龄区间则对方年龄必须落在区间内），在候选循环打分前**双向各校验一次**，不满足直接 `continue`。软分门槛保留作次级质量线。

### 验证（修复后重跑，6/6 PASS）
A↔B 双向互配成立且对称、各 1 条；D 因年龄被硬过滤→0 条；C 无可配→0 条。

### 提交
`e07aa55 fix(match): enforce age range as hard bidirectional filter (true mutual-fit)`

### 备注
- 后续可按需把身高/学历也升级为硬条件（目前仅年龄）。
- 本机 git 无身份，已设 repo-local identity 沿用 Cursor Agent 以保持 author 一致。

---

## 2026-06-29 — 身高区间 + 匹配配置化 + 学历层级

### 类型
新功能 + 重构（直接实现，ponytail 模式）

### 改动
- **新增 `server/src/config/matchConfig.js`**：软分权重、`minSideScore`、硬条件开关(`hard.age/height/minEducation`)、`educationRank` 全部可配，不再写死。
- **身高区间**：register 改用 `HEIGHT_RANGE_OPTIONS`；`matchService.parseHeightCm` 取区间中位数；match-detail（后端+前端）把身高以区间加回展示；新增 `database/migrate-height-to-range.js` 把存量精确身高(175cm→170-180cm)一次性迁移。
- **年龄**：硬条件（一票否决），由 `matchConfig.hard.age=true` 控制（原写死，现配置化）。
- **身高**：v1 软分，`hard.height=false` 预留，待区间稳定后开。
- **学历**：软分逻辑由“完全相等”改为“层级比较”(`eduRank`，达标即满分)；`hard.minEducation=false` 预留最低学历硬门槛。

### 涉及文件
matchConfig.js(新)、matchService.js、routes/match.js、register.js、match-detail.js/.wxml、database/migrate-height-to-range.js(新)、server/match.selfcheck.js(自检)

### 验证（全 PASS）
- `match.selfcheck.js`（无DB）7/7：身高中位数/学历层级/年龄硬条件/学历软分达标
- 迁移：`175cm → 170-180cm`（migrated 1/1）
- runBatchMatch 冒烟：A↔B 互配对称、D(18-22)被年龄硬过滤
- curl VIP 详情：返回 `height_range:170-180cm` + `age_band`，无性别/城市

### 留给后续
- 身高/学历的硬条件开关已就位，按用户池大小在 matchConfig 调即可，无需改码。
- 配置下发前端（`GET /api/common/config`）仍属 R2，未做。

---

## 2026-06-29 — 老板新增需求入档：110 方案一 + 三大人群批量导入

### 类型
需求入档（**未写码**）

### 来源
老板原话 + 两份新 docx（存于 `D:\wefinal`）：
- `微信小程序对接深圳110系统的合规解决方案.docx`
- `深圳群团_工会对接 + 公务员免费入驻批量上传 可行性合规方案 (1).docx`

### 锁定（A 组，最高优先级）
- **A7** 见面安全升级到 **110 方案一**：见面报备 + LBS 定位 + 紧急联系人 + 一键呼救（跳「广东110」官方小程序）+ 平台内部预警；方案二（直推110，需资质）后期。⚠️ **覆盖**早期 C2/Q5「v1 不做定位/紧急联系人/一键报警」。
- **A8** 三大人群（公务员 / 在编教师 / 在岗医护）由单位官方批量白名单导入 → 终身免费会员 + 圈层标签；**先留好接口**。
- **A9** 远期：小程序做得非常官方、要公安背书。

### 落档
- `BOSS_IDEAS_CHECKLIST` A7-A9；`MODULES/11` 重写为方案一；**新增 `MODULES/13` 批量导入与公职白名单**；`00-总览` 加模块13；`REQUIREMENTS §七` 改（定位/紧急联系人不再"不做"）；`QUESTIONS_TO_BOSS` 新增 M-1~M-4（见面安全）/ W-1~W-4（批量导入）。

### 未做（待答后再排期）
不写码。需 John/老板先答 M/W 问题（尤其 M-1 方案一 v1 范围、M-3 24h客服人力、W-3 白名单手机号↔微信登录绑定）。两个新模块（见面安全方案一、批量导入）将各自单独出 plan。

---

## 2026-06-29 — 模块13 批量导入 + 公益免费白名单

### 类型
新功能（按 `plan-module13-free-whitelist.md` 执行）

### 修改目的
为公职/教师/医护三类单位批量白名单预留接口；用户登录后用单位登记手机号领取终身公益免费会员，豁免 188 付费。

### 涉及文件
- `database/patch-004-free-whitelist.sql`
- `server/src/middleware/guard.js`
- `server/src/routes/admin.js`
- `server/src/routes/user.js`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/profile/profile.wxml`

### 测试
- [x] DB patch 导入：看到 `free_member/free_source` 和 `free_whitelist`
- [x] `node --check`：`guard.js`、`admin.js`、`user.js`、`profile.js`
- [x] 端到端：管理员导入 `imported=1`；用户领取后 `free_member/free_source = 1 public`
- [x] 未命中：返回「该手机号不在公益免费名单内」，用户 `free_member` 保持 0
- [x] 免费会员 VIP 守卫：`/api/match/latest` 未返回 403

### 提交
`d4c6ee2`、`2aa89b0`、`12fc257`、`b7cdec7`、`0d97e5e`

### 备注
v1 只做 JSON 批量导入接口和用户自报手机号领取；单位自助门户、CSV UI、个人证件人工审核留到真实对接后再加。

---

## 2026-06-29 — 模块11 见面安全 110 方案一

### 类型
新功能（按 `plan-module11-meet-safety.md` 执行）

### 修改目的
实现线下见面安全确认：报备、LBS 主动定位、紧急联系人、安全卡、历史记录、SOS 证据记录和拨 110 前端入口。

### 涉及文件
- `database/patch-005-meet-report.sql`
- `server/src/config/safetyConfig.js`
- `server/src/routes/meet.js`
- `server/src/app.js`
- `miniprogram/app.json`
- `miniprogram/pages/meet-safety/*`
- `miniprogram/pages/meet-safety-list/*`
- `miniprogram/pages/match-detail/*`
- `miniprogram/pages/profile/profile.js`

### 测试
- [x] DB patch 导入：看到 `meet_report` 和 `sos_log`
- [x] `node --check`：`safetyConfig.js`、`meet.js`、`app.js`、新增/改动小程序 JS
- [x] `app.json` 可 JSON 解析
- [x] 后端验收：缺安全勾选失败；正常创建返回 `id/card_no`；SOS 返回 `sosPhone=110` 和紧急联系人；`sos_log` 写入 1 条；list 返回 1 条
- [ ] 微信开发者工具/真机手动验收：`getLocation` 授权、广东110小程序跳转、`open-type=share`

### 提交
`306dcb6`、`f304b74`、`f3ed55b`、`b3e1cb5`

### 备注
未宣称直连 110；广东 110 小程序跳转默认关闭，仅在 `safetyConfig.guangdong110` 留位。暂无短信商/24h 客服，SOS v1 只落证据并回传紧急联系人给前端引导用户自联。

---

## 2026-06-29 — 撤下见面安全卡（老板"不要自己来"）

### 类型
范围修正（按老板口径）

### 背景
老板企微原话「你按照我的提示来，不要自己来」，针对的正是 John 自加的"见面安全卡+转发好友"(C3)。安全卡不在老板两份 110 Word 内（"安全卡"出现 0 次）。按第一原则(老板原话>John新增)撤下，模块11 v1 严格只对齐老板 110 方案一(报备+LBS+紧急联系人+一键呼救+内部预警)。

### 改动（前端，移除安全卡的卡片+转发；保留报备/定位/SOS）
- `pages/meet-safety/meet-safety.wxml`：去掉"见面安全卡"标题、卡号、`open-type="share"` 转发按钮；提交后改为"已提交见面安全确认"+ 保留一键呼救。
- `pages/meet-safety/meet-safety.js`：删除 `onShareAppMessage`。
- `pages/meet-safety-list/meet-safety-list.wxml`：列表去掉卡号标签。
- 后端 `meet_report.card_no` 字段保留（无害，未来恢复安全卡可直接用）。
- 文档：MODULES/11 item6 标"已撤下"；BOSS_IDEAS_CHECKLIST C3 → 已撤下/待老板确认。

### 备注
确认"企微新需求 = 这两份 110 文档"，无其它遗漏需求。安全卡降级为待老板确认项，他点头再恢复（代码痕迹仍在，恢复成本低）。

---

## 2026-06-30 — 匹配增强：跨批次去重 + 小池兜底开关

### 类型
新功能（按 `plan-match-enhance.md` 执行）

### 修改目的
避免同一对用户跨批次重复匹配；用户池小时预留运营可开的软分兜底，硬条件仍一票否决。

### 涉及文件
- `server/src/config/matchConfig.js`
- `server/src/services/matchService.js`

### 测试
- [x] `node --check server/src/config/matchConfig.js server/src/services/matchService.js`
- [x] 临时 `_rv_enh.js` 验收：跨批次同一对不再重复；`smallPoolFallback=false` 不放宽软分；`smallPoolFallback=true` 可兜底；年龄硬条件始终不破。脚本已删除。
- [x] 最终内联脚本复验：`PASS final match enhance + notify no-op`

### 提交
`f6d3f1f`、`d277788`、`c8a6acd`

### 备注
默认值：`avoidRematch=true`，`smallPoolFallback=false`。未改 UI、分润、支付、`matchCron` 周三/五节奏。

---

## 2026-06-30 — 匹配成功微信订阅消息预留 hook

### 类型
新功能预留（按 `plan-match-notify.md` 执行，默认关）

### 修改目的
为周三/五匹配成功后发送微信订阅消息预留完整链路；当前没有真 AppID/Secret、模板 ID、用户授权，所以默认 no-op。

### 涉及文件
- `server/src/config/notifyConfig.js`
- `server/src/services/wxNotify.js`
- `server/src/services/matchService.js`
- `miniprogram/utils/constants.js`
- `miniprogram/pages/match-setting/match-setting.js`

### 测试
- [x] `node --check`：`notifyConfig.js`、`wxNotify.js`、`matchService.js`、`constants.js`、`match-setting.js`
- [x] 默认值检查：`notifyConfig.enabled=false`、`matchTemplateId=''`、`SUBSCRIBE_TMPL_IDS=[]`
- [x] `sendMatchNotice` 在默认关时直接返回；最终匹配验收仍通过，不影响主流程。

### 提交
`591746e`、`50d50bf`、`5ddf6f2`、`792969b`

### 备注
启用时需填真 `WX_APPID/WX_SECRET`、订阅消息模板 ID、前端模板 ID，并按实际模板字段调整 `wxNotify` 的 `data` 字段；启用前不弹授权、不请求微信通知接口。

---

## 2026-06-30 — 外貌 LLM 匹配方案丙实现（默认关）

### 类型
新功能预留（按 `plan-appearance-llm.md` 执行，分支 `feature/appearance-llm-match`）

### 修改目的
用户填写「外貌描述」和「期待对方外貌」；LLM 启用后可在保存资料时抽结构化标签，匹配时仅用标签重合计外貌分，匹配过程不调用 LLM。当前 `llmConfig.enabled=false`、`useAppearanceInMatch=false`，默认回退现状。

### 涉及文件
- `database/patch-006-appearance-llm.sql`
- `server/src/config/llmConfig.js`
- `server/src/config/matchConfig.js`
- `server/src/services/llmService.js`
- `server/src/routes/user.js`
- `server/src/services/matchService.js`
- `miniprogram/app.json`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/appearance/*`

### 测试
- [x] DB patch 导入：看到 `appearance_description`、`appearance_want`、`appearance_tags`、`appearance_want_tags`
- [x] `node --check`：后端配置/服务/路由/匹配服务 + 小程序 appearance/profile JS
- [x] 默认关检查：`llmConfig.enabled=false`、`useAppearanceInMatch=false`；`extractAppearanceTags()` 返回 `null`
- [x] grep 确认：`matchService` 不 import / 调用 `llmService`
- [x] HTTP 回退验收：`PUT /api/user/profile` 外貌文本返回「更新成功」；`GET /profile` 可读回；DB 标签保持 `NULL NULL`
- [x] 匹配回退验收：真实 `runBatchMatch` 冒烟输出 `PASS match fallback smoke`

### 提交
`a880d94`、`4bf116d`、`d637d8a`、`ca49998`、`cf74302`、`92df5f3`

### 备注
本地 `server/.env` 已按用户要求从 `D:\cjz vscode coode\tradingagents-astock\.env` 读取 DeepSeek key，并设置 `LLM_BASE_URL=https://api.deepseek.com`、`LLM_MODEL=deepseek-chat`；`.env` 被 gitignore，不提交密钥。启用前仍需霞姐知情同意、个保法授权、内容安全和预算确认。

---

## 2026-06-29 — 外貌升级方案丙(LLM 匹配) + 开分支

### 类型
需求升级 + 计划产出（分支 `feature/appearance-llm-match`，未改 master 业务码）

### 背景
霞姐"外貌要增加匹配度"。说明:自由文本+不上LLM无法真"按长相配"(无外貌偏好字段、规则引擎读不懂文本)→ 给三选(甲完整度加分/乙结构化偏好/丙LLM)。John 选 **丙**,开分支做。

### 架构(防成本爆)
LLM **只在用户存外貌时调一次**抽结构化标签存库;**匹配时只比标签、零 LLM 调用**。加"期待对方外貌"输入,按"我方期待 vs 对方实际"双向标签重合计分。全程 `llmConfig.enabled`+env Key 控,**默认关→零副作用**(套路同110/notify)。

### 产出
- 开分支 `feature/appearance-llm-match`
- `plan-appearance-llm.md`(丙 实施计划,7 Task,Codex 在分支执行)
- `plan-module03-appearance.md`(v1 纯文本框)标记**已被丙取代**
- MODULES/03、CHECKLIST C4 更新指向丙

### 启用前必办(写进计划)
霞姐对"匹配接入外部LLM"知情同意 / 个保法授权(数据发第三方) / 内容安全机审 / 模型Key预算(John申请中)。未齐保持默认关。

---

## 2026-07-02 — 自检脚本沉淀 + R1 老 Bug 文档收口

### 类型
测试沉淀 / Bug 收口 / 文档

### 修改目的
把此前跑完即删的验收脚本沉淀为 `server/selfcheck/*.js`，覆盖匹配核心、免费会员、见面安全、LLM 默认关回退、R1 确定性 Bug；同时清理文档里“R1 待修”的过期状态。

### 涉及文件
- `server/selfcheck/*`
- `server/package.json`
- `server/src/routes/match.js`
- `AGENTS.md`
- `project-docs/TODO.md`
- `project-docs/README_HANDOVER.md`
- `project-docs/REQUIREMENTS.md`
- `project-docs/CODE_REVIEW.md`
- `project-docs/MODULES/07-合伙人体系.md`
- `project-docs/MODULES/10-婚姻报备与数据公示.md`

### 测试
- [x] `node --check` selfcheck 脚本与改动路由
- [x] `npm run selfcheck`

### 备注
沉淀过程中发现小程序实际使用的 `/api/match/setting` 仍会把 `prefer_city` 写入 `like_circle_ids`，已按 R1 根因一并修复，并纳入 `known-bugs.js`。

---

## 2026-07-02 — 本地开发微信登录开关

### 类型
开发调试 / 安全开关 / 文档

### 修改目的
微信开发者工具联调阶段暂无真实 `WX_SECRET` 时，允许本地显式开启 dev 登录，绕过微信 `code2session`，先跑通登录、注册和页面业务流程；默认关闭，且生产环境强制无效。

### 涉及文件
- `server/src/services/devWxLogin.js`
- `server/src/routes/auth.js`
- `server/selfcheck/dev-login.js`
- `server/selfcheck/run-all.js`
- `server/.env.example`
- `miniprogram/README.md`
- `project-docs/README_HANDOVER.md`

### 测试
- [x] `node selfcheck/dev-login.js`
- [x] `node --check selfcheck/dev-login.js selfcheck/run-all.js src/services/devWxLogin.js src/routes/auth.js`
- [x] `npm run selfcheck`
- [x] 默认关闭时 `POST /api/auth/wx-login` 仍走微信校验并返回 `invalid appsecret`
- [x] 临时开启时 `POST /api/auth/wx-login` 返回本地 openid 和 `needRegister=true`

### 备注
本机 `server/.env` 已写入 AppID `wx91c6559ea4490a29`，`DEV_WX_LOGIN_ENABLED=false` 保持默认关闭；当前调试用后端进程可临时开启 dev 登录，重启后端前需按需切换。

---

## 2026-07-02 — 注册体验优化：圈层分组、离异复入、推广码选填

### 类型
体验优化 / 后端接口 / 自检

### 修改目的
解决注册流程三个卡点：职业圈层从 50 项单列选择改为按板块二级选择；婚姻状况补“离异”并转入人工复入审核状态页；推广码改为选填，空值允许注册，填错才拦截，填对绑定激活合伙人。

### 涉及文件
- `database/patch-007-register-ux.sql`
- `server/src/routes/common.js`
- `server/src/routes/user.js`
- `server/src/routes/admin.js`
- `server/src/routes/report.js`
- `server/selfcheck/register-ux.js`
- `server/selfcheck/run-all.js`
- `miniprogram/app.json`
- `miniprogram/pages/register/*`
- `miniprogram/pages/divorce-review/*`
- `miniprogram/utils/constants.js`
- `miniprogram/utils/util.js`

### 测试
- [x] `node --check` 后端改动路由、新增自检和小程序 JS
- [x] `Get-ChildItem selfcheck/*.js | ForEach-Object { node --check $_.FullName }`
- [x] `node selfcheck/register-ux.js`
- [x] `npm run selfcheck`

### 备注
本地已应用 `patch-007-register-ux.sql`；离异申请仅记录 openid、联系电话、备注和设备信息，不提供用户端证明文件上传，审核通过后也不自动创建可匹配用户。

---

## 2026-07-03 — 本地 VIP 支付 mock 不再调用微信支付

### 类型
Bug修复 / 支付联调 / 自检

### 修改目的
修复真机/开发联调时点击开通 VIP 后弹出“调用支付 JSAPI 缺少参数：total_fee”的问题。根因是开发环境未配置微信商户号/API Key 时，后端生成了 `payment.mock=true` 的假支付参数并返回给小程序，前端随后仍调用 `wx.requestPayment`。

### 涉及文件
- `server/src/routes/order.js`
- `server/selfcheck/vip-purchase-dev.js`
- `server/selfcheck/run-all.js`
- `server/selfcheck/register-ux.js`

### 测试
- [x] `node selfcheck/vip-purchase-dev.js`
- [x] `npm run selfcheck`

### 备注
仅调整开发环境 mock 支付分支：遇到 mock payment 时直接本地标记订单已支付并返回 `payment: null`，不触发小程序支付 JSAPI；未改 `orderService` 分润/入账逻辑。`register-ux` 自检改为自动选择空闲圈层，避免与本地测试合伙人账号冲突。

---

## 2026-07-03 — Branch A：心理学算法匹配 + AI报告默认关

### 类型
新功能 / 匹配算法 / 自检

### 修改目的
保留旧纯算法双向互选骨架，加入轻量心理/关系偏好维度；匹配结果写入综合分和分数拆解。AI 仅用于匹配后给双方生成报告，默认关闭，不参与排序。

### 涉及文件
- `database/patch-008-match-psych-report.sql`
- `server/src/config/llmConfig.js`
- `server/src/config/matchConfig.js`
- `server/src/services/matchService.js`
- `server/src/services/llmService.js`
- `server/src/utils/psychMatch.js`
- `server/src/routes/match.js`
- `server/src/routes/user.js`
- `server/selfcheck/match-psych-report.js`
- `server/selfcheck/partner-dashboard.js`
- `miniprogram/pages/match-setting/*`
- `miniprogram/pages/match-detail/*`

### 测试
- [x] `node --check server/src/services/matchService.js server/src/services/llmService.js server/src/routes/match.js server/src/routes/user.js server/selfcheck/match-psych-report.js server/selfcheck/partner-dashboard.js`
- [x] `npm run selfcheck`

### 备注
本地已应用 `patch-008-match-psych-report.sql`。`LLM_MATCH_REPORT_ENABLED=false`、`AI_MATCH_WEIGHT_ENABLED=false` 均保持默认关闭；报告关闭时自检确认匹配照常生成且 `ai_report_status=3`。

---

## 2026-07-03 — Branch A：报告调用粒度对齐

### 类型
成本优化 / 自检 / 文档

### 修改目的
将 AI 报告生成从“每个用户一调”调整为“每对匹配一调，返回双方报告”，与成本展示口径一致。

### 涉及文件
- `server/src/services/llmService.js`
- `server/src/services/matchService.js`
- `server/selfcheck/llm-default-off.js`
- `project-docs/MATCH_EXPERIMENT_COMPARE.md`

### 测试
- [x] `node --check src/services/matchService.js src/services/llmService.js selfcheck/llm-default-off.js`
- [x] `npm run selfcheck`

### 备注
默认关闭时仍写入 `ai_report_status=3`，匹配结果不受报告生成影响。

---

## 2026-07-03 — Branch B：AI加权 Top K 重排实验

### 类型
实验功能 / 匹配算法 / 文档

### 修改目的
在 Branch A 可解释算法基础上增加 AI 加权重排实验：先由算法筛选候选，再在开关开启时让 DeepSeek 对 Top K 生成 `ai_score`，按 70/30 合成最终排序分。默认关闭，失败自动回退算法排序。

### 涉及文件
- `server/src/services/llmService.js`
- `server/src/services/matchService.js`
- `server/selfcheck/ai-weighted-default-off.js`
- `server/selfcheck/llm-default-off.js`
- `server/selfcheck/run-all.js`
- `project-docs/MATCH_EXPERIMENT_COMPARE.md`

### 测试
- [x] `node --check src/services/matchService.js src/services/llmService.js selfcheck/llm-default-off.js selfcheck/ai-weighted-default-off.js`
- [x] `npm run selfcheck`

### 备注
`AI_MATCH_WEIGHT_ENABLED=false` 保持默认关闭；默认关闭时自检确认 AI 重排不改变算法排序。报告调用已调整为“一对匹配一次 LLM 调用返回双方报告”，便于成本对比。

---

## 2026-07-03 — 匹配效果案例自检沉淀

### 类型
测试 / 匹配算法

### 修改目的
用 `sc_case_` 合成用户沉淀一组可重复运行的匹配效果测试，覆盖三观/心理高低分、年龄硬过滤、140-150cm 身高、学历软扣分与婚育节奏分，方便后续对比算法+AI报告和 AI加权分支。

### 涉及文件
- `server/src/services/matchService.js`
- `server/selfcheck/match-psych-report.js`
- `server/selfcheck/match-effect-cases.js`
- `server/selfcheck/run-all.js`

### 测试
- [x] `node --check src/services/matchService.js selfcheck/match-psych-report.js selfcheck/match-effect-cases.js selfcheck/run-all.js`
- [x] `node selfcheck/match-effect-cases.js`
- [x] `npm run selfcheck`

### 备注
`runBatchMatch` 新增可选 `scopeOpenidPrefix`，默认不传时行为不变；自检脚本用该参数只跑 `sc_case_` 测试池，结束后清理测试用户和匹配记录。

---

## 2026-07-03 — 严格匹配质量门槛

### 类型
匹配算法 / 自检 / 文档

### 修改目的
在算法匹配链路中加入默认开启的质量门槛，低三观、低心理契合或任一方综合分过低时不再进入匹配，避免用户池小时为了凑数输出低质量匹配。

### 涉及文件
- `server/src/config/matchConfig.js`
- `server/src/services/matchService.js`
- `server/selfcheck/match.js`
- `server/selfcheck/match-effect-cases.js`
- `project-docs/MATCH_EXPERIMENT_COMPARE.md`

### 测试
- [x] `node --check src/services/matchService.js; node --check selfcheck/match.js; node --check selfcheck/match-effect-cases.js`
- [x] `node selfcheck/match.js`
- [x] `node selfcheck/match-effect-cases.js`
- [x] `npm run selfcheck`

### 备注
`matchConfig.qualityGate.enabled=true`，默认要求双方各自分不低于 90、三观相似不低于 40；心理维度至少比较 3 项后，任一方心理分低于 50 则拒绝。`smallPoolFallback=false` 时严格执行，运营显式开启兜底时才允许低质量候选进入兜底。

---

## 2026-07-03 — Branch B：严格门槛合入 AI 加权

### 类型
合并 / 匹配算法 / 自检

### 修改目的
将严格匹配质量门槛合入 AI 加权实验分支，保证 AI 只在通过质量门槛的候选中做 Top K 重排，不能把低三观、低心理或低单边分候选救回匹配池。

### 涉及文件
- `server/src/services/matchService.js`
- `server/src/config/matchConfig.js`
- `server/selfcheck/match.js`
- `server/selfcheck/match-effect-cases.js`
- `project-docs/MATCH_EXPERIMENT_COMPARE.md`

### 测试
- [x] `node --check src/services/matchService.js; node --check selfcheck/match.js; node --check selfcheck/match-effect-cases.js; node --check selfcheck/ai-weighted-default-off.js`
- [x] `node selfcheck/match.js`
- [x] `node selfcheck/match-effect-cases.js`
- [x] `node selfcheck/ai-weighted-default-off.js`
- [x] `npm run selfcheck`

### 备注
AI 加权分支现在先筛 `quality.pass`，再调用 `applyAiRerank`；只有运营显式开启小池兜底且没有合格候选时，才按算法分兜底排序且不走 AI 重排。

---

## 2026-07-03 — 本地匹配记录演示数据

### 类型
测试工具 / 自检复用

### 修改目的
将 `sc_case_` 合成匹配案例抽为共享 fixtures，并新增本地演示 seed/clear 命令，让当前微信开发者工具登录账号能直接看到一条匹配记录。

### 涉及文件
- `server/package.json`
- `server/selfcheck/match-effect-fixtures.js`
- `server/selfcheck/match-effect-cases.js`
- `server/selfcheck/match-demo-seed.js`
- `server/selfcheck/match-demo-clear.js`

### 测试
- [x] `node --check selfcheck/match-effect-cases.js selfcheck/match-effect-fixtures.js selfcheck/match-demo-seed.js selfcheck/match-demo-clear.js`
- [x] `npm run demo:match-clear`
- [x] `npm run demo:match-seed`
- [x] `GET /api/match/list` 返回当前 `DEV_WX_OPENID` 可见的 1 条演示匹配
- [x] `npm run selfcheck`

### 备注
`npm run selfcheck` 不运行演示 seed，仍会清理自己的 `sc_case_` 数据；`demo:match-seed` 会保留 `sc_demo_match_partner` 和双向演示匹配记录，便于小程序「记录」页测试。清理演示数据可运行 `npm run demo:match-clear`。

---

## 2026-07-03 — 匹配详情分项拆解与多场景演示数据

### 类型
前端展示 / 测试工具 / Bug修复

### 修改目的
解释综合匹配分为何可能超过 100，并在匹配详情页展示婚育、三观、心理、年龄、身高、学历、圈层、城市等分项；同时将本地演示数据从 1 条扩展为 5 条，覆盖高契合、三观中等、心理磨合、学历软扣和异地扣分。

### 涉及文件
- `server/src/routes/match.js`
- `server/selfcheck/match-demo-seed.js`
- `server/selfcheck/match-demo-clear.js`
- `miniprogram/pages/match-detail/*`
- `miniprogram/pages/match-list/match-list.js`
- `miniprogram/pages/index/index.js`

### 测试
- [x] `node --check src/routes/match.js selfcheck/match-demo-seed.js selfcheck/match-demo-clear.js`
- [x] `node --check miniprogram/pages/match-detail/match-detail.js miniprogram/pages/match-list/match-list.js miniprogram/pages/index/index.js`
- [x] `npm run demo:match-clear && npm run demo:match-seed`
- [x] `GET /api/match/list` 返回当前 `DEV_WX_OPENID` 可见的 5 条演示匹配，且包含 gender/birth_year/city
- [x] `GET /api/match/detail` 返回完整 `score_detail.side` 和 `quality_gate`
- [x] `npm run selfcheck`

### 备注
前端现在显示原始综合分，进度条仍按 100 封顶；列表和首页日期格式化为 `YYYY-MM-DD`。演示数据保留在本地数据库，方便微信开发者工具直接刷新测试。

---

## 2026-07-03 — 匹配演示日期修正

### 类型
Bug修复 / 测试工具

### 修改目的
修复 MySQL `DATE` 经 Node JSON 序列化后在小程序端显示为前一天的问题；同时将本地演示匹配日期从 2099 年改为 2026 年近期周三/周五，避免演示时出现明显不真实日期。

### 涉及文件
- `server/src/routes/match.js`
- `server/selfcheck/match-demo-seed.js`
- `server/selfcheck/match-demo-clear.js`
- `miniprogram/utils/util.js`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/match-list/match-list.js`
- `miniprogram/pages/match-detail/match-detail.js`

### 测试
- [x] `node --check src/routes/match.js selfcheck/match-demo-seed.js selfcheck/match-demo-clear.js`
- [x] `node --check utils/util.js pages/match-list/match-list.js pages/index/index.js pages/match-detail/match-detail.js`
- [x] 重启本地后端并通过 `/api/common/health`
- [x] `npm run demo:match-clear && npm run demo:match-seed`
- [x] `GET /api/match/list` 返回 5 条演示记录，首条日期为 `2026-07-03`
- [x] `npm run selfcheck`

### 备注
演示数据日期现在为 `2026-07-03`、`2026-07-01`、`2026-06-26`、`2026-06-24`、`2026-06-19`。

---

## 2026-07-03 — 匹配演示样本真实感与前台降承诺展示

### 类型
前端展示 / 测试工具

### 修改目的
避免用户侧看到 `100%` 或满分式表达后误以为平台承诺线下约会结果；本地演示数据改为 8 条合成真实感案例，覆盖跨城、学历、圈层、心理、事业异地、三观适中等场景，且前台主视觉改为等级文案。

### 涉及文件
- `server/selfcheck/match-demo-seed.js`
- `miniprogram/utils/util.js`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/match-list/match-list.js`
- `miniprogram/pages/match-list/match-list.wxml`
- `miniprogram/pages/match-detail/match-detail.js`
- `miniprogram/pages/match-detail/match-detail.wxml`
- `miniprogram/pages/match-detail/match-detail.wxss`

### 测试
- [x] `node --check selfcheck/match-demo-seed.js`
- [x] `node --check utils/util.js pages/match-list/match-list.js pages/index/index.js pages/match-detail/match-detail.js`
- [x] `npm run selfcheck`
- [x] `npm run demo:match-clear && npm run demo:match-seed`
- [x] `GET /api/match/list` 返回 8 条演示记录，综合分约 `90-96`，三观相似约 `68-96`
- [x] 前端检索确认不再显示 `三观 xx%`、`综合 xx分`、`原始分` 等裸分承诺文案

### 备注
用户侧首页、记录页、详情页主视觉显示“综合较高契合 / 三观值得了解 / 关系偏好较为接近”等等级文案；字段拆解和 API 仍保留原始分数，方便开发调试和算法验收。

---

## 2026-07-03 — 外貌入口、见面安全时间、注销匹配池与交接文档

### 类型
前端展示 / Bug修复 / 测试工具 / 文档

### 修改目的
按最新测试反馈收口：外貌描述进入择偶配置和匹配详情流程；线下见面安全确认兼容用户输入的单数字日期/全角冒号，避免 MySQL datetime 500；注销审核通过后清理用户择偶设置和匹配记录；演示匹配年龄改年龄段展示并补充新对话交接文档。

### 涉及文件
- `server/src/routes/meet.js`
- `server/src/routes/admin.js`
- `server/selfcheck/meet-safety.js`
- `server/selfcheck/known-bugs.js`
- `server/selfcheck/match-demo-seed.js`
- `miniprogram/pages/match-setting/*`
- `miniprogram/pages/match-detail/*`
- `miniprogram/pages/index/*`
- `miniprogram/pages/match-list/*`
- `project-docs/NEXT_THREAD_HANDOFF_2026-07-03.md`

### 测试
- [x] `node --check src/routes/meet.js src/routes/admin.js selfcheck/meet-safety.js selfcheck/known-bugs.js selfcheck/match-demo-seed.js`
- [x] `node --check pages/match-setting/match-setting.js pages/match-detail/match-detail.js pages/index/index.js pages/match-list/match-list.js`
- [x] 重启本地后端并通过 `/api/common/health`
- [x] `npm run selfcheck`
- [x] `npm run demo:match-clear && npm run demo:match-seed`
- [x] `POST /api/meet/create` 使用 `2026-9-01 18：00` 保存成功
- [x] `GET /api/match/list` 返回 8 条演示记录并包含年龄段

### 备注
外貌仍不展示对方原文，不默认开启 LLM/外貌加权；期望年龄暂不改多选，后续如要“随意年龄”建议新增 `不限年龄` 选项并做 null 回显。

---

## 模板（后续变更请复制）

```markdown
## YYYY-MM-DD — 简述

### 类型
[分析 / 文档 / Bug修复 / 重构 / 新功能]

### 修改目的
（为什么改）

### 涉及文件
- path/to/file

### 测试
- [ ] 本地跑通
- [ ] 相关 API 手动验证

### 备注
```

---

## 2026-07-16 — AI 客服协调边界与集合自初始化补强

### 类型
Bug修复 / 安全加固 / 自检

### 修改目的
依据 AI 客服交接文档做定向审查，修复约会协调 session 历史读取缺少参与者复核、MiniMax 失败被知识库内容伪装、云数据库非原地更新导致修改确认响应返回旧状态的问题；为 Agent/约会白名单集合增加缺失时创建并重试的受限策略。

### 涉及文件
- `miniprogram/cloudfunctions/api/handlers/agent.js`
- `miniprogram/cloudfunctions/api/handlers/dateApplicationPatch.js`
- `miniprogram/cloudfunctions/api/lib/db.js`
- `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js`
- `server/selfcheck/agent-chat.js`
- `server/selfcheck/date-application-patch.js`
- `server/selfcheck/agent-route-contract.js`

### 测试
- [x] 两条 Agent 回归先红后绿：协调 session 越权读取、供应商失败命中知识库
- [x] 约会修改云数据库返回语义先红后绿：patch 状态与无交集协调状态
- [x] `git diff --check` 与受影响文件 `node --check`
- [x] `npm --prefix server run selfcheck:agent`
- [x] `npm --prefix server run selfcheck:safety`
- [x] `npm --prefix server run selfcheck:ai-report`
- [x] `npm --prefix server run selfcheck:cloudpay`

### 备注
未提交 Git、未部署云函数、未输出任何密钥。云端 `api` 仍需从当前工作树部署后确认微信支付 `User-Agent` 和本轮 Agent 代码实际生效。

---

## 2026-07-16 — 霞姐/Benson 生产约会协调实测

### 类型
Bug修复 / 云端部署 / 生产流程验证

### 修改目的
按真实协调任务验证“发起方表单 → 受邀方接受并提交表单 → 计算交集 → 通知发起方”。实测前发现候选方案生成后未给另一方排队通知，先补失败回归，再增加幂等的 `proposal_generated` 通知。

### 涉及文件
- `miniprogram/cloudfunctions/api/agent/notificationJobs.js`
- `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- `server/selfcheck/date-coordination-cloud.js`

### 生产验证
- [x] 从当前工作树生成部署 bundle 并更新云函数 `api`；状态恢复 `Active`，`ping` 成功。
- [x] 真实任务进入 `waiting_confirmations / proposal_generated`。
- [x] 生成候选：2026-07-18 下午、福田区、咖啡、AA、约 1 小时。
- [x] 发起方 `proposal_generated` 通知任务已幂等入队。
- [x] 脱敏候选摘要已直投霞姐自己的约会协调 session，通知状态为 `sent`；未包含 Benson 原始表单或私密留言。
- [x] 临时受限测试入口已撤下；复测返回 `Unknown action`。
- [x] 下载云端函数确认 Agent/确认逻辑、`proposal_generated`、集合自初始化和微信支付 `User-Agent` 存在。
- [x] Agent、Safety、AI Report、CloudPay 四项最终自检通过。
- [x] Benson 建立独立约会协调 session，状态工具返回成功；其 session ID 与霞姐 session 不同。
- [x] Benson 侧真实 MiniMax 回复成功，`provider=minimax` 且未使用 fallback。
- [x] A、B 依次确认同一候选方案，生产状态进入 `arranged / completed`，`final_proposal_id` 已写入。

### 备注
未修改任何用户 `openid`，未提交 Git，未输出任何密钥。微信订阅消息等站外推送与 1 分钱真机支付仍需分别验证。

---

## 2026-07-16 — AI 报告永久“生成中”修复

### 根因与修复
- 生产任务 `match-report-1784101279665635-1784101279812835-v1` 自 2026-07-15 15:42（台北时间）停在 `generating`，`attempt_count=1`。
- 云函数执行被中断时无法进入业务 `catch`；原 worker 只扫描 `queued`，没有回收过期的 `generating` 租约。
- 新增 2 分钟生成租约判断；worker 每轮先回收中断任务，未耗尽次数则重新排队，达到 3 次则明确失败并允许人工重试。
- 按 TDD 先新增失败回归，再实现最小修复；`selfcheck:ai-report` 转绿。

### 生产验证
- [x] 从当前工作树重新生成单文件 bundle 并部署 `api`，健康检查通过。
- [x] 卡住任务被自动回收，`attempt_count` 从 1 变为 2，随后于 2026-07-16 23:52:11（台北时间）进入 `succeeded`。
- [x] Agent、Safety、AI Report、CloudPay 四项最终自检通过。
- [ ] 微信开发者工具部署未同步 `config.json` 超时；线上 `api` 仍为 20 秒，源码期望 60 秒。需在云控制台或完成 CloudBase CLI 授权后单独更新。

### 备注
未提交 Git，未打印任何密钥。线上 20 秒本次足以完成模型调用，但仍应提高到 60 秒以降低慢响应再次触发回收的概率。

---

## 2026-07-17 — 会员订单查询与发票申请入口

### 类型
会员功能 / 支付订单可见性 / 客服适配

### 修改目的
- 在“我的”页面将“我的订单”作为与“VIP 会员”并列的菜单，紧接在 VIP 入口下方。
- 新增会员订单列表，只返回当前登录会员自己的订单及必要展示字段。
- 待支付订单支持主动刷新微信支付状态；已支付订单显示“申请开发票”。
- 发票入口升级为独立申请页：填写个人/企业抬头、企业税号和接收邮箱；后端验证订单归属与支付状态后记录 `pending`，重复提交幂等，并为人工审核及后续电子发票平台回写 `issued/rejected` 状态保留数据位。

### 涉及文件
- `miniprogram/cloudfunctions/api/lib/vipOrder.js`
- `miniprogram/cloudfunctions/api/handlers/vip.js`
- `miniprogram/cloudfunctions/api/handlers/route.js`
- `miniprogram/utils/constants.js`
- `miniprogram/app.json`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/orders/*`
- `miniprogram/pages/invoice/*`
- `server/selfcheck/cloudbase-vip-payment.js`
- `server/selfcheck/miniprogram-vip-payment.js`

### 测试与部署
- [x] 订单归属隔离、倒序展示、发票资格和云函数 handler 回归通过。
- [x] 小程序路由、菜单、订单状态刷新、发票表单和状态展示回归通过。
- [x] Agent、Safety、AI Report、CloudPay 四项自检通过。
- [x] `git diff --check` 与受影响 JavaScript 语法检查通过。
- [ ] 从当前工作树部署云函数 `api`：微信开发者工具云 API 鉴权连续返回 `41002 system error`，尚未上传；需恢复开发者工具登录/云环境授权后重试并真机验证。

### 备注
未提交 Git，未修改支付回调、结算或 VIP 发放逻辑，未输出任何密钥。

---

## 2026-07-26 — 综合分归一化、A/B 实证与 Agent 重排隐私收口

### 类型
Bug 验证 / 云端只读审计 / 测试夹具 / 隐私加固

### 修改目的
- 验证匹配详情按 `normalized_total`、`normalizedTotal`、`total/max_total`、历史 `total_score` 的顺序解析百分比，避免把 128 分制原始总分误当百分制。
- 只读核对已完成 A/B 测试的真实分项与 AI 报告状态，并确认一次性 B 已通过后台业务流程清理。
- 审计 `high_fit`、`medium_fit`、`edge_pass`、`hard_reject`、`missing_data` 五类离线夹具。
- 防止离线 `evaluationId` 被误带入模型 JSON；该标识改为与内部候选映射相同的不可序列化后端元数据。

### 涉及文件
- `miniprogram/utils/matchScore.js`
- `miniprogram/utils/util.js`
- `miniprogram/pages/match-detail/match-detail.js`
- `miniprogram/cloudfunctions/api/lib/matchAgentRerankPolicy.js`
- `server/selfcheck/match-detail-score-normalization.js`
- `server/selfcheck/fixtures/match-scenarios.js`
- `server/selfcheck/match-scenario-fixtures.js`
- `server/selfcheck/match-agent-rerank-policy.js`
- `project-docs/MATCH_SCENARIO_FIXTURES_2026-07-26.md`
- `project-docs/MATCH_AGENT_TOPK_RERANK_2026-07-26.md`

### 测试与证据
- [x] 交接第 8 节六组 selfcheck 全部通过。
- [x] `total=100 / max_total=128` 显示为 `78%`，等级文案按归一化百分比计算。
- [x] 云端脱敏快照确认 A 侧关系偏好 `0/18`、外貌偏好 `0/10`、原始总分 `100/128`；B 侧原始总分 `105/128`。
- [x] A 的 `psych_profile_json` 实际为空；外貌字段已填写但未命中当前关键词交集。
- [x] AI 报告任务状态 `succeeded`，生成耗时约 14.4 秒。
- [x] 后台审计记录确认一次性 B、偏好和双向 2 条匹配日志已由业务流程清理，当前无活动夹具。
- [x] `evaluationId` 不进入模型请求的新增断言先红后绿。
- [x] `node --check miniprogram/cloudfunctions/api/lib/matchAgentRerankPolicy.js`
- [x] `npm --prefix server run selfcheck:cloud-match`
- [x] 微信开发者工具从当前 `miniprogram/` 工作树本地编译成功，模拟器进入登录页，问题面板为 0；现有 4 条为基础库/弃用类警告。

### 备注
未直接修改或批量迁移生产数据库，未重复执行清理，未调用真实重排模型，未将重排接入生产匹配链路，未部署云函数或上传小程序客户端，未提交 Git。

## 2026-07-29 — 仓库清理与 GitHub 协作入口

### 类型
工程整理 / 文档治理 / 凭据风险收口

### 修改目的
- 删除不应进入版本库的 `.deploy/` 生成副本和两张完全重复的设计预览图。
- 将旧交接、已完成计划和一次性审计报告移入 `project-docs/archive/`，降低新协作者误读旧方案的风险。
- 在根目录建立 `PROJECT_HANDOFF.md`、`CONTRIBUTING.md` 和更新后的 `AGENTS.md`。
- 删除活跃执行说明中的明文本地凭据，并明确现有 Git 历史在推送前需要专项处理。

### 结果
- `.deploy/` 共 9,281 个文件已移入系统回收站，并加入 `.gitignore`。
- 6 份旧交接、8 份历史计划、6 份一次性审计报告已归档。
- 已创建空的私有 GitHub 仓库 `John030427/wefinally` 并绑定本地 `origin`；因历史凭据风险和巨大未提交工作树，尚未推送任何提交。
- 未提交、未推送、未部署、未上传客户端、未修改生产数据库。

## 2026-07-29 — GitHub 首次安全基线审计

### 类型
凭据审计 / 自检 / 发布准备

### 结果
- 从当前工作树生成 409 文件、约 4.3 MB 的独立无历史候选快照；`.env`、`.deploy/`、依赖目录和 Git 历史未进入候选。
- 使用 Gitleaks 8.30.1 扫描：首次发现 3 项候选；其中 2 项为运行时环境变量引用误报，已显式标注，1 项自检硬编码密码已改为每次运行随机生成；复扫为 0 项。
- 六组总自检全部通过；归档 CloudBase 交付报告后产生的旧路径断言已同步到 `project-docs/archive/audits/`。
- `server/selfcheck/partner-dashboard.js` 语法检查和 `git diff --check` 通过。
- 首次基线使用独立临时 Git 仓库生成，不改写当前 `feature/ai-agent-system` 的 90 个旧提交和脏工作树。
- 安全基线已推送到私有仓库 `John030427/wefinally` 的 `main`，提交为 `7d8d7549b5a5e5e4cd8905c44a7b47906e3d614e`，远端与本地快照 SHA 一致。
- `Todou-er` 已接受邀请并具有 `write` 权限。
- `main` 已要求 PR、1 人审批、对话解决和线性历史，禁止强推/删除并对管理员生效；仅允许 Squash 合并，合并后自动删除分支。
- 已启用漏洞提醒和自动安全修复。

## 2026-08-10 — 本地管理后台连接 CloudBase

### 类型
后台接入 / 鉴权隔离 / 云端版本核对

### 修改目的
- 为本地管理后台增加仅连接 CloudBase 的运行模式，避免本地夹具与真实云端数据混用。
- 复用 CloudBase 现有管理员登录和业务 API，不在浏览器保存云端密钥，不让前端直接访问数据库。
- 保留原有本地开发模式，便于继续使用脱敏夹具做界面和流程开发。

### 结果
- 新增 `npm run admin:cloudbase`，服务仅监听 `127.0.0.1`，并将后台请求指向已绑定环境的 CloudBase HTTP 访问服务。
- CloudBase 模式只开放已迁移页面，登录态改用 `sessionStorage`，退出浏览器会话后自动失效。
- 登录页、顶部环境标识和云端接口过旧提示已区分本地模式与真实环境。
- CORS 预检通过；浏览器打开 `http://127.0.0.1:3107/admin` 正常，控制台无警告或错误；未提交真实管理员密码。
- 只读核对发现线上 `api` 云函数尚缺少当前客服工作台所需的会话列表、会话详情、统一时间线和人工回复接口，因此连接层已完成，但完整客服功能需要在明确授权后部署当前云函数版本。

### 测试与边界
- [x] `npm run selfcheck:cloudbase-admin`
- [x] 后台内联脚本语法检查
- [x] `npm run selfcheck:agent`
- [x] `npm run selfcheck:safety`
- [x] `git diff --check`
- 未部署云函数、未写入生产数据库、未提交 Git、未保存管理员口令。

## 2026-08-10 — 管理员与合伙人后台 CloudBase 接入上线

### 类型
云函数部署 / 后台接入 / 角色权限隔离

### 修改目的
- 在用户明确授权后，将当前 `api` 云函数代码部署到既有 CloudBase 环境。
- 让管理员后台与合伙人后台使用同一个云端业务 API，同时保持 `admin` / `partner` 的服务端权限边界。
- 修复 CloudBase 服务地址重复拼接 `/api` 导致请求落到 `/api/api/...` 的连接错误。

### 结果
- `api` Event 云函数已更新，运行时仍为 `Nodejs16.13`，环境变量、网关和支付配置未改动。
- 部署后函数状态为 `Active`，只读 `ping` 返回目标环境 `cloud1-d4gy8l52g08bba326`。
- 管理员会话与合伙人申请接口的无凭据请求均返回 `401 后台Token无效`，确认新路由和角色鉴权已生效且未返回业务数据。
- 本地连接器同时提供 `http://127.0.0.1:3107/admin` 与 `http://127.0.0.1:3107/partner`。
- 合伙人 CloudBase 专用模式使用 `sessionStorage`，复用单次云端登录 Token，仅开放已迁移的“用户审核、推广工具”。看板、订单、提现仍依赖旧本地 MySQL，暂未暴露；提现迁移需要单独设计事务与幂等控制。

### 测试与边界
- [x] 交接第 8 节六组 selfcheck 全部通过。
- [x] `npm --prefix server run selfcheck:cloudbase-admin`
- [x] `npm --prefix server run selfcheck:cloudbase-partner`
- [x] 管理员与合伙人登录页浏览器验证，控制台无警告或错误。
- 未上传小程序客户端、未修改生产数据库、未提交 Git、未提交真实后台账号密码。

## 2026-08-11 — LangGraph 客服与双向约会协调本地候选

### 类型
AI 编排 / 人工介入 / 安全边界 / 本地发布候选

### 实现
- 新增独立 `Nodejs20.19` TypeScript `agent-graph` 函数源码，固定使用 `@langchain/langgraph@1.4.9`。
- 客服图支持普通咨询、投诉/支付争议转人工、提示词注入拦截、`interrupt()` 暂停及跨图实例恢复。
- 双向约会图以确定性代码计算时间、行政区、场所类型、时长和预算交集；任一方修改后版本递增，旧 proposal 和双方旧确认立即失效。
- 新增 CloudBase collection 抽象的 checkpoint saver：文档键不可猜测，write 幂等，限定 `wf_thread_`，保存过期时间，并可在新实例恢复。
- API 侧新增 HMAC actor/thread 标识、严格结果 DTO、超时/不可用回退、shadow mode 和 8 项精确工具白名单。平台客服可通过默认关闭的开关接入；模型和图节点不直接访问业务数据库。

### 安全与验证
- 图函数 30 项测试通过（包括读取层主动忽略已过期 checkpoint），TypeScript 严格构建通过，生产依赖 `npm audit --omit=dev` 为 0。
- `selfcheck:langgraph` 以及 Agent、安全、AI 报告、支付、会员、匹配六组基线全部通过。
- 对抗测试覆盖伪造 actor/thread、任意工具、跨协调任务、旧版本、重复恢复、坏 checkpoint、手机号/OpenID/密钥泄漏、函数超时和不可用回退。
- 最终验证时已临时启动 `localhost:3000`，总入口通过健康检查和纯逻辑匹配断言，随后因本机没有监听 `127.0.0.1:3306` 的 MySQL 服务，在 `match-psych-report` 清理步骤以 `ECONNREFUSED` 停止；逐组代码自检没有失败。
- 变更扫描只命中测试中的明确假手机号/OpenID/密钥/私钥标记夹具，未发现真实凭据。

### 部署边界
- 当前未部署 `agent-graph`、未更新线上 `api`、未上传小程序客户端、未写生产数据库。
- `LANGGRAPH_ENABLED` 默认关闭；`LANGGRAPH_SHADOW_MODE` 不执行工具。
- 约会协调图已实现并测试，但 API 暂不切流，直到旧 `date_coordination_application` 字段到新偏好 schema 的无损映射有独立测试。
- 未将 `wx-server-sdk@4.0.2` 加入新图函数，因为它固定的 CloudBase SDK 依赖链仍包含审计为高危的旧依赖。部署前必须确定安全的运行时数据库适配方式，并完成 collection、TTL/index、环境变量和真实云函数恢复验证。
- `api` 云函数部署与小程序客户端上传是两个独立发布动作，必须分别验证和授权。

---

## 2026-08-16 — agent-graph 测试外移后 requireFromAgentGraph 缺失修复

### 类型
Bug修复 / 测试

### 修改目的
`fec4215`（修复微信开发者工具"非法的文件 / import.meta outside module"上传报错）将 agent-graph 的 8 个测试从 `cloudfunctions/agent-graph/test/` 外移至 `miniprogram/tests/agent-graph/`，同时把 4 个测试文件的 `import ... from '@langchain/langgraph'` 改写为 `requireFromAgentGraph('@langchain/langgraph')`，但从未定义该全局函数，导致 `checkpoint / customerService / dateCoordination / index` 四个测试文件在模块加载期直接 `ReferenceError` 整包失败，`npm run check` 从 33 项通过退化为 13 通过 / 4 文件失败。

### 涉及文件
- `miniprogram/tests/agent-graph/agentGraphRequire.ts`（新增：createRequire 锚定 `cloudfunctions/agent-graph/package.json`，兼容 tsx CJS/ESM 两种形态）
- `miniprogram/tests/agent-graph/checkpoint.test.ts`
- `miniprogram/tests/agent-graph/customerService.test.ts`
- `miniprogram/tests/agent-graph/dateCoordination.test.ts`
- `miniprogram/tests/agent-graph/index.test.ts`

### 测试
- [x] `npm --prefix miniprogram/cloudfunctions/agent-graph run check`：33/33 通过（build + tsc + tsx --test）
- [x] 六组 server selfcheck（agent / safety / ai-report / cloudpay / member / cloud-match）复跑全绿

### 备注
提交 `7bffc93`（分支 `feature/partner-gated-aigc-plan`）。用户既有 dirty 文件未纳入提交；本会话另产出 `project-docs/HANDOFF_2026-08-16.md` 交接文档。

