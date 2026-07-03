require('dotenv').config();

const { ok, pool, USER_STATUS } = require('./_helpers');
const {
  birthYear,
  stableCaseForGender,
  stablePartnerForGender,
} = require('./match-effect-fixtures');
const {
  computeViewSimilarity,
  passesQualityGate,
  scorePairDetail,
} = require('../src/services/matchService');
const {
  DEV_OPENID,
  MATCH_DATE,
  MATCH_TYPE,
  PARTNER_OPENID,
  clearDemoMatchData,
} = require('./match-demo-clear');

function toSetting(row) {
  const s = row.setting;
  return {
    age_min: s.ageMin,
    age_max: s.ageMax,
    height_min: s.heightMin,
    height_max: s.heightMax,
    min_education: s.minEducation,
    like_circle_ids: s.likeCircleIds,
    like_marry_status: '未婚',
    like_baby_plan: s.likeBabyPlan,
    like_income: null,
    like_house_car: null,
    self_view_text: s.selfViewText,
    target_view_text: s.targetViewText,
    psych_profile_json: JSON.stringify(s.psychProfile),
  };
}

function toUser(openid, id, row) {
  return {
    id,
    openid,
    gender: row.gender,
    birth_year: birthYear(row.age),
    height_range: row.heightRange,
    education: row.education,
    circle_id: row.circleId,
    city: row.city,
    marry_status: '未婚',
    baby_plan: row.babyPlan,
    status: USER_STATUS.NORMAL,
    is_vip: 1,
    psych_profile_json: JSON.stringify(row.setting.psychProfile),
  };
}

async function existingDevGender() {
  const [rows] = await pool.query('SELECT gender FROM `user` WHERE openid = ? LIMIT 1', [DEV_OPENID]);
  return Number(rows[0]?.gender) === 2 ? 2 : 1;
}

async function upsertUser(openid, row) {
  const vipExpire = new Date(Date.now() + 30 * 86400000);
  await pool.query(
    `INSERT INTO \`user\`
     (openid, gender, birth_year, height_range, education, circle_id, city,
      marry_status, baby_plan, status, is_vip, vip_expire_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, '未婚', ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE
      gender = VALUES(gender),
      birth_year = VALUES(birth_year),
      height_range = VALUES(height_range),
      education = VALUES(education),
      circle_id = VALUES(circle_id),
      city = VALUES(city),
      marry_status = '未婚',
      baby_plan = VALUES(baby_plan),
      status = VALUES(status),
      is_vip = 1,
      vip_expire_time = VALUES(vip_expire_time)`,
    [
      openid,
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

  const [[user]] = await pool.query('SELECT id FROM `user` WHERE openid = ?', [openid]);
  return user.id;
}

async function upsertSetting(userId, row) {
  const s = toSetting(row);
  await pool.query(
    `INSERT INTO user_match_setting
     (user_id, age_min, age_max, height_min, height_max, min_education,
      like_circle_ids, like_marry_status, like_baby_plan,
      self_view_text, target_view_text, psych_profile_json, last_edit_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
      age_min = VALUES(age_min),
      age_max = VALUES(age_max),
      height_min = VALUES(height_min),
      height_max = VALUES(height_max),
      min_education = VALUES(min_education),
      like_circle_ids = VALUES(like_circle_ids),
      like_marry_status = VALUES(like_marry_status),
      like_baby_plan = VALUES(like_baby_plan),
      self_view_text = VALUES(self_view_text),
      target_view_text = VALUES(target_view_text),
      psych_profile_json = VALUES(psych_profile_json),
      last_edit_time = NULL`,
    [
      userId,
      s.age_min,
      s.age_max,
      s.height_min,
      s.height_max,
      s.min_education,
      s.like_circle_ids,
      s.like_marry_status,
      s.like_baby_plan,
      s.self_view_text,
      s.target_view_text,
      s.psych_profile_json,
    ]
  );
}

function buildScoreDetail(score, mutualTotal, viewSim, quality) {
  return {
    version: 'algo_psych_v1',
    total: score.total,
    mutual_total: mutualTotal,
    view_similarity: viewSim,
    ai_weight: null,
    quality_gate: {
      pass: quality.pass,
      reasons: quality.reasons,
      fallback: false,
    },
    side: score.detail,
  };
}

async function insertDemoLogs(devId, partnerId, devCase, partnerCase) {
  const devUser = toUser(DEV_OPENID, devId, devCase);
  const partnerUser = toUser(PARTNER_OPENID, partnerId, partnerCase);
  const devSetting = toSetting(devCase);
  const partnerSetting = toSetting(partnerCase);
  const viewSim = computeViewSimilarity(
    devSetting.self_view_text,
    devSetting.target_view_text,
    partnerSetting.self_view_text,
    partnerSetting.target_view_text
  );
  const scoreAB = scorePairDetail(devUser, devSetting, partnerUser, viewSim);
  const scoreBA = scorePairDetail(partnerUser, partnerSetting, devUser, viewSim);
  const quality = passesQualityGate(scoreAB, scoreBA, viewSim);
  ok('demo pair passes strict quality gate', quality.pass === true);

  const mutualTotal = Math.round(((scoreAB.total + scoreBA.total) / 2) * 100) / 100;
  const detailA = buildScoreDetail(scoreAB, mutualTotal, viewSim, quality);
  const detailB = buildScoreDetail(scoreBA, mutualTotal, viewSim, quality);

  await pool.query(
    `INSERT INTO user_match_log
     (user_id, match_user_id, view_similarity, total_score, score_detail_json,
      score_version, ai_report_status, ai_report_error, match_date, match_type)
     VALUES (?, ?, ?, ?, ?, 'algo_psych_v1', 3, 'disabled', ?, ?),
            (?, ?, ?, ?, ?, 'algo_psych_v1', 3, 'disabled', ?, ?)`,
    [
      devId,
      partnerId,
      viewSim,
      scoreAB.total,
      JSON.stringify(detailA),
      MATCH_DATE,
      MATCH_TYPE,
      partnerId,
      devId,
      viewSim,
      scoreBA.total,
      JSON.stringify(detailB),
      MATCH_DATE,
      MATCH_TYPE,
    ]
  );

  return { mutualTotal, scoreA: scoreAB.total, scoreB: scoreBA.total, viewSim };
}

(async () => {
  try {
    await clearDemoMatchData();

    const gender = await existingDevGender();
    const devCase = stableCaseForGender(gender);
    const partnerCase = {
      ...stablePartnerForGender(gender),
      openid: PARTNER_OPENID,
    };

    const devId = await upsertUser(DEV_OPENID, devCase);
    const partnerId = await upsertUser(PARTNER_OPENID, partnerCase);
    await upsertSetting(devId, devCase);
    await upsertSetting(partnerId, partnerCase);

    const result = await insertDemoLogs(devId, partnerId, devCase, partnerCase);
    ok(`demo match visible for ${DEV_OPENID}`, true);
    console.log(JSON.stringify({
      dev_openid: DEV_OPENID,
      partner_openid: PARTNER_OPENID,
      match_date: MATCH_DATE,
      match_type: MATCH_TYPE,
      ...result,
    }, null, 2));
  } finally {
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
