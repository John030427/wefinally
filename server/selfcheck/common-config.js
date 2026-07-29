const {
  ok,
  request,
} = require('./_helpers');
const fs = require('fs');
const path = require('path');

(async () => {
  const res = await request('GET', '/api/common/config');
  ok('common config endpoint succeeds', res.status === 200 && res.json.code === 0);
  const data = res.json.data || {};
  ok('common config returns vip config', data.vip && data.vip.price === 188 && data.vip.days === 30);
  ok('common config returns match schedule', data.match && Array.isArray(data.match.days) && data.match.days.includes(3) && data.match.days.includes(5));
  ok('common config returns safety config', data.safety && data.safety.sosPhone === '110' && data.safety.guangdong110);
  ok('common config returns match weights readonly copy', data.match.weights && data.match.weights.appearance === 10);

  const constants = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'utils', 'constants.js'), 'utf8');
  ok('miniprogram declares common config API path', constants.includes('COMMON_CONFIG') && constants.includes('/api/common/config'));
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
