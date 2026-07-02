const { cleanupOpenids, createUser, ok, pool } = require('./_helpers');
const { runBatchMatch } = require('../src/services/matchService');
const llmConfig = require('../src/config/llmConfig');

async function requireColumn(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  ok(`${table}.${column} exists`, rows.length === 1);
}

async function insertSetting(userId, psych) {
  const text = '认真进入婚姻，重视责任沟通，也希望对方稳定真诚并愿意共同经营家庭';
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_circle_ids, like_marry_status, like_baby_plan,
      self_view_text, target_view_text, psych_profile_json, last_edit_time)
     VALUES (?, 25, 40, 160, 185, '大专', '', '未婚', '3-5y', ?, ?, ?, NULL)`,
    [userId, text, text, JSON.stringify(psych)]
  );
}

(async () => {
  const openids = ['sc_match_psych_a', 'sc_match_psych_b'];
  const psych = {
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    security_space: '亲密也独立',
    family_boundary: '小家庭优先',
    money_view: '共同规划',
    career_family: '动态平衡',
  };

  try {
    await requireColumn('user_match_setting', 'psych_profile_json');
    await requireColumn('user_match_log', 'total_score');
    await requireColumn('user_match_log', 'ai_report_status');
    ok('match report llm default off', llmConfig.matchReportEnabled === false);

    await cleanupOpenids(openids);
    const a = await createUser({ openid: openids[0], gender: 1, isVip: 1, birthYear: 1994 });
    const b = await createUser({ openid: openids[1], gender: 2, isVip: 1, birthYear: 1996 });
    await insertSetting(a.id, psych);
    await insertSetting(b.id, psych);

    const result = await runBatchMatch('2099-01-03', '周三');
    ok('psych match creates one pair', result.matched === 1);

    const [rows] = await pool.query(
      `SELECT * FROM user_match_log
       WHERE user_id IN (?, ?) AND match_user_id IN (?, ?)
       ORDER BY id`,
      [a.id, b.id, a.id, b.id]
    );
    ok('symmetric match logs created', rows.length === 2);
    ok('total score saved', Number(rows[0].total_score) > 0);
    const detail = JSON.parse(rows[0].score_detail_json);
    ok('psych score contributes to detail', detail.side.psych > 0 && detail.side.psych_score === 100);
    ok('ai report disabled status saved', rows.every((r) => Number(r.ai_report_status) === 3));
  } finally {
    await cleanupOpenids(openids);
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
