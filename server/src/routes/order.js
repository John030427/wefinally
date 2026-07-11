const express = require('express');
const pool = require('../config/db');
const { userAuth } = require('../middleware/auth');
const { requireActiveUser, requireApprovedMember, blockDivorcedUser, debounceMiddleware } = require('../middleware/guard');
const { success, fail } = require('../utils/response');
const { createVipOrder, markOrderPaid } = require('../services/orderService');
const { buildJsapiPayment } = require('../services/wxpayService');
const { VIP_PRICE } = require('../config/constants');

const router = express.Router();

router.use(userAuth, requireActiveUser, blockDivorcedUser, requireApprovedMember);

function formatOrder(row) {
  return {
    order_no: row.order_no,
    amount: Number(row.price),
    price: Number(row.price),
    pay_status: row.pay_status,
    status: row.pay_status,
    settle_status: row.settle_status,
    paid_at: row.pay_time,
    pay_time: row.pay_time,
    created_at: row.create_time,
    create_time: row.create_time,
  };
}

/** POST /api/order/create */
router.post(
  '/create',
  debounceMiddleware((req) => `order:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const order = await createVipOrder(req.auth.id);
      return success(res, {
        order_no: order.order_no,
        amount: VIP_PRICE,
        amount_fen: VIP_PRICE * 100,
        price: VIP_PRICE,
        pay_status: order.pay_status,
        status: order.pay_status,
        message: 'VIP 会员 30 天，188 元，不自动续费',
      });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/order/status/:orderNo */
router.get('/status/:orderNo', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT order_no, price, pay_status, pay_time, create_time
       FROM user_order WHERE order_no = ? AND user_id = ?`,
      [req.params.orderNo, req.auth.id]
    );
    if (rows.length === 0) return fail(res, '订单不存在', 404, 404);
    return success(res, formatOrder(rows[0]));
  } catch (err) {
    next(err);
  }
});

/** GET /api/order/list */
router.get('/list', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT order_no, price, pay_status, pay_time, create_time, settle_status
       FROM user_order WHERE user_id = ? ORDER BY id DESC LIMIT 20`,
      [req.auth.id]
    );
    return success(res, rows.map(formatOrder));
  } catch (err) {
    next(err);
  }
});

/** GET /api/vip/info — miniprogram VIP info (also mount router at /api/vip) */
router.get('/info', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT is_vip, vip_expire_time, free_member, free_source FROM `user` WHERE id = ?',
      [req.auth.id]
    );
    if (rows.length === 0) return fail(res, '用户不存在', 404, 404);
    const user = rows[0];
    const active = user.free_member === 1 || (user.is_vip === 1 && user.vip_expire_time && new Date(user.vip_expire_time) > new Date());
    return success(res, {
      is_vip: active ? 1 : 0,
      isVip: active,
      free_member: user.free_member || 0,
      free_source: user.free_source || '',
      vip_expire_time: user.vip_expire_time,
      expireDate: user.vip_expire_time,
      price: VIP_PRICE,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/vip/purchase */
router.post(
  '/purchase',
  debounceMiddleware((req) => `vip-purchase:${req.auth.id}`),
  async (req, res, next) => {
    try {
      const order = await createVipOrder(req.auth.id);
      const [users] = await pool.query('SELECT openid FROM `user` WHERE id = ?', [req.auth.id]);
      const openid = users[0]?.openid;

      let payment = null;
      if (openid) {
        try {
          payment = await buildJsapiPayment(order.order_no, openid);
        } catch (payErr) {
          console.warn('[vip/purchase] wxpay:', payErr.message);
        }
      }

      if ((payment?.mock || !payment) && process.env.NODE_ENV !== 'production') {
        await markOrderPaid(order.order_no, `MOCK_${Date.now()}`);
        return success(res, {
          order_no: order.order_no,
          amount: VIP_PRICE,
          pay_status: 1,
          payment: null,
          mock_paid: true,
          message: '开发环境已自动完成 Mock 支付',
        });
      }

      return success(res, {
        order_no: order.order_no,
        amount: VIP_PRICE,
        pay_status: order.pay_status,
        payment,
        message: payment ? '请完成微信支付' : '订单已创建，请配置支付后重试',
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
