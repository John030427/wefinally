# WeFinally 云开发接入交付说明（2026-07-08）

## 问题原因

体验版仍然请求本地局域网后端：

```text
http://10.20.154.54:3000
```

手机体验版会报：

```text
request:fail url not in domain list
```

因为体验版/审核版不能依赖开发者工具“不校验合法域名”，也不能访问电脑本地服务。

## 本次方案

小程序端从：

```text
wx.request -> 本地 Express -> 本地 MySQL
```

改为：

```text
wx.cloud.callFunction -> cloudfunctions/api -> 云开发数据库
```

云环境：

```text
cloud1-d4gy8l52g08bba326
```

## 新增云函数

- `miniprogram/cloudfunctions/login`：获取 openid。
- `miniprogram/cloudfunctions/api`：统一业务入口，支持 `ping` 和兼容旧 `/api/...` 路由的 `request` action。

## 已覆盖的小程序接口

已在云函数 route adapter 中覆盖：

- 登录：`/api/auth/wx-login`
- 注册与资料：`/api/user/register`、`/api/user/profile`
- 择偶：`/api/match/setting`、`/api/match/setting/cooldown`
- 匹配：`/api/match/latest`、`/api/match/list`、`/api/match/detail`、`/api/match/start`、`/api/match/handoff`
- VIP：`/api/vip/info`、`/api/vip/purchase`
- 客服：`/api/chat/history`、`/api/chat/send`
- 见面安全：`/api/meet/create`、`/api/meet/list`、`/api/meet/:id`、`/api/meet/share/:token`、`/api/meet/:id/location`、`/api/meet/:id/finish`、`/api/meet/:id/sos`、`/api/meet/sos`
- 规则与公共配置：`/api/common/circles`、`/api/common/promote-code`、`/api/common/agreements`、`/api/common/safety-config`、`/api/common/config`、`/api/platform/rules`、`/api/platform/marry-stat`
- 低频用户动作：婚姻报备、账号注销、激活码兑换、离异复入申请。

## 尚需继续云化的部分

- Web 管理后台 `/admin` 和合伙人后台 `/partner` 仍是 Express 静态站 + 后端 API 模式。
- 微信支付正式 JSAPI、支付回调、T+7 分润定时任务仍需后续云化/云托管。
- 周三/周五定时匹配任务原来由 `node-cron` 执行；云开发方案下应改成云函数定时触发器。

## 云函数部署步骤

1. 打开微信开发者工具。
2. 导入 `miniprogram` 目录。
3. 确认 AppID：`wx91c6559ea4490a29`。
4. 确认云开发环境：`cloud1-d4gy8l52g08bba326`。
5. 左侧找到 `cloudfunctions/login`。
6. 右键选择“上传并部署：云端安装依赖”。
7. 左侧找到 `cloudfunctions/api`。
8. 右键选择“上传并部署：云端安装依赖”。
9. 到云开发控制台查看云函数日志。
10. 在小程序 Console 执行：

```js
getApp().debugApiHealth()
```

期望看到 `pong`。

## 数据库导入步骤

详见：

```text
project-docs/CLOUDBASE_MIGRATION_GUIDE_2026-07-08.md
```

核心命令：

```bash
node tools/cloudbase/export-mysql-to-cloud-json.js
```

然后将 `cloudbase-export/*.json` 导入对应集合。

## 上传体验版

1. 确认 `cloudfunctions/login` 和 `cloudfunctions/api` 已部署。
2. 确认云数据库集合已创建并导入。
3. 如需明天 demo，导入 `tools/cloudbase/demo-system-configs.json` 到 `system_configs`，打开演示 VIP 和演示立即匹配。
4. 微信开发者工具点击“上传”。
5. 微信公众平台 → 管理 → 版本管理 → 开发版本 → 设为体验版。
6. 手机扫码测试。

详细测试顺序见：

```text
project-docs/USER_TEST_GUIDE_CLOUDBASE_2026-07-08.md
```

## 风险点

- 云数据库权限必须收紧，不能开放客户端任意写。
- 原 MySQL 的复杂 join/事务已转成云函数逻辑，需继续做真机回归。
- 支付和定时任务还没有彻底云化。
- 云函数免费额度、超时、并发限制需要上线前评估。
- 隐私协议、定位权限、见面安全提示仍需审核前复核。
