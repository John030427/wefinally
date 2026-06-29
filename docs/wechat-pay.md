# WeFinally 微信支付对接指南

本文档说明 WeFinally 婚恋小程序接入 **微信支付 JSAPI（小程序支付）** 的完整流程，对应 188 元/30 天 VIP 会员套餐。

---

## 一、支付业务规则（硬编码）

| 规则 | 值 |
|------|-----|
| 套餐 | 188 元 / 30 天 |
| 自动续费 | 无 |
| 分润比例 | 平台 50% + 推广合伙人 50%（代码写死） |
| 结算周期 | T+7（Cron 自动结算） |
| 支付方式 | 微信小程序 JSAPI |

---

## 二、前置条件

1. **微信小程序** 已认证（企业主体）
2. **微信商户号** 已开通，并与小程序 AppID 绑定
3. 服务器 **HTTPS** 已部署（回调 URL 必须公网 HTTPS）
4. 后端 `server/.env` 可配置支付密钥

绑定路径：**微信支付商户平台 → 产品中心 → AppID 账号管理 → 关联小程序 AppID**

---

## 三、商户平台配置

### 3.1 获取商户号与 API 密钥

登录 [微信支付商户平台](https://pay.weixin.qq.com/)：

| 参数 | 说明 | 对应 .env |
|------|------|-----------|
| 商户号 mchid | 10 位数字 | `WX_MCH_ID` |
| APIv3 密钥 | 32 位字符串 | `WX_API_V3_KEY` |
| 商户 API 证书 | apiclient_key.pem | 存放于 `server/certs/` |
| 证书序列号 | 商户平台查看 | `WX_CERT_SERIAL` |

### 3.2 设置支付回调 URL

**产品中心 → 开发配置 → 支付配置 → Native/JSAPI 回调链接**（以平台实际入口为准）：

```
https://api.yourdomain.com/api/wxpay/notify
```

须与 `.env` 中 `WX_NOTIFY_URL` 完全一致。

---

## 四、后端环境变量

在 `server/.env` 添加：

```env
# 微信支付
WX_MCH_ID=1234567890
WX_API_V3_KEY=your32CharApiV3Keyxxxxxxxxxxxx
WX_CERT_SERIAL=证书序列号十六进制
WX_NOTIFY_URL=https://api.yourdomain.com/api/wxpay/notify

# 证书路径（相对 server 目录）
WX_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
WX_PLATFORM_CERT_PATH=./certs/wechatpay_platform.pem
```

将商户 API 私钥 `apiclient_key.pem` 上传至 `server/certs/`，**勿提交到 Git**。

---

## 五、支付流程说明

```
用户点击购买 VIP
    ↓
小程序 POST /api/order/create
    ↓
后端创建 orders 记录（status=待支付）
    ↓
后端调用微信「统一下单」API 获取 prepay_id
    ↓
返回支付参数给小程序
    ↓
wx.requestPayment() 调起支付
    ↓
用户支付成功
    ↓
微信 POST /api/wxpay/notify（异步通知）
    ↓
后端验签 → 更新订单 status=已付 → 延长 VIP 有效期 → 记录分润
    ↓
T+7 后 Cron 结算合伙人可提现余额
```

---

## 六、小程序端调用示例

```javascript
// 1. 创建订单
const { order_no, payParams } = await request.post('/order/create');

// 2. 调起支付
wx.requestPayment({
  timeStamp: payParams.timeStamp,
  nonceStr: payParams.nonceStr,
  package: payParams.package,
  signType: payParams.signType || 'RSA',
  paySign: payParams.paySign,
  success() {
    wx.showToast({ title: '支付成功' });
    // 可轮询 /api/order/status 确认
  },
  fail(err) {
    if (err.errMsg !== 'requestPayment:fail cancel') {
      wx.showToast({ title: '支付失败', icon: 'none' });
    }
  }
});
```

---

## 七、后端关键接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/order/create` | POST | 创建 188 元订单，返回 prepay 参数 |
| `/api/order/status/:orderNo` | GET | 查询订单支付状态 |
| `/api/wxpay/notify` | POST | 微信支付异步通知（raw body 验签） |

### 7.1 幂等与防重复

- 订单号 `order_no` 全局唯一（`WF` + 时间戳 + 随机）
-  notify 处理须判断订单是否已支付，避免重复加 VIP
- 接口层已配置 debounce / 限流

### 7.2 分润记录

支付成功后写入：

- `partner_commission` = 94.00（50%）
- `platform_amount` = 94.00（50%）
- `promote_partner_id` = 用户注册时锁定的推广合伙人

---

## 八、本地与沙箱调试

1. 微信开发者工具 → 打开真机调试（模拟器无法真实支付）
2. 使用 **0.01 元测试**（需商户号开通测试权限，或在代码中临时改价仅限 dev 环境）
3. 支付回调需公网 URL，本地可用 **ngrok / 内网穿透** 临时映射：

```bash
ngrok http 3000
# 将 https://xxx.ngrok.io/api/wxpay/notify 填入商户平台（仅调试）
```

---

## 九、对账与异常处理

### 9.1 商户平台对账

**交易中心 → 账单管理** 下载交易账单，与 `orders` 表 `wx_transaction_id` 核对。

### 9.2 常见问题

| 问题 | 排查 |
|------|------|
| 调起支付失败 | AppID 与商户号未绑定；prepay_id 过期 |
| 回调未收到 | notify URL 非 HTTPS；防火墙拦截；验签失败 |
| 已支付但 VIP 未生效 | 查 server 日志；手动核对 orders 表 status |
| 分润未结算 | T+7 Cron 是否运行；PM2 进程是否正常 |

### 9.3 退款说明

WeFinally 规则：**违规封号不退会员费**。正常退款需走微信退款 API，当前版本以业务规则为准，如需退款功能需单独开发。

---

## 十、安全要求

- [ ] API 私钥仅存放在服务器，不入库、不进 Git
- [ ] notify 接口必须验签（APIv3 微信平台证书）
- [ ] 生产环境关闭测试改价逻辑
- [ ] 定期轮换 APIv3 密钥（商户平台可重置）
- [ ] 日志中不打印完整 prepay_key / 用户 openid

---

## 十一、上线检查清单

- [ ] 小程序与商户号已绑定
- [ ] `.env` 支付参数完整
- [ ] 证书文件已上传至 `server/certs/`
- [ ] notify URL 已在商户平台配置且可访问
- [ ] 真机完成 188 元（或测试金额）全流程支付
- [ ] 支付成功后 VIP 到期时间正确
- [ ] 有推广合伙人的订单分润字段正确
- [ ] T+7 结算任务正常运行

完成以上步骤后，WeFinally 即可正式收取会员费用。
