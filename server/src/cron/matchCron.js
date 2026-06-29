const cron = require('node-cron');
const { MATCH_DAYS } = require('../config/constants');
const { runBatchMatch } = require('../services/matchService');

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function matchTypeForDay(date = new Date()) {
  const dow = date.getDay();
  if (dow === 3) return '周三';
  if (dow === 5) return '周五';
  return '周三';
}

function isMatchDay(date = new Date()) {
  return MATCH_DAYS.includes(date.getDay());
}

function startMatchCron() {
  cron.schedule(
    '0 0 * * 3,5',
    async () => {
      if (!isMatchDay()) return;
      const batchDate = todayStr();
      const matchType = matchTypeForDay();
      console.log(`[matchCron] starting batch match for ${batchDate} (${matchType})`);
      try {
        const result = await runBatchMatch(batchDate, matchType);
        console.log(`[matchCron] done: users=${result.users} matches=${result.matched}`);
      } catch (err) {
        console.error('[matchCron] failed:', err.message);
      }
    },
    { timezone: 'Asia/Shanghai' }
  );
  console.log('[matchCron] scheduled Wed/Fri 00:00');
}

module.exports = { startMatchCron, isMatchDay, matchTypeForDay };
