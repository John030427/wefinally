const fs = require('fs');
const path = require('path');
const llmConfig = require('../src/config/llmConfig');
const matchConfig = require('../src/config/matchConfig');
const { extractAppearanceTags } = require('../src/services/llmService');
const { ok } = require('./_helpers');

(async () => {
  ok('llmConfig.enabled is false', llmConfig.enabled === false);
  ok('matchConfig.useAppearanceInMatch is false', matchConfig.useAppearanceInMatch === false);
  ok('extractAppearanceTags returns null when disabled', (await extractAppearanceTags('高 瘦 文艺')) === null);

  const matchService = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'matchService.js'), 'utf8');
  ok('matchService does not import llmService', !matchService.includes('llmService'));
  ok('matchService does not call extractAppearanceTags', !matchService.includes('extractAppearanceTags'));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
