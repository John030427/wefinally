const { MARRY_REPORT_TYPE } = require('../src/config/constants');
const { hashPassword } = require('../src/utils/crypto');
const {
  adminToken,
  cleanupOpenids,
  cleanupPartnerPhones,
  createUser,
  ok,
  pool,
  request,
  userToken,
} = require('./_helpers');

const openids = ['sc_bug_cancel', 'sc_bug_marry', 'sc_bug_privacy', 'sc_bug_match'];
const partnerPhones = ['sc_partner_phone'];

async function insertPartner() {
  await cleanupPartnerPhones(partnerPhones);
  const [r] = await pool.query(
    `INSERT INTO partner (circle_id, name, phone, password, status, promote_code, balance)
     VALUES (1, '自检合伙人', ?, ?, 1, 'SCBUG', 100)`,
    [partnerPhones[0], hashPassword('scpass')]
  );
  return r.insertId;
}

(async () => {
  const admin = adminToken();
  let statBefore = 0;
  try {
    await cleanupOpenids(openids);
    await cleanupPartnerPhones(partnerPhones);
    const [[stat]] = await pool.query('SELECT marry_success_count FROM system_stat WHERE id = 1');
    statBefore = Number(stat.marry_success_count || 0);

    const partnerId = await insertPartner();
    const [w] = await pool.query(
      'INSERT INTO partner_withdraw (partner_id, amount, status) VALUES (?, 50, 0)',
      [partnerId]
    );
    const reject = await request('PUT', `/api/admin/withdrawals/${w.insertId}`, { status: 2 }, admin);
    ok('withdraw reject API succeeds', reject.status === 200 && reject.json.code === 0);
    const [[withdraw]] = await pool.query('SELECT status FROM partner_withdraw WHERE id = ?', [w.insertId]);
    const [[partner]] = await pool.query('SELECT balance FROM partner WHERE id = ?', [partnerId]);
    ok('withdraw reject uses status=2 and refunds balance', withdraw.status === 2 && Number(partner.balance) === 150);

    const cancelUser = await createUser({ openid: openids[0], isVip: 1 });
    const [cancelReport] = await pool.query(
      'INSERT INTO marry_report (user_id, report_type, proof_img, audit_status) VALUES (?, ?, ?, 0)',
      [cancelUser.id, MARRY_REPORT_TYPE.CANCEL, 'cancel']
    );
    const cancel = await request('POST', `/api/admin/marry-reports/${cancelReport.insertId}/approve`, { approve: true }, admin);
    ok('cancel report approve succeeds', cancel.status === 200 && cancel.json.code === 0);
    const [[cancelAfter]] = await pool.query('SELECT status, is_vip FROM `user` WHERE id = ?', [cancelUser.id]);
    const [[statAfterCancel]] = await pool.query('SELECT marry_success_count FROM system_stat WHERE id = 1');
    ok('cancel report bans user without increasing marry count', cancelAfter.status === 2 && cancelAfter.is_vip === 0 && Number(statAfterCancel.marry_success_count) === statBefore);

    const marryUser = await createUser({ openid: openids[1], isVip: 1 });
    const [marryReport] = await pool.query(
      'INSERT INTO marry_report (user_id, report_type, proof_img, audit_status) VALUES (?, ?, ?, 0)',
      [marryUser.id, MARRY_REPORT_TYPE.MARRY, 'marry']
    );
    const marry = await request('POST', `/api/admin/marry-reports/${marryReport.insertId}/approve`, { approve: true }, admin);
    ok('marry report approve succeeds', marry.status === 200 && marry.json.code === 0);
    const [[marryAfter]] = await pool.query('SELECT status, is_vip FROM `user` WHERE id = ?', [marryUser.id]);
    const [[statAfterMarry]] = await pool.query('SELECT marry_success_count FROM system_stat WHERE id = 1');
    ok('marry report marks married and increases marry count once', marryAfter.status === 3 && marryAfter.is_vip === 0 && Number(statAfterMarry.marry_success_count) === statBefore + 1);

    const privacyUser = await createUser({ openid: openids[2] });
    await pool.query(
      `INSERT INTO user_privacy_auth_log
       (openid, user_id, auth_service, auth_privacy, auth_data, device_info, auth_time)
       VALUES (?, ?, 1, 1, 1, 'selfcheck', '2026-10-02 12:34:56')`,
      [privacyUser.openid, privacyUser.id]
    );
    const logs = await request('GET', '/api/admin/privacy-logs?page=1&pageSize=10', undefined, admin);
    const found = logs.json.data.list.find((row) => row.user_id === privacyUser.id);
    ok('privacy logs return auth_time', logs.status === 200 && found && String(found.auth_time).includes('2026'));

    const matchUser = await createUser({ openid: openids[3] });
    const matchToken = userToken(matchUser);
    const text = '这是一个用于自检的三观描述文本，长度足够通过校验';
    const setting = await request('POST', '/api/match/setting', {
      prefer_age: '25-35岁',
      prefer_education: '本科',
      prefer_city: 'SZTEST',
      prefer_height: '170-180cm',
      like_baby_plan: '3-5y',
      my_values: text,
      expect_values: text,
    }, matchToken);
    ok('match setting save succeeds', setting.status === 200 && setting.json.code === 0);
    const [[saved]] = await pool.query('SELECT like_circle_ids FROM user_match_setting WHERE user_id = ?', [matchUser.id]);
    ok('prefer_city does not pollute like_circle_ids', saved.like_circle_ids === '');
  } finally {
    await pool.query('UPDATE system_stat SET marry_success_count = ? WHERE id = 1', [statBefore]).catch(() => {});
    await cleanupOpenids(openids);
    await cleanupPartnerPhones(partnerPhones);
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
