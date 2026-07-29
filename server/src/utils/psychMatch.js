const DIMENSIONS = [
  'marriage_pace',
  'conflict_style',
  'security_space',
  'family_boundary',
  'money_view',
  'career_family',
];

const OPTIONS = {
  marriage_pace: ['稳定推进', '先磨合再定', '顺其自然'],
  conflict_style: ['及时沟通', '冷静后沟通', '需要空间'],
  security_space: ['高陪伴感', '亲密也独立', '重视个人空间'],
  family_boundary: ['大家庭融合', '小家庭优先', '边界清晰'],
  money_view: ['共同规划', '相对独立', '稳健储蓄'],
  career_family: ['事业优先', '家庭优先', '动态平衡'],
};

function parsePsychProfile(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function normalizePsychProfile(input) {
  const src = parsePsychProfile(input);
  const out = {};
  for (const key of DIMENSIONS) {
    const val = String(src[key] || '').trim();
    if (val) out[key] = val.slice(0, 30);
  }
  return out;
}

function compatibilityScore(key, a, b) {
  if (!a || !b) return null;
  if (a === b) return 100;
  const opts = OPTIONS[key] || [];
  const ia = opts.indexOf(a);
  const ib = opts.indexOf(b);
  if (ia < 0 || ib < 0) return 0;
  const dist = Math.abs(ia - ib);
  if (dist === 1) return 70;
  return 35;
}

function scorePsychProfile(a, b) {
  const pa = normalizePsychProfile(a);
  const pb = normalizePsychProfile(b);
  let compared = 0;
  let total = 0;
  const detail = {};

  for (const key of DIMENSIONS) {
    if (!pa[key] || !pb[key]) continue;
    compared += 1;
    const score = compatibilityScore(key, pa[key], pb[key]);
    total += score;
    detail[key] = score;
  }

  if (compared === 0) return { score: 0, compared: 0, detail };
  return {
    score: Math.round(total / compared),
    compared,
    detail,
  };
}

module.exports = {
  DIMENSIONS,
  OPTIONS,
  compatibilityScore,
  normalizePsychProfile,
  parsePsychProfile,
  scorePsychProfile,
};
