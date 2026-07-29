const fs = require('fs');
const path = require('path');
const {
  adminToken,
  cleanupOpenids,
  createUser,
  ok,
  pool,
  request,
  userToken,
} = require('./_helpers');

const openids = ['sc_handoff_a', 'sc_handoff_b'];

async function createMatchLog(user, partner) {
  const [result] = await pool.query(
    `INSERT INTO user_match_log
     (user_id, match_user_id, view_similarity, total_score, match_date, match_type)
     VALUES (?, ?, 92, 118, '2099-03-01', '自检匹配')`,
    [user.id, partner.id]
  );
  return result.insertId;
}

(async () => {
  try {
    const miniRoot = path.join(__dirname, '..', '..', 'miniprogram');
    const settingWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'match-setting', 'match-setting.wxml'), 'utf8');
    const settingJs = fs.readFileSync(path.join(miniRoot, 'pages', 'match-setting', 'match-setting.js'), 'utf8');
    const detailWxml = fs.readFileSync(path.join(miniRoot, 'pages', 'match-detail', 'match-detail.wxml'), 'utf8');
    const detailJs = fs.readFileSync(path.join(miniRoot, 'pages', 'match-detail', 'match-detail.js'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'index.html'), 'utf8');

    ok('match setting hides supplemental relationship preference options',
      !settingWxml.includes('关系偏好') && !settingWxml.includes('婚姻节奏') && !settingJs.includes('PSYCH_PROFILE_OPTIONS'));
    ok('match setting no longer submits new psych profile choices',
      !settingJs.includes('psych_profile: {') && settingJs.includes('psych_profile: null'));
    ok('match detail exposes official handoff action',
      detailWxml.includes('申请官方奔现对接') && detailJs.includes('requestHandoff'));
    ok('admin web exposes handoff ticket page',
      adminHtml.includes('奔现工单') && adminHtml.includes('/admin/handoff/tickets'));

    await cleanupOpenids(openids);
    const user = await createUser({ openid: openids[0], gender: 1, isVip: 1 });
    const partner = await createUser({ openid: openids[1], gender: 2, isVip: 1 });
    const matchLogId = await createMatchLog(user, partner);

    const created = await request('POST', '/api/match/handoff', { match_log_id: matchLogId }, userToken(user));
    ok('user can create official match handoff ticket',
      created.status === 200
        && created.json.code === 0
        && created.json.data
        && created.json.data.status === 'submitted'
        && Number(created.json.data.match_log_id) === matchLogId);

    const duplicate = await request('POST', '/api/match/handoff', { match_log_id: matchLogId }, userToken(user));
    ok('handoff ticket create is idempotent for same user and match',
      duplicate.status === 200
        && duplicate.json.code === 0
        && Number(duplicate.json.data.id) === Number(created.json.data.id));

    const recovered = await request('POST', '/api/match/handoff', {
      match_log_id: matchLogId + 100000,
      match_user_id: partner.id,
    }, userToken(user));
    ok('handoff ticket can recover by partner id when match log id is stale',
      recovered.status === 200
        && recovered.json.code === 0
        && Number(recovered.json.data.id) === Number(created.json.data.id));

    const listed = await request('GET', '/api/admin/handoff/tickets', undefined, adminToken());
    const found = ((listed.json && listed.json.data) || []).find((row) => Number(row.id) === Number(created.json.data.id));
    ok('admin can see official handoff ticket with both sides',
      listed.status === 200
        && listed.json.code === 0
        && found
        && Number(found.user_id) === user.id
        && Number(found.match_user_id) === partner.id);

    const updated = await request('PUT', `/api/admin/handoff/tickets/${created.json.data.id}`, {
      status: 'arranged',
      service_note: '已电话确认双方意向',
    }, adminToken());
    ok('admin can update handoff ticket status',
      updated.status === 200
        && updated.json.code === 0
        && updated.json.data.status === 'arranged'
        && updated.json.data.service_note === '已电话确认双方意向');
  } finally {
    await pool.query('DELETE FROM match_handoff_ticket WHERE user_id IN (SELECT id FROM `user` WHERE openid IN (?, ?))', openids).catch(() => {});
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
