const {
  adminToken,
  cleanupOpenids,
  cleanupPhones,
  createUser,
  ok,
  pool,
  request,
  userToken,
} = require('./_helpers');
const { runBatchMatch } = require('../src/services/matchService');

const openids = ['sc_free_user', 'sc_free_target', 'sc_free_other'];
const phones = ['13800009991'];

async function insertSetting(userId) {
  const text = '公益免费会员匹配自检三观文本长度足够通过质量门槛';
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_baby_plan, self_view_text, target_view_text, psych_profile_json)
     VALUES (?, 25, 35, 170, 180, '本科', '3-5y', ?, ?, '{}')`,
    [userId, text, text]
  );
}

(async () => {
  let user;
  try {
    await cleanupOpenids(openids);
    await cleanupPhones(phones);

    const admin = adminToken();
    const imported = await request('POST', '/api/admin/whitelist/import', {
      list: [{ phone: phones[0], name: '自检用户', unit: '自检单位', source: 'public' }],
    }, admin);
    ok('free whitelist import succeeds', imported.status === 200 && imported.json.code === 0 && imported.json.data.imported === 1);
    ok('free whitelist import records batch id', imported.json.data.batch_id);

    const batches = await request('GET', '/api/admin/whitelist/batches', undefined, admin);
    ok('free whitelist import batch is visible to admin', batches.status === 200 && batches.json.code === 0 && batches.json.data.list.some((b) => b.id === imported.json.data.batch_id && b.imported_count === 1));

    const whitelist = await request('GET', '/api/admin/whitelist', undefined, admin);
    ok('free whitelist admin list masks phone', whitelist.status === 200 && whitelist.json.code === 0 && whitelist.json.data.list.some((r) => r.phone_masked === '138****9991' && !r.phone));

    user = await createUser({ openid: openids[0], gender: 1, isVip: 0 });
    const target = await createUser({ openid: openids[1], gender: 2, isVip: 0 });
    const other = await createUser({ openid: openids[2], gender: 2, isVip: 0 });
    const token = userToken(user);

    const claim = await request('POST', '/api/user/claim-free', { phone: phones[0] }, token);
    ok('claim-free succeeds', claim.status === 200 && claim.json.code === 0);

    const [[row]] = await pool.query('SELECT free_member, free_source, is_vip FROM `user` WHERE id = ?', [user.id]);
    ok('claim sets free_member without paid vip', row.free_member === 1 && row.free_source === 'public' && row.is_vip === 0);

    const vipInfo = await request('GET', '/api/vip/info', undefined, token);
    ok('free_member is reported as active vip', vipInfo.status === 200 && vipInfo.json.code === 0 && vipInfo.json.data.isVip === true && vipInfo.json.data.free_member === 1);

    const publicStats = await request('GET', '/api/common/stats');
    const [[activeVipCount]] = await pool.query(
      `SELECT COUNT(*) AS c FROM \`user\`
       WHERE status = 1
         AND (free_member = 1 OR (is_vip = 1 AND vip_expire_time > NOW()))`
    );
    ok('common stats counts free_member as active vip',
      publicStats.status === 200
      && publicStats.json.code === 0
      && Number(publicStats.json.data.vip_count) === Number(activeVipCount.c));

    const dashboard = await request('GET', '/api/admin/dashboard', undefined, admin);
    const [[dashboardVipCount]] = await pool.query(
      `SELECT COUNT(*) AS c FROM \`user\`
       WHERE free_member = 1 OR (is_vip = 1 AND vip_expire_time > NOW())`
    );
    ok('admin dashboard counts free_member as vip user',
      dashboard.status === 200
      && dashboard.json.code === 0
      && Number(dashboard.json.data.vip_users) === Number(dashboardVipCount.c));

    const duplicate = await request('POST', '/api/user/claim-free', { phone: phones[0] }, userToken(other));
    const [[otherRow]] = await pool.query('SELECT free_member FROM `user` WHERE id = ?', [other.id]);
    ok('free whitelist phone cannot be claimed twice', duplicate.json.code !== 0 && otherRow.free_member === 0);

    await insertSetting(user.id);
    await insertSetting(target.id);
    const match = await runBatchMatch('2026-10-01', '公益自检', { scopeOpenidPrefix: 'sc_free_' });
    ok('free_member is included in active match pool', match.matched === 1);

    const latest = await request('GET', '/api/match/latest', undefined, token);
    ok('free_member passes vip detail gate', latest.status === 200 && latest.json.code === 0 && latest.json.data.locked === false);

    const detail = await request('GET', `/api/match/detail?id=${latest.json.data.id}`, undefined, token);
    ok('match detail returns matched user id for meet safety handoff',
      detail.status === 200
      && detail.json.code === 0
      && Number(detail.json.data.matched_user_id || detail.json.data.match_user_id) === target.id);
  } finally {
    await cleanupOpenids(openids);
    await cleanupPhones(phones);
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
