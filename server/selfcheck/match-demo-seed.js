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

const DEMO_VIEW_TEXT = {
  devSelf:
    '我重视长期婚姻、责任感、稳定沟通和共同经营家庭，遇到分歧愿意复盘，也尊重彼此成长空间',
  devTarget:
    '希望对方真诚稳定，有责任心，愿意认真经营关系，能一起规划家庭和事业，也保留彼此成长空间',
};

const PARTNER_TEXT = {
  steady:
    '我期待稳定亲密关系，重视责任、沟通和长期家庭经营，分歧时愿意复盘，也支持彼此成长',
  city:
    '我工作节奏比较稳定，重视长期承诺和有效沟通，异地也愿意提前安排见面与未来规划',
  circle:
    '我在职业圈层里接触人多，但感情上偏慢热，重视坦诚、责任和稳定经营',
  boundary:
    '我喜欢清晰边界和独立空间，也重视承诺、复盘沟通和稳定的家庭经营',
  education:
    '我不太看重学历标签，更看重责任感、诚实沟通、生活稳定和共同解决问题的能力',
  career:
    '我事业心比较强，平时节奏忙，但会为重要关系留时间，重视承诺和长期计划',
  open:
    '我喜欢新鲜体验和旅行，也重视关系中的责任、沟通和未来规划',
};

const PSYCH_VARIANTS = {
  stable: PSYCH.stable,
  boundary: {
    ...PSYCH.stable,
    conflict_style: '冷静后沟通',
    security_space: '重视个人空间',
  },
};

const DEMO_MATCHES = [
  {
    suffix: 'steady',
    matchDate: '2026-07-03',
    matchType: '演示高契合',
    viewSim: 92,
    partner: {
      age: 31,
      education: '硕士',
      city: '深圳',
      circleId: 1,
      babyPlan: '3-5年内',
      setting: {
        psychProfile: PSYCH_VARIANTS.stable,
        selfViewText: PARTNER_TEXT.steady,
        targetViewText: PARTNER_TEXT.steady,
      },
    },
  },
  {
    suffix: 'cross_city',
    matchDate: '2026-07-01',
    matchType: '演示跨城',
    viewSim: 84,
    partner: {
      age: 28,
      education: '本科',
      city: '广州',
      circleId: 1,
      babyPlan: '2-3年内',
      setting: {
        psychProfile: PSYCH_VARIANTS.stable,
        selfViewText: PARTNER_TEXT.city,
        targetViewText: PARTNER_TEXT.city,
      },
    },
  },
  {
    suffix: 'education',
    matchDate: '2026-06-26',
    matchType: '演示学历',
    viewSim: 76,
    partner: {
      age: 35,
      education: '高中及以下',
      city: '深圳',
      circleId: 1,
      babyPlan: '1年内',
      setting: {
        psychProfile: PSYCH_VARIANTS.stable,
        selfViewText: PARTNER_TEXT.education,
        targetViewText: PARTNER_TEXT.education,
      },
    },
  },
  {
    suffix: 'low_view',
    matchDate: '2026-06-24',
    matchType: '演示三观适中',
    viewSim: 68,
    partner: {
      age: 29,
      education: '本科',
      city: '深圳',
      circleId: 1,
      babyPlan: '待定',
      setting: {
        psychProfile: PSYCH_VARIANTS.stable,
        selfViewText: PARTNER_TEXT.open,
        targetViewText: PARTNER_TEXT.open,
      },
    },
  },
  {
    suffix: 'circle',
    matchDate: '2026-06-19',
    matchType: '演示圈层',
    viewSim: 88,
    partner: {
      age: 37,
      education: '大专',
      city: '深圳',
      circleId: 4,
      babyPlan: '待定',
      setting: {
        psychProfile: PSYCH_VARIANTS.stable,
        selfViewText: PARTNER_TEXT.circle,
        targetViewText: PARTNER_TEXT.circle,
      },
    },
  },
  {
    suffix: 'psych',
    matchDate: '2026-06-17',
    matchType: '演示心理',
    viewSim: 92,
    partner: {
      age: 34,
      education: '本科',
      city: '深圳',
      circleId: 1,
      babyPlan: '丁克',
      setting: {
        psychProfile: PSYCH_VARIANTS.boundary,
        selfViewText: PARTNER_TEXT.boundary,
        targetViewText: PARTNER_TEXT.boundary,
      },
    },
  },
  {
    suffix: 'career',
    matchDate: '2026-06-12',
    matchType: '演示事业异地',
    viewSim: 96,
    partner: {
      age: 40,
      education: '博士',
      city: '杭州',
      circleId: 5,
      babyPlan: '3-5年内',
      setting: {
        psychProfile: PSYCH_VARIANTS.stable,
        selfViewText: PARTNER_TEXT.career,
        targetViewText: PARTNER_TEXT.career,
      },
    },
  },
  {
    suffix: 'open_view',
    matchDate: '2026-06-10',
    matchType: '演示三观中等',
    viewSim: 80,
    partner: {
      age: 26,
      education: '大专',
      city: '上海',
      circleId: 1,
      babyPlan: '丁克',
      setting: {
        psychProfile: PSYCH_VARIANTS.stable,
        selfViewText: PARTNER_TEXT.open,
        targetViewText: PARTNER_TEXT.open,
      },
    },
  },
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

function demoDevCaseForGender(gender) {
  return cloneCase(stableCaseForGender(gender), {
    babyPlan: '待定',
    setting: {
      ageMin: 25,
      ageMax: 42,
      minEducation: '高中及以下',
      likeBabyPlan: null,
      selfViewText: DEMO_VIEW_TEXT.devSelf,
      targetViewText: DEMO_VIEW_TEXT.devTarget,
      psychProfile: PSYCH_VARIANTS.stable,
    },
  });
}

function partnerForScenario(basePartner, scenario, devCase) {
  const partner = scenario.partner || {};
  const settingOverrides = {
    likeBabyPlan: null,
    minEducation: '大专',
    likeCircleIds: String(devCase.circleId),
    ...(partner.setting || {}),
  };
  return cloneCase(basePartner, {
    openid: `${PARTNER_PREFIX}${scenario.suffix}`,
    age: partner.age || basePartner.age,
    heightRange: partner.heightRange || basePartner.heightRange,
    education: partner.education || basePartner.education,
    circleId: partner.circleId || basePartner.circleId,
    city: partner.city || basePartner.city,
    babyPlan: partner.babyPlan || basePartner.babyPlan,
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
    const devCase = demoDevCaseForGender(gender);
    const basePartner = stablePartnerForGender(gender);
    const devId = await upsertUser(DEV_OPENID, devCase);
    await upsertSetting(devId, devCase);

    const inserted = [];
    for (const scenario of DEMO_MATCHES) {
      const partnerCase = partnerForScenario(basePartner, scenario, devCase);
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
