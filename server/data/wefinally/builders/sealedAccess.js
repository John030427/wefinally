'use strict'

/**
 * Fail-closed sealed access (v1.4 review-fix).
 * General loaders must not open SEALED_TEST encounters/gold casually.
 */

const fs = require('fs')
const path = require('path')
const { PATHS } = require('../paths')
const { readJsonl } = require('./cases')

const ALLOWED_PARTS = new Set(['TRAIN_CORE', 'CALIBRATION', 'DEV'])

function loadPart(name) {
  if (name === 'SEALED_TEST') {
    throw new Error(
      'SEALED_GENERAL_LOADER_FORBIDDEN: use loadSealedForEvaluatorOnly({ explicit: true }) — never loadPart(SEALED_TEST)'
    )
  }
  if (!ALLOWED_PARTS.has(name)) {
    throw new Error(`Unknown partition ${name}`)
  }
  const p = path.join(PATHS.splits, 'speed-dating-v1.3', name, 'encounters.jsonl')
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`)
  return readJsonl(p)
}

/**
 * Evaluator-only sealed join. Requires explicit:true.
 * Does not expose a general encounters.jsonl path.
 */
function loadSealedForEvaluatorOnly(opts = {}) {
  if (!opts || opts.explicit !== true) {
    throw new Error('EVALUATOR_ONLY_GOLD_ACCESS: pass { explicit: true }')
  }
  const dir = path.join(PATHS.splits, 'speed-dating-v1.3', 'SEALED_TEST')
  const encPath = path.join(dir, 'encounters.jsonl')
  if (fs.existsSync(encPath)) {
    throw new Error(
      'NO_GOLD_BEARING_ENCOUNTERS_IN_SEALED: encounters.jsonl must not exist under SEALED_TEST — regenerate split'
    )
  }
  const features = readJsonl(path.join(dir, 'features.jsonl'))
  const gold = readJsonl(path.join(dir, 'gold.jsonl'))
  const goldById = new Map(gold.map((g) => [g.case_id, g]))
  return features.map((f) => {
    const g = goldById.get(f.case_id)
    if (!g) throw new Error(`sealed gold missing for ${f.case_id}`)
    return {
      ...f,
      a_to_b_decision: g.a_to_b_decision,
      b_to_a_decision: g.b_to_a_decision,
      bilateral_outcome: {
        mutual_match: !!g.mutual_match,
        one_sided: !!g.a_to_b_decision !== !!g.b_to_a_decision
      },
      _sealed_evaluator_join: true
    }
  })
}

function assertSealedPhysicallyIsolated() {
  const dir = path.join(PATHS.splits, 'speed-dating-v1.3', 'SEALED_TEST')
  if (!fs.existsSync(dir)) return { ok: true, note: 'SEALED_TEST dir absent' }
  const enc = path.join(dir, 'encounters.jsonl')
  const feat = path.join(dir, 'features.jsonl')
  const gold = path.join(dir, 'gold.jsonl')
  if (fs.existsSync(enc)) {
    throw new Error('NO_GOLD_BEARING_ENCOUNTERS_IN_SEALED')
  }
  if (!fs.existsSync(feat) || !fs.existsSync(gold)) {
    throw new Error('SEALED_TEST must have features.jsonl and gold.jsonl')
  }
  return { ok: true }
}

module.exports = {
  loadPart,
  loadSealedForEvaluatorOnly,
  assertSealedPhysicallyIsolated,
  ALLOWED_PARTS
}
