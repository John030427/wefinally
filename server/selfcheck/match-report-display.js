const fs = require('fs');
const path = require('path');
const { ok } = require('./_helpers');
const {
  buildFieldExplainItems,
  buildLocalMatchReport,
} = require('../../miniprogram/utils/matchReport');

const detailWxml = fs.readFileSync(
  path.join(__dirname, '..', '..', 'miniprogram', 'pages', 'match-detail', 'match-detail.wxml'),
  'utf8'
);
const scoreDetail = {
  side: {
    baby: 30,
    view: 18,
    psych: 9,
    appearance: 5,
    age: 15,
    height: 6,
    education: 0,
    circle: 6,
    city: 2,
  },
};

const report = buildLocalMatchReport({
  scoreDetail,
  ageBand: '30-35岁',
  education: '硕士',
  circleName: '金融',
  babyPlan: '3-5年内',
  city: '深圳',
  appearanceText: '外貌偏好按双方自述与期待的契合度参考，不做颜值判断。',
});
const items = buildFieldExplainItems(scoreDetail);
const emptyItems = buildFieldExplainItems(null);
const v2Items = buildFieldExplainItems({
  side: {
    dimensions: {
      baby: { raw_score: 28 },
      view: { raw_score: 20 },
      psych: { raw_score: 12 },
      appearance: { raw_score: 7 },
      age: { raw_score: 15 },
      height: { raw_score: 12 },
      education: { raw_score: 8 },
      circle: { raw_score: 6 },
      city: { raw_score: 4 },
    },
  },
});

ok('local AI report uses marriage-report style prose', report.includes('你们这组匹配的现实基础') && report.includes('真正需要提前聊的是'));
ok('local AI report does not expose raw score language', !report.includes('/30') && !report.includes('分数'));
ok('local AI report avoids mechanical system wording', !report.includes('条件匹配') && !report.includes('系统认为') && !report.includes('系统看到'));
ok('local AI report says appearance is scored as preference fit', report.includes('外貌偏好') && !report.includes('不进入打分'));
ok(
  'match detail shows ai report between summary and field breakdown',
  detailWxml.indexOf('综合匹配参考') < detailWxml.indexOf('AI匹配报告')
  && detailWxml.indexOf('AI匹配报告') < detailWxml.indexOf('字段拆解')
);
ok('field explain includes every score item', items.length === 9);
ok('field explain hides old records without score detail', emptyItems.length === 0);
ok('field explain keeps original display order', items[0].key === 'baby' && items[1].key === 'view');
ok('field explain carries tap detail text', items[0].explain.includes('婚育计划') && items[0].expanded === false);
ok('field explain includes appearance preference score', items.some((item) => item.key === 'appearance' && item.label === '外貌偏好'));
ok('field explain reads v2 nested dimension scores', v2Items[0].score === 28 && v2Items.find((item) => item.key === 'appearance').score === 7);
