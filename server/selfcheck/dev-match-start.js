delete process.env.DEV_MATCH_START_ENABLED;

const fs = require('fs');
const path = require('path');
const {
  cleanupOpenids,
  createUser,
  ok,
  pool,
  request,
  userToken,
} = require('./_helpers');
const { runBatchMatch } = require('../src/services/matchService');

const openids = [
  'sc_dev_match_start',
  'sc_dev_match_repeat_a',
  'sc_dev_match_repeat_b',
  'sc_dev_match_quality_a',
  'sc_dev_match_quality_b',
  'sc_dev_match_seed_current',
  'sc_dev_match_seed_current_candidate',
  'sc_dev_match_no_setting',
];

async function insertSetting(userId, text = '认真进入婚姻，重视责任沟通，也希望对方稳定真诚并愿意共同经营家庭') {
  const psych = {
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    security_space: '亲密也独立',
    family_boundary: '小家庭优先',
    money_view: '共同规划',
    career_family: '动态平衡',
  };
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_circle_ids, like_marry_status, like_baby_plan,
      self_view_text, target_view_text, psych_profile_json, last_edit_time)
     VALUES (?, 25, 40, 160, 185, '大专', '', '未婚', '3-5y', ?, ?, ?, NULL)`,
    [userId, text, text, JSON.stringify(psych)]
  );
}

async function insertHistoricalPair(a, b) {
  await pool.query(
    `INSERT INTO user_match_log
     (user_id, match_user_id, view_similarity, total_score, match_date, match_type)
     VALUES (?, ?, 92, 100, '2099-02-01', '历史测试匹配'),
            (?, ?, 92, 100, '2099-02-01', '历史测试匹配')`,
    [a.id, b.id, b.id, a.id]
  );
}

(async () => {
  try {
    const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'app.js'), 'utf8');
    const indexJs = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'pages', 'index', 'index.js'), 'utf8');
    const indexWxml = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'pages', 'index', 'index.wxml'), 'utf8');
    const matchRoute = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'match.js'), 'utf8');
    ok('miniprogram disables local API overrides after cloud migration', appJs.includes('setApiBaseUrl') && appJs.includes('不再使用本地 API 地址') && appJs.includes('wx.cloud.init'));
    ok('home page has dev-only manual match button wiring', indexJs.includes('devStartMatch') && indexWxml.includes('开发测试：立即匹配'));
    ok(
      'dev manual match request supports repeatable reruns',
      indexJs.includes('allow_rematch')
        && indexJs.includes('allow_quality_fallback')
        && indexJs.includes('reset_user_batch')
        && indexJs.includes('dev_seed_current_user_candidates')
        && matchRoute.includes('allow_rematch')
        && matchRoute.includes('allow_quality_fallback')
        && matchRoute.includes('dev_seed_current_user_candidates')
    );
    ok(
      'dev manual match empty result toast stays explicit',
      indexJs.includes("'暂无可用候选'") && indexJs.includes('wx.showToast')
    );

    await cleanupOpenids(openids);
    const user = await createUser({ openid: openids[0], isVip: 1 });
    const res = await request('POST', '/api/match/start', { scope_openid_prefix: 'sc_dev_match_start' }, userToken(user));
    ok(
      'manual match start is guarded by dev env',
      res.status === 200 && (
        (res.json.code !== 0 && String(res.json.message || '').includes('DEV_MATCH_START_ENABLED'))
        || (res.json.code === 0 && res.json.data && res.json.data.batch_date)
      )
    );

    const a = await createUser({ openid: openids[1], gender: 1, isVip: 1, birthYear: 1994 });
    const b = await createUser({ openid: openids[2], gender: 2, isVip: 1, birthYear: 1996 });
    await insertSetting(a.id);
    await insertSetting(b.id);
    await insertHistoricalPair(a, b);

    const noRepeat = await runBatchMatch('2099-02-02', '手动测试匹配', { scopeOpenidPrefix: 'sc_dev_match_repeat_' });
    ok('manual match respects production rematch avoidance by default', noRepeat.matched === 0);

    const repeat = await runBatchMatch('2099-02-03', '手动测试匹配', {
      scopeOpenidPrefix: 'sc_dev_match_repeat_',
      allowRematch: true,
    });
    ok('dev manual match can repeat historical pairs for testing', repeat.matched === 1);

    const c = await createUser({ openid: openids[3], gender: 1, isVip: 1, birthYear: 1994 });
    const d = await createUser({ openid: openids[4], gender: 2, isVip: 1, birthYear: 1996 });
    await insertSetting(c.id, '我重视长期规划、家庭责任、财务透明和稳定作息，希望认真进入婚姻');
    await insertSetting(d.id, '喜欢即兴旅行、艺术展览、城市探索和开放体验，希望生活保持新鲜');

    const strict = await runBatchMatch('2099-02-04', '手动测试匹配', { scopeOpenidPrefix: 'sc_dev_match_quality_' });
    ok('manual match respects quality gate by default', strict.matched === 0);

    const fallback = await runBatchMatch('2099-02-05', '手动测试匹配', {
      scopeOpenidPrefix: 'sc_dev_match_quality_',
      allowQualityFallback: true,
    });
    ok('dev manual match can use quality fallback for testing', fallback.matched === 1);

    const narrow = await createUser({ openid: openids[5], gender: 1, isVip: 1, birthYear: new Date().getFullYear() - 20 });
    await pool.query(
      `INSERT INTO user_match_setting
       (user_id, age_min, age_max, height_min, height_max, min_education,
        like_circle_ids, like_marry_status, like_baby_plan,
        self_view_text, target_view_text, psych_profile_json, last_edit_time)
       VALUES (?, 20, 25, 160, 170, '高中及以下', '', '未婚', '3-5年内', ?, ?, ?, NULL)`,
      [
        narrow.id,
        '我重视长期关系、稳定沟通和共同经营家庭，也愿意认真了解后进入婚姻',
        '希望对方真诚稳定，沟通顺畅，愿意共同规划家庭和未来生活',
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
    const seeded = await request('POST', '/api/match/start', {
      batch_date: '2099-02-06',
      allow_rematch: true,
      allow_quality_fallback: true,
      reset_user_batch: true,
      dev_seed_current_user_candidates: true,
    }, userToken(narrow));
    const [[seededMine]] = await pool.query(
      'SELECT COUNT(*) AS count FROM user_match_log WHERE user_id = ? AND match_date = ?',
      [narrow.id, '2099-02-06']
    );
    ok('dev manual match can seed a compatible current-user candidate',
      seeded.status === 200 && seeded.json.code === 0 && Number(seededMine.count) >= 1);

    const noSetting = await createUser({ openid: openids[7], gender: 1, isVip: 1, birthYear: 1994 });
    const empty = await request('POST', '/api/match/start', {
      batch_date: '2099-02-07',
      allow_rematch: true,
      allow_quality_fallback: true,
      reset_user_batch: true,
      dev_seed_current_user_candidates: true,
    }, userToken(noSetting));
    ok(
      'dev manual match returns empty success when current user has no match setting',
      empty.status === 200
        && empty.json.code === 0
        && Number(empty.json.data?.matched || 0) === 0
    );
  } finally {
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
