require('dotenv').config();

const { ok, pool } = require('./_helpers');

const DEV_OPENID = process.env.DEV_WX_OPENID || 'dev_wefinally_local_openid';
const PARTNER_OPENID = 'sc_demo_match_partner';
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
  const partner = users.find((u) => u.openid === PARTNER_OPENID);

  if (dev) {
    await pool.query(
      'DELETE FROM user_match_log WHERE match_date = ? AND match_type = ? AND (user_id = ? OR match_user_id = ?)',
      [MATCH_DATE, MATCH_TYPE, dev.id, dev.id]
    );
  }

  if (partner) {
    await pool.query('DELETE FROM user_match_log WHERE user_id = ? OR match_user_id = ?', [partner.id, partner.id]);
    await pool.query('DELETE FROM user_match_setting WHERE user_id = ?', [partner.id]);
    await pool.query('DELETE FROM `user` WHERE id = ?', [partner.id]);
  }
}

module.exports = {
  DEV_OPENID,
  MATCH_DATE,
  MATCH_TYPE,
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
