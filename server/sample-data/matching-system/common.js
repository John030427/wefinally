require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool, USER_STATUS, ok } = require('../../selfcheck/_helpers');

const SAMPLE_PREFIX = 'sample_match_';
const sampleDir = __dirname;
const fixtures = JSON.parse(fs.readFileSync(path.join(sampleDir, 'fixtures.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(sampleDir, 'expected-results.json'), 'utf8'));
const latestPath = path.join(sampleDir, 'latest-run.json');

const PSYCH = {
  stable: {
    marriage_pace: '稳定推进',
    conflict_style: '及时沟通',
    security_space: '亲密也独立',
    family_boundary: '小家庭优先',
    money_view: '共同规划',
    career_family: '动态平衡',
  },
  dinks: {
    marriage_pace: '顺其自然',
    conflict_style: '需要空间',
    security_space: '重视个人空间',
    family_boundary: '小家庭优先',
    money_view: '相对独立',
    career_family: '事业优先',
  },
  legacy_empty: {},
};

const TEXT = {
  stable: '我重视长期婚姻、责任、稳定沟通和共同经营家庭，遇到分歧愿意复盘，也尊重彼此成长空间',
  dinks: '我享受独立生活和事业成长，婚姻里需要空间、尊重和清晰边界，暂时不计划生育',
  young_stable: '我希望关系真诚稳定，遇到问题愿意沟通，也愿意认真了解后一起规划未来生活',
  legacy: '我重视现实责任和稳定沟通，虽然资料项不完整，但愿意认真经营长期关系',
};

function birthYear(age) {
  return new Date().getFullYear() - Number(age);
}

function assertSampleOpenid(openid) {
  if (!String(openid || '').startsWith(SAMPLE_PREFIX)) {
    throw new Error(`sample openid must start with ${SAMPLE_PREFIX}: ${openid}`);
  }
}

async function clearSampleData() {
  const [users] = await pool.query('SELECT id, openid FROM `user` WHERE openid LIKE ?', [`${SAMPLE_PREFIX}%`]);
  const ids = users.map((row) => row.id);
  if (ids.length) {
    const qs = ids.map(() => '?').join(',');
    await pool.query(`DELETE FROM user_match_log WHERE user_id IN (${qs}) OR match_user_id IN (${qs})`, [...ids, ...ids]);
    await pool.query(`DELETE FROM user_match_setting WHERE user_id IN (${qs})`, ids);
    await pool.query(`DELETE FROM \`user\` WHERE id IN (${qs})`, ids);
  }
}

async function insertSampleUser(row) {
  assertSampleOpenid(row.openid);
  const vipExpire = row.isVip ? new Date(Date.now() + 30 * 86400000) : null;
  const [created] = await pool.query(
    `INSERT INTO \`user\`
     (openid, gender, birth_year, height_range, education, circle_id, city,
      marry_status, baby_plan, status, is_vip, vip_expire_time,
      appearance_description, appearance_want)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.openid,
      row.gender,
      birthYear(row.age),
      row.heightRange,
      row.education,
      row.circleId,
      row.city,
      row.marryStatus || '未婚',
      row.babyPlan,
      USER_STATUS.NORMAL,
      row.isVip ? 1 : 0,
      vipExpire,
      row.appearanceDescription || '',
      row.appearanceWant || '',
    ]
  );

  const s = row.setting;
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_circle_ids, like_marry_status, like_baby_plan,
      self_view_text, target_view_text, psych_profile_json, last_edit_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      created.insertId,
      s.ageMin,
      s.ageMax,
      s.heightMin,
      s.heightMax,
      s.minEducation,
      s.likeCircleIds,
      s.likeMarryStatus || '未婚',
      s.likeBabyPlan,
      TEXT[s.text],
      TEXT[s.text],
      JSON.stringify(PSYCH[s.psychProfile]),
    ]
  );

  return created.insertId;
}

async function seedSampleData() {
  await clearSampleData();
  for (const row of fixtures.users) {
    await insertSampleUser(row);
  }
}

function parseDetail(value) {
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function dateOnly(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function collectSampleResults() {
  const [rows] = await pool.query(
    `SELECT owner.openid AS owner_openid, partner.openid AS partner_openid,
            ml.match_type, ml.total_score, ml.score_version, ml.score_detail_json,
            ml.ai_report_status, ml.ai_report_text, ml.ai_report_error, ml.match_date
     FROM user_match_log ml
     INNER JOIN \`user\` owner ON owner.id = ml.user_id
     INNER JOIN \`user\` partner ON partner.id = ml.match_user_id
     WHERE owner.openid LIKE ?
     ORDER BY owner.openid, partner.openid`,
    [`${SAMPLE_PREFIX}%`]
  );

  const matches = rows.map((row) => {
    const detail = parseDetail(row.score_detail_json);
    return {
      owner: row.owner_openid,
      partner: row.partner_openid,
      matchDate: dateOnly(row.match_date),
      matchType: row.match_type,
      totalScore: Number(row.total_score),
      scoreVersion: row.score_version,
      detailVersion: detail?.version || '',
      algorithmRank: detail?.algorithm_rank || null,
      aiRank: detail?.ai_rank || null,
      aiWeightStatus: detail?.ai_weight?.status || null,
      reportStatusInDetail: detail?.report_status || null,
      aiReportStatus: Number(row.ai_report_status || 0),
      hasReportText: Boolean(row.ai_report_text),
      reportError: row.ai_report_error || '',
    };
  });

  const main = matches.find((row) => row.owner === expected.main.viewer);
  const fail = matches.find((row) => row.owner === expected.reportFailure.viewer);
  const wave2Cases = (expected.wave2 || []).map((item) => {
    const found = matches.find((row) => (
      row.owner === item.viewer
      && row.partner === item.partner
      && row.matchDate === item.batchDate
      && row.detailVersion === expected.main.scoreVersion
    ));
    return {
      name: item.name,
      passed: Boolean(found),
      owner: item.viewer,
      partner: item.partner,
      batchDate: item.batchDate,
      aiReportStatus: found ? found.aiReportStatus : null,
    };
  });
  const summary = {
    algorithmMatched: Boolean(main && main.scoreVersion === expected.main.scoreVersion && main.algorithmRank > main.aiRank),
    aiRerankApplied: Boolean(main && main.partner === expected.main.aiFirst && main.aiWeightStatus === 1),
    aiReportGenerated: Boolean(main && main.aiReportStatus === expected.main.reportStatus && main.hasReportText),
    reportFailureFallback: Boolean(fail && fail.partner === expected.reportFailure.partner && fail.aiReportStatus === expected.reportFailure.reportStatus && fail.reportError.includes('mock')),
    wave2Cases,
    wave2AllPassed: wave2Cases.length > 0 && wave2Cases.every((item) => item.passed),
  };

  return { summary, matches };
}

function writeLatest(result) {
  fs.writeFileSync(latestPath, `${JSON.stringify(result, null, 2)}\n`);
}

module.exports = {
  clearSampleData,
  collectSampleResults,
  expected,
  fixtures,
  latestPath,
  ok,
  pool,
  seedSampleData,
  writeLatest,
};
