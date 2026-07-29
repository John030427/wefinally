process.env.LLM_MOCK_MODE = process.env.LLM_MOCK_MODE || 'matching_sample';
process.env.AI_RERANK_TOP_K = process.env.AI_RERANK_TOP_K || '5';

const { runBatchMatch } = require('../../src/services/matchService');
const {
  collectSampleResults,
  fixtures,
  ok,
  pool,
  writeLatest,
} = require('./common');

async function runSampleMatching() {
  await runBatchMatch(fixtures.batchDates.main, '样本主链路', { scopeOpenidPrefix: 'sample_match_main_' });
  await runBatchMatch(fixtures.batchDates.reportFail, '样本报告失败', { scopeOpenidPrefix: 'sample_match_fail_' });
  for (const item of fixtures.caseBatches || []) {
    await runBatchMatch(item.batchDate, '样本案例', {
      scopeOpenidPrefix: item.scopeOpenidPrefix,
      allowRematch: true,
      allowQualityFallback: true,
    });
  }
  const result = await collectSampleResults();
  writeLatest(result);
  return result;
}

module.exports = { runSampleMatching };

if (require.main === module) {
  (async () => {
    try {
      const result = await runSampleMatching();
      const expectedCaseLogs = (fixtures.caseBatches || []).length * 2;
      ok('sample matching run produced results', result.matches.length >= 4 + expectedCaseLogs);
    } finally {
      await pool.end();
    }
  })().catch(async (err) => {
    console.error(err.stack || err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
