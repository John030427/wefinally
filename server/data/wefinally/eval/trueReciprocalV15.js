'use strict'

/**
 * True reciprocal evaluation (v1.5.2).
 * Predictions NEVER carry gold. Evaluator joins by canonical_key only.
 */

const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir, REPO_ROOT } = require('../paths')
const {
  auditNativeIdCandidate,
  importNativeSpeedDating,
  NATIVE_PATH
} = require('../importers/nativeIdMigration')
const {
  buildNativeDirectionalFeatureView,
  assertNoGoldInPrediction
} = require('./nativeFeatureView')
const { averagePrecision, aurocTieAware } = require('./binaryRankingMetrics')

const REVIEW = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.5.2')

function write(name, body) {
  ensureDir(REVIEW)
  fs.writeFileSync(path.join(REVIEW, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2))
}

function assertNoSwappedVectorReciprocal(fnSource) {
  const bad =
    /\bxRev\b|\[\s*xRev\[|predictLogistic\(\s*lrDir\s*,\s*xRev/.test(fnSource) ||
    /;\s*\[xRev\[0\]/.test(fnSource)
  if (bad) throw new Error('NO_SWAPPED_VECTOR_RECIPROCAL violated')
  return true
}

/**
 * Returns { status, predictions, evaluatorGold }.
 * predictions contain ZERO gold keys (including nested).
 */
function trueDirectionalScores(completePairs, scoreFn) {
  if (typeof scoreFn !== 'function') {
    return {
      status: 'TRUE_RECIPROCAL_MODEL_NOT_READY',
      predictions: [],
      evaluatorGold: []
    }
  }
  const predictions = []
  const evaluatorGold = []
  for (const p of completePairs) {
    if (!p.row_ab || !p.row_ba || !p.row_ab.raw || !p.row_ba.raw) {
      throw new Error('TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW')
    }
    const fvAb = buildNativeDirectionalFeatureView(p.row_ab)
    const fvBa = buildNativeDirectionalFeatureView(p.row_ba)
    const p_ab = scoreFn(fvAb)
    const p_ba = scoreFn(fvBa)
    const pred = {
      canonical_key: p.canonical_key,
      p_ab,
      p_ba,
      score: Math.min(p_ab, p_ba)
    }
    assertNoGoldInPrediction(pred)
    predictions.push(pred)
    evaluatorGold.push({
      canonical_key: p.canonical_key,
      mutual_match: !!p.mutual_match,
      a_decision: !!p.a_decision,
      b_decision: !!p.b_decision
    })
  }
  assertNoGoldInPrediction({ predictions })
  return { status: 'OK', predictions, evaluatorGold }
}

function recipAggregators(predictions) {
  const harmonic = (a, b) => {
    if (a + b === 0) return 0
    return (2 * a * b) / (a + b)
  }
  return {
    RECIP_MIN: predictions.map((r) => ({
      canonical_key: r.canonical_key,
      p_ab: r.p_ab,
      p_ba: r.p_ba,
      score: Math.min(r.p_ab, r.p_ba)
    })),
    RECIP_PRODUCT: predictions.map((r) => ({
      canonical_key: r.canonical_key,
      p_ab: r.p_ab,
      p_ba: r.p_ba,
      score: r.p_ab * r.p_ba
    })),
    RECIP_GEOMEAN: predictions.map((r) => ({
      canonical_key: r.canonical_key,
      p_ab: r.p_ab,
      p_ba: r.p_ba,
      score: Math.sqrt(Math.max(0, r.p_ab * r.p_ba))
    })),
    RECIP_HARMONIC: predictions.map((r) => ({
      canonical_key: r.canonical_key,
      p_ab: r.p_ab,
      p_ba: r.p_ba,
      score: harmonic(r.p_ab, r.p_ba)
    })),
    RECIP_ASYMMETRY_PENALTY: predictions.map((r) => ({
      canonical_key: r.canonical_key,
      p_ab: r.p_ab,
      p_ba: r.p_ba,
      score: Math.min(r.p_ab, r.p_ba) * (1 - Math.abs(r.p_ab - r.p_ba))
    }))
  }
}

/** Join predictions to gold by canonical_key only — after predictions finalized. */
function evalBinary(predictions, evaluatorGold) {
  assertNoGoldInPrediction({ predictions })
  const goldBy = new Map((evaluatorGold || []).map((g) => [g.canonical_key, g]))
  const labels = []
  const scores = []
  for (const p of predictions) {
    const g = goldBy.get(p.canonical_key)
    if (!g) throw new Error(`evaluator gold missing for ${p.canonical_key}`)
    labels.push(g.mutual_match ? 1 : 0)
    scores.push(p.score)
  }
  return {
    AVERAGE_PRECISION: averagePrecision(scores, labels),
    AUROC: aurocTieAware(scores, labels),
    note: 'integrity_metrics_only_not_product'
  }
}

function predictNativePairs(completePairs, scoreFn) {
  return trueDirectionalScores(completePairs, scoreFn)
}

function main() {
  ensureDir(REVIEW)
  const sourceAudit = auditNativeIdCandidate()
  const imported = importNativeSpeedDating(undefined, {
    featuresAvailable: false,
    modelReady: false,
    requireFeatures: true
  })

  const status = {
    native_file_present: fs.existsSync(NATIVE_PATH()),
    NATIVE_SCHEMA_AVAILABLE: !!imported.NATIVE_SCHEMA_AVAILABLE,
    NATIVE_ROWS_VALID: !!imported.NATIVE_ROWS_VALID,
    REVERSE_PAIRING_VALID: !!imported.REVERSE_PAIRING_VALID,
    TRUE_RECIPROCAL_FEATURES_AVAILABLE: false,
    TRUE_RECIPROCAL_MODEL_READY: false,
    TRUE_RECIPROCAL_AVAILABLE: false,
    identity_mode: imported.ok ? imported.identity_mode : 'PAIR_IDENTITY_UNCERTAIN',
    waiting: imported.status === 'WAITING_NATIVE_ID_DATA' || !imported.ok,
    source_audit: sourceAudit
  }

  const metrics = {
    status: 'TRUE_RECIPROCAL_MODEL_NOT_READY',
    note: 'No product directional model wired; refusing gold-derived placeholders'
  }
  const directional = {
    status: 'TRUE_RECIPROCAL_MODEL_NOT_READY',
    NO_GOLD_IN_PREDICTION_ARTIFACT: true,
    note: 'Await native data + label-blind model. Predictions never embed gold.'
  }

  write(
    'NATIVE_IDENTITY_AUDIT.md',
    [
      '# Native Identity Audit v1.5.2',
      '',
      '```json',
      JSON.stringify(
        {
          ...status,
          import_status: imported.status,
          directed_rows: imported.directed_rows || 0,
          true_canonical_pairs: imported.true_canonical_pairs || 0
        },
        null,
        2
      ),
      '```',
      ''
    ].join('\n')
  )
  write('METRICS.json', {
    validation_type: 'PIPELINE_INTEGRITY_ONLY',
    ...status,
    metrics,
    directional
  })
  console.log(JSON.stringify({ ...status, import_status: imported.status }, null, 2))
  return { status, imported, metrics, directional }
}

if (require.main === module) main()

module.exports = {
  trueDirectionalScores,
  recipAggregators,
  predictNativePairs,
  evalBinary,
  assertNoSwappedVectorReciprocal,
  main
}
