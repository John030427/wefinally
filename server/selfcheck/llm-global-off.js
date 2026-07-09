delete process.env.LLM_ENABLED;
process.env.LLM_MATCH_REPORT_ENABLED = 'true';
process.env.AI_MATCH_WEIGHT_ENABLED = 'true';
process.env.LLM_BASE_URL = 'http://127.0.0.1:1';
process.env.LLM_API_KEY = 'fake-key';
process.env.LLM_MODEL = 'fake-model';

const llmConfig = require('../src/config/llmConfig');
const {
  generateMutualMatchReports,
  rerankMatchCandidates,
} = require('../src/services/llmService');
const { ok } = require('./_helpers');

(async () => {
  ok('llm global enabled defaults false', llmConfig.enabled === false);
  ok('llm feature flags can be true while global is off', llmConfig.matchReportEnabled === true && llmConfig.aiWeightEnabled === true);

  const report = await generateMutualMatchReports({}, {}, {}, {});
  ok('global llm off blocks mutual reports even when feature flag is true', report.status === 3);

  const rerank = await rerankMatchCandidates({}, [{ candidate: { id: 1 }, combined: 80, viewSim: 70 }]);
  ok('global llm off blocks ai rerank even when feature flag is true', rerank.status === 3);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
