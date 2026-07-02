const DIMENSIONS = [
  'marriage_pace',
  'conflict_style',
  'security_space',
  'family_boundary',
  'money_view',
  'career_family',
];

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

function scorePsychProfile(a, b) {
  const pa = normalizePsychProfile(a);
  const pb = normalizePsychProfile(b);
  let compared = 0;
  let matched = 0;
  const detail = {};

  for (const key of DIMENSIONS) {
    if (!pa[key] || !pb[key]) continue;
    compared += 1;
    const same = pa[key] === pb[key];
    if (same) matched += 1;
    detail[key] = same ? 100 : 0;
  }

  if (compared === 0) return { score: 0, compared: 0, detail };
  return {
    score: Math.round((matched / compared) * 100),
    compared,
    detail,
  };
}

module.exports = {
  DIMENSIONS,
  normalizePsychProfile,
  parsePsychProfile,
  scorePsychProfile,
};
