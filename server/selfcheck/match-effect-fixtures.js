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

function caseByOpenid(openid) {
  return CASES.find((row) => row.openid === openid);
}

function stableCaseForGender(gender) {
  return gender === 2 ? caseByOpenid('sc_case_f_stable') : caseByOpenid('sc_case_m_stable');
}

function stablePartnerForGender(gender) {
  return gender === 2 ? caseByOpenid('sc_case_m_stable') : caseByOpenid('sc_case_f_stable');
}

module.exports = {
  BATCH_DATE,
  CASES,
  EXPECTED_PAIRS,
  OPENIDS,
  PSYCH,
  TEXT,
  UNMATCHED_BY_GATE,
  birthYear,
  caseByOpenid,
  setting,
  stableCaseForGender,
  stablePartnerForGender,
};
