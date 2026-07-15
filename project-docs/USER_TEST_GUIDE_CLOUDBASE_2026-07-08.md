# WeFinally 云开发体验版测试指南（2026-07-08）

> 这是明天 demo 优先使用的测试手册。旧的 `USER_TEST_GUIDE_2026-07-04.md` 是本地 Express/MySQL 版本，里面的本地 `3000` 和局域网 IP 只保留给后台/本地开发参考。

## 1. 当前结论

小程序用户端已切到微信云开发：

```text
wx.cloud.callFunction -> cloudfunctions/api -> 云开发数据库
```

云环境：

```text
cloud1-d4gy8l52g08bba326
```

体验版/真机不再需要电脑本地后端、Docker、本机 MySQL、`http://电脑IPv4:3000`。

## 2. 上传体验版前准备

1. 微信开发者工具导入：

```text
D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\miniprogram
```

2. 确认 `miniprogram/project.config.json` 里有：

```json
"cloudfunctionRoot": "cloudfunctions/"
```

3. 确认云开发环境是：

```text
cloud1-d4gy8l52g08bba326
```

4. 上传云函数：

```text
cloudfunctions/login -> 右键 -> 上传并部署：云端安装依赖
cloudfunctions/api   -> 右键 -> 上传并部署：云端安装依赖
```

5. Console 测试云函数：

```js
getApp().debugApiHealth()
```

通过标准：弹窗显示“云开发连接成功”，Console 里看到 `pong`。

## 3. 导入云数据库

