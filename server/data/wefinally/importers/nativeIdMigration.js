'use strict'

/**
 * Native iid/pid import + true reciprocal pairing (v1.5).
 * Does NOT download unknown mirrors or weaken REVIEW_REQUIRED gates.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PATHS, ensureDir } = require('../paths')

const REQUIRED = ['iid', 'pid', 'wave']
const DECISION_A = ['decision', 'dec']
const DECISION_B = ['decision_o', 'dec_o']
const MATCH_COLS = ['match']

const NATIVE_PATH = () =>
  path.join(PATHS.raw, 'speed-dating', 'speed-dating-native-iid-pid.csv')

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
    report.identity_mode = 'NATIVE_IID_PID'
    report.skip_fingerprint = true
    report.TRUE_RECIPROCAL_AVAILABLE = true
  } else {
    report.status = 'WAITING_NATIVE_ID_DATA'
    report.identity_mode = 'PAIR_IDENTITY_UNCERTAIN'
    report.skip_fingerprint = false
    report.TRUE_RECIPROCAL_AVAILABLE = false
    report.note =
      'OpenML/GitHub speed-dating CSV lacks iid/pid. Place Columbia-style file at raw/speed-dating/speed-dating-native-iid-pid.csv without weakening license gates.'
  }
  return report
}

function parseHeaderLine(line) {
  return String(line || '')
    .split(',')
    .map((h) => h.replace(/^"|"$/g, '').trim())
}

function parseCsvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { headers: [], rows: [] }
  const headers = parseHeaderLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const obj = {}
    headers.forEach((h, j) => {
      obj[h] = cols[j] != null ? cols[j].replace(/^"|"$/g, '').trim() : ''
    })
    rows.push(obj)
  }
  return { headers, rows }
}

function col(row, names) {
  const keys = Object.keys(row)
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase() === n.toLowerCase())
    if (hit != null && row[hit] !== '' && row[hit] != null) return row[hit]
  }
  return null
}

function auditNativeIdCandidate(csvPath) {
  const resolved = csvPath || NATIVE_PATH()
  const openml = path.join(PATHS.raw, 'speed-dating', 'speed-dating.csv')
  const preferNative = fs.existsSync(resolved)
  const target = preferNative ? resolved : openml
  if (!fs.existsSync(target)) {
    return { status: 'WAITING_NATIVE_ID_DATA', path: target, TRUE_RECIPROCAL_AVAILABLE: false }
  }
  const first = fs.readFileSync(target, 'utf8').split(/\r?\n/).filter(Boolean)[0]
  const headers = parseHeaderLine(first)
  const report = {
    ...detectNativeIdSchema(headers),
    inspected_path: target,
    preferred_native_path: NATIVE_PATH(),
    using_native_file: preferNative,
    generated_at: new Date().toISOString()
  }
  if (!preferNative) {
    report.status = 'WAITING_NATIVE_ID_DATA'
    report.TRUE_RECIPROCAL_AVAILABLE = false
    report.identity_mode = 'PAIR_IDENTITY_UNCERTAIN'
  }
  ensureDir(PATHS.reports)
  fs.writeFileSync(
    path.join(PATHS.reports, 'speed-dating-native-id-migration-audit.md'),
    [
      '# Speed Dating Native iid/pid Migration Audit',
      '',
      '```json',
      JSON.stringify(report, null, 2),
      '```',
      ''
    ].join('\n')
  )
  return report
}

/**
 * Import native CSV when present. Throws if schema invalid.
 */
