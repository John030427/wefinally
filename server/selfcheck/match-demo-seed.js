require('dotenv').config();

const { ok, pool, USER_STATUS } = require('./_helpers');
const {
  PSYCH,
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
  PARTNER_PREFIX,
  clearDemoMatchData,
} = require('./match-demo-clear');

const DEMO_MATCHES = [
  { suffix: 'high', matchDate: '2026-07-03', matchType: '演示高契合' },
  { suffix: 'view', matchDate: '2026-07-01', matchType: '演示三观中等', viewSim: 65 },
  {
    suffix: 'psych',
    matchDate: '2026-06-26',
    matchType: '演示心理磨合',
    partnerPsych: {
      marriage_pace: PSYCH.stable.marriage_pace,
      conflict_style: '冷静后沟通',
      security_space: PSYCH.stable.security_space,
      family_boundary: '边界清晰',
      money_view: PSYCH.stable.money_view,
      career_family: '事业优先',
    },
  },
  { suffix: 'edu', matchDate: '2026-06-24', matchType: '演示学历软扣', partnerEducation: '高中及以下' },
  { suffix: 'city', matchDate: '2026-06-19', matchType: '演示异地扣分', partnerCity: '广州' },
];

function cloneCase(row, overrides = {}) {
  return {
    ...row,
    ...overrides,
    setting: {
      ...row.setting,
      ...(overrides.setting || {}),
    },
  };
}

function partnerForScenario(basePartner, scenario) {
  const settingOverrides = {};
  if (scenario.partnerPsych) settingOverrides.psychProfile = scenario.partnerPsych;
  return cloneCase(basePartner, {
    openid: `${PARTNER_PREFIX}${scenario.suffix}`,
    education: scenario.partnerEducation || basePartner.education,
    city: scenario.partnerCity || basePartner.city,
    setting: settingOverrides,
  });
}

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

function buildScoreDetail(score, mutualTotal, viewSim, quality, scenarioLabel) {
  return {
    version: 'algo_psych_v1',
    scenario: scenarioLabel,
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

async function insertDemoLog(devId, partnerId, devCase, partnerCase, scenario) {
  const devUser = toUser(DEV_OPENID, devId, devCase);
  const partnerUser = toUser(partnerCase.openid, partnerId, partnerCase);
  const devSetting = toSetting(devCase);
  const partnerSetting = toSetting(partnerCase);
  const viewSim = Number.isFinite(Number(scenario.viewSim))
    ? Number(scenario.viewSim)
    : computeViewSimilarity(
      devSetting.self_view_text,
      devSetting.target_view_text,
      partnerSetting.self_view_text,
      partnerSetting.target_view_text
    );
  const scoreAB = scorePairDetail(devUser, devSetting, partnerUser, viewSim);
  const scoreBA = scorePairDetail(partnerUser, partnerSetting, devUser, viewSim);
  const quality = passesQualityGate(scoreAB, scoreBA, viewSim);
  ok(`${scenario.matchType} passes strict quality gate`, quality.pass === true);

  const mutualTotal = Math.round(((scoreAB.total + scoreBA.total) / 2) * 100) / 100;
  const detailA = buildScoreDetail(scoreAB, mutualTotal, viewSim, quality, scenario.matchType);
  const detailB = buildScoreDetail(scoreBA, mutualTotal, viewSim, quality, scenario.matchType);

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
      scenario.matchDate,
      scenario.matchType,
      partnerId,
      devId,
      viewSim,
      scoreBA.total,
      JSON.stringify(detailB),
      scenario.matchDate,
      scenario.matchType,
    ]
  );

  return {
    type: scenario.matchType,
    partner_openid: partnerCase.openid,
    total: scoreAB.total,
    view_similarity: viewSim,
    psych_score: scoreAB.detail.psych_score,
  };
}

(async () => {
  try {
    await clearDemoMatchData();

    const gender = await existingDevGender();
    const devCase = stableCaseForGender(gender);
    const basePartner = stablePartnerForGender(gender);
    const devId = await upsertUser(DEV_OPENID, devCase);
    await upsertSetting(devId, devCase);

    const inserted = [];
    for (const scenario of DEMO_MATCHES) {
      const partnerCase = partnerForScenario(basePartner, scenario);
      const partnerId = await upsertUser(partnerCase.openid, partnerCase);
      await upsertSetting(partnerId, partnerCase);
      inserted.push(await insertDemoLog(devId, partnerId, devCase, partnerCase, scenario));
    }

    ok(`demo matches visible for ${DEV_OPENID}`, inserted.length === DEMO_MATCHES.length);
    console.log(JSON.stringify({ dev_openid: DEV_OPENID, count: inserted.length, matches: inserted }, null, 2));
  } finally {
    await pool.end();
  }
})().catch(async (err) => {
  console.error(err.stack || err.message);
  await pool.end();
  process.exit(1);
});
