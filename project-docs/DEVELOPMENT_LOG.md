# 开发变更日志

> 记录每一次分析、修改、决策和变更，方便后续交接。

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
- [ ] 微信开发者工具手动验收：`getLocation` 授权、`makePhoneCall`、`open-type=share`

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
