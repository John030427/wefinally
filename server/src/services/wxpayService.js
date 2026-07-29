const axios = require('axios');
const pool = require('../config/db');
const { markOrderPaid } = require('./orderService');
const { md5, randomNonce } = require('../utils/crypto');
const { VIP_PRICE } = require('../config/constants');

function buildSign(params, apiKey) {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '' && k !== 'sign')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return md5(`${sorted}&key=${apiKey}`).toUpperCase();
}

function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>([^<]*)<\/\3>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const key = m[1] || m[3];
    result[key] = m[2] || m[4];
  }
  return result;
}

function buildXml(obj) {
  let xml = '<xml>';
  for (const [k, v] of Object.entries(obj)) {
    xml += `<${k}><![CDATA[${v}]]></${k}>`;
  }
  xml += '</xml>';
  return xml;
}

/**
 * 生成小程序 wx.requestPayment 参数
 */
async function buildJsapiPayment(orderNo, openid) {
  const [orders] = await pool.query(
    'SELECT * FROM user_order WHERE order_no = ?',
    [orderNo]
  );
  if (orders.length === 0) throw new Error('订单不存在');
  const order = orders[0];
  if (Number(order.price) !== VIP_PRICE) throw new Error('订单金额异常');

  const mchId = process.env.WXPAY_MCH_ID;
  const apiKey = process.env.WXPAY_API_KEY;
  const appid = process.env.WX_APPID;
  const notifyUrl = process.env.WXPAY_NOTIFY_URL;

  if (!mchId || !apiKey || !appid) {
    const prepayId = `mock_prepay_${orderNo}`;
    return {
      mock: true,
      appId: appid || 'mock_appid',
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: randomNonce(16),
      package: `prepay_id=${prepayId}`,
      signType: 'MD5',
      paySign: 'MOCK_SIGN',
    };
  }

  const params = {
    appid,
    mch_id: mchId,
    nonce_str: randomNonce(32),
    body: 'WeFinally VIP会员',
    out_trade_no: orderNo,
    total_fee: VIP_PRICE * 100,
    spbill_create_ip: '127.0.0.1',
    notify_url: notifyUrl,
    trade_type: 'JSAPI',
    openid,
  };
  params.sign = buildSign(params, apiKey);

  const { data: wxRes } = await axios.post(
    'https://api.mch.weixin.qq.com/pay/unifiedorder',
    buildXml(params),
    { headers: { 'Content-Type': 'text/xml' } }
  );

  const parsed = parseXml(wxRes);
  if (parsed.return_code !== 'SUCCESS' || parsed.result_code !== 'SUCCESS') {
    throw new Error(parsed.err_code_des || parsed.return_msg || '微信下单失败');
  }

  const payParams = {
    appId: appid,
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: randomNonce(16),
    package: `prepay_id=${parsed.prepay_id}`,
    signType: 'MD5',
  };
  payParams.paySign = buildSign(payParams, apiKey);
  return payParams;
}

module.exports = {
  buildJsapiPayment,
  buildSign,
  parseXml,
  buildXml,
};
