# WeFinally CloudBase WeChat Pay Design

## Decision

Build the first real payment version on the current CloudBase mini program stack, using WeChat Pay API v3 JSAPI payment.

The current user-facing mini program already routes requests through:

```text
wx.cloud.callFunction -> miniprogram/cloudfunctions/api -> CloudBase database
```

The payment work should keep that path for authenticated mini program requests. We will add a separate HTTPS-accessible notify entry for WeChat Pay callbacks, because WeChat Pay needs to call a public `notify_url`.

The design must not store payment secrets in source code, database fixtures, mini program code, or logs. It will leave environment variable names and deployment instructions only. Xiajie or the merchant super administrator will provide the real merchant credentials later.

## Current Problem

`POST /api/vip/purchase` currently creates a `user_orders` record and then returns `payment: null`. If the demo flag `cloud_demo_vip_grant_enabled` is enabled, the cloud function grants VIP directly without real payment. If that flag is disabled, the mini program displays "支付暂未配置".

That means the current experience version cannot show the WeChat cashier, cannot receive payment callbacks, and cannot prove that VIP was opened by a real paid order.

The old Express implementation under `server/src/routes/wxpay.js` uses the older XML/MD5 payment style and is tied to local/server MySQL. It is not used by the current CloudBase experience version and should not be copied into the CloudBase mini program path.

## Goals

- Create real WeChat Pay API v3 JSAPI orders for the 188 yuan / 30 day VIP product.
- Return valid `wx.requestPayment` parameters to the mini program.
- Keep the authoritative price on the server. The client cannot choose amount, product name, commission, or VIP days.
- Receive and verify WeChat Pay callbacks.
- Decrypt callback resources with the APIv3 key.
- Validate `appid`, `mchid`, `out_trade_no`, `transaction_id`, currency, amount, and payment success state before opening VIP.
- Make callback processing idempotent. Repeated WeChat retries must not grant VIP twice.
- Add a mini program order-status refresh path so the client only shows final success after the backend marks the order paid.
- Disable or clearly isolate demo VIP granting when real payment is enabled.
- Keep the core payment logic portable so later migration from CloudBase to Tencent Cloud CVM, Cloud Run, or another HTTPS server only changes adapters.

## Non-Goals For This Phase

- Automated refunds in the mini program.
- T+7 partner settlement automation.
- Admin refund review workflow.
- Merchant platform operation automation.
- Changing the current VIP product price or duration.
- Migrating the whole web admin backend.
- Storing real merchant private keys or APIv3 keys in the repository.

Refunds and settlement remain manual merchant/admin operations in phase 1.

## Architecture

### Mini Program Authenticated Path

The VIP page continues to call:

```text
POST /api/vip/purchase
GET /api/order/status
```

through the existing `miniprogram/utils/request.js` wrapper and the CloudBase `api` cloud function.

`vip.purchase` will:

1. Load the current user from `wxContext.OPENID`.
2. Create a pending `user_orders` record.
3. Use server-side payment configuration to call `/v3/pay/transactions/jsapi`.
4. Save the returned `prepay_id`.
5. Return mini program payment parameters:

```js
{
  timeStamp,
  nonceStr,
  package: "prepay_id=...",
  signType: "RSA",
  paySign,
  order_no
}
```

The mini program will call `wx.requestPayment()` with these values.

### WeChat Pay Callback Path

Add a public HTTPS callback endpoint as an independent CloudBase HTTP function or HTTP-accessible function route. This endpoint is used only for WeChat Pay notifications.

The callback handler will:

1. Read the raw request body and WeChat Pay signature headers.
2. Verify the WeChat Pay signature using the configured WeChat Pay public key.
3. Decrypt `resource.ciphertext` with the APIv3 key using AES-256-GCM.
4. Validate the decrypted transaction against the local order.
5. Atomically mark the order paid and open VIP.
6. Return WeChat Pay's expected success response quickly.

If verification, decryption, validation, or database update fails, return a failure response so WeChat Pay retries.

### Portable Core

