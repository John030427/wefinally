# WeFinally 婚恋小程序 — 项目总交接文档

> 最后更新：2026-06-29  
> 维护者：开发 Agent + John

---

## 一、项目是什么

**WeFinally** 是一款纯结婚导向的严肃婚恋微信小程序，依托 **50 大职业圈层合伙人风控**、**AI 定时精准匹配**、**三观文本语义契合度**，仅支持**官方一对一私密奔现**。

**核心壁垒**：无头像、无用户私聊、无社交动态 — 反照骗、反闲聊、反虚假交友。

**Slogan**：专门解决想结婚的单身朋友的结婚问题。

---

## 二、三层产品意图（必读）

本项目存在三层意图来源，开发时必须分清优先级：

| 层级 | 来源 | 地位 | 说明 |
|------|------|------|------|
| **第 1 层** | 两份 PRD `.docx` + 现有代码 | **执行依据** | 严肃婚恋、188元/月、官方客服对接奔现、50圈层、50分润 |
| **第 2 层** | `老板早期想法-豆包记录与讨论.md` | **背景参考** | Date Drop、MBTI、9.9+咖啡店、二狗式线下 — **已被老板否定为执行依据** |
| **第 3 层** | John 新增需求 | **当前总需求** | 女性安全感、线下见面安全确认、外貌描述、配置化、AI 匹配研究 |

**2026-06-29 已锁定**：商业模式以 PRD（第 1 层）为准，由执行人 John 明确拍板「188 元 PRD 路线，我确定这条路线」。第 2 层咖啡店 OMO（9.9 元）方案不采纳。

> ℹ️ **方向状态**：已锁定，按 PRD 路线执行，不再当作悬而未决的风险。唯一保留的回溯条件：若**老板本人**日后提出与 PRD 不同的方向，需回溯本决定。原始方向分歧的来龙去脉见 `老板早期想法-豆包记录与讨论.md` 与 `BOSS_IDEAS_CHECKLIST.md` D2；决策留痕见 `QUESTIONS_TO_BOSS.md`「方向已锁定」。

---

## 三、当前完成进度

### 整体评估：约 80% MVP 完成

| 模块 | 完成度 | 说明 |
|------|--------|------|
| 微信登录 + 注册 + 协议 | DONE | 三协议勾选、全下拉注册 |
| 择偶配置 + 三观文本 + 7天冷却 | DONE | 前后端均已实现 |
| AI 定时匹配（周三/五） | PARTIAL | cron 已实现；需改双向互配、候选放开非 VIP |
| VIP 188/30天 + 微信支付 | PARTIAL | 逻辑完成；需真支付密钥与安全加固 |
| 合伙人体系 | DONE | 注册冻结→激活→推广码→分润→提现 |
| 管理后台 | PARTIAL | 10+ 模块可用；部分页面简化 |
| AI 客服 | DONE | 知识库关键词匹配 + 转人工 |
| 婚姻报备 / 注销 | PARTIAL | 有 Bug（cancel 类型误用） |
| **外貌描述** | NOT STARTED | 用户新增需求 |
| **线下见面安全确认** | NOT STARTED | 用户新增需求 |
| **配置化** | PARTIAL | 部分已集中在 constants |

### 已知 Bug（待 R1 修复）

见 `CODE_REVIEW.md` 与 `TODO.md`。

---

## 四、项目总需求之一：提升女性安全感与线下见面转化

通过 AI 匹配、资料完善、**外貌描述**、**线下见面安全确认**、**见面安全卡**等功能，提升用户之间的匹配效率和线下见面的安全感，尤其要让女性用户更有安全感，从而提升女性用户愿意线下见面的比例。

**产品原则**：

- 面向用户文案叫「**线下见面安全确认**」，不用「强制报备」
- 内部文档/数据库可用 `meet_report` 或「见面报备」
- 第一版做 MVP，不做复杂风控系统
- 安全感功能要克制、可信、好用，不要吓到用户
- 定位为**官方客服对接奔现之后的用户自我安全确认附加层**

---

## 五、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生微信小程序（无自定义组件，页面级 UI） |
| 后端 | Node.js 18+ / Express |
| 数据库 | MySQL 8.0 |
| 定时任务 | node-cron（内置） |
| 管理后台 | 原生 JS SPA（`server/public/admin/`） |
| 合伙人后台 | 原生 JS SPA（`server/public/partner/`） |
| 部署 | 腾讯云轻量 + 宝塔 + Nginx + PM2 |

---

## 六、如何运行（本地开发）

### 0. 项目路径说明

真实代码根目录（双层嵌套）：

```
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\
```

### 1. 数据库

```bash
# Windows 一键导入
database\import.bat

# 或手动
mysql -u root -p < database/init.sql
mysql -u root -p < database/patch-002-partner-audit.sql
```

Schema 单一真源：`database/init.sql`（不要用 `server/migrations/001_schema.sql`）。

### 2. 后端

```bash
cd server
cp .env.example .env   # 填写数据库、JWT、微信等配置
npm install
npm run dev
```

默认：`http://localhost:3000`

