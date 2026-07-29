const { spawnSync } = require('child_process');
const path = require('path');
const { BASE_URL } = require('./_helpers');

const scripts = [
  'match.js',
  'match-psych-report.js',
  'match-report-display.js',
  'match-handoff-ticket.js',
  'match-effect-cases.js',
  'match-batch-lock.js',
  'dev-match-start.js',
  'miniprogram-real-device.js',
  'cloudbase-migration.js',
  'admin-web.js',
  'customer-service-workbench.js',
  'llm-default-off.js',
  'llm-global-off.js',
  'ai-weighted-default-off.js',
  'ai-mock.js',
  'ai-topk-rerank.js',
  'partner-dashboard.js',
  'dev-login.js',
  'free-member.js',
  'vip-purchase-dev.js',
  'meet-safety.js',
  'common-config.js',
  'register-ux.js',
  'known-bugs.js',
  'sample-matching-system.js',
];

function envFor(script) {
  const env = { ...process.env };
  delete env.LLM_ENABLED;
  delete env.LLM_MATCH_REPORT_ENABLED;
  delete env.AI_MATCH_WEIGHT_ENABLED;
  delete env.LLM_MOCK_MODE;
  delete env.AI_RERANK_TOP_K;
  delete env.DEV_MATCH_START_ENABLED;
  if (script === 'ai-mock.js' || script === 'sample-matching-system.js') {
    env.LLM_MOCK_MODE = 'matching_sample';
  }
  return env;
}

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
      env: envFor(script),
    });
    if (r.status !== 0) process.exit(r.status || 1);
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