Payment signing, response verification, callback decryption, amount validation, and payment parameter generation should live in small modules under the CloudBase function, not inside page code.

The CloudBase-specific pieces should be limited to:

- Reading `wxContext.OPENID`.
- Reading `process.env`.
- Reading/writing CloudBase collections.
- Exposing the callback through CloudBase HTTP access.

If the project later moves to a Tencent Cloud server, the reusable core can be reused behind an Express/Koa route. The changed pieces would be:

- Mini program request base: `wx.cloud.callFunction` becomes `wx.request` to an HTTPS API.
- Callback URL: CloudBase HTTP URL becomes the server domain callback URL.
- Database adapter: CloudBase database operations become MySQL or another server database.
- Secret storage: CloudBase environment variables become server environment variables or Tencent Cloud secret manager.

The payment state machine and WeChat Pay API v3 signing rules remain the same.

## Data Model

Continue using the CloudBase `user_orders` collection mapped by `user_order`.

Required fields for new paid orders:

- `order_no`: merchant order number, unique.
- `user_id`: local numeric user id.
- `openid`: payer openid at order creation time.
- `price`: human-readable yuan amount, currently `188`.
- `amount_total`: integer amount in fen, production `18800`.
- `currency`: `CNY`.
- `vip_days`: `30`.
- `pay_status`: `0` pending, `1` paid, `2` closed or failed.
- `trade_state`: WeChat trade state when known.
- `prepay_id`: returned by JSAPI order creation.
- `transaction_id`: WeChat transaction id after payment.
- `pay_time`: WeChat success time or local callback time.
- `notify_received_at`: callback receive time.
- `pay_error`: last safe error message, without secrets.
- `partner_commission`: current business value, `94`.
- `platform_income`: current business value, `94`.
- `circle_id`: copied from user.
- `partner_id`: copied from user.
- `settle_status`: existing settlement status, initially `0`.
- `create_time` and `update_time`.

The implementation should not trust any client-sent amount or product fields.

## Payment State Machine

```text
created/pending
  -> prepay_created
  -> user_cancelled locally, still pending on server
  -> paid by verified callback
  -> failed/closed only after explicit close/query result
```

The backend is authoritative. Client-side `wx.requestPayment` success means only "WeChat cashier returned success to the client"; VIP is considered active only after the backend marks the order paid.

If the callback is delayed, the mini program should show a processing state and let the user refresh.

## VIP Granting Rules

When a verified paid order is processed:

1. If the order is already paid, return success without modifying VIP again.
2. If the order is pending and validation passes, set `pay_status = 1`, record transaction fields, and grant VIP.
3. VIP expiration extends from the later of current active expiration or now.
4. Extension length is exactly 30 days for this product.

Demo granting remains available only when real payment is not enabled and the explicit demo flag is enabled. When real payment config is enabled, `cloud_demo_vip_grant_enabled` must not grant paid VIP.

## Environment Variables

Leave these placeholders for CloudBase environment variables:

```text
WXPAY_ENABLED=true
WXPAY_APP_ID=wx91c6559ea4490a29
WXPAY_MCH_ID=1747991634
WXPAY_NOTIFY_URL=<public https callback url>
WXPAY_MERCHANT_SERIAL_NO=<merchant api cert serial number>
WXPAY_MERCHANT_PRIVATE_KEY_BASE64=<base64 of apiclient_key.pem>
WXPAY_API_V3_KEY=<32-character APIv3 key, never committed>
WXPAY_PUBLIC_KEY_ID=<PUB_KEY_ID_...>
WXPAY_PUBLIC_KEY_BASE64=<base64 of wxp_pub.pem>
PAYMENT_STAGE=production
PAYMENT_TEST_AMOUNT_FEN=1
```

`PAYMENT_TEST_AMOUNT_FEN` is honored only when `PAYMENT_STAGE=test`. In production, the amount is always `18800`.

If Xiajie cannot provide certificates immediately, code can still be implemented and tested with local fixtures, but real payment deployment must wait for the environment variables.

