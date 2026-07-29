# WeFinally 云开发方案 A 交接（2026-07-08）

## 1. 最新状态

本轮已把小程序用户端从本地 Express API 切到微信云开发：

```text
wx.cloud.callFunction -> cloudfunctions/api -> 云开发数据库
```

云环境：

```text
cloud1-d4gy8l52g08bba326
```

核心目标是让体验版/真机 demo 不再依赖电脑本地 `3000`、局域网 IP、Docker 或本机 MySQL。

## 2. 主要改动

- `miniprogram/app.js`：初始化 `wx.cloud.init`，禁用旧 `setApiBaseUrl` 本地后端切换。
- `miniprogram/utils/request.js`：保留原 `get/post/put/del` 调用方式，但底层改为云函数。
- `miniprogram/utils/cloudApi.js`：新增统一 `wx.cloud.callFunction` 包装。
- `miniprogram/cloudfunctions/login`：获取微信 openid。
- `miniprogram/cloudfunctions/api`：统一业务云函数，兼容旧 `/api/...` 路由。
- `tools/cloudbase/export-mysql-to-cloud-json.js`：本地 MySQL 导出为云数据库 JSON。
- `tools/cloudbase/demo-system-configs.json`：演示用云端开关。
- `tools/cloudbase/convert-export-to-jsonl.js`：把导出的 JSON 数组转换成微信云开发导入所需 JSON Lines。
- `project-docs/CLOUDBASE_MIGRATION_GUIDE_2026-07-08.md`：云数据库导入指南。
- `project-docs/USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md`：明天 demo 优先使用的测试手册。

## 3. 已覆盖的小程序接口

- 登录/注册/用户资料
- 择偶配置/冷却
- 匹配首页/列表/详情/演示立即匹配
- MiniMax AI 报告手动生成与字段读取；匹配完成后先显示“待生成”，详情页按钮单独生成，避免立即匹配被 LLM 拖到云函数超时
- VIP 信息/演示开通
- AI 客服，官方奔现对接会带 `handoff_ticket_id / match_log_id / match_user_id` 进入客服页
- 见面安全创建/列表/详情/亲友分享/定位/SOS；安全卡按匹配对象独立管理
- 广东110小程序拉起配置
- 平台规则、协议、圈层、激活码、婚姻报备、注销、离异复入

## 4. 演示开关

默认生产逻辑仍不允许手动匹配，也不允许绕过微信支付。

明天 demo 如果要稳定演示，可在云数据库 `system_configs` 打开：

```text
cloud_demo_match_enabled=true
cloud_demo_vip_grant_enabled=true
```

也可以执行 `node tools/cloudbase/convert-export-to-jsonl.js`，再把 `cloudbase-export-jsonl/system_configs.json` 导入 `system_configs`。

效果：

- 用户点击 VIP 购买后，云函数演示授予 30 天 VIP。
- VIP 用户首页显示“开发测试：立即匹配”。
- 候选池为空时，云函数自动补一个演示候选，避免“暂无可用候选”。

演示结束后必须关闭这两个开关。

## 5. 部署步骤

1. 微信开发者工具导入 `miniprogram`。
2. 上传部署 `cloudfunctions/login`，选择“云端安装依赖”。
3. 给 `cloudfunctions/api` 配置 MiniMax 环境变量：

```text
MINIMAX_API_KEY=<MiniMax Key>
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
MINIMAX_TIMEOUT_MS=12000
MINIMAX_MATCH_REPORT_ENABLED=true
```

4. 上传部署 `cloudfunctions/api`，选择“云端安装依赖”。
5. 云开发数据库导入 `cloudbase-export-jsonl/*.json`，或至少导入 demo 开关。
6. Console 执行：

```js
getApp().debugApiHealth()
```

7. 成功后点击“上传”，到微信公众平台设为体验版。

## 6. 验证结果

本轮已跑通：

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\server
npm run selfcheck
npm run selfcheck:cloudbase
```

还需在微信开发者工具手动完成：

- 云函数真实上传部署
- 云数据库真实导入
- 体验版真机扫码
- 广东110真机跳转
- 云数据库需创建 `system_counters` 内部集合；不要创建 `_counters`，微信云数据库不允许下划线开头。

## 7. 未完成/后续优先级

P0：

- 真机验证云函数登录、注册、VIP 演示开通、立即匹配、匹配详情。
- 真机验证 MiniMax AI 报告生成；未配置或超时时应显示兜底报告，不影响匹配。
- 真机验证广东110 `wxf654be7f2931bfcb` 是否能被当前小程序拉起。

P1：

- Web 管理后台、合伙人后台继续使用 Express；后续可迁云托管或独立公网 HTTPS。
- 正式微信支付 JSAPI、支付回调、T+7 分润任务需要继续云化。
- 周三/周五定时匹配需要改成云函数定时触发器。

P2：

- 云数据库字段级隐私、访问审计、短信亲友通知、24h 安全客服值守。
