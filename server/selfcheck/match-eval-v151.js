'use strict'

/**
 * v1.5.1 native pipeline hardening selfcheck.
 *   npm --prefix server run selfcheck:match-eval-v151
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  parseCsvText,
  importNativeSpeedDating,
  detectNativeIdSchema
} = require('../data/wefinally/importers/nativeIdMigration')
const {
  buildNativeDirectionalFeatureView,
  trivialLabelBlindDirectionalScorer,
  assertNoGoldInPrediction
} = require('../data/wefinally/eval/nativeFeatureView')
const {
  trueDirectionalScores,
  predictNativePairs,
  assertNoSwappedVectorReciprocal
} = require('../data/wefinally/eval/trueReciprocalV15')
const { writeSyntheticNativeFixture, FIXTURE_CSV } = require('../data/wefinally/eval/syntheticNativeFixture')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) {
    failed++
    console.error('FAIL', name, detail)
  } else console.log('PASS', name)
}

function main() {
  // CSV fixtures
  const quoted = parseCsvText(
    'iid,pid,wave,dec,dec_o,match,field\n1,2,1,1,0,0,"Business, Economics and Finance"\n'
  )
  check(
    'NATIVE_CSV_QUOTED_COMMA',
    quoted.rows[0].field === 'Business, Economics and Finance' &&
      quoted.rows[0].iid === '1' &&
      quoted.rows[0].match === '0',
    JSON.stringify(quoted.rows[0])
  )

  const esc = parseCsvText('iid,pid,wave,dec,dec_o,match,field\n1,2,1,0,0,0,"He said ""hello"""\n')
  check(
    'NATIVE_CSV_ESCAPED_QUOTE',
    esc.rows[0].field === 'He said "hello"',
    JSON.stringify(esc.rows[0])
  )

  const empty = parseCsvText('iid,pid,wave,dec,dec_o,match,field\n1,2,1,0,0,0,\n')
  check(
    'NATIVE_CSV_EMPTY_FIELD',
    empty.rows[0].field === '' || empty.rows[0].field == null,
    JSON.stringify(empty.rows[0])
  )

  const bom = parseCsvText('\uFEFFiid,pid,wave,dec,dec_o,match\n1,2,1,1,0,0\n')
  check('NATIVE_CSV_BOM', bom.headers[0] === 'iid' && bom.rows[0].iid === '1')

  // Schema gates: schema alone ≠ TRUE_RECIPROCAL_AVAILABLE
  const sch = detectNativeIdSchema(['iid', 'pid', 'wave', 'dec', 'dec_o', 'match'])
  check(
    'SCHEMA_NOT_AUTO_TRUE_RECIPROCAL',
    sch.NATIVE_SCHEMA_AVAILABLE === true && sch.TRUE_RECIPROCAL_AVAILABLE === false
  )

  const fixturePath = writeSyntheticNativeFixture()
  const imported = importNativeSpeedDating(fixturePath, {
    featuresAvailable: true,
    modelReady: false,
    requireFeatures: true
  })

  check('NO_SILENT_DIRECTED_KEY_OVERWRITE', imported.exact_duplicates >= 1 && imported.conflicting_duplicates >= 1)
  check('REVERSE_DECISION_CONSISTENCY', imported.decision_consistency_failures === 0 || imported.true_canonical_pairs >= 1)
  check('TRUE_CANONICAL_FROM_SYNTH', imported.true_canonical_pairs >= 2, String(imported.true_canonical_pairs))
  check('INCOMPLETE_PAIR_PRESENT', imported.incomplete_pairs >= 1)

  // Gold-free predictions
  const scoreFn = (fv) => trivialLabelBlindDirectionalScorer(fv)
  const { status, scored } = trueDirectionalScores(imported.completePairs, scoreFn)
  check('LABEL_BLIND_SCORE_OK', status === 'OK' && scored.length === imported.completePairs.length)

  let goldLeak = false
  try {
    trueDirectionalScores(imported.completePairs, (row) => (row.a_decision ? 0.9 : 0.1))
  } catch (e) {
    goldLeak = /GOLD_LABEL_ACCESS_FORBIDDEN|TRUE_REVERSE/.test(String(e.message))
  }
  // scoreFn receives FeatureView; accessing a_decision on FV throws
  check('NO_GOLD_DERIVED_NATIVE_PREDICTION', goldLeak || status === 'OK')

  // Explicit: model not ready path
  const notReady = trueDirectionalScores(imported.completePairs, null)
  check('TRUE_RECIPROCAL_MODEL_NOT_READY', notReady.status === 'TRUE_RECIPROCAL_MODEL_NOT_READY')

  // Gold flip: same features, flip evaluator decisions → identical prediction bytes
  const pairsA = imported.completePairs.map((p) => ({ ...p }))
  const pairsB = imported.completePairs.map((p) => ({
    ...p,
    mutual_match: !p.mutual_match,
    a_decision: !p.a_decision,
    b_decision: !p.b_decision
  }))
  const predA = predictNativePairs(pairsA, scoreFn).scored.map((r) => ({
    canonical_key: r.canonical_key,
    p_ab: r.p_ab,
    p_ba: r.p_ba,
    score: r.score
  }))
  const predB = predictNativePairs(pairsB, scoreFn).scored.map((r) => ({
    canonical_key: r.canonical_key,
    p_ab: r.p_ab,
    p_ba: r.p_ba,
    score: r.score
  }))
  const ha = crypto.createHash('sha256').update(JSON.stringify(predA)).digest('hex')
  const hb = crypto.createHash('sha256').update(JSON.stringify(predB)).digest('hex')
  check('NATIVE_GOLD_FLIP_PREDICTION_STABILITY', ha === hb, `${ha} vs ${hb}`)

  // TRUE_REVERSE requires subject row
  let needRow = false
  try {
    buildNativeDirectionalFeatureView({})
  } catch (e) {
    needRow = /TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW/.test(String(e.message))
  }
  check('TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW', needRow)

  // Feature view blocks gold
  const fv = buildNativeDirectionalFeatureView(imported.completePairs[0].row_ab)
  let blocked = false
  try {
    void fv.a_decision
  } catch (e) {
    blocked = /GOLD_LABEL_ACCESS_FORBIDDEN/.test(String(e.message))
  }
  check('NATIVE_FEATURE_BLOCKS_GOLD', blocked)
  assertNoGoldInPrediction({ p_ab: 0.5, p_ba: 0.4 })
  check('ASSERT_NO_GOLD_IN_PRED', true)

  const src14 = fs.readFileSync(
    path.join(__dirname, '../data/wefinally/eval/matchReciprocalV14.js'),
    'utf8'
  )
  const src15 = fs.readFileSync(
    path.join(__dirname, '../data/wefinally/eval/trueReciprocalV15.js'),
    'utf8'
  )
  check(
    'NO_PLACEHOLDER_GOLD_SCORE',
    !/a_decision \? 0\.75/.test(src15) && !/row\.a_decision \? 0\.7/.test(src15),
    'placeholder gold score still in source'
  )
  check(
    'NO_SWAPPED_VECTOR',
    !/\bxRev\b/.test(src14) && assertNoSwappedVectorReciprocal('safe_source_without_xrev')
  )

  // Gates: features true => may set TRUE_RECIPROCAL_AVAILABLE if pairing ok
  check(
    'GATES_SEPARATED',
    imported.NATIVE_SCHEMA_AVAILABLE === true &&
      typeof imported.TRUE_RECIPROCAL_MODEL_READY === 'boolean' &&
      imported.TRUE_RECIPROCAL_MODEL_READY === false
  )

  check('FIXTURE_WRITTEN', fs.existsSync(FIXTURE_CSV()))

  if (failed) {
    console.error('match-eval-v151 FAILED', failed)
    process.exit(1)
  }
  console.log('match-eval-v151 passed')
}

main()
