'use strict'

/**
 * Native iid/pid migration path (preferred over fingerprint).
 * Does NOT download unknown mirrors or weaken license gates.
 *
 * Prefer a user-provided / legally obtained Columbia-style CSV with:
 *   iid, pid, wave, decision|dec, decision_o|dec_o, match
 */

const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir } = require('../paths')

const REQUIRED = ['iid', 'pid', 'wave']
const DECISION_A = ['decision', 'dec']
const DECISION_B = ['decision_o', 'dec_o']
const MATCH_COLS = ['match']

function detectNativeIdSchema(headers) {
  const set = new Set(headers.map((h) => String(h).trim().toLowerCase()))
  const has = (names) => names.some((n) => set.has(n.toLowerCase()))
  const report = {
    NATIVE_ID_DATASET_PREFERRED: true,
    headers_sample: headers.slice(0, 40),
    has_iid: set.has('iid'),
    has_pid: set.has('pid'),
    has_wave: set.has('wave'),
    has_decision: has(DECISION_A),
    has_decision_o: has(DECISION_B),
    has_match: has(MATCH_COLS),
    usable_native: false,
    status: 'MISSING_NATIVE_IDS'
  }
  report.usable_native =
    report.has_iid &&
    report.has_pid &&
    report.has_wave &&
    report.has_decision &&
    report.has_decision_o
  if (report.usable_native) {
    report.status = 'NATIVE_IID_PID_AVAILABLE'
    report.identity_mode = 'native_iid_pid'
    report.skip_fingerprint = true
  } else {
    report.status = 'FALLBACK_FINGERPRINT_REQUIRED'
    report.identity_mode = 'IDENTITY_RECONSTRUCTED_FROM_PREMATCH_FINGERPRINT'
    report.skip_fingerprint = false
    report.note =
      'OpenML/GitHub datasets/speed-dating CSV lacks iid/pid. Provide Columbia-style file under raw/speed-dating/ with REVIEW_REQUIRED gates intact.'
  }
  return report
}

function parseHeaderLine(line) {
  return String(line || '')
    .split(',')
    .map((h) => h.replace(/^"|"$/g, '').trim())
}

/**
 * Inspect a local CSV path without downloading.
 * Writes audit under datasets/wefinally/reports/.
 */
function auditNativeIdCandidate(csvPath) {
  const resolved =
    csvPath ||
    path.join(PATHS.raw, 'speed-dating', 'speed-dating-native-iid-pid.csv')
  const openml = path.join(PATHS.raw, 'speed-dating', 'speed-dating.csv')
  const target = fs.existsSync(resolved) ? resolved : openml
  if (!fs.existsSync(target)) {
    return { status: 'NO_CSV', path: target }
  }
  const first = fs.readFileSync(target, 'utf8').split(/\r?\n/).filter(Boolean)[0]
  const headers = parseHeaderLine(first)
  const report = {
    ...detectNativeIdSchema(headers),
    inspected_path: target,
    generated_at: new Date().toISOString()
  }
  ensureDir(PATHS.reports)
  fs.writeFileSync(
    path.join(PATHS.reports, 'speed-dating-native-id-migration-audit.md'),
    [
      '# Speed Dating Native iid/pid Migration Audit',
      '',
      '**NATIVE_ID_DATASET_PREFERRED** — fingerprint is uncertain fallback only.',
      '',
      '```json',
      JSON.stringify(report, null, 2),
      '```',
      '',
      '## Import path (when native file available)',
      '',
      '1. Place licensed Columbia-style CSV at `datasets/wefinally/raw/speed-dating/speed-dating-native-iid-pid.csv`',
      '2. Keep `source-registry` status REVIEW_REQUIRED / rag=false',
      '3. Re-run ingest with native detector → `identity_mode=native_iid_pid`',
      '4. Do not fetch unknown mirrors automatically',
      ''
    ].join('\n')
  )
  return report
}

module.exports = {
  detectNativeIdSchema,
  auditNativeIdCandidate,
  REQUIRED,
  DECISION_A,
  DECISION_B
}
