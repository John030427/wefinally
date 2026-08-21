'use strict'

/**
 * v1.5.2 final native pipeline integrity selfcheck.
 *   npm --prefix server run selfcheck:match-eval-v152
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { importNativeSpeedDating, parseCsvText } = require('../data/wefinally/importers/nativeIdMigration')
const {
  buildNativeDirectionalFeatureView,
  trivialLabelBlindDirectionalScorer,
  assertNoGoldInPrediction,
  collectForbiddenKeys
} = require('../data/wefinally/eval/nativeFeatureView')
const { trueDirectionalScores, evalBinary } = require('../data/wefinally/eval/trueReciprocalV15')
const { writeSyntheticNativeFixture } = require('../data/wefinally/eval/syntheticNativeFixture')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) {
    failed++
    console.error('FAIL', name, detail)
  } else console.log('PASS', name)
}

function main() {
  const fixturePath = writeSyntheticNativeFixture()
  const imported = importNativeSpeedDating(fixturePath, {
    featuresAvailable: true,
    modelReady: false,
    requireFeatures: true
  })

  // Duplicate semantics
  check('EXACT_DUP_COUNTED', imported.exact_duplicates >= 1, String(imported.exact_duplicates))
  check(
    'SAME_OUTCOME_DIFFERENT_FEATURE_NOT_EXACT_DUPLICATE',
    imported.feature_conflict_duplicates >= 1,
    JSON.stringify({
      feature: imported.feature_conflict_duplicates,
      outcome: imported.outcome_conflict_duplicates
    })
  )
  const featureConflictQ = (imported.quarantine || []).some((q) => q.reason === 'FEATURE_CONFLICT_DUPLICATE')
  check('FEATURE_CONFLICT_QUARANTINED', featureConflictQ)

  // match inconsistency excluded
  const matchQ = (imported.quarantine || []).filter((q) => q.reason === 'match_dec_inconsistent')
  check('SOURCE_MATCH_INCONSISTENCY_EXCLUDED', matchQ.length >= 1)
  check(
    'MATCH_INCONSISTENT_NOT_IN_DIRECTED',
    !(imported.directed || []).some((d) => d.iid === '7' && d.pid === '8')
  )

  check('REVERSE_SOURCE_MATCH_CONSISTENCY', imported.true_canonical_pairs >= 1)
  check('INCOMPLETE_PAIR', imported.incomplete_pairs >= 1)

  const scoreFn = (fv) => trivialLabelBlindDirectionalScorer(fv)
  const result = trueDirectionalScores(imported.completePairs, scoreFn)
  check('PRED_STATUS_OK', result.status === 'OK')
  check('PRED_SEPARATE_FROM_GOLD', Array.isArray(result.predictions) && Array.isArray(result.evaluatorGold))

  // Full artifact zero gold
  let zeroGold = false
  try {
    assertNoGoldInPrediction({ predictions: result.predictions })
    zeroGold = collectForbiddenKeys({ predictions: result.predictions }).length === 0
  } catch (_) {
    zeroGold = false
  }
  check('PREDICTION_ARTIFACT_ZERO_GOLD_KEYS', zeroGold)

  // Full gold flip — hash COMPLETE prediction artifact (no filtering)
  const artifactA = JSON.stringify(result.predictions)
  const flippedGoldPairs = imported.completePairs.map((p) => ({
    ...p,
    mutual_match: !p.mutual_match,
    a_decision: !p.a_decision,
    b_decision: !p.b_decision
  }))
  const resultB = trueDirectionalScores(flippedGoldPairs, scoreFn)
  const artifactB = JSON.stringify(resultB.predictions)
  check(
    'NATIVE_FULL_ARTIFACT_GOLD_FLIP_STABLE',
    crypto.createHash('sha256').update(artifactA).digest('hex') ===
      crypto.createHash('sha256').update(artifactB).digest('hex'),
    'artifacts differ'
  )

  // eval join still works and metrics can change with gold
  const m1 = evalBinary(result.predictions, result.evaluatorGold)
  check('EVAL_JOIN_BY_KEY', m1 && Object.prototype.hasOwnProperty.call(m1, 'AVERAGE_PRECISION'))

  // Malicious scorers must be blocked
  const attacks = [
    (row) => (row.a_decision ? 0.9 : 0.1),
    (row) => (row.features && row.features.dec != null ? 0.9 : 0.1),
    (row) => (row.features && row.features.match != null ? 0.9 : 0.1),
    (row) => (row.raw ? 0.9 : 0.1),
    (row) => (row._eval_only ? 0.9 : 0.1),
    (row) => (row['mutual_match'] ? 0.9 : 0.1)
  ]
  let allBlocked = true
  for (const attack of attacks) {
    let blocked = false
    try {
      trueDirectionalScores(imported.completePairs.slice(0, 1), attack)
    } catch (e) {
      blocked = /GOLD_LABEL_ACCESS_FORBIDDEN|MODEL_FEATURE_IDENTITY|NO_GOLD/.test(String(e.message))
    }
    if (!blocked) allBlocked = false
  }
  check('MALICIOUS_SCORER_GOLD_ACCESS_BLOCKED', allBlocked)

  // Feature identity exclusion
  if (imported.completePairs.length) {
    const fv = buildNativeDirectionalFeatureView(imported.completePairs[0].row_ab)
    const feats = { ...fv.features }
    check('MODEL_FEATURES_NO_IID', !Object.prototype.hasOwnProperty.call(feats, 'iid'))
    check('MODEL_FEATURES_NO_PID', !Object.prototype.hasOwnProperty.call(feats, 'pid'))
    check('MODEL_FEATURES_NO_WAVE_IDENTITY', !Object.prototype.hasOwnProperty.call(feats, 'wave'))
    let idBlocked = false
    try {
      void fv.iid
    } catch (e) {
      idBlocked = /MODEL_FEATURE_IDENTITY_FORBIDDEN|GOLD/.test(String(e.message))
    }
    check('TOPLEVEL_IID_BLOCKED', idBlocked)
    check('METADATA_HAS_IDS', fv.metadata && fv.metadata.iid != null && fv.metadata.wave != null)
  } else {
    check('MODEL_FEATURES_NO_IID', false, 'no pairs')
    check('MODEL_FEATURES_NO_PID', false)
    check('MODEL_FEATURES_NO_WAVE_IDENTITY', false)
  }

  // CSV still ok
  const q = parseCsvText('iid,pid,wave,dec,dec_o,match,field\n1,2,1,1,0,0,"Business, Economics and Finance"\n')
  check('CSV_QUOTED', q.rows[0].field === 'Business, Economics and Finance')

  // Gates separated
  check(
    'GATES_SEPARATED',
    imported.TRUE_RECIPROCAL_MODEL_READY === false && typeof imported.TRUE_RECIPROCAL_AVAILABLE === 'boolean'
  )

  // Source file asserts no _eval_only in predictions path
  const src = fs.readFileSync(path.join(__dirname, '../data/wefinally/eval/trueReciprocalV15.js'), 'utf8')
  check('NO_EVAL_ONLY_IN_PRED_PUSH', !/predictions\.push\(\{[\s\S]*_eval_only/.test(src))

  if (failed) {
    console.error('match-eval-v152 FAILED', failed)
    process.exit(1)
  }
  console.log('match-eval-v152 passed')
}

main()
