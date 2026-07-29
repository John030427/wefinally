const pool = require('../config/db');
const { VIP_PRICE, COMMISSION_RATE } = require('../config/constants');
const { generateOrderNo } = require('../utils/crypto');

const PAY_PENDING = 0;
const PAY_PAID = 1;

/**
 * Create VIP order — idempotent by pending order per user.
 * 50/50 split: partner_commission + platform_income.
 */
async function createVipOrder(userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [users] = await conn.query(
      'SELECT id, promote_partner_id, circle_id FROM `user` WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (users.length === 0) throw new Error('用户不存在');
    const user = users[0];

    const [pending] = await conn.query(
      `SELECT * FROM user_order
       WHERE user_id = ? AND pay_status = ? AND price = ?
       ORDER BY id DESC LIMIT 1`,
      [userId, PAY_PENDING, VIP_PRICE]
    );

    if (pending.length > 0) {
      await conn.commit();
      return pending[0];
    }

    const orderNo = generateOrderNo();
    const commission = Math.round(VIP_PRICE * COMMISSION_RATE * 100) / 100;
    const platform = Math.round((VIP_PRICE - commission) * 100) / 100;

    const [result] = await conn.query(
      `INSERT INTO user_order
       (user_id, order_no, price, partner_commission, platform_income,
        circle_id, partner_id, pay_status, settle_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        userId,
        orderNo,
        VIP_PRICE,
        commission,
        platform,
        user.circle_id || 1,
        user.promote_partner_id || 0,
        PAY_PENDING,
      ]
    );

    const [orders] = await conn.query('SELECT * FROM user_order WHERE id = ?', [result.insertId]);
    await conn.commit();
    return orders[0];
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Mark order paid — idempotent on order_no.
 */
async function markOrderPaid(orderNo, wxTransactionId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(
      'SELECT * FROM user_order WHERE order_no = ? FOR UPDATE',
      [orderNo]
    );
    if (orders.length === 0) throw new Error('订单不存在');
    const order = orders[0];

    if (order.pay_status === PAY_PAID) {
      await conn.commit();
      return { order, alreadyPaid: true };
    }

    if (order.pay_status !== PAY_PENDING) {
      throw new Error('订单状态不可支付');
    }

    await conn.query(
      `UPDATE user_order SET pay_status = ?, pay_time = NOW() WHERE id = ?`,
      [PAY_PAID, order.id]
    );

    const { VIP_DAYS } = require('../config/constants');
    const [users] = await conn.query(
      'SELECT is_vip, vip_expire_time FROM `user` WHERE id = ?',
      [order.user_id]
    );
    const current = users[0]?.vip_expire_time;
    const base = current && new Date(current) > new Date() ? new Date(current) : new Date();
    const expire = new Date(base);
    expire.setDate(expire.getDate() + VIP_DAYS);

    await conn.query(
      `UPDATE \`user\` SET is_vip = 1, vip_expire_time = ?, status = 1
       WHERE id = ? AND status IN (0, 1)`,
      [expire, order.user_id]
    );

    if (order.partner_id > 0 && order.partner_commission > 0) {
      await conn.query(
        `UPDATE \`partner\` SET total_commission = total_commission + ?
         WHERE id = ? AND status = 1`,
        [order.partner_commission, order.partner_id]
      );
      await conn.query(
        'UPDATE `partner` SET total_promote_vip = total_promote_vip + 1 WHERE id = ?',
        [order.partner_id]
      );
    }

    const [updated] = await conn.query('SELECT * FROM user_order WHERE id = ?', [order.id]);
    await conn.commit();
    return { order: updated[0], alreadyPaid: false, wxTransactionId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createVipOrder, markOrderPaid, PAY_PENDING, PAY_PAID };
