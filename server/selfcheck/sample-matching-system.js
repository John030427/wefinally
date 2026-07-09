const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ok, pool } = require('./_helpers');

const root = path.join(__dirname, '..');
const sampleDir = path.join(root, 'sample-data', 'matching-system');
const latestPath = path.join(sampleDir, 'latest-run.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

for (const file of ['fixtures.json', 'expected-results.json', 'README.md']) {
  ok(`sample matching system includes ${file}`, fs.existsSync(path.join(sampleDir, file)));
}

const fixtures = JSON.parse(fs.readFileSync(path.join(sampleDir, 'fixtures.json'), 'utf8'));
const requiredScenarios = [
  '高契合',
  '单方高分',
  '心理冲突',
  '跨城',
  '学历差异',
  '外貌偏好命中',
  '外貌偏好不命中',
  '小池兜底',
  'AI重排反转',
  '报告生成失败兜底',
  '新用户小池_窄条件首匹配',
  '年龄边界_刚好命中',
  '旧关系偏好_缺失不误杀',
  '婚育不限_节奏不同仍可配',
  '身高边界_软分可解释',
  '外貌近义_清爽简洁命中',
  '关系轻差异_仍可接受',
  'AI重排_三候选反转',
];
const scenarioNames = new Set((fixtures.scenarioCoverage || []).map((item) => item.name));
ok('sample matching system covers required scenarios', requiredScenarios.every((name) => scenarioNames.has(name)));
ok('package exposes sample matching e2e script', pkg.scripts && pkg.scripts['sample:match-e2e']);

(async () => {
  try {
    const run = spawnSync(process.execPath, [path.join(sampleDir, 'e2e.js')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, LLM_MOCK_MODE: 'matching_sample', AI_RERANK_TOP_K: '5' },
    });
    const clear = spawnSync(process.execPath, [path.join(sampleDir, 'clear.js')], {
      cwd: root,
      stdio: 'inherit',
    });
    ok('sample matching e2e script exits successfully', run.status === 0);
    ok('sample matching e2e writes latest-run.json', fs.existsSync(latestPath));

    const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    ok('sample e2e verifies algorithm match', latest.summary && latest.summary.algorithmMatched === true);
    ok('sample e2e verifies ai rerank', latest.summary && latest.summary.aiRerankApplied === true);
    ok('sample e2e verifies ai report', latest.summary && latest.summary.aiReportGenerated === true);
    ok('sample e2e verifies report fallback', latest.summary && latest.summary.reportFailureFallback === true);
    ok('sample e2e verifies wave2 case matrix', latest.summary && latest.summary.wave2AllPassed === true);
    ok('sample matching selfcheck cleanup exits successfully', clear.status === 0);

    const [[remaining]] = await pool.query("SELECT COUNT(*) AS c FROM `user` WHERE openid LIKE 'sample_match_%'");
    ok('sample matching selfcheck leaves no sample users', Number(remaining.c) === 0);
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