- 健康检查：`GET /api/common/health`
- 管理后台：`http://localhost:3000/admin/`（admin / admin123456）
- 合伙人后台：`http://localhost:3000/partner/`

### 3. 小程序

1. 微信开发者工具导入 `miniprogram/` 目录
2. 填写 AppID（替换 `project.config.json` 中的占位符）
3. 修改 `app.js` 中 `API_BASE_URL` 为本地或测试域名
4. 开发阶段可关闭「不校验合法域名」

### 4. 一键脚本（可选）

```bash
scripts\start-dev.bat    # Windows
./scripts/start-dev.sh   # Linux/macOS
```

---

## 七、核心商业规则（硬编码，已确认）

| 规则 | 值 | 配置位置 |
|------|-----|----------|
| VIP 价格 | 188 元 / 30 天 | `server/src/config/constants.js` |
| 匹配节奏 | 每周三、周五 0:00 各 1 次 | `matchCron.js` |
| 择偶配置冷却 | 7 天修改 1 次 | `MATCH_COOLDOWN_DAYS` |
| 分润比例 | 平台 50% + 合伙人 50% | `COMMISSION_RATE: 0.5` |
| 结算周期 | T+7 | `SETTLE_DAYS: 7` |
| 无图片上传 | 用户端彻底禁止 | 全站 |
| 无用户私聊 | 仅对接平台 AI 客服 | 全站 |
| 被匹配对象 | 不要求必须是 VIP | **2026-06-29 已确认** |
| 双向互配 | 必须做 | **2026-06-29 已确认** |

---

## 八、主要目录结构

```
WeFinally婚恋小程序项目/
├── miniprogram/          # 微信小程序（15 页面）
├── server/               # Node.js 后端
│   ├── src/routes/       # API 路由
│   ├── src/services/     # 业务服务
│   ├── src/config/       # 配置（真源）
│   ├── public/admin/     # 管理后台 SPA
│   └── public/partner/   # 合伙人后台 SPA
├── database/init.sql     # 数据库 Schema（单一真源）
├── docs/                 # 部署/API/支付/审核文档
├── scripts/              # 启动脚本
└── project-docs/         # 本交接文档体系
```

详见 `PROJECT_STRUCTURE.md`。

---

## 九、当前存在的问题

### 确定性 Bug

1. 管理后台驳回提现误写 `status=1`（应为驳回状态）
2. `/api/user/cancel` 误用 `marry_report.report_type=1`
3. 隐私日志 `auth_time` 取错列名
4. `user.js` 的 `like_circle_ids || prefer_city` 疑把城市写入圈层字段

### 逻辑与 PRD 偏差（已确认需改）

5. 匹配目前为单向记录，需改为**双向互配**
6. 候选池目前要求双方 VIP，需改为**被匹配对象不要求 VIP**
7. 注册身高用精确 cm，PRD 要求身高区间档位

### 安全

8. JWT 默认密钥 `dev_secret`、CORS=*、wxpay 未鉴权

### 未完成的新需求

9. 外貌描述字段
10. 线下见面安全确认 + 见面安全卡
11. 配置化（12/23 项尚缺）

---

## 十、后续开发路线

### 第一阶段（当前）：文档体系搭建 ✅

建立 `project-docs/` 全套交接文档，不改业务代码。

### 第二阶段：跑通 + 修 Bug + 配置化

- R0：本地跑通并记录
- R1：修确定性 Bug
- R2：配置化收敛（无行为变更）
- R3：安全加固

### 第三阶段：匹配逻辑修正

- 双向互配 + 候选放开非 VIP（专项测试）

### 第四阶段：新功能 MVP

- 外貌描述（profile + match-detail）
- 线下见面安全确认 + 见面安全卡
- 配置 API `GET /api/common/config`

### 第五阶段：上线准备

- 微信支付真密钥、域名、审核材料

详见 `TODO.md` 与 `DEVELOPMENT_PROGRESS.md`。

---

## 十一、文档索引

| 文档 | 路径 |
|------|------|
| Agent 工作规则 | `project-docs/AGENT.md` |
| 老板想法核对 | `project-docs/BOSS_IDEAS_CHECKLIST.md` |
| 需求拆解 | `project-docs/REQUIREMENTS.md` |
| 代码 Review | `project-docs/CODE_REVIEW.md` |
| UI Review | `project-docs/UI_REVIEW.md` |
| 配置设计 | `project-docs/CONFIG_DESIGN.md` |
| AI 匹配研究 | `project-docs/AI_MATCHING_RESEARCH.md` |
| AI 匹配设计 | `project-docs/AI_MATCHING_DESIGN.md` |
| 开发进度 | `project-docs/DEVELOPMENT_PROGRESS.md` |
| 变更日志 | `project-docs/DEVELOPMENT_LOG.md` |
| 待办 | `project-docs/TODO.md` |
| 待确认问题 | `project-docs/QUESTIONS_TO_BOSS.md` |
| 模块文档 | `project-docs/MODULES/` |
| 原项目 README | `README.md` |
| API 文档 | `docs/API-REFERENCE.md` |
| 部署指南 | `docs/deploy-tencent.md` |
