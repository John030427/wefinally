const cron = require('node-cron');
const pool = require('../config/db');

async function expireVipUsers() {
  const [result] = await pool.query(
    `UPDATE \`user\`
     SET is_vip = 0
     WHERE is_vip = 1
       AND vip_expire_time IS NOT NULL
       AND vip_expire_time <= NOW()`
  );
  return result.affectedRows || 0;
}

function startVipExpireCron() {
  cron.schedule(
    '0 1 * * *',
    async () => {
      console.log('[vipExpireCron] running...');
      try {
        const count = await expireVipUsers();
        console.log(`[vipExpireCron] cleared ${count} expired VIP flags`);
      } catch (err) {
        console.error('[vipExpireCron] failed:', err.message);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );
  console.log('[vipExpireCron] scheduled daily 01:00');
}

module.exports = { startVipExpireCron, expireVipUsers };
