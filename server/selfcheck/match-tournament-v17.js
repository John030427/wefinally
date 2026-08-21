'use strict'

/**
 * v1.7 tournament integrity smoke
 *   npm --prefix server run selfcheck:match-tournament-v17
 */

const fs = require('fs')
const path = require('path')
const { REPO_ROOT } = require('../data/wefinally/paths')
const { FEATURE_NAMES, ruleSimpleScore, SPLIT_WAVES } = require('../data/wefinally/eval/finalTournamentV17')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) {
    failed++
    console.error('FAIL', name, detail)
  } else console.log('PASS', name)
}

function main() {
  const review = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.7')
  const champ = JSON.parse(fs.readFileSync(path.join(review, 'CHAMPION_LOCK.json'), 'utf8'))
  const metrics = JSON.parse(fs.readFileSync(path.join(review, 'METRICS.json'), 'utf8'))

  check('CHAMPION_LOCKED', champ.status === 'LOCKED')
  check('NOT_FRESH_SEALED_LABEL', champ.holdout_is_fresh_sealed === false)
  check('HOLDOUT_LABEL', champ.holdout_label === 'LOCKED_RETROSPECTIVE_TEST')
  check('FEATURES_SPARSE', Array.isArray(champ.features) && champ.features.join(',') === FEATURE_NAMES.join(','))
  check('NO_ATTR_FEATURE', !champ.features.includes('attr'))
  check('TRAIN_WAVES_FIXED', JSON.stringify(champ.training_waves) === JSON.stringify(SPLIT_WAVES.TRAIN))
  check('LOCKED_EVAL_PRESENT', !!metrics.locked_retrospective && metrics.locked_retrospective.NOT_FRESH_SEALED === true)
  check('RULE_SIMPLE_DETERMINISTIC', ruleSimpleScore({ features: { RA: 6, order: 5 } }) === ruleSimpleScore({ features: { RA: 6, order: 5 } }))
  check('PAIR_DIRECTED_SPLIT_OK', metrics.split_integrity && metrics.split_integrity.pair_directed_ok === true)
  check(
    'STRUCTURED_STATUS_HONEST',
    ['STRUCTURED_SMALL_UNCERTAIN_IMPROVEMENT', 'NO_CLEAR_STRUCTURED_WINNER', 'STRUCTURED_CLEAR_IMPROVEMENT', 'STRUCTURED_REGRESSION'].includes(
      metrics.structured_status
    )
  )

  if (fs.existsSync(path.join(review, 'TRACK_B_HY3.json'))) {
    const b = JSON.parse(fs.readFileSync(path.join(review, 'TRACK_B_HY3.json'), 'utf8'))
    check('TRACK_B_HAS_STATUS', !!b.status)
    if (b.status !== 'HY3_REAL_BLOCKED') {
      check('TRACK_B_REAL_PROVIDER', b.provider === 'cloudbase' && String(b.model).toLowerCase() === 'hy3')
    }
  } else {
    check('TRACK_B_FILE', false, 'missing TRACK_B_HY3.json')
  }

  if (failed) {
    console.error('FAILED', failed)
    process.exit(1)
  }
  console.log('OK match-tournament-v17')
}

main()
