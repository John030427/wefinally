// ponytail: 匹配核心逻辑自检（无DB）。跑法: cd server && node match.selfcheck.js
const m = require('./src/services/matchService');
let bad = 0; const a = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n); if (!c) bad++; };
a('身高区间取中位数 170-180→175', m.parseHeightCm('170-180cm') === 175);
a('身高精确 175cm→175', m.parseHeightCm('175cm') === 175);
a('身高 190cm以上→190', m.parseHeightCm('190cm以上') === 190);
a('学历层级 本科>大专', m.eduRank('本科') > m.eduRank('大专'));
a('年龄硬条件 区间外→false', m.hardOk({ age_min: 18, age_max: 22 }, { birth_year: 1995 }) === false);
a('年龄硬条件 区间内→true', m.hardOk({ age_min: 25, age_max: 35 }, { birth_year: 1995 }) === true);
const set = { like_baby_plan: null, age_min: null, age_max: null, height_min: null, height_max: null, min_education: '大专', like_circle_ids: '' };
const u = { city: 'SZ' };
const c1 = { baby_plan: null, birth_year: 1995, height_range: '170-180cm', education: '本科', circle_id: 1, city: 'SZ' };
const c2 = { ...c1, education: '高中及以下' };
a('学历软分 达标(本科≥大专) > 不达标(高中)', m.scorePair(u, set, c1, 0) > m.scorePair(u, set, c2, 0));
console.log(bad ? ('FAILED ' + bad) : 'ALL PASS');
process.exit(bad ? 1 : 0);
