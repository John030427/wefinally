const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('../config/db');
const { userAuth } = require('../middleware/auth');
const { markOrderPaid } = require('../services/orderService');
const { md5, randomNonce } = require('../utils/crypto');
const { VIP_PRICE } = require('../config/constants');

const router = express.Router();

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

/** POST /api/wxpay/unified */
router.post('/unified', userAuth, async (req, res, next) => {
  try {
    const { order_no, openid } = req.body;
    if (!order_no || !openid) {
      return res.status(400).json({ code: 1, message: '缺少 order_no 或 openid' });
    }

    const [orders] = await pool.query(
      'SELECT * FROM user_order WHERE order_no = ?',
      [order_no]
    );
    if (orders.length === 0) {
      return res.status(404).json({ code: 1, message: '订单不存在' });
    }
    const order = orders[0];
    if (order.user_id !== req.auth.id) {
      return res.status(403).json({ code: 403, message: '无权操作此订单' });
    }
    if (Number(order.price) !== VIP_PRICE) {
      return res.status(400).json({ code: 1, message: '订单金额异常' });
    }

    const mchId = process.env.WXPAY_MCH_ID;
    const apiKey = process.env.WXPAY_API_KEY;
    const appid = process.env.WX_APPID;
    const notifyUrl = process.env.WXPAY_NOTIFY_URL;

    if (!mchId || !apiKey || !appid) {
      const prepayId = `mock_prepay_${order_no}`;
      return res.json({
        code: 0,
        data: {
          mock: true,
          appId: appid || 'mock_appid',
          timeStamp: String(Math.floor(Date.now() / 1000)),
          nonceStr: randomNonce(16),
          package: `prepay_id=${prepayId}`,
          signType: 'MD5',
          paySign: 'MOCK_SIGN',
        },
      });
    }

    const params = {
      appid,
      mch_id: mchId,
      nonce_str: randomNonce(32),
      body: 'WeFinally VIP会员',
      out_trade_no: order_no,
      total_fee: VIP_PRICE * 100,
      spbill_create_ip: '127.0.0.1',
      notify_url: notifyUrl,
      trade_type: 'JSAPI',
      openid,
    };
    params.sign = buildSign(params, apiKey);

    const xmlBody = buildXml(params);
    const { data: wxRes } = await axios.post(
      'https://api.mch.weixin.qq.com/pay/unifiedorder',
      xmlBody,
      { headers: { 'Content-Type': 'text/xml' } }
    );

    const parsed = parseXml(wxRes);
    if (parsed.return_code !== 'SUCCESS' || parsed.result_code !== 'SUCCESS') {
      return res.status(500).json({ code: 1, message: parsed.err_code_des || parsed.return_msg });
    }

    const payParams = {
      appId: appid,
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: randomNonce(16),
      package: `prepay_id=${parsed.prepay_id}`,
      signType: 'MD5',
    };
    payParams.paySign = buildSign(payParams, apiKey);

    return res.json({ code: 0, data: payParams });
  } catch (err) {
    next(err);
  }
});

/** POST /api/wxpay/notify */
router.post('/notify', async (req, res) => {
  try {
    const xml = Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body || '');
    const data = parseXml(xml);

    if (data.return_code !== 'SUCCESS') {
      return res.send(buildXml({ return_code: 'FAIL', return_msg: '通信失败' }));
    }

    const apiKey = process.env.WXPAY_API_KEY;
    if (process.env.NODE_ENV === 'production' && !apiKey) {
      console.error('[wxpay notify] 生产环境缺少 WXPAY_API_KEY，拒绝处理回调');
      return res.send(buildXml({ return_code: 'FAIL', return_msg: '支付未正确配置' }));
    }
    if (apiKey) {
      const sign = data.sign;
      const computed = buildSign(data, apiKey);
      if (sign !== computed) {
        return res.send(buildXml({ return_code: 'FAIL', return_msg: '签名错误' }));
      }
    }

    if (data.result_code === 'SUCCESS') {
      await markOrderPaid(data.out_trade_no, data.transaction_id);
    }

    return res.send(buildXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
  } catch (err) {
    console.error('[wxpay notify]', err.message);
    return res.send(buildXml({ return_code: 'FAIL', return_msg: err.message }));
  }
});

/** POST /api/wxpay/mock-pay — dev only */
router.post('/mock-pay', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ code: 1, message: '生产环境不可用' });
    }
    const { order_no } = req.body;
    const txId = `MOCK_${crypto.randomBytes(8).toString('hex')}`;
    const result = await markOrderPaid(order_no, txId);
    return res.json({ code: 0, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
