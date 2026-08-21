'use strict'

/**
 * True reciprocal evaluation (v1.5.1).
 * No gold-derived placeholder scores. Model readiness is an explicit gate.
 *
 *   node server/data/wefinally/eval/trueReciprocalV15.js
 */

const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir, REPO_ROOT } = require('../paths')
const {
  auditNativeIdCandidate,
  importNativeSpeedDating
} = require('../importers/nativeIdMigration')
const {
  buildNativeDirectionalFeatureView,
  trivialLabelBlindDirectionalScorer,
  assertNoGoldInPrediction
} = require('./nativeFeatureView')
const { averagePrecision, aurocTieAware } = require('./binaryRankingMetrics')

const REVIEW = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.5.1')

function write(name, body) {
  ensureDir(REVIEW)
  fs.writeFileSync(path.join(REVIEW, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2))
}

function assertNoSwappedVectorReciprocal(fnSource) {
  // Detect executable swapped-vector patterns, not prose that forbids them.
  const bad =
    /\bxRev\b|\[\s*xRev\[|predictLogistic\(\s*lrDir\s*,\s*xRev/.test(fnSource) ||
    /;\s*\[xRev\[0\]/.test(fnSource)
  if (bad) throw new Error('NO_SWAPPED_VECTOR_RECIPROCAL violated')
  return true
}

/**
 * scoreFn must accept a FeatureView (label-blind), never gold decisions.
 */
function trueDirectionalScores(completePairs, scoreFn) {
  if (typeof scoreFn !== 'function') {
    return { status: 'TRUE_RECIPROCAL_MODEL_NOT_READY', scored: [] }
  }
  const out = []
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
    // gold attached only for evaluator join — separate object
    out.push({
      ...pred,
      _eval_only: {
        mutual: !!p.mutual_match,
        a_decision: p.a_decision,
        b_decision: p.b_decision
      }
    })
  }
  return { status: 'OK', scored: out }
}

function recipAggregators(scored) {
  const harmonic = (a, b) => {
    if (a + b === 0) return 0
    return (2 * a * b) / (a + b)
  }
  return {
    RECIP_MIN: scored.map((r) => ({ ...r, score: Math.min(r.p_ab, r.p_ba) })),
    RECIP_PRODUCT: scored.map((r) => ({ ...r, score: r.p_ab * r.p_ba })),
    RECIP_GEOMEAN: scored.map((r) => ({
      ...r,
      score: Math.sqrt(Math.max(0, r.p_ab * r.p_ba))
    })),
    RECIP_HARMONIC: scored.map((r) => ({ ...r, score: harmonic(r.p_ab, r.p_ba) })),
    RECIP_ASYMMETRY_PENALTY: scored.map((r) => ({
      ...r,
      score: Math.min(r.p_ab, r.p_ba) * (1 - Math.abs(r.p_ab - r.p_ba))
    }))
  }
}

function evalBinary(scored) {
  const labels = scored.map((r) => (r._eval_only && r._eval_only.mutual ? 1 : 0))
  const scores = scored.map((r) => r.score)
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
    native_file_present: fs.existsSync(
      require('../importers/nativeIdMigration').NATIVE_PATH()
    ),
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

  let metrics = {
    status: 'TRUE_RECIPROCAL_MODEL_NOT_READY',
    note: 'No product directional model wired; refusing gold-derived placeholders'
  }
  let directional = {
    status: 'TRUE_RECIPROCAL_MODEL_NOT_READY',
    NO_GOLD_DERIVED_NATIVE_PREDICTION: true,
    note: 'Await native data + label-blind model. Swapped-vector forbidden.'
  }

  // External native file: never invent quality metrics without a real scoreFn
  if (imported.ok && imported.completePairs && imported.completePairs.length) {
    directional = {
      status: 'TRUE_RECIPROCAL_MODEL_NOT_READY',
      n_pairs: imported.completePairs.length,
      TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW: true,
      NO_GOLD_DERIVED_NATIVE_PREDICTION: true
    }
    metrics = {
      status: 'TRUE_RECIPROCAL_MODEL_NOT_READY',
      TRUE_RECIPROCAL_AVAILABLE: false,
      note: 'Pairs reconstructed but model not ready — no placeholder AP/AUROC'
    }
  }

  write(
    'NATIVE_IDENTITY_AUDIT.md',
    [
      '# Native Identity Audit v1.5.1',
      '',
      '```json',
      JSON.stringify(
        {
          ...status,
          import_status: imported.status,
          directed_rows: imported.directed_rows || 0,
          true_canonical_pairs: imported.true_canonical_pairs || 0,
          exact_duplicates: imported.exact_duplicates,
          conflicting_duplicates: imported.conflicting_duplicates
        },
        null,
        2
      ),
      '```',
      ''
    ].join('\n')
  )

  write(
    'TRUE_PAIR_RECONSTRUCTION.md',
    [
      '# True Pair Reconstruction v1.5.1',
      '',
      status.waiting
        ? 'WAITING_NATIVE_ID_DATA — TRUE_CANONICAL_PAIR N/A for product claims.'
        : JSON.stringify(
            {
              directed: imported.directed_rows,
              true_canonical_pairs: imported.true_canonical_pairs,
              reverse_pair_rate: imported.reverse_pair_rate
            },
            null,
            2
          ),
      ''
    ].join('\n')
  )

  write(
    'DIRECTIONAL_TRUE_REVERSE.md',
    ['# Directional True Reverse', '', '```json', JSON.stringify(directional, null, 2), '```', ''].join('\n')
  )
  write(
    'RECIPROCAL_TRUE_REVERSE.md',
    ['# Reciprocal True Reverse', '', '```json', JSON.stringify(metrics, null, 2), '```', ''].join('\n')
  )
  write('METRICS.json', {
    validation_type: 'PIPELINE_INTEGRITY_ONLY',
    fresh_sealed: 'NO_FRESH_SEALED_AVAILABLE',
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
  assertNoSwappedVectorReciprocal,
  evalBinary,
  main
}
