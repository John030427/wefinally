const cron = require('node-cron');
const pool = require('../config/db');
const { SETTLE_DAYS } = require('../config/constants');

const PAY_PAID = 1;

/**
 * T+7 settle partner commission: add to partner.balance
 */
async function settlePartnerCommissions() {
  const conn = await pool.getConnection();
  let settled = 0;

  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(
      `SELECT * FROM user_order
       WHERE pay_status = ?
         AND settle_status = 0
         AND partner_id > 0
         AND partner_commission > 0
         AND pay_time IS NOT NULL
         AND pay_time <= DATE_SUB(NOW(), INTERVAL ? DAY)
       FOR UPDATE`,
      [PAY_PAID, SETTLE_DAYS]
    );

    for (const order of orders) {
      const [partners] = await conn.query(
        'SELECT id, status FROM `partner` WHERE id = ? FOR UPDATE',
        [order.partner_id]
      );
      if (partners.length === 0 || partners[0].status !== 1) {
        await conn.query(
          'UPDATE user_order SET settle_status = 1 WHERE id = ?',
          [order.id]
        );
        continue;
      }

      await conn.query(
        `UPDATE \`partner\`
         SET balance = balance + ?
         WHERE id = ?`,
        [order.partner_commission, order.partner_id]
      );

      await conn.query(
        'UPDATE user_order SET settle_status = 1 WHERE id = ?',
        [order.id]
      );
      settled += 1;
    }

    await conn.commit();
    return settled;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function startSettleCron() {
  cron.schedule(
    '30 2 * * *',
    async () => {
      console.log('[settleCron] running T+7 settlement...');
      try {
        const count = await settlePartnerCommissions();
        console.log(`[settleCron] settled ${count} orders`);
      } catch (err) {
        console.error('[settleCron] failed:', err.message);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );
  console.log('[settleCron] scheduled daily 02:30');
}

module.exports = { startSettleCron, settlePartnerCommissions };
