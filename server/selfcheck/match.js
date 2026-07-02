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
