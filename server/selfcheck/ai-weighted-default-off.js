delete process.env.LLM_ENABLED;
delete process.env.AI_MATCH_WEIGHT_ENABLED;
delete process.env.LLM_MOCK_MODE;

const { applyAiRerank } = require('../src/services/matchService');
const llmConfig = require('../src/config/llmConfig');
const { ok } = require('./_helpers');

(async () => {
  ok('ai weighted match default off', llmConfig.aiWeightEnabled === false);
  const eligible = [
    { candidate: { id: 1 }, combined: 80, viewSim: 60 },
    { candidate: { id: 2 }, combined: 70, viewSim: 90 },
  ];
  const reranked = await applyAiRerank({}, eligible);
  ok('ai weighted off keeps algorithm winner first', reranked[0].candidate.id === 1);
  ok('ai weighted off does not attach aiWeight', reranked.every((item) => item.aiWeight === undefined));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
