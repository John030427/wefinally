const { cleanupOpenids, ok, pool, USER_STATUS } = require('./_helpers');
const { runBatchMatch } = require('../src/services/matchService');

const YEAR = new Date().getFullYear();
const BATCH_DATE = '2099-01-17';

const PSYCH = {
  stable: {
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    security_space: '亲密也独立',
    family_boundary: '小家庭优先',
    money_view: '共同规划',
    career_family: '动态平衡',
  },
  short: {
    marriage_pace: '先磨合再定',
    conflict_style: '冷静后沟通',
    security_space: '高陪伴感',
    family_boundary: '边界清晰',
    money_view: '稳健储蓄',
    career_family: '家庭优先',
  },
  dinks: {
    marriage_pace: '顺其自然',
    conflict_style: '需要空间',
    security_space: '重视个人空间',
    family_boundary: '小家庭优先',
    money_view: '相对独立',
    career_family: '事业优先',
  },
  mismatchA: {
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    security_space: '高陪伴感',
    family_boundary: '大家庭融合',
    money_view: '共同规划',
    career_family: '家庭优先',
  },
  mismatchB: {
    marriage_pace: '顺其自然',
    conflict_style: '需要空间',
    security_space: '重视个人空间',
    family_boundary: '边界清晰',
    money_view: '相对独立',
    career_family: '事业优先',
  },
};

const TEXT = {
  stable:
    '我重视长期婚姻、责任、稳定沟通和共同经营家庭，遇到分歧愿意当天复盘，也尊重彼此成长空间',
  short:
    '我希望关系真实稳妥，先充分了解再推进婚姻，重视家庭边界、稳定生活和互相照顾',
  dinks:
    '我享受独立生活和事业成长，婚姻里需要空间、尊重和清晰边界，暂时不计划生育',
  education:
    '我看重责任感、诚实沟通和共同规划，即使背景不同也愿意把生活节奏稳定下来',
  adventure:
    '我喜欢高频社交、冒险旅行和快速决策，希望关系保持刺激感，不太喜欢提前规划',
  quiet:
    '我偏好安静稳定、低频社交和慢节奏生活，希望重要决定充分讨论并提前规划',
};

function birthYear(age) {
  return YEAR - age;
}

function setting(ageMin, ageMax, heightMin, heightMax, minEducation, circleId, babyPlan, psych, text) {
  return {
    ageMin,
    ageMax,
    heightMin,
    heightMax,
    minEducation,
    likeCircleIds: String(circleId),
    likeBabyPlan: babyPlan,
    selfViewText: text,
    targetViewText: text,
    psychProfile: psych,
  };
}

