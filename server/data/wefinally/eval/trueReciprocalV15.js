'use strict'

/**
 * True reciprocal evaluation (v1.5.2 final review fix).
 * Predictor receives model input ONLY (no metadata / gold).
 * Prediction API returns predictions ONLY (no evaluatorGold).
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
  buildNativeModelInput,
  assertNoGoldInPrediction
} = require('./nativeFeatureView')
const { averagePrecision, aurocTieAware } = require('./binaryRankingMetrics')

const REVIEW = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.5.2')

const GOLD_STRIP_KEYS = new Set([
  'dec',
  'dec_o',
  'decision',
  'decision_o',
  'match',
  'mutual_match',
  'a_decision',
  'b_decision',
  'source_match',
  'source_match_consistent',
  'source_match_available'
])

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

function stripGoldFromRaw(raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw || {})) {
    if (GOLD_STRIP_KEYS.has(k) || GOLD_STRIP_KEYS.has(String(k).toLowerCase())) continue
    out[k] = v
  }
  return out
}

/**
 * Strip gold from a complete pair for predictor path only.
 */
function buildPredictionPairInput(completePair) {
  if (!completePair || !completePair.row_ab || !completePair.row_ba) {
    throw new Error('TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW')
  }
  const safeSide = (row) => {
    if (!row.raw) throw new Error('TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW')
    return {
      wave: row.wave,
      iid: row.iid,
      pid: row.pid,
      directed_key: row.directed_key,
      reverse_key: row.reverse_key,
      raw: stripGoldFromRaw(row.raw)
      // intentionally NO a_decision / b_decision / mutual_match
    }
  }
  const input = {
    canonical_key: completePair.canonical_key,
    row_ab_safe: safeSide(completePair.row_ab),
    row_ba_safe: safeSide(completePair.row_ba)
  }
  assertNoGoldInPrediction(input)
  return input
}

function buildEvaluatorGold(completePairs) {
  return (completePairs || []).map((p) => ({
    canonical_key: p.canonical_key,
    mutual_match: !!p.mutual_match,
    a_decision: !!p.a_decision,
    b_decision: !!p.b_decision
  }))
}

/**
 * Predictor API — returns predictions ONLY. Never evaluatorGold.
 * scoreFn receives buildNativeModelInput(...) — no metadata.
 */
function predictTrueDirectionalPairs(predictionPairInputs, scoreFn) {
  if (typeof scoreFn !== 'function') {
    return { status: 'TRUE_RECIPROCAL_MODEL_NOT_READY', predictions: [] }
  }
  const predictions = []
  for (const p of predictionPairInputs) {
    const fvAb = buildNativeDirectionalFeatureView(p.row_ab_safe)
    const fvBa = buildNativeDirectionalFeatureView(p.row_ba_safe)
    const inAb = buildNativeModelInput(fvAb)
    const inBa = buildNativeModelInput(fvBa)
    const p_ab = scoreFn(inAb)
    const p_ba = scoreFn(inBa)
    const pred = {
      canonical_key: p.canonical_key,
      p_ab,
      p_ba,
      score: Math.min(p_ab, p_ba)
    }
    assertNoGoldInPrediction(pred)
    predictions.push(pred)
  }
  const apiReturn = { status: 'OK', predictions }
  assertNoGoldInPrediction(apiReturn)
  return apiReturn
}

/** @deprecated orchestration helper — prefer predictTrueDirectionalPairs + buildEvaluatorGold */
function trueDirectionalScores(completePairs, scoreFn) {
  const inputs = (completePairs || []).map(buildPredictionPairInput)
  return predictTrueDirectionalPairs(inputs, scoreFn)
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
  return predictTrueDirectionalPairs((completePairs || []).map(buildPredictionPairInput), scoreFn)
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
    source_audit: sourceAudit,
    FINAL_REVIEW_FIX: true
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
    ...status
  })
  console.log(JSON.stringify({ ...status, import_status: imported.status }, null, 2))
  return { status, imported }
}

if (require.main === module) main()

module.exports = {
  buildPredictionPairInput,
  buildEvaluatorGold,
  predictTrueDirectionalPairs,
  trueDirectionalScores,
  recipAggregators,
  predictNativePairs,
  evalBinary,
  assertNoSwappedVectorReciprocal,
  main
}
