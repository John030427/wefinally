// ponytail: pure function selfcheck, no DB/server required.
const m = require('../src/services/matchService');
const { ok } = require('./_helpers');

ok('height range midpoint 170-180cm -> 175', m.parseHeightCm('170-180cm') === 175);
ok('precise height 175cm -> 175', m.parseHeightCm('175cm') === 175);
ok('height above bucket 190cm以上 -> 190', m.parseHeightCm('190cm以上') === 190);
ok('education rank 本科 > 大专', m.eduRank('本科') > m.eduRank('大专'));
ok('hard age rejects outside range', m.hardOk({ age_min: 18, age_max: 22 }, { birth_year: 1995 }) === false);
ok('hard age accepts inside range', m.hardOk({ age_min: 25, age_max: 35 }, { birth_year: 1995 }) === true);

const setting = {
  like_baby_plan: null,
  age_min: null,
  age_max: null,
  height_min: null,
  height_max: null,
  min_education: '大专',
  like_circle_ids: '',
};
const user = { city: '深圳' };
const good = { baby_plan: null, birth_year: 1995, height_range: '170-180cm', education: '本科', circle_id: 1, city: '深圳' };
const bad = { ...good, education: '高中及以下' };

ok('education soft score rewards minimum-or-above', m.scorePair(user, setting, good, 0) > m.scorePair(user, setting, bad, 0));

const unlimitedBaby = m.scorePair(user, { ...setting, like_baby_plan: '不限' }, good, 0);
const emptyBaby = m.scorePair(user, setting, good, 0);
ok('baby plan 不限 is treated like no hard preference', unlimitedBaby === emptyBaby);

const appearanceUser = {
  city: '深圳',
  appearance_want: '希望对方清爽自然，有运动感',
};
const appearanceGood = {
  ...good,
  appearance_description: '平时穿搭干净清爽，喜欢跑步健身，有运动感',
};
const appearanceBad = {
  ...good,
  appearance_description: '偏成熟商务风，正式稳重',
};
const appearanceGoodScore = m.scorePairDetail(appearanceUser, setting, appearanceGood, 0);
const appearanceBadScore = m.scorePairDetail(appearanceUser, setting, appearanceBad, 0);
ok('appearance preference contributes to match score from text', appearanceGoodScore.detail.appearance > 0 && appearanceGoodScore.total > appearanceBadScore.total);
ok('appearance scoring is capped by configured weight', appearanceGoodScore.detail.appearance <= 10);

const partialPsychA = {
  marriage_pace: '稳定推进',
  conflict_style: '及时沟通',
  security_space: '亲密也独立',
  family_boundary: '小家庭优先',
  money_view: '共同规划',
  career_family: '动态平衡',
};
const partialPsychB = {
  marriage_pace: '先磨合再定',
  conflict_style: '冷静后沟通',
  security_space: '高陪伴感',
  family_boundary: '边界清晰',
  money_view: '稳健储蓄',
  career_family: '家庭优先',
};
const v2User = {
  city: '深圳',
  psych_profile_json: JSON.stringify(partialPsychA),
  appearance_want: '清爽自然',
};
const v2Settings = {
  ...setting,
  like_baby_plan: '3-5年内',
  age_min: 25,
  age_max: 38,
  height_min: 160,
  height_max: 185,
  psych_profile_json: JSON.stringify(partialPsychA),
};
const v2Candidate = {
  ...good,
  baby_plan: '3-5年内',
  birth_year: new Date().getFullYear() - 31,
  height_range: '170-180cm',
  psych_profile_json: JSON.stringify(partialPsychB),
  appearance_description: '干净清爽，自然简单',
};
const evidence = m.scorePairEvidenceV2(v2User, v2Settings, v2Candidate, 80);
ok('evidence v2 score exposes versioned dimensions', evidence.version === 'algo_evidence_v2' && evidence.dimensions && evidence.dimensions.psych && evidence.dimensions.appearance);
ok('psych compatibility matrix gives partial score', evidence.dimensions.psych.raw_score > 0 && evidence.dimensions.psych.raw_score < 18 && evidence.dimensions.psych.compatibility_score > 0 && evidence.dimensions.psych.compatibility_score < 100);
ok('evidence v2 exposes max and normalized totals', evidence.maxTotal > 0 && evidence.normalizedTotal > 0 && evidence.normalizedTotal <= 100);
ok('harmonic mutual score penalizes one-sided match', m.harmonicMean(100, 50) < 75 && m.harmonicMean(100, 50) > 0);

function score(total, psychScore = 100, psychCompared = 6) {
  return {
    total,
    detail: {
      psych_score: psychScore,
      psych_compared: psychCompared,
    },
  };
}

ok('quality gate accepts high compatibility', m.passesQualityGate(score(118), score(118), 100).pass === true);

const lowView = m.passesQualityGate(score(100), score(100), 16);
ok('quality gate rejects low view similarity', lowView.pass === false && lowView.reasons.includes('view_similarity'));

const lowPsych = m.passesQualityGate(score(100, 0, 6), score(100, 100, 6), 80);
ok('quality gate rejects sufficiently compared low psych score', lowPsych.pass === false && lowPsych.reasons.includes('psych_score'));

ok('quality gate does not kill old users with incomplete psych data', m.passesQualityGate(score(95, 0, 2), score(95, 0, 0), 80).pass === true);

const lowSide = m.passesQualityGate(score(89, 100, 6), score(110, 100, 6), 80);
ok('quality gate rejects low one-sided score', lowSide.pass === false && lowSide.reasons.includes('side_score'));