const CASES = [
  {
    openid: 'sc_case_m_stable',
    gender: 1,
    age: 33,
    heightRange: '170-180cm',
    education: '本科',
    circleId: 1,
    city: '深圳',
    babyPlan: '3-5年内',
    setting: setting(28, 36, 155, 180, '大专', 1, '3-5年内', PSYCH.stable, TEXT.stable),
  },
  {
    openid: 'sc_case_f_stable',
    gender: 2,
    age: 31,
    heightRange: '160-170cm',
    education: '硕士',
    circleId: 1,
    city: '深圳',
    babyPlan: '3-5年内',
    setting: setting(30, 38, 165, 185, '本科', 1, '3-5年内', PSYCH.stable, TEXT.stable),
  },
  {
    openid: 'sc_case_m_short',
    gender: 1,
    age: 37,
    heightRange: '140-150cm',
    education: '大专',
    circleId: 2,
    city: '广州',
    babyPlan: '2-3年内',
    setting: setting(30, 38, 145, 175, '大专', 2, '2-3年内', PSYCH.short, TEXT.short),
  },
  {
    openid: 'sc_case_f_short',
    gender: 2,
    age: 34,
    heightRange: '150-160cm',
    education: '本科',
    circleId: 2,
    city: '广州',
    babyPlan: '2-3年内',
    setting: setting(35, 40, 140, 170, '大专', 2, '2-3年内', PSYCH.short, TEXT.short),
  },
  {
    openid: 'sc_case_m_dink',
    gender: 1,
    age: 32,
    heightRange: '180-190cm',
    education: '本科',
    circleId: 3,
    city: '上海',
    babyPlan: '丁克',
    setting: setting(29, 35, 160, 180, '本科', 3, '丁克', PSYCH.dinks, TEXT.dinks),
  },
  {
    openid: 'sc_case_f_dink',
    gender: 2,
    age: 30,
    heightRange: '160-170cm',
    education: '本科',
    circleId: 3,
    city: '上海',
    babyPlan: '丁克',
    setting: setting(30, 35, 175, 190, '本科', 3, '丁克', PSYCH.dinks, TEXT.dinks),
  },
  {
    openid: 'sc_case_m_low_edu',
    gender: 1,
    age: 34,
    heightRange: '170-180cm',
    education: '高中及以下',
    circleId: 4,
    city: '成都',
    babyPlan: '1年内',
    setting: setting(30, 36, 160, 175, '高中及以下', 4, '1年内', PSYCH.stable, TEXT.education),
  },
  {
    openid: 'sc_case_f_low_edu_ok',
    gender: 2,
    age: 32,
    heightRange: '160-170cm',
    education: '硕士',
    circleId: 4,
    city: '成都',
    babyPlan: '1年内',
    setting: setting(32, 36, 165, 185, '博士', 4, '1年内', PSYCH.stable, TEXT.education),
  },
  {
    openid: 'sc_case_m_psych_low',
    gender: 1,
    age: 35,
    heightRange: '170-180cm',
    education: '本科',
    circleId: 5,
    city: '杭州',
    babyPlan: '待定',
    setting: setting(30, 36, 155, 175, '大专', 5, '待定', PSYCH.mismatchA, TEXT.adventure),
  },
  {
    openid: 'sc_case_f_psych_low',
    gender: 2,
    age: 33,
    heightRange: '160-170cm',
    education: '本科',
    circleId: 5,
    city: '杭州',
    babyPlan: '待定',
    setting: setting(34, 38, 165, 185, '大专', 5, '待定', PSYCH.mismatchB, TEXT.quiet),
  },
  {
    openid: 'sc_case_m_age_fail',
    gender: 1,
    age: 46,
    heightRange: '170-180cm',
    education: '本科',
    circleId: 6,
    city: '武汉',
    babyPlan: '3-5年内',
    setting: setting(29, 31, 155, 175, '大专', 6, '3-5年内', PSYCH.stable, TEXT.stable),
  },
  {
    openid: 'sc_case_f_age_guard',
    gender: 2,
    age: 30,
    heightRange: '160-170cm',
    education: '本科',
    circleId: 6,
    city: '武汉',
    babyPlan: '3-5年内',
    setting: setting(30, 40, 165, 185, '大专', 6, '3-5年内', PSYCH.stable, TEXT.stable),
  },
];

const OPENIDS = CASES.map((c) => c.openid);

const EXPECTED_PAIRS = [
  ['sc_case_m_stable', 'sc_case_f_stable'],
  ['sc_case_m_short', 'sc_case_f_short'],
  ['sc_case_m_dink', 'sc_case_f_dink'],
  ['sc_case_m_low_edu', 'sc_case_f_low_edu_ok'],
];

const UNMATCHED_BY_GATE = ['sc_case_m_psych_low', 'sc_case_f_psych_low'];

async function requireColumn(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  ok(`${table}.${column} exists`, rows.length === 1);
}

