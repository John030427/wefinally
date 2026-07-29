delete process.env.LLM_ENABLED;
delete process.env.LLM_MATCH_REPORT_ENABLED;
delete process.env.AI_MATCH_WEIGHT_ENABLED;
delete process.env.LLM_MOCK_MODE;

const fs = require('fs');
const path = require('path');
const llmConfig = require('../src/config/llmConfig');
const matchConfig = require('../src/config/matchConfig');
const {
  extractAppearanceTags,
  generateMatchReport,
  generateMutualMatchReports,
  rerankMatchCandidates,
} = require('../src/services/llmService');
const { ok } = require('./_helpers');

(async () => {
  ok('llmConfig.enabled is false', llmConfig.enabled === false);
  ok('llm match report is false', llmConfig.matchReportEnabled === false);
  ok('llm ai weight is false', llmConfig.aiWeightEnabled === false);
  ok('appearance preference match is enabled', matchConfig.useAppearanceInMatch === true);
  ok('extractAppearanceTags returns null when disabled', (await extractAppearanceTags('高 瘦 文艺')) === null);
  const report = await generateMatchReport({}, {}, {});
  ok('generateMatchReport returns disabled when off', report.status === 3);
  const mutualReport = await generateMutualMatchReports({}, {}, {}, {});
  ok('generateMutualMatchReports returns disabled when off', mutualReport.status === 3);
  const rerank = await rerankMatchCandidates({}, []);
  ok('rerankMatchCandidates returns disabled when off', rerank.status === 3);

  const matchService = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'matchService.js'), 'utf8');
  ok('matchService does not call extractAppearanceTags', !matchService.includes('extractAppearanceTags'));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