## Security And Compliance

- Do not print APIv3 key, merchant private key, public key content, payment signatures, or decrypted callback payloads in logs.
- Do not put secrets in mini program files, CloudBase database records, exported JSON, `.env.example`, screenshots, or handoff docs.
- Verify callbacks before decrypting and processing business state.
- Validate amount and merchant identifiers after decrypting.
- Treat callback processing as idempotent because WeChat Pay retries callbacks.
- Keep database permissions as "cloud functions only" for payment collections.
- Keep demo payment and production payment mutually exclusive.
- Use official merchant platform credentials only. Do not use APIv2 keys for this phase.

## Frontend Behavior

The VIP page should show four user-facing states:

- Creating order.
- WeChat payment popup active.
- Payment processing, waiting for backend confirmation.
- Paid and VIP activated.

If the user cancels the WeChat cashier, show "已取消支付" and do not grant VIP.

If payment returns success but the callback is delayed, show a processing message and offer refresh/retry order-status check. Do not show "开通成功" until backend status confirms paid VIP.

## Testing

The implementation should use test-first development for payment utility modules and handlers.

Minimum automated coverage:

- API v3 authorization signature string and RSA signing use the expected fields.
- Mini program `paySign` generation signs `appId`, `timeStamp`, `nonceStr`, and `prepay_id`.
- APIv3 callback AES-256-GCM decryption succeeds for a fixture and fails with a wrong key.
- Callback handler rejects wrong `mchid`, wrong `appid`, wrong amount, wrong currency, and missing order.
- Callback handler is idempotent and does not extend VIP twice.
- `vip.purchase` refuses real payment when required config is missing, except explicit demo mode.
- `vip.purchase` uses `18800` fen in production regardless of client input.
- Order status endpoint returns pending/paid states only for the current user's own order.
- VIP page waits for backend confirmation after `wx.requestPayment`.

Manual verification after merchant credentials are available:

1. Deploy CloudBase `api` and payment callback function.
2. Set all environment variables in CloudBase.
3. Configure the callback URL in WeChat Pay merchant platform if required by the selected callback path.
4. Use a test amount only in `PAYMENT_STAGE=test`.
5. Confirm `wx.requestPayment` opens on a real device.
6. Confirm callback marks the order paid.
7. Confirm VIP expiration appears in the mini program.
8. Confirm user cancel does not open VIP.

## Rollout

Phase 1 implementation can be completed before Xiajie provides credentials.

Before real-money testing:

- Xiajie must provide the APIv3 key, merchant API certificate private key, merchant certificate serial number, WeChat Pay public key, and WeChat Pay public key id.
- The callback URL must be publicly reachable.
- Payment product permission must be enabled for merchant `1747991634`.
- The merchant account must be bound to mini program AppID `wx91c6559ea4490a29`.

First real test should use either the official smallest accepted amount in a test environment or the real amount after business confirmation. Production code must not silently charge 1 fen.

## Alternative Considered: CloudBase Payment Integration Center

CloudBase also provides a WeChat Pay integration that can generate a payment HTTP function and callback URL. It can be useful later if the team wants CloudBase to host more of the payment wrapper.

For this project phase, keep payment integrated into the existing WeFinally order and VIP logic instead of switching the whole payment flow to a generated function. This avoids splitting the authoritative order state between a generated payment service and the existing `user_orders` / `user` collections. The integration-center idea remains compatible as a later adapter, as long as callback business handling still updates the same order state machine.

## Sources Checked

- WeChat Pay JSAPI/mini program order API v3: `/v3/pay/transactions/jsapi`.
- WeChat Pay APIv3 key guidance: 32-character key, used for callback/platform certificate decryption, cannot be viewed after setup.
- WeChat Pay development parameters: merchant API certificate private key signs APIv3 requests; merchant certificate serial number is required; WeChat Pay public key is recommended for verification.
- CloudBase HTTP function and payment integration documentation: CloudBase can expose HTTP callback routes and can also generate a payment integration, but business callback handling still needs to update the project's database idempotently.
