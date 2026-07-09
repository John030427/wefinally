const fs = require('fs');
const path = require('path');
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

const openids = [
  'sc_bug_cancel',
  'sc_bug_cancel_peer',
  'sc_bug_marry',
  'sc_bug_privacy',
  'sc_bug_match',
  'sc_bug_pending',
  'sc_bug_match_empty',
];
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
    const cancelPeer = await createUser({ openid: openids[1], isVip: 1 });
    await pool.query(
      `INSERT INTO user_match_setting
       (user_id, age_min, age_max, height_min, height_max, min_education, self_view_text, target_view_text)
       VALUES (?, 25, 35, 160, 180, '本科', '注销自检三观文本长度足够', '注销自检期待文本长度足够')`,
      [cancelUser.id]
    );
    await pool.query(
      `INSERT INTO user_match_log
       (user_id, match_user_id, view_similarity, total_score, match_date, match_type)
       VALUES (?, ?, 80, 90, '2026-07-03', '注销自检'), (?, ?, 80, 90, '2026-07-03', '注销自检')`,
      [cancelUser.id, cancelPeer.id, cancelPeer.id, cancelUser.id]
    );
    const [cancelReport] = await pool.query(
      'INSERT INTO marry_report (user_id, report_type, proof_img, audit_status) VALUES (?, ?, ?, 0)',
      [cancelUser.id, MARRY_REPORT_TYPE.CANCEL, 'cancel']
    );
    const cancel = await request('POST', `/api/admin/marry-reports/${cancelReport.insertId}/approve`, { approve: true }, admin);
    ok('cancel report approve succeeds', cancel.status === 200 && cancel.json.code === 0);
    const [[cancelAfter]] = await pool.query('SELECT status, is_vip FROM `user` WHERE id = ?', [cancelUser.id]);
    const [[statAfterCancel]] = await pool.query('SELECT marry_success_count FROM system_stat WHERE id = 1');
    ok('cancel report bans user without increasing marry count', cancelAfter.status === 2 && cancelAfter.is_vip === 0 && Number(statAfterCancel.marry_success_count) === statBefore);
    const [[cancelSetting]] = await pool.query('SELECT COUNT(*) AS c FROM user_match_setting WHERE user_id = ?', [cancelUser.id]);
    const [[cancelLogs]] = await pool.query(
      'SELECT COUNT(*) AS c FROM user_match_log WHERE user_id = ? OR match_user_id = ?',
      [cancelUser.id, cancelUser.id]
    );
    ok('cancel report removes user from match pool and visible match logs', Number(cancelSetting.c) === 0 && Number(cancelLogs.c) === 0);

    const marryUser = await createUser({ openid: openids[2], isVip: 1 });
    const [marryReport] = await pool.query(
      'INSERT INTO marry_report (user_id, report_type, proof_img, audit_status) VALUES (?, ?, ?, 0)',
      [marryUser.id, MARRY_REPORT_TYPE.MARRY, 'marry']
    );
    const marry = await request('POST', `/api/admin/marry-reports/${marryReport.insertId}/approve`, { approve: true }, admin);
    ok('marry report approve succeeds', marry.status === 200 && marry.json.code === 0);
    const [[marryAfter]] = await pool.query('SELECT status, is_vip FROM `user` WHERE id = ?', [marryUser.id]);
    const [[statAfterMarry]] = await pool.query('SELECT marry_success_count FROM system_stat WHERE id = 1');
    ok('marry report marks married and increases marry count once', marryAfter.status === 3 && marryAfter.is_vip === 0 && Number(statAfterMarry.marry_success_count) === statBefore + 1);
    const marryAgain = await request('POST', `/api/admin/marry-reports/${marryReport.insertId}/approve`, { approve: true }, admin);
    const [[statAfterMarryAgain]] = await pool.query('SELECT marry_success_count FROM system_stat WHERE id = 1');
    ok('marry report approve is not double-counted', marryAgain.json.code !== 0 && Number(statAfterMarryAgain.marry_success_count) === statBefore + 1);

    const privacyUser = await createUser({ openid: openids[3] });
    await pool.query(
      `INSERT INTO user_privacy_auth_log
       (openid, user_id, auth_service, auth_privacy, auth_data, device_info, auth_time)
       VALUES (?, ?, 1, 1, 1, 'selfcheck', '2026-10-02 12:34:56')`,
      [privacyUser.openid, privacyUser.id]
    );
    const logs = await request('GET', '/api/admin/privacy-logs?page=1&pageSize=10', undefined, admin);
    const found = logs.json.data.list.find((row) => row.user_id === privacyUser.id);
    ok('privacy logs return auth_time', logs.status === 200 && found && String(found.auth_time).includes('2026'));

    const matchUser = await createUser({ openid: openids[4] });
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

    const pendingUser = await createUser({ openid: openids[5], status: 0 });
    const pendingToken = userToken(pendingUser);
    const pendingSetting = await request('POST', '/api/match/setting', {
      prefer_age: '25-35岁',
      prefer_education: '本科',
      prefer_city: '深圳',
      prefer_height: '170-180cm',
      like_baby_plan: '3-5y',
      my_values: text,
      expect_values: text,
    }, pendingToken);
    ok('pending user can save setting', pendingSetting.status === 200 && pendingSetting.json.code === 0);
    const [[pendingAfter]] = await pool.query('SELECT status FROM `user` WHERE id = ?', [pendingUser.id]);
    ok('match setting does not bypass partner audit', pendingAfter.status === 0);

    const emptyTextUser = await createUser({ openid: openids[6] });
    const emptyTextSetting = await request('POST', '/api/match/setting', {
      prefer_age: '25-35岁',
      prefer_education: '本科',
      prefer_height: '170-180cm',
      like_baby_plan: '3-5y',
    }, userToken(emptyTextUser));
    ok('match setting rejects missing view texts without 500', emptyTextSetting.status === 200 && emptyTextSetting.json.code !== 0);
    const [[emptyTextSaved]] = await pool.query('SELECT COUNT(*) AS c FROM user_match_setting WHERE user_id = ?', [emptyTextUser.id]);
    ok('match setting missing view texts is not saved', Number(emptyTextSaved.c) === 0);

    const importBat = fs.readFileSync(path.join(__dirname, '../../database/import.bat'), 'utf8');
    for (const patch of [
      'patch-002-partner-audit.sql',
      'patch-004-free-whitelist.sql',
      'patch-005-meet-report.sql',
      'patch-006-appearance-llm.sql',
      'patch-007-register-ux.sql',
      'patch-008-match-psych-report.sql',
      'patch-009-safety-whitelist-audit.sql',
    ]) {
      ok(`database import includes ${patch}`, importBat.includes(patch));
    }

    const matchSettingJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/match-setting/match-setting.js'), 'utf8');
    const matchSettingWxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/match-setting/match-setting.wxml'), 'utf8');
    ok('match setting page does not send fake prefer_city', !matchSettingJs.includes('prefer_city:') && !matchSettingJs.includes('preferCity'));
    ok('match setting page does not show fake city picker', !matchSettingWxml.includes('偏好城市') && !matchSettingWxml.includes('preferCity'));

    const profileJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/profile/profile.js'), 'utf8');
    const profileWxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/profile/profile.wxml'), 'utf8');
    const indexWxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/index/index.wxml'), 'utf8');
    ok('free claim is renamed to activation code', !profileJs.includes('公益免费认证') && !profileWxml.includes('公益免费') && profileJs.includes('激活码'));
    ok('home page exposes safety access', indexWxml.includes('安全求助') && indexWxml.includes('/pages/meet-safety-list/meet-safety-list'));
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
