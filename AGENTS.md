# AGENTS.md — WeFinally 婚恋小程序（给执行 agent 的背景与规矩）

你正处在**代码根目录**（双层同名嵌套：`D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\`）。`miniprogram/`、`server/`、`database/`、`project-docs/` 都在这一层。

## 这是什么
纯结婚导向的严肃婚恋微信小程序。原生小程序 + Node/Express + MySQL8 + node-cron。无图片/无头像、用户间无私聊、官方客服对接奔现、50 圈层合伙人 50/50 分润。

## 先读这些（单一真源，别从零猜）
- `project-docs/README_HANDOVER.md` — 总交接入口
- `project-docs/AGENT.md` — 工作规矩（最高优先级原则、禁止事项、UI 复用）
- `project-docs/BOSS_IDEAS_CHECKLIST.md` — 老板原话（A 组=最高优先级，含新需求 A7-A9）
- `project-docs/QUESTIONS_TO_BOSS.md` — 已确认/待确认决策
- `project-docs/MODULES/` — 各模块规格
- `project-docs/DEVELOPMENT_LOG.md` — 变更流水（每次改完追加一条）

## 当前要做的任务
按这两份计划执行（**先 13 后 11，同一个 agent 顺序做，不要并行**），**按 Task 顺序、每个 Task 一个 commit、跑计划里的验收**：
- `plan-module13-free-whitelist.md` — 批量导入 + 公职/教师/医护免费白名单
- `plan-module11-meet-safety.md` — 见面安全 110 方案一

> 两份计划唯一的共享文件是 `miniprogram/pages/profile/`（各加一个菜单项：13 加「公益免费认证」、11 加「见面安全记录」）——顺序做、两个菜单项都保留、不要互相覆盖。其余文件不重叠。
> 跑完两份后，把结果各追加一条到 `project-docs/DEVELOPMENT_LOG.md`，等人工 review。

## 硬约束（违反即返工）
- **不改**：`orderService` 分润、支付流程、`matchCron` 周三/五节奏、`database/init.sql` 已上线结构（要改表写新 `database/patch-*.sql`）、`app.wxss` 设计系统。
- 红线：用户端无图片上传、用户间无私聊；LBS 必须用户主动授权、不后台静默采集；不宣称"直连110"。
- **复用现有 UI**，不为新功能重做一套。小步改，不大重构。
- 不确定是否老板原意 → 写进 `QUESTIONS_TO_BOSS.md`，**不要猜着实现**。
- ⚠️ 豆包文档里的"单身人数/单身率/数据来源"未经核实，**禁止写进小程序或宣传文案**。

## 本地环境（已就绪）
- 数据库：Docker 容器 `wefinally-mysql`（mysql:8.0，root 密码 `wefinally123`，库 `wefinally`，端口 3306）。开机后 `docker start wefinally-mysql`。导库：`docker exec -i wefinally-mysql mysql -uroot -pwefinally123 wefinally < database/xxx.sql`。
- 后端：`server/.env` 已配（`DB_PASSWORD=wefinally123`）；`cd server && npm install && node src/app.js`；健康检查 `GET http://localhost:3000/api/common/health`。
- 后台账号：`admin / admin123456`。
- 已是 git 仓库；提交沿用现有 author 风格即可。

## 验收习惯
项目无测试框架 → 用计划里给的 **curl / node 自包含脚本** 连本地库验收；非平凡逻辑留一个能跑的自检。改完更新 `DEVELOPMENT_LOG.md`，实际与计划不符处以代码为准并注明。
