const { spawnSync } = require('child_process');
const path = require('path');
const { BASE_URL } = require('./_helpers');

const scripts = [
  'match.js',
  'match-psych-report.js',
  'llm-default-off.js',
  'partner-dashboard.js',
  'dev-login.js',
  'free-member.js',
  'vip-purchase-dev.js',
  'meet-safety.js',
  'register-ux.js',
  'known-bugs.js',
];

(async () => {
  const res = await fetch(`${BASE_URL}/api/common/health`).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(`health check failed: ${BASE_URL}/api/common/health`);
  }
  console.log(`PASS - backend health ${BASE_URL}`);

  for (const script of scripts) {
    console.log(`\n## selfcheck/${script}`);
    const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
    if (r.status !== 0) process.exit(r.status || 1);
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
