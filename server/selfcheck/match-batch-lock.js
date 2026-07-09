const { ok, pool } = require('./_helpers');
const { batchLockName, runBatchMatch } = require('../src/services/matchService');

(async () => {
  const options = { scopeOpenidPrefix: 'sc_lock_' };
  const batchDate = '2099-03-01';
  const lockName = batchLockName(batchDate, options);
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS locked', [lockName]);
    ok('manual match batch lock acquired', Number(rows[0]?.locked) === 1);

    let blocked = false;
    try {
      await runBatchMatch(batchDate, '锁自检', options);
    } catch (err) {
      blocked = String(err.message || '').includes('already running');
    }
    ok('same batch and scope cannot run while lock is held', blocked);
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?) AS released', [lockName]).catch(() => {});
    conn.release();
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
