'use strict'

/**
 * Synthetic native-id fixture for pipeline integrity only (v1.5.1).
 * NOT a product accuracy result.
 */

const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir } = require('../paths')

const FIXTURE_DIR = () => path.join(PATHS.samples, 'native-id-v151')
const FIXTURE_CSV = () => path.join(FIXTURE_DIR(), 'synthetic-native-iid-pid.csv')

/**
 * 6 participants, 2 waves, complete reverses, incomplete, exact dup, conflicting dup,
 * quoted-comma field.
 */
function buildSyntheticNativeCsv() {
  const header =
    'iid,pid,wave,dec,dec_o,match,age,age_o,gender,field,pref_attractive,pref_sincere,hobby_sports,hobby_music,self_attractive'
  const rows = [
    // wave 1: complete pair 1↔2
    '1,2,1,1,0,0,25,24,1,"Business, Economics and Finance",70,60,8,5,7',
    '2,1,1,0,1,0,24,25,0,"Business, Economics and Finance",55,80,4,9,6',
    // wave 1: complete pair 1↔3 mutual
    '1,3,1,1,1,1,25,26,1,"Business, Economics and Finance",70,60,8,5,7',
    '3,1,1,1,1,1,26,25,0,Art,40,70,3,8,5',
    // wave 1: incomplete 4→5 (no reverse)
    '4,5,1,1,0,0,30,28,1,Law,50,50,6,6,5',
    // wave 2: complete 5↔6
    '5,6,2,0,1,0,28,29,0,Medicine,45,65,5,7,6',
    '6,5,2,1,0,0,29,28,1,Medicine,80,40,9,2,8',
    // exact duplicate of 1→2 wave1 (same decisions)
    '1,2,1,1,0,0,25,24,1,"Business, Economics and Finance",70,60,8,5,7',
    // conflicting duplicate of 3→1 wave1 (different dec)
    '3,1,1,0,1,0,26,25,0,Art,40,70,3,8,5',
    // escaped quote in field
    '4,6,2,0,0,0,30,29,1,"He said ""hello""",50,50,5,5,5',
    '6,4,2,0,0,0,29,30,0,EmptyFieldTest,50,50,5,5,5'
  ]
  // empty field row: leave field empty between commas
  rows.push('5,4,2,1,0,0,28,30,0,,45,65,5,7,6')
  rows.push('4,5,2,0,1,0,30,28,1,Law,50,50,6,6,5')
  return `${header}\n${rows.join('\n')}\n`
}

function writeSyntheticNativeFixture() {
  ensureDir(FIXTURE_DIR())
  const csv = buildSyntheticNativeCsv()
  fs.writeFileSync(FIXTURE_CSV(), csv)
  fs.writeFileSync(
    path.join(FIXTURE_DIR(), 'README.md'),
    [
      '# Synthetic native iid/pid fixture (v1.5.1)',
      '',
      'Integrity-only. Not product accuracy.',
      '',
      `- path: ${FIXTURE_CSV()}`,
      '- includes quoted commas, escaped quotes, empty fields',
      '- exact + conflicting directed duplicates',
      '- complete and incomplete reverse pairs',
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
