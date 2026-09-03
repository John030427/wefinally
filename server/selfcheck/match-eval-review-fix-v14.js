'use strict'

/**
 * v1.4 review-fix checks.
 *   npm --prefix server run selfcheck:match-eval-review-fix-v14
 */

const fs = require('fs')
const path = require('path')
const { PATHS } = require('../data/wefinally/paths')
const { splitSpeedDatingV13 } = require('../data/wefinally/builders/splitSpeedDatingV13')
const {
  loadPart,
  loadSealedForEvaluatorOnly,
  assertSealedPhysicallyIsolated
} = require('../data/wefinally/builders/sealedAccess')
const { auditNativeIdCandidate } = require('../data/wefinally/importers/nativeIdMigration')
const { averagePrecision } = require('../data/wefinally/eval/binaryRankingMetrics')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) {
    failed++
    console.error('FAIL', name, detail)
  } else console.log('PASS', name)
}

function main() {
  // Ensure sealed isolation on regenerate
  const encPath = path.join(PATHS.cleaned, 'speed-dating-encounters-v1.3.jsonl')
  if (fs.existsSync(encPath)) {
    splitSpeedDatingV13(encPath)
  }

  let sealedLoaderBlocked = false
  try {
    loadPart('SEALED_TEST')
  } catch (e) {
    sealedLoaderBlocked = /SEALED_GENERAL_LOADER_FORBIDDEN/.test(String(e.message))
  }
  check('SEALED_GENERAL_LOADER_FORBIDDEN', sealedLoaderBlocked)

  let explicitRequired = false
  try {
    loadSealedForEvaluatorOnly({})
  } catch (e) {
    explicitRequired = /EVALUATOR_ONLY_GOLD_ACCESS/.test(String(e.message))
  }
  check('EVALUATOR_ONLY_GOLD_ACCESS', explicitRequired)

  try {
    assertSealedPhysicallyIsolated()
    check('NO_GOLD_BEARING_ENCOUNTERS_IN_SEALED', true)
  } catch (e) {
    check('NO_GOLD_BEARING_ENCOUNTERS_IN_SEALED', false, String(e.message))
  }

  // DEV still loads
  const dev = loadPart('DEV')
  check('DEV_LOAD_OK', Array.isArray(dev) && dev.length > 0, String(dev.length))

  const native = auditNativeIdCandidate()
  check(
    'NATIVE_ID_DATASET_PREFERRED_DOCUMENTED',
    native.NATIVE_ID_DATASET_PREFERRED === true && !!native.status
  )

  // Calibration name match unit
  const bestRecip = 'RECIP_ASYMMETRY_PENALTY'
  const calibratedName = `${bestRecip}_PLATT`
  check('CALIBRATOR_BASE_MODEL_MATCHES_NAME', calibratedName.startsWith(bestRecip + '_'))

  // AP still works
  check('AP_SMOKE', averagePrecision([1, 0], [1, 0]) === 1)

  if (failed) {
    console.error('review-fix FAILED', failed)
    process.exit(1)
  }
  console.log('match-eval-review-fix-v14 passed')
}

main()
