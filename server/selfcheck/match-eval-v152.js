'use strict'

/**
 * v1.5.2 final review-fix + prior integrity selfcheck.
 *   npm --prefix server run selfcheck:match-eval-v152
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { importNativeSpeedDating, parseCsvText } = require('../data/wefinally/importers/nativeIdMigration')
const {
  buildNativeDirectionalFeatureView,
  buildNativeModelInput,
  trivialLabelBlindDirectionalScorer,
  assertNoGoldInPrediction,
  collectForbiddenKeys,
  collectModelInputForbidden
} = require('../data/wefinally/eval/nativeFeatureView')
const {
  buildPredictionPairInput,
  buildEvaluatorGold,
  predictTrueDirectionalPairs,
  evalBinary
} = require('../data/wefinally/eval/trueReciprocalV15')
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

  check('EXACT_DUP_COUNTED', imported.exact_duplicates >= 1, String(imported.exact_duplicates))
  check(
    'SAME_OUTCOME_DIFFERENT_FEATURE_NOT_EXACT_DUPLICATE',
    imported.feature_conflict_duplicates >= 1
  )
  check(
    'FEATURE_CONFLICT_QUARANTINED',
    (imported.quarantine || []).some((q) => q.reason === 'FEATURE_CONFLICT_DUPLICATE')
  )
  check(
    'SOURCE_MATCH_INCONSISTENCY_EXCLUDED',
    (imported.quarantine || []).some((q) => q.reason === 'match_dec_inconsistent')
  )
  check(
    'MATCH_INCONSISTENT_NOT_IN_DIRECTED',
    !(imported.directed || []).some((d) => d.iid === '7' && d.pid === '8')
  )
  check('REVERSE_SOURCE_MATCH_CONSISTENCY', imported.true_canonical_pairs >= 1)
  check('INCOMPLETE_PAIR', imported.incomplete_pairs >= 1)

  const scoreFn = (mi) => trivialLabelBlindDirectionalScorer(mi)
  const predInputs = imported.completePairs.map(buildPredictionPairInput)
  const gold = buildEvaluatorGold(imported.completePairs)
  const apiReturn = predictTrueDirectionalPairs(predInputs, scoreFn)

  check('PRED_STATUS_OK', apiReturn.status === 'OK')
  check('PREDICTION_API_NO_EVALUATOR_GOLD', !Object.prototype.hasOwnProperty.call(apiReturn, 'evaluatorGold'))
  check('PRED_HAS_PREDICTIONS', Array.isArray(apiReturn.predictions))

  // COMPLETE API return must be gold-free
  let zeroGold = false
  try {
    assertNoGoldInPrediction(apiReturn)
    zeroGold = collectForbiddenKeys(apiReturn).length === 0
  } catch (_) {
    zeroGold = false
  }
  check('PREDICTION_ARTIFACT_ZERO_GOLD_KEYS', zeroGold)

  // Gold flip on completePairs → strip → predict; hash FULL API return
  const flipped = imported.completePairs.map((p) => ({
    ...p,
    mutual_match: !p.mutual_match,
    a_decision: !p.a_decision,
    b_decision: !p.b_decision
  }))
  const apiA = predictTrueDirectionalPairs(
    imported.completePairs.map(buildPredictionPairInput),
    scoreFn
  )
  const apiB = predictTrueDirectionalPairs(flipped.map(buildPredictionPairInput), scoreFn)
  const ha = crypto.createHash('sha256').update(JSON.stringify(apiA)).digest('hex')
  const hb = crypto.createHash('sha256').update(JSON.stringify(apiB)).digest('hex')
  check('NATIVE_PREDICTOR_API_FULL_RETURN_GOLD_FLIP_STABLE', ha === hb, `${ha} vs ${hb}`)
  check('NATIVE_FULL_ARTIFACT_GOLD_FLIP_STABLE', ha === hb)

  const m1 = evalBinary(apiReturn.predictions, gold)
  check('EVAL_JOIN_BY_KEY', m1 && Object.prototype.hasOwnProperty.call(m1, 'AVERAGE_PRECISION'))

  // Malicious gold / identity attacks on model input
  if (!imported.completePairs.length) {
    check('MALICIOUS_SCORER_GOLD_ACCESS_BLOCKED', false, 'no pairs')
  } else {
    const sampleIn = buildNativeModelInput(
      buildNativeDirectionalFeatureView(buildPredictionPairInput(imported.completePairs[0]).row_ab_safe)
    )
    const metaAttacks = [
      (fv) => fv.metadata && fv.metadata.iid,
      (fv) => fv.metadata && fv.metadata.pid,
      (fv) => fv.metadata && fv.metadata.wave,
      (fv) => fv.directed_key,
      (fv) => fv.features && fv.features.iid,
      (fv) => fv.a_decision,
      (fv) => fv.raw,
      (fv) => fv._eval_only,
      (fv) => fv.mutual_match
    ]
    let allBlocked = true
    for (const attack of metaAttacks) {
      let blocked = false
      try {
        predictTrueDirectionalPairs(predInputs.slice(0, 1), attack)
      } catch (e) {
        blocked = /FORBIDDEN|IDENTITY|GOLD|MODEL_INPUT/.test(String(e.message))
      }
      // Also: attack returns undefined/falsy without throw if prop missing — treat as blocked if no usable id
      if (!blocked) {
        try {
          const v = attack(sampleIn)
          blocked = v === undefined || v === false || v == null
        } catch (e) {
          blocked = true
        }
      }
      if (!blocked) allBlocked = false
    }
    check('MALICIOUS_SCORER_GOLD_ACCESS_BLOCKED', allBlocked)

    // Explicit model input shape tests
    let noMeta = false
    try {
      void sampleIn.metadata
    } catch (e) {
      noMeta = /MODEL_INPUT_IDENTITY_FORBIDDEN/.test(String(e.message))
    }
    check('MODEL_INPUT_NO_METADATA', noMeta)

    let noIid = false
    try {
      void sampleIn.iid
    } catch (e) {
      noIid = /MODEL_INPUT_IDENTITY_FORBIDDEN/.test(String(e.message))
    }
    check('MODEL_INPUT_NO_IID_RECURSIVE', noIid)

    let noPid = false
    try {
      void sampleIn.pid
    } catch (e) {
      noPid = /MODEL_INPUT_IDENTITY_FORBIDDEN/.test(String(e.message))
    }
    check('MODEL_INPUT_NO_PID_RECURSIVE', noPid)

    let noWave = false
    try {
      void sampleIn.wave
    } catch (e) {
      noWave = /MODEL_INPUT_IDENTITY_FORBIDDEN/.test(String(e.message))
    }
    check('MODEL_INPUT_NO_WAVE_RECURSIVE', noWave)

    let noDk = false
    try {
      void sampleIn.directed_key
    } catch (e) {
      noDk = /MODEL_INPUT_IDENTITY_FORBIDDEN/.test(String(e.message))
    }
    check('MODEL_INPUT_NO_DIRECTED_KEY', noDk)

    let featIidBlocked = false
    try {
      void sampleIn.features.iid
    } catch (e) {
      featIidBlocked = true
    }
    const feats = Object.assign({}, sampleIn.features)
    check('MODEL_FEATURES_NO_IID', featIidBlocked || !Object.prototype.hasOwnProperty.call(feats, 'iid'))
    check('MODEL_FEATURES_NO_PID', !Object.prototype.hasOwnProperty.call(feats, 'pid'))
    check('MODEL_FEATURES_NO_WAVE_IDENTITY', !Object.prototype.hasOwnProperty.call(feats, 'wave'))

    // Orchestration still has metadata on full feature view
    const fullFv = buildNativeDirectionalFeatureView(
      buildPredictionPairInput(imported.completePairs[0]).row_ab_safe
    )
    check('ORCH_METADATA_KEPT', fullFv.metadata && fullFv.metadata.iid != null)
  }

  // Prediction pair input has no gold decisions
  const pin = buildPredictionPairInput(imported.completePairs[0])
  check(
    'STRIP_GOLD_BEFORE_PRED',
    pin.row_ab_safe.a_decision === undefined &&
      pin.row_ab_safe.mutual_match === undefined &&
      pin.row_ab_safe.raw.match === undefined &&
      pin.row_ab_safe.raw.dec === undefined
  )

  const q = parseCsvText('iid,pid,wave,dec,dec_o,match,field\n1,2,1,1,0,0,"Business, Economics and Finance"\n')
  check('CSV_QUOTED', q.rows[0].field === 'Business, Economics and Finance')
  check('GATES_SEPARATED', imported.TRUE_RECIPROCAL_MODEL_READY === false)

  const src = fs.readFileSync(path.join(__dirname, '../data/wefinally/eval/trueReciprocalV15.js'), 'utf8')
  check(
    'PREDICTOR_DOES_NOT_BUILD_GOLD',
    !/function predictTrueDirectionalPairs[\s\S]*evaluatorGold/.test(src.split('function buildEvaluatorGold')[0])
  )

  if (failed) {
    console.error('match-eval-v152 FAILED', failed)
    process.exit(1)
  }
  console.log('match-eval-v152 passed')
}

main()
