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
