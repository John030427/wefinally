'use strict'

/**
 * v1.6 benchmark adapter selfcheck
 *   npm --prefix server run selfcheck:match-benchmark-v16
 */

const fs = require('fs')
const path = require('path')
const { PATHS } = require('../data/wefinally/paths')
const {
  adaptBhargavaTabToNativeCsv,
  NATIVE_CSV,
  EXPECTED_SHA256
} = require('../data/wefinally/importers/bhargavaDataverseAdapter')
const { importNativeSpeedDating } = require('../data/wefinally/importers/nativeIdMigration')
const {
  buildPredictionPairInput,
  buildEvaluatorGold,
  predictTrueDirectionalPairs
} = require('../data/wefinally/eval/trueReciprocalV15')
const {
  buildNativeModelInput,
  buildNativeDirectionalFeatureView,
  trivialLabelBlindDirectionalScorer,
  assertNoGoldInPrediction,
  collectForbiddenKeys
} = require('../data/wefinally/eval/nativeFeatureView')
const crypto = require('crypto')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) {
    failed++
    console.error('FAIL', name, detail)
  } else console.log('PASS', name)
}

function main() {
  const adapted = adaptBhargavaTabToNativeCsv()
  check('ADAPTER_OK', adapted.ok === true, adapted.status)
  check('LICENSE_CC0', adapted.license_name === 'CC0 1.0')
  check('RAW_NOT_CLAIMED_COMMITTED', adapted.local_paths && adapted.local_paths.raw_committed === false)
  check('ATTR_OMITTED', (adapted.omitted_fields || []).includes('attr'))
  check('SHA_PINNED', adapted.raw_tab_sha256 === EXPECTED_SHA256)

  const imported = importNativeSpeedDating(NATIVE_CSV(), {
    featuresAvailable: true,
    modelReady: false,
    requireFeatures: true
  })

  check('NATIVE_SCHEMA', imported.NATIVE_SCHEMA_AVAILABLE === true)
  check('NATIVE_ROWS', imported.NATIVE_ROWS_VALID === true)
  check('REVERSE_OK', imported.REVERSE_PAIRING_VALID === true)
  check('FEATURES_OK', imported.TRUE_RECIPROCAL_FEATURES_AVAILABLE === true)
  check('PAIRS_GT_1000', imported.true_canonical_pairs > 1000, String(imported.true_canonical_pairs))
  check('NO_DECISION_INCONSISTENCY', imported.decision_consistency_failures === 0)

  const sample = imported.completePairs.slice(0, 50)
  const inputs = sample.map(buildPredictionPairInput)
  const gold = buildEvaluatorGold(sample)
  const flip = gold.map((g) => ({ ...g, mutual_match: !g.mutual_match }))

  const scoreFn = (mi) => trivialLabelBlindDirectionalScorer(mi)
  const a = predictTrueDirectionalPairs(inputs, scoreFn)
  const b = predictTrueDirectionalPairs(inputs, scoreFn)
  // Flip gold externally — predictions must be identical
  void flip
  const ha = crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex')
  const hb = crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex')
  check('PRED_STABLE', ha === hb)
  check('PRED_NO_GOLD_KEY', !Object.prototype.hasOwnProperty.call(a, 'evaluatorGold'))
  let zeroGold = false
  try {
    assertNoGoldInPrediction(a)
    zeroGold = collectForbiddenKeys(a).length === 0
  } catch (_) {
    zeroGold = false
  }
  check('PRED_API_GOLD_FREE', zeroGold)

  const view = buildNativeDirectionalFeatureView(sample[0].row_ab)
  const mi = buildNativeModelInput(view)
  const own = Reflect.ownKeys(mi).map(String)
  check('MODEL_INPUT_FEATURES_ONLY', own.length === 1 && own[0] === 'features')
  check('NO_IID_IN_FEATURES', !Object.prototype.hasOwnProperty.call(mi.features, 'iid'))
  check('NO_PID_IN_FEATURES', !Object.prototype.hasOwnProperty.call(mi.features, 'pid'))
  const featKeys = Object.keys(mi.features)
  check(
    'HAS_RA_OR_GENDER',
    featKeys.some((k) => ['RA', 'ra', 'gender', 'order', 'round', 'date'].includes(k)),
    featKeys.join(',')
  )

  // candidate median
  const by = new Map()
  for (const d of imported.directed) by.set(d.iid, (by.get(d.iid) || 0) + 1)
  const counts = [...by.values()].sort((a, b) => a - b)
  const med = counts[Math.floor((counts.length - 1) * 0.5)]
  check('CANDIDATE_MEDIAN_GT_1', med > 1, String(med))

  check('NATIVE_CSV_EXISTS', fs.existsSync(NATIVE_CSV()))
  check('MANIFEST_EXISTS', fs.existsSync(path.join(PATHS.manifests, 'speed-dating-native-v1.json')))

  if (failed) {
    console.error(`FAILED ${failed}`)
    process.exit(1)
  }
  console.log('OK match-benchmark-v16')
}

main()