async function insertCase(row) {
  const vipExpire = new Date(Date.now() + 30 * 86400000);
  const [created] = await pool.query(
    `INSERT INTO \`user\`
     (openid, gender, birth_year, height_range, education, circle_id, city,
      marry_status, baby_plan, status, is_vip, vip_expire_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, '未婚', ?, ?, 1, ?)`,
    [
      row.openid,
      row.gender,
      birthYear(row.age),
      row.heightRange,
      row.education,
      row.circleId,
      row.city,
      row.babyPlan,
      USER_STATUS.NORMAL,
      vipExpire,
    ]
  );

  const s = row.setting;
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_circle_ids, like_marry_status, like_baby_plan,
      self_view_text, target_view_text, psych_profile_json, last_edit_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, '未婚', ?, ?, ?, ?, NULL)`,
    [
      created.insertId,
      s.ageMin,
      s.ageMax,
      s.heightMin,
      s.heightMax,
      s.minEducation,
      s.likeCircleIds,
      s.likeBabyPlan,
      s.selfViewText,
      s.targetViewText,
      JSON.stringify(s.psychProfile),
    ]
  );

  return { id: created.insertId, openid: row.openid };
}

function parseDetail(row) {
  return typeof row.score_detail_json === 'string'
    ? JSON.parse(row.score_detail_json)
    : row.score_detail_json;
}

function rowFor(rows, openid, matchOpenid) {
  return rows.find((r) => r.user_openid === openid && r.match_openid === matchOpenid);
}

function printPairTable(rows) {
  const lines = [];
  for (const [a, b] of EXPECTED_PAIRS) {
    const ra = rowFor(rows, a, b);
    const rb = rowFor(rows, b, a);
    if (!ra || !rb) continue;
    const da = parseDetail(ra);
    const db = parseDetail(rb);
    lines.push({
      pair: `${a} <-> ${b}`,
      view: Number(ra.view_similarity),
      score_a: Number(ra.total_score),
      score_b: Number(rb.total_score),
      psych_a: da.side.psych_score,
      psych_b: db.side.psych_score,
      baby_a: da.side.baby,
      baby_b: db.side.baby,
      height_a: da.side.height,
      height_b: db.side.height,
    });
  }
  console.table(lines);
}

(async () => {
  try {
    await requireColumn('user_match_setting', 'psych_profile_json');
    await requireColumn('user_match_log', 'score_detail_json');
    await cleanupOpenids(OPENIDS);

    for (const row of CASES) {
      await insertCase(row);
    }

    const result = await runBatchMatch(BATCH_DATE, '周五', { scopeOpenidPrefix: 'sc_case_' });
    ok('effect case pool creates four strict-quality expected pairs', result.matched === EXPECTED_PAIRS.length);

    const [rows] = await pool.query(
      `SELECT ml.*, u.openid AS user_openid, mu.openid AS match_openid
       FROM user_match_log ml
       INNER JOIN \`user\` u ON u.id = ml.user_id
       INNER JOIN \`user\` mu ON mu.id = ml.match_user_id
       WHERE ml.match_date = ? AND u.openid LIKE 'sc_case_%'
       ORDER BY ml.id`,
      [BATCH_DATE]
    );
    ok('symmetric logs saved for every expected pair', rows.length === EXPECTED_PAIRS.length * 2);

    for (const [a, b] of EXPECTED_PAIRS) {
      ok(`${a} matches ${b}`, Boolean(rowFor(rows, a, b)));
      ok(`${b} matches ${a}`, Boolean(rowFor(rows, b, a)));
    }

    const involved = new Set(rows.flatMap((r) => [r.user_openid, r.match_openid]));
    ok('age hard filter leaves over-age case unmatched', !involved.has('sc_case_m_age_fail'));
    ok('age hard filter leaves guarded candidate unmatched', !involved.has('sc_case_f_age_guard'));
    ok('quality gate leaves low view/psych case unmatched', UNMATCHED_BY_GATE.every((openid) => !involved.has(openid)));

    const shortDetail = parseDetail(rowFor(rows, 'sc_case_f_short', 'sc_case_m_short'));
    ok('140-150cm case is matchable', Number(shortDetail.side.height) > 0);

    const lowEduDetail = parseDetail(rowFor(rows, 'sc_case_f_low_edu_ok', 'sc_case_m_low_edu'));
    ok('below-min education is soft-scored not hard-rejected', lowEduDetail.side.education === 0);

    const stableDetail = parseDetail(rowFor(rows, 'sc_case_m_stable', 'sc_case_f_stable'));
    ok('high psychology pair records 100 psych score', stableDetail.side.psych_score === 100);
    ok('high compatibility pair passes quality gate', stableDetail.quality_gate && stableDetail.quality_gate.pass === true);

    const dinkDetail = parseDetail(rowFor(rows, 'sc_case_m_dink', 'sc_case_f_dink'));
    ok('same baby plan earns full baby score', dinkDetail.side.baby === 30);

    printPairTable(rows);
  } finally {
    await cleanupOpenids(OPENIDS);
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
