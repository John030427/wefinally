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
