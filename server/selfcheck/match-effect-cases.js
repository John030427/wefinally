const { cleanupOpenids, ok, pool, USER_STATUS } = require('./_helpers');
const { runBatchMatch } = require('../src/services/matchService');

const {
  BATCH_DATE,
  CASES,
  EXPECTED_PAIRS,
  OPENIDS,
  UNMATCHED_BY_GATE,
  birthYear,
} = require('./match-effect-fixtures');


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
