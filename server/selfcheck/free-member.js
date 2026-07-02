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

const openids = ['sc_free_user', 'sc_free_target'];
const phones = ['13800009991'];

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

    user = await createUser({ openid: openids[0], gender: 1, isVip: 0 });
    const target = await createUser({ openid: openids[1], gender: 2, isVip: 0 });
    const token = userToken(user);

    const claim = await request('POST', '/api/user/claim-free', { phone: phones[0] }, token);
    ok('claim-free succeeds', claim.status === 200 && claim.json.code === 0);

    const [[row]] = await pool.query('SELECT free_member, free_source, is_vip FROM `user` WHERE id = ?', [user.id]);
    ok('claim sets free_member without paid vip', row.free_member === 1 && row.free_source === 'public' && row.is_vip === 0);

    await pool.query(
      `INSERT INTO user_match_log (user_id, match_user_id, view_similarity, match_date, match_type)
       VALUES (?, ?, 88, '2026-10-01', 'Wed')`,
      [user.id, target.id]
    );
    const latest = await request('GET', '/api/match/latest', undefined, token);
    ok('free_member passes vip detail gate', latest.status === 200 && latest.json.code === 0 && latest.json.data.locked === false);
  } finally {
    await cleanupOpenids(openids);
    await cleanupPhones(phones);
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
