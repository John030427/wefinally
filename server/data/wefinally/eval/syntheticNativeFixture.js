'use strict'

/**
 * Synthetic native-id fixture for pipeline integrity only (v1.5.2).
 * NOT a product accuracy result.
 */

const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir } = require('../paths')

const FIXTURE_DIR = () => path.join(PATHS.samples, 'native-id-v152')
const FIXTURE_CSV = () => path.join(FIXTURE_DIR(), 'synthetic-native-iid-pid.csv')

function buildSyntheticNativeCsv() {
  const header =
    'iid,pid,wave,dec,dec_o,match,age,age_o,gender,field,pref_attractive,pref_sincere,hobby_sports,hobby_music,self_attractive'
  const rows = [
    // complete pair 1↔2 wave1
    '1,2,1,1,0,0,25,24,1,"Business, Economics and Finance",70,60,8,5,7',
    '2,1,1,0,1,0,24,25,0,"Business, Economics and Finance",55,80,4,9,6',
    // complete pair 5↔6 wave2
    '5,6,2,0,1,0,28,29,0,Medicine,45,65,5,7,6',
    '6,5,2,1,0,0,29,28,1,Medicine,80,40,9,2,8',
    // incomplete 4→5 (no reverse)
    '4,5,1,1,0,0,30,28,1,Law,50,50,6,6,5',
    // EXACT duplicate of 1→2 (byte-identical normalized)
    '1,2,1,1,0,0,25,24,1,"Business, Economics and Finance",70,60,8,5,7',
    // FEATURE_CONFLICT on disposable key 8→9 (same outcome, different age) — both excluded
    '8,9,1,1,0,0,40,41,1,FeatureConflict,50,50,5,5,5',
    '8,9,1,1,0,0,99,41,1,FeatureConflict,50,50,5,5,5',
    // OUTCOME_CONFLICT on 3→1 (and lone 1→3 becomes incomplete)
    '1,3,1,1,1,1,25,26,1,"Business, Economics and Finance",70,60,8,5,7',
    '3,1,1,1,1,1,26,25,0,Art,40,70,3,8,5',
    '3,1,1,0,1,0,26,25,0,Art,40,70,3,8,5',
    // match-vs-dec inconsistency — quarantined, not in directed
    '7,8,1,0,0,1,22,23,1,BadMatch,50,50,5,5,5',
    // escaped quote + empty field reverse pair 4↔6 wave2
    '4,6,2,0,0,0,30,29,1,"He said ""hello""",50,50,5,5,5',
    '6,4,2,0,0,0,29,30,0,,50,50,5,5,5'
  ]
  return `${header}\n${rows.join('\n')}\n`
}

function writeSyntheticNativeFixture() {
  ensureDir(FIXTURE_DIR())
  const csv = buildSyntheticNativeCsv()
  fs.writeFileSync(FIXTURE_CSV(), csv)
  fs.writeFileSync(
    path.join(FIXTURE_DIR(), 'README.md'),
    [
      '# Synthetic native iid/pid fixture (v1.5.2)',
      '',
      'Integrity-only. Not product accuracy.',
      '',
      `- path: ${FIXTURE_CSV()}`,
      ''
    ].join('\n')
  )
  return FIXTURE_CSV()
}

module.exports = {
  buildSyntheticNativeCsv,
  writeSyntheticNativeFixture,
  FIXTURE_CSV,
  FIXTURE_DIR
}
