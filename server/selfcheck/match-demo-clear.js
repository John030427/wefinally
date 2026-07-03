require('dotenv').config();

const { ok, pool } = require('./_helpers');

const DEV_OPENID = process.env.DEV_WX_OPENID || 'dev_wefinally_local_openid';
const PARTNER_OPENID = 'sc_demo_match_partner';
const PARTNER_PREFIX = 'sc_demo_match_';
const MATCH_DATE = '2099-02-14';
const MATCH_TYPE = '演示匹配';

async function idsForOpenids(openids) {
  const [rows] = await pool.query(
    `SELECT id, openid FROM \`user\` WHERE openid IN (${openids.map(() => '?').join(',')})`,
    openids
  );
  return rows;
}

async function clearDemoMatchData() {
  const users = await idsForOpenids([DEV_OPENID, PARTNER_OPENID]);
  const dev = users.find((u) => u.openid === DEV_OPENID);
  const [partners] = await pool.query(
    'SELECT id, openid FROM `user` WHERE openid = ? OR openid LIKE ?',
    [PARTNER_OPENID, `${PARTNER_PREFIX}%`]
  );

  if (dev) {
    await pool.query(
      'DELETE FROM user_match_log WHERE match_type LIKE ? AND (user_id = ? OR match_user_id = ?)',
      ['演示%', dev.id, dev.id]
    );
  }

  const partnerIds = partners.map((p) => p.id);
  if (partnerIds.length) {
    const qs = partnerIds.map(() => '?').join(',');
    await pool.query(`DELETE FROM user_match_log WHERE user_id IN (${qs}) OR match_user_id IN (${qs})`, [...partnerIds, ...partnerIds]);
    await pool.query(`DELETE FROM user_match_setting WHERE user_id IN (${qs})`, partnerIds);
    await pool.query(`DELETE FROM \`user\` WHERE id IN (${qs})`, partnerIds);
  }
}

module.exports = {
  DEV_OPENID,
  MATCH_DATE,
  MATCH_TYPE,
  PARTNER_PREFIX,
  PARTNER_OPENID,
  clearDemoMatchData,
};

if (require.main === module) {
  (async () => {
    try {
      await clearDemoMatchData();
      ok('demo match data cleared', true);
    } finally {
      await pool.end();
    }
  })().catch(async (err) => {
    console.error(err.stack || err.message);
    await pool.end();
    process.exit(1);
  });
}
