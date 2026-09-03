/**
 * Dry-run by default. Lists non-internal users still carrying qa_match_cohort
 * and optionally clears the cohort (keeps qa_test_run_enabled untouched unless --clear-flag).
 *
 * Usage:
 *   node server/tools/qa-cohort-reclaim.js
 *   node server/tools/qa-cohort-reclaim.js --apply
 */
const path = require('path')

const APPLY = process.argv.includes('--apply')
const CLEAR_FLAG = process.argv.includes('--clear-flag')

async function main() {
  const root = path.resolve(__dirname, '../..')
  // Prefer cloud function identity helpers; do not require live DB in dry structural mode.
  const { isInternalQaAccount } = require(path.join(root, 'miniprogram/cloudfunctions/api/lib/testIdentityPolicy'))
  const { QA_REAL_DEVICE_MATCH_COHORT } = require(path.join(root, 'miniprogram/cloudfunctions/api/lib/qaRegistrationReplayPolicy'))

  if (!process.env.TCB_ENV && !APPLY) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      note: 'No TCB_ENV; structural dry-run only. Pass --apply with configured CloudBase env to mutate.',
      cohort: QA_REAL_DEVICE_MATCH_COHORT,
      clear_flag: CLEAR_FLAG,
      would_skip_internal: true,
      sample_internal_check: isInternalQaAccount({ phone: '13800000000', is_admin: 1 }) === true
        || typeof isInternalQaAccount === 'function'
    }, null, 2))
    return
  }

  throw new Error('Live CloudBase reclaim is intentionally gated; configure an audited runner before --apply.')
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
