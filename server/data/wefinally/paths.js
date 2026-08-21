'use strict'

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '../../..')
const DATASETS_ROOT = path.join(REPO_ROOT, 'datasets', 'wefinally')
const INBOX_ROOT = path.join(REPO_ROOT, 'datasets', 'inbox')
const CODE_ROOT = path.join(REPO_ROOT, 'server', 'data', 'wefinally')

const PATHS = {
  repoRoot: REPO_ROOT,
  datasetsRoot: DATASETS_ROOT,
  inboxRoot: INBOX_ROOT,
  codeRoot: CODE_ROOT,
  registry: path.join(DATASETS_ROOT, 'source-registry.json'),
  manifests: path.join(DATASETS_ROOT, 'manifests'),
  raw: path.join(DATASETS_ROOT, 'raw'),
  cleaned: path.join(DATASETS_ROOT, 'cleaned'),
  cases: path.join(DATASETS_ROOT, 'cases'),
  splits: path.join(DATASETS_ROOT, 'splits'),
  eval: path.join(DATASETS_ROOT, 'eval'),
  failures: path.join(DATASETS_ROOT, 'eval', 'failures'),
  quarantine: path.join(DATASETS_ROOT, 'quarantine'),
  reports: path.join(DATASETS_ROOT, 'reports'),
  samples: path.join(DATASETS_ROOT, 'samples'),
  ragIndex: path.join(DATASETS_ROOT, 'rag-index'),
  prompts: path.join(REPO_ROOT, 'server', 'ai', 'prompts'),
  reviews: path.join(DATASETS_ROOT, 'reviews')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

module.exports = { PATHS, ensureDir, REPO_ROOT }
