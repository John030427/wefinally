const fs = require('fs');
const path = require('path');
const {
  adminToken,
  cleanupOpenids,
  createUser,
  ok,
  pool,
  request,
} = require('./_helpers');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'admin', 'index.html'), 'utf8');
const route = fs.readFileSync(path.join(root, 'src', 'routes', 'admin.js'), 'utf8');
const openids = ['sc_admin_diag_a', 'sc_admin_diag_b'];

async function insertSetting(userId, selfViewText, targetViewText) {
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_circle_ids, like_marry_status, like_baby_plan,
      self_view_text, target_view_text, psych_profile_json, last_edit_time)
     VALUES (?, 25, 40, 155, 185, '本科', '1', '未婚', '3-5年内', ?, ?, ?, NULL)`,
    [
      userId,
      selfViewText,
      targetViewText,
      JSON.stringify({
        marriage_pace: '稳定推进',
        conflict_style: '及时沟通',
        security_space: '亲密也独立',
        family_boundary: '小家庭优先',
        money_view: '共同规划',
        career_family: '动态平衡',
      }),
    ]
  );
}

async function insertMatchLog(a, b) {
  const detail = {
    version: 'algo_evidence_v2',
    total: 88,
    quality_gate: { pass: false, reasons: ['view_similarity'], fallback: true },
    side: {
      dimensions: {
        view: { label: '三观文本', raw_score: 8, max: 25, percent: 32 },
        appearance: { label: '外貌偏好', raw_score: 6, max: 10, percent: 60 },
      },
    },
  };
  const [result] = await pool.query(
    `INSERT INTO user_match_log
     (user_id, match_user_id, view_similarity, total_score, score_detail_json,
      score_version, ai_report_status, ai_report_error, match_date, match_type)
     VALUES (?, ?, 32, 88, ?, 'algo_evidence_v2', 3, 'disabled', '2099-03-01', '后台诊断测试')`,
    [a.id, b.id, JSON.stringify(detail)]
  );
  return result.insertId;
}

ok('admin web exists at /admin', html.includes('WeFinally 超级管理后台'));
ok('admin route exposes all match logs API', route.includes("router.get('/matches'"));
ok('admin route exposes match diagnostic detail API', route.includes("router.get('/matches/:id'"));
ok('admin web exposes match records nav', html.includes('data-p="matches"') && html.includes('匹配记录'));
ok('admin web renders match records from API', html.includes('function pgMatches') && html.includes("api('/admin/matches"));
ok('admin web can open match diagnostic modal', html.includes('viewMatch') && html.includes('质量门槛') && html.includes('双方资料'));
ok('admin user detail modal renders values and appearance', html.includes('match_settings') && html.includes('appearance_description') && html.includes('三观自述'));
ok('admin route exposes whitelist audit APIs', route.includes("router.get('/whitelist'") && route.includes("router.get('/whitelist/batches'") && route.includes("router.post('/whitelist/import'"));
ok('admin web exposes whitelist audit nav', html.includes('data-p="whitelist"') && html.includes('单位白名单'));
ok('admin web can import and inspect whitelist batches', html.includes('function pgWhitelist') && html.includes("api('/admin/whitelist/batches") && html.includes('importWhitelist'));

(async () => {
  try {
    await cleanupOpenids(openids);
    const a = await createUser({ openid: openids[0], gender: 1, isVip: 1, birthYear: 1994 });
    const b = await createUser({ openid: openids[1], gender: 2, isVip: 1, birthYear: 1996 });
    await pool.query(
      'UPDATE `user` SET appearance_description = ?, appearance_want = ? WHERE id = ?',
      ['干净清爽，生活规律', '希望对方自然稳定', a.id]
    );
    await pool.query(
      'UPDATE `user` SET appearance_description = ?, appearance_want = ? WHERE id = ?',
      ['自然大方，通勤简洁', '希望对方清爽真诚', b.id]
    );
    await insertSetting(a.id, '我重视长期规划和稳定沟通', '希望对方愿意认真经营家庭');
    await insertSetting(b.id, '我重视稳定关系和坦诚表达', '希望对方有责任感和长期计划');
    const matchId = await insertMatchLog(a, b);

    const res = await request('GET', '/api/admin/matches?pageSize=5', undefined, adminToken());
    ok('admin matches API is reachable', res.status === 200 && res.json.code === 0 && Array.isArray(res.json.data.list));

    const userDetail = await request('GET', `/api/admin/users/${a.id}`, undefined, adminToken());
    ok('admin user detail API includes match settings', userDetail.json.data.match_settings && userDetail.json.data.match_settings.self_view_text);
    ok('admin user detail API includes appearance fields', userDetail.json.data.user.appearance_description === '干净清爽，生活规律');

    const matchDetail = await request('GET', `/api/admin/matches/${matchId}`, undefined, adminToken());
    ok('admin match detail API is reachable', matchDetail.status === 200 && matchDetail.json.code === 0);
    ok('admin match detail includes both sides', matchDetail.json.data.owner.openid === openids[0] && matchDetail.json.data.partner.openid === openids[1]);
    ok('admin match detail includes failure diagnostics', matchDetail.json.data.score_detail.quality_gate.reasons.includes('view_similarity'));
    ok('admin match detail includes both settings', matchDetail.json.data.owner.match_settings.self_view_text && matchDetail.json.data.partner.match_settings.target_view_text);

    const whitelist = await request('GET', '/api/admin/whitelist', undefined, adminToken());
    ok('admin whitelist API returns masked list shape', whitelist.status === 200 && whitelist.json.code === 0 && Array.isArray(whitelist.json.data.list));
  } finally {
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await cleanupOpenids(openids).catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