如果要把当前本地 MySQL 数据迁移到云开发，先在项目根目录执行：

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
node tools/cloudbase/export-mysql-to-cloud-json.js
```

微信云开发导入器要求 JSON Lines（一行一条记录）。先把导出的 JSON 数组转换成导入版：

```bash
node tools/cloudbase/convert-export-to-jsonl.js
```

输出目录：

```text
cloudbase-export-jsonl/
```

然后在微信开发者工具：

1. 打开“云开发”控制台。
2. 进入“数据库”。
3. 按 `project-docs/CLOUDBASE_MIGRATION_GUIDE_2026-07-08.md` 的表映射创建集合。
4. 导入 `cloudbase-export-jsonl/*.json`。
5. 数据库权限设为“仅云函数可读写”或等价安全模式。

## 4. 明天 demo 推荐打开的云端开关

真实生产不能手动匹配，也不能绕过微信支付；但明天给霞姐看 demo 时，需要稳定演示“开 VIP -> 立即匹配 -> 看报告”。因此只在演示环境打开两个云数据库开关。

方式 A：手动新建集合和记录。

集合名：

```text
system_configs
```

记录 1：

```json
{
  "_id": "cloud_demo_match_enabled",
  "key": "cloud_demo_match_enabled",
  "value": "true",
  "enabled": true
}
```

记录 2：

```json
{
  "_id": "cloud_demo_vip_grant_enabled",
  "key": "cloud_demo_vip_grant_enabled",
  "value": "true",
  "enabled": true
}
```

方式 B：导入转换后的现成文件：

```text
cloudbase-export-jsonl/system_configs.json
```

导入到 `system_configs` 集合。

## 4.1 `system_counters` 集合说明

云函数会优先使用 `system_counters` 集合生成递增数字 id。建议创建这个集合：

```text
system_counters
```

权限同样选择：

```text
所有用户不可读写
```

不需要导入任何文件。若未创建，当前云函数也会使用时间戳 id 兜底，不会阻塞注册。

## 4.2 MiniMax AI 报告开关

AI 报告由 `cloudfunctions/api` 云函数调用 MiniMax，不从小程序端直连。

在云函数 `api` 的环境变量里填写：

```text
MINIMAX_API_KEY=<MiniMax Key>
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
MINIMAX_TIMEOUT_MS=12000
MINIMAX_MATCH_REPORT_ENABLED=true
```

保存后重新上传并部署 `cloudfunctions/api`。Key 不要写进源码、不要导入数据库、不要发到前端。

如果你的云开发控制台找不到环境变量入口，明天 demo 可临时改用数据库配置：

1. 打开云开发 -> 数据库 -> `system_configs`。
2. 新增 4 条记录：

```json
{"_id":"minimax_api_key","key":"minimax_api_key","value":"<MiniMax Key>","enabled":true}
{"_id":"minimax_base_url","key":"minimax_base_url","value":"https://api.minimaxi.com/anthropic","enabled":true}
{"_id":"minimax_model","key":"minimax_model","value":"MiniMax-M3","enabled":true}
{"_id":"minimax_timeout_ms","key":"minimax_timeout_ms","value":"12000","enabled":true}
{"_id":"minimax_match_report_enabled","key":"minimax_match_report_enabled","value":"true","enabled":true}
```

3. 重新上传并部署 `cloudfunctions/api`。

正式上线前建议删掉 `minimax_api_key` 这条数据库记录，改回云函数环境变量。

打开后效果：

- 未配置真实微信支付且打开 `cloud_demo_vip_grant_enabled` 时：点击 VIP 购买会演示开通 30 天 VIP。
- 首页出现“开发测试：立即匹配”。
- 候选池为空时，会自动补一个演示候选，避免“暂无可用候选”。

演示结束后请把两个开关删掉或改成 `false`。

## 4.3 微信支付配置说明

真实支付走微信支付 API v3 JSAPI。代码只读取云函数环境变量，不把密钥写入源码、数据库或导出文件。

云函数 `api` 需要配置：

```text
WXPAY_ENABLED=true
WXPAY_APP_ID=wx91c6559ea4490a29
WXPAY_MCH_ID=1747991634
WXPAY_NOTIFY_URL=<CloudBase HTTP 访问里的 /wxpay/notify 公网 HTTPS 地址>
WXPAY_MERCHANT_SERIAL_NO=3AF25390241003BF601241DFBC51C659070061D7
WXPAY_MERCHANT_PRIVATE_KEY_BASE64=<apiclient_key.pem 的 base64 文本>
WXPAY_API_V3_KEY=<32 位 APIv3 密钥>
WXPAY_PUBLIC_KEY_ID=PUB_KEY_ID_0117479916342026071000291646004203
WXPAY_PUBLIC_KEY_BASE64=<微信支付公钥 PEM 的 base64 文本>
PAYMENT_STAGE=test
PAYMENT_TEST_AMOUNT_FEN=1
```

本机可用以下命令检查证书，或把某一项安全复制到剪贴板；脚本不会在终端显示私钥内容：

```powershell
powershell -ExecutionPolicy Bypass -File tools/cloudbase/copy-wechatpay-env.ps1 -Check
powershell -ExecutionPolicy Bypass -File tools/cloudbase/copy-wechatpay-env.ps1 -Name WXPAY_MERCHANT_PRIVATE_KEY_BASE64
```

首次内部真机测试使用 `PAYMENT_STAGE=test` 和 `PAYMENT_TEST_AMOUNT_FEN=1`，实际扣款 1 分。正式发布前必须改成 `PAYMENT_STAGE=production`，此时服务端固定收取 188 元并忽略测试金额。

支付请求会携带微信支付公钥 ID 并校验微信 API 应答签名。客户端确认付款后，服务端除了等待支付通知，还会主动查单；回调延迟时也能确认真实付款并幂等开通 VIP。

没有补齐以上密钥前，可以完成代码部署和自检，但不能做真实收款测试。

## 5. 标准用户端测试顺序

1. 清缓存后重新编译。
2. 登录页点击“微信一键登录”。
3. 勾选三项协议。
4. 完成注册基础信息，包含外貌描述。
5. 进入择偶配置，填写年龄、身高、学历、婚育、三观文本、期待外貌等。
6. 进入 VIP 页，点击 188 元 / 30 天开通。
7. 回首页，点“开发测试：立即匹配”。
8. 打开最近匹配详情，检查综合匹配、字段拆解、外貌匹配。
9. 在 AI 匹配报告区域点击“手动生成AI报告”；如果 MiniMax 较慢，页面会显示“AI报告生成中/刷新进度”，匹配结果不受影响。
10. 点击“申请官方奔现对接”，确认不走用户私聊，而是进入客服页并自动提交对接上下文。
11. 在匹配详情点“线下见面安全确认”，填写当前匹配对象的安全确认。
12. 首页点“安全求助”，确认进入安全记录列表；如果一周有两个约会，应能分别进入各自安全卡。
13. 填完后测试“发送安全确认给亲友”“开启安全守护”“一键呼救 110”。
14. 管理后台/本地后台可继续辅助看数据；小程序体验版本身不依赖本地后台。

## 6. 重新模拟“新用户注册状态”

清微信开发者工具缓存只会清本地 Storage，不会删除云数据库里的真实 openid 用户。

最稳方式：

1. 云开发数据库 `users` 集合里按当前 openid 找到用户，记下数字 `id`。
2. 删除或清理这些集合中与该 `id` 相关的数据：

```text
users
user_match_settings
user_match_logs
user_orders
meet_reports
meet_location_logs
sos_logs
marry_reports
match_handoff_tickets
```

3. 微信开发者工具执行“工具 -> 清除缓存 -> 全部清除”。
4. 重新编译并点击“微信一键登录”。

如果只是想测前端首屏，也可以只清缓存；但同一个微信 openid 在云数据库还存在时，登录会直接回到老用户。

## 7. 广东110测试口径

当前实现不是拨打电话，而是：

```text
SOS 留证 -> wx.navigateToMiniProgram -> 拉起广东110官方小程序
```

广东110 appId：

```text
wxf654be7f2931bfcb
```

注意：

- 微信开发者工具不会真实打开第三方小程序，只会显示跳转成功或底层错误。
- 真实跳转必须用真机预览/体验版测试。
- 如果打不开，会弹出微信底层 errMsg，并引导复制“广东110”去微信搜索。
- 不能对外说“直连公安 110 接警系统”；当前是合规的第三方官方小程序拉起方案。

## 8. 自检命令

本地代码自检：

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目\server
npm run selfcheck
npm run selfcheck:cloudpay
npm run selfcheck:cloudbase
```

静态检查重点：

```bash
cd D:\wefinal\WeFinally婚恋小程序项目\WeFinally婚恋小程序项目
git diff --check
```

通过标准：

- `npm run selfcheck` 退出码为 0。
- `npm run selfcheck:cloudpay` 退出码为 0。
- `npm run selfcheck:cloudbase` 退出码为 0。
- 小程序 `miniprogram/` 内不再出现本地 `127.0.0.1:3000`、局域网 API 或“同一局域网”诊断文案。

## 9. 还没彻底云化的部分

- Web 管理后台和合伙人后台仍是 Express/本地或服务器后端模式。
- T+7 分润定时任务还未迁到云函数/云托管；当前微信支付只覆盖 VIP 下单、支付回调、订单状态确认和开通 VIP。
- 定时匹配任务需要后续接云函数定时触发器。
- 短信通知亲友、24 小时安全客服值守、警企合作直推 110 不在当前 v1 范围。