function importNativeSpeedDating(csvPath) {
  const p = csvPath || NATIVE_PATH()
  if (!fs.existsSync(p)) {
    return {
      ok: false,
      status: 'WAITING_NATIVE_ID_DATA',
      TRUE_RECIPROCAL_AVAILABLE: false,
      rows: []
    }
  }
  const text = fs.readFileSync(p, 'utf8')
  const sha256 = crypto.createHash('sha256').update(text).digest('hex')
  const { headers, rows: raw } = parseCsvRows(text)
  const schema = detectNativeIdSchema(headers)
  if (!schema.usable_native) {
    return { ok: false, status: 'NATIVE_SCHEMA_INVALID', schema, TRUE_RECIPROCAL_AVAILABLE: false }
  }

  const quarantine = []
  const directed = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const iid = Number(col(r, ['iid']))
    const pid = Number(col(r, ['pid']))
    const wave = Number(col(r, ['wave']))
    const dec = Number(col(r, DECISION_A))
    const decO = Number(col(r, DECISION_B))
    const matchRaw = col(r, MATCH_COLS)
    if (![iid, pid, wave].every((x) => Number.isFinite(x)) || iid === pid) {
      quarantine.push({ reason: 'bad_iid_pid_wave', i })
      continue
    }
    if (![0, 1].includes(dec) || ![0, 1].includes(decO)) {
      quarantine.push({ reason: 'bad_decision', i, iid, pid, wave })
      continue
    }
    const mutual = dec === 1 && decO === 1
    if (matchRaw != null && matchRaw !== '' && Number(matchRaw) !== (mutual ? 1 : 0)) {
      quarantine.push({ reason: 'match_dec_inconsistent', i, iid, pid, wave })
    }
    directed.push({
      wave: String(wave),
      iid: String(iid),
      pid: String(pid),
      a_decision: dec === 1,
      b_decision: decO === 1,
      mutual_match: mutual,
      directed_key: `${wave}|${iid}|${pid}`,
      reverse_key: `${wave}|${pid}|${iid}`,
      row_index: i,
      raw: r
    })
  }

  const byKey = new Map(directed.map((d) => [d.directed_key, d]))
  let withReverse = 0
  let missingReverse = 0
  let decisionInconsistent = 0
  const completePairs = []
  const incomplete = []
  const seenCanon = new Set()
  const physicalPairs = new Map()

  for (const d of directed) {
    const rev = byKey.get(d.reverse_key)
    if (rev) {
      withReverse++
      const okDec =
        d.a_decision === rev.b_decision && d.b_decision === rev.a_decision
      if (!okDec) {
        decisionInconsistent++
        quarantine.push({
          reason: 'reverse_decision_inconsistent',
          directed_key: d.directed_key
        })
      } else {
        const lo = Math.min(Number(d.iid), Number(d.pid))
        const hi = Math.max(Number(d.iid), Number(d.pid))
        const canon = `${d.wave}|${lo}|${hi}`
        if (!seenCanon.has(canon)) {
          seenCanon.add(canon)
          completePairs.push({
            canonical_key: canon,
            label: 'TRUE_CANONICAL_PAIR',
            wave: d.wave,
            iid_lo: String(lo),
            iid_hi: String(hi),
            row_ab: d.iid < d.pid ? d : rev,
            row_ba: d.iid < d.pid ? rev : d,
            a_decision: d.iid < d.pid ? d.a_decision : rev.a_decision,
            b_decision: d.iid < d.pid ? d.b_decision : rev.b_decision,
            mutual_match: d.mutual_match
          })
        }
      }
    } else {
      missingReverse++
      incomplete.push({ ...d, status: 'PARTIAL_RECIPROCAL_OBSERVATION' })
    }

    const lo = Math.min(Number(d.iid), Number(d.pid))
    const hi = Math.max(Number(d.iid), Number(d.pid))
    const pk = `${d.wave}|${lo}|${hi}`
    if (!physicalPairs.has(pk)) physicalPairs.set(pk, [])
    physicalPairs.get(pk).push(d)
  }

  // Cross-row identity: same iid stable age/gender when present
  const byIid = new Map()
  for (const d of directed) {
    if (!byIid.has(d.iid)) byIid.set(d.iid, [])
    byIid.get(d.iid).push(d)
  }
  const profileInconsistent = []
  for (const [iid, list] of byIid) {
    const ages = new Set(
      list.map((d) => col(d.raw, ['age'])).filter((x) => x != null && x !== '')
    )
    const genders = new Set(
      list.map((d) => col(d.raw, ['gender'])).filter((x) => x != null && x !== '')
    )
    if (ages.size > 1 || genders.size > 1) {
      profileInconsistent.push({ iid, ages: [...ages], genders: [...genders], n: list.length })
    }
  }

  return {
    ok: true,
    status: 'NATIVE_IID_PID_AVAILABLE',
    identity_mode: 'NATIVE_IID_PID',
    TRUE_RECIPROCAL_AVAILABLE: true,
    sha256,
    path: p,
    schema,
    directed_rows: directed.length,
    unique_participants: byIid.size,
    rows_with_reverse: withReverse,
    rows_missing_reverse: missingReverse,
    reverse_pair_rate: directed.length ? withReverse / directed.length : 0,
    decision_consistency_failures: decisionInconsistent,
    unique_physical_pair_keys: physicalPairs.size,
    true_canonical_pairs: completePairs.length,
    incomplete_pairs: incomplete.length,
    profile_inconsistencies: profileInconsistent,
    quarantine,
    directed,
    completePairs,
    incomplete
  }
}

module.exports = {
  detectNativeIdSchema,
  auditNativeIdCandidate,
  importNativeSpeedDating,
  NATIVE_PATH,
  REQUIRED,
  DECISION_A,
  DECISION_B
}
