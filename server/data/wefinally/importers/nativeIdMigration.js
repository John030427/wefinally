'use strict'

/**
 * Native iid/pid import + true reciprocal pairing (v1.5.1).
 * Proper CSV parse; duplicate-key safety; separated readiness gates.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { parse } = require('csv-parse/sync')
const { PATHS, ensureDir } = require('../paths')

const REQUIRED = ['iid', 'pid', 'wave']
const DECISION_A = ['decision', 'dec']
const DECISION_B = ['decision_o', 'dec_o']
const MATCH_COLS = ['match']

const GOLD_KEYS = new Set([
  'dec',
  'dec_o',
  'decision',
  'decision_o',
  'match',
  'mutual_match',
  'a_decision',
  'b_decision'
])

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
    NATIVE_SCHEMA_AVAILABLE: false,
    TRUE_RECIPROCAL_AVAILABLE: false
  }
  report.NATIVE_SCHEMA_AVAILABLE =
    report.has_iid &&
    report.has_pid &&
    report.has_wave &&
    report.has_decision &&
    report.has_decision_o
  report.usable_native = report.NATIVE_SCHEMA_AVAILABLE
  if (report.NATIVE_SCHEMA_AVAILABLE) {
    report.status = 'NATIVE_SCHEMA_AVAILABLE'
    report.identity_mode = 'NATIVE_IID_PID'
    report.skip_fingerprint = true
  } else {
    report.status = 'WAITING_NATIVE_ID_DATA'
    report.identity_mode = 'PAIR_IDENTITY_UNCERTAIN'
    report.skip_fingerprint = false
    report.note =
      'Schema alone does not imply TRUE_RECIPROCAL_AVAILABLE. Need valid rows + reverse pairs + feature/gold separation.'
  }
  return report
}

function parseCsvText(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '')
  const records = parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: true,
    bom: true,
    cast: false
  })
  const headers = records.length ? Object.keys(records[0]) : []
  return { headers, rows: records }
}

function col(row, names) {
  const keys = Object.keys(row)
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase() === n.toLowerCase())
    if (hit != null && row[hit] !== '' && row[hit] != null) return row[hit]
  }
  return null
}

function decisionsEqual(a, b) {
  return !!a === !!b
}

function decisionPayloadEqual(d1, d2) {
  return (
    decisionsEqual(d1.a_decision, d2.a_decision) &&
    decisionsEqual(d1.b_decision, d2.b_decision) &&
    decisionsEqual(d1.mutual_match, d2.mutual_match)
  )
}

/** Canonical hash of parsed row values (sorted keys, trimmed strings). */
function normalizeRowHash(raw) {
  const keys = Object.keys(raw || {}).sort()
  const norm = {}
  for (const k of keys) {
    const v = raw[k]
    norm[k] = v == null ? '' : String(v).trim()
  }
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex')
}

function classifyDuplicateGroup(list) {
  const hashes = list.map((x) => normalizeRowHash(x.raw))
  const allExact = hashes.every((h) => h === hashes[0])
  if (allExact) return 'EXACT_DUPLICATE'
  const outcomesSame = list.every((x) => decisionPayloadEqual(x, list[0]))
  if (outcomesSame) return 'FEATURE_CONFLICT_DUPLICATE'
  return 'OUTCOME_CONFLICT_DUPLICATE'
}

function auditNativeIdCandidate(csvPath) {
  const resolved = csvPath || NATIVE_PATH()
  const openml = path.join(PATHS.raw, 'speed-dating', 'speed-dating.csv')
  const preferNative = fs.existsSync(resolved)
  const target = preferNative ? resolved : openml
  if (!fs.existsSync(target)) {
    return {
      status: 'WAITING_NATIVE_ID_DATA',
      path: target,
      NATIVE_SCHEMA_AVAILABLE: false,
      TRUE_RECIPROCAL_AVAILABLE: false
    }
  }
  const buf = fs.readFileSync(target)
  const text = buf.toString('utf8')
  let headers
  try {
    headers = parseCsvText(text).headers
  } catch (_) {
    headers = text.split(/\r?\n/).filter(Boolean)[0].split(',')
  }
  const report = {
    ...detectNativeIdSchema(headers),
    inspected_path: target,
    preferred_native_path: NATIVE_PATH(),
    using_native_file: preferNative,
    generated_at: new Date().toISOString(),
    TRUE_RECIPROCAL_AVAILABLE: false
  }
  if (!preferNative) {
    report.status = 'WAITING_NATIVE_ID_DATA'
    report.NATIVE_SCHEMA_AVAILABLE = false
    report.identity_mode = 'PAIR_IDENTITY_UNCERTAIN'
  }
  ensureDir(PATHS.reports)
  fs.writeFileSync(
    path.join(PATHS.reports, 'speed-dating-native-id-migration-audit.md'),
    ['# Speed Dating Native iid/pid Migration Audit', '', '```json', JSON.stringify(report, null, 2), '```', ''].join(
      '\n'
    )
  )
  return report
}

/**
 * Import native CSV. Separates schema / rows / reverse / reciprocal gates.
 */
function importNativeSpeedDating(csvPath, opts = {}) {
  const p = csvPath || NATIVE_PATH()
  if (!fs.existsSync(p)) {
    return {
      ok: false,
      status: 'WAITING_NATIVE_ID_DATA',
      NATIVE_SCHEMA_AVAILABLE: false,
      NATIVE_ROWS_VALID: false,
      REVERSE_PAIRING_VALID: false,
      TRUE_RECIPROCAL_FEATURES_AVAILABLE: false,
      TRUE_RECIPROCAL_MODEL_READY: false,
      TRUE_RECIPROCAL_AVAILABLE: false,
      rows: []
    }
  }
  const text = fs.readFileSync(p, 'utf8')
  const sha256 = crypto.createHash('sha256').update(text).digest('hex')
  let headers
  let raw
  try {
    ;({ headers, rows: raw } = parseCsvText(text))
  } catch (e) {
    return {
      ok: false,
      status: 'CSV_PARSE_FAILED',
      error: String(e.message || e),
      TRUE_RECIPROCAL_AVAILABLE: false
    }
  }
  const schema = detectNativeIdSchema(headers)
  if (!schema.NATIVE_SCHEMA_AVAILABLE) {
    return {
      ok: false,
      status: 'NATIVE_SCHEMA_INVALID',
      schema,
      NATIVE_SCHEMA_AVAILABLE: false,
      TRUE_RECIPROCAL_AVAILABLE: false
    }
  }

  const quarantine = []
  const directedRaw = []
  let sourceMatchAvailable = schema.has_match
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
    let source_match = null
    let source_match_consistent = true
    if (matchRaw != null && matchRaw !== '') {
      source_match = Number(matchRaw) === 1
      source_match_consistent = source_match === mutual
      if (!source_match_consistent) {
        quarantine.push({
          reason: 'match_dec_inconsistent',
          i,
          iid,
          pid,
          wave,
          source_match,
          derived_mutual: mutual
        })
        continue // INVALID for Gold benchmark
      }
    } else {
      sourceMatchAvailable = false
    }
    directedRaw.push({
      wave: String(wave),
      iid: String(iid),
      pid: String(pid),
      a_decision: dec === 1,
      b_decision: decO === 1,
      mutual_match: mutual,
      source_match,
      source_match_consistent,
      source_match_available: matchRaw != null && matchRaw !== '',
      directed_key: `${wave}|${iid}|${pid}`,
      reverse_key: `${wave}|${pid}|${iid}`,
      row_index: i,
      raw: r,
      row_hash: normalizeRowHash(r)
    })
  }

  // Duplicate directed key handling — never silent overwrite
  const groups = new Map()
  for (const d of directedRaw) {
    if (!groups.has(d.directed_key)) groups.set(d.directed_key, [])
    groups.get(d.directed_key).push(d)
  }
  let exactDuplicates = 0
  let featureConflictDuplicates = 0
  let outcomeConflictDuplicates = 0
  const directed = []
  for (const [key, list] of groups) {
    if (list.length === 1) {
      directed.push(list[0])
      continue
    }
    const kind = classifyDuplicateGroup(list)
    if (kind === 'EXACT_DUPLICATE') {
      exactDuplicates += list.length - 1
      directed.push(list[0])
      quarantine.push({ reason: 'EXACT_DUPLICATE', directed_key: key, dropped: list.length - 1 })
    } else if (kind === 'FEATURE_CONFLICT_DUPLICATE') {
      featureConflictDuplicates += list.length
      quarantine.push({ reason: 'FEATURE_CONFLICT_DUPLICATE', directed_key: key, n: list.length })
      // Do NOT keep first — exclude all
    } else {
      outcomeConflictDuplicates += list.length
      quarantine.push({ reason: 'OUTCOME_CONFLICT_DUPLICATE', directed_key: key, n: list.length })
    }
  }

  const byKey = new Map()
  for (const d of directed) {
    if (byKey.has(d.directed_key)) {
      throw new Error('NO_SILENT_DIRECTED_KEY_OVERWRITE: duplicate slipped into map')
    }
    byKey.set(d.directed_key, d)
  }

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
      const okDec = d.a_decision === rev.b_decision && d.b_decision === rev.a_decision
      const derivedMatchOk =
        d.mutual_match === rev.mutual_match && d.mutual_match === (d.a_decision && d.b_decision)
      let sourceMatchOk = true
      if (d.source_match_available || rev.source_match_available) {
        sourceMatchOk =
          d.source_match_consistent &&
          rev.source_match_consistent &&
          d.source_match === rev.source_match &&
          d.source_match === d.mutual_match
      }
      if (!okDec || !derivedMatchOk || !sourceMatchOk) {
        decisionInconsistent++
        quarantine.push({
          reason: 'reverse_decision_inconsistent',
          directed_key: d.directed_key,
          okDec,
          derivedMatchOk,
          sourceMatchOk
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
            row_ab: Number(d.iid) < Number(d.pid) ? d : rev,
            row_ba: Number(d.iid) < Number(d.pid) ? rev : d,
            a_decision: Number(d.iid) < Number(d.pid) ? d.a_decision : rev.a_decision,
            b_decision: Number(d.iid) < Number(d.pid) ? d.b_decision : rev.b_decision,
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

  const byIid = new Map()
  for (const d of directed) {
    if (!byIid.has(d.iid)) byIid.set(d.iid, [])
    byIid.get(d.iid).push(d)
  }
  const profileInconsistent = []
  for (const [iid, list] of byIid) {
    const ages = new Set(list.map((d) => col(d.raw, ['age'])).filter((x) => x != null && x !== ''))
    const genders = new Set(list.map((d) => col(d.raw, ['gender'])).filter((x) => x != null && x !== ''))
    if (ages.size > 1 || genders.size > 1) {
      profileInconsistent.push({ iid, ages: [...ages], genders: [...genders], n: list.length })
    }
  }

  const NATIVE_ROWS_VALID = directed.length > 0
  const REVERSE_PAIRING_VALID = completePairs.length > 0 && decisionInconsistent === 0
  // profile inconsistencies are reported but do not alone zero REVERSE_PAIRING_VALID;
  // they block TRUE_RECIPROCAL_AVAILABLE below.
  const TRUE_RECIPROCAL_FEATURES_AVAILABLE = !!opts.featuresAvailable
  const TRUE_RECIPROCAL_MODEL_READY = !!opts.modelReady
  const TRUE_RECIPROCAL_AVAILABLE =
    schema.NATIVE_SCHEMA_AVAILABLE &&
    NATIVE_ROWS_VALID &&
    REVERSE_PAIRING_VALID &&
    profileInconsistent.length === 0 &&
    (opts.requireFeatures !== false ? TRUE_RECIPROCAL_FEATURES_AVAILABLE : true)

  return {
    ok: true,
    status: TRUE_RECIPROCAL_AVAILABLE
      ? 'TRUE_RECIPROCAL_AVAILABLE'
      : schema.NATIVE_SCHEMA_AVAILABLE
        ? 'NATIVE_SCHEMA_AVAILABLE_BUT_GATES_INCOMPLETE'
        : 'WAITING_NATIVE_ID_DATA',
    identity_mode: 'NATIVE_IID_PID',
    NATIVE_SCHEMA_AVAILABLE: schema.NATIVE_SCHEMA_AVAILABLE,
    NATIVE_ROWS_VALID,
    REVERSE_PAIRING_VALID,
    TRUE_RECIPROCAL_FEATURES_AVAILABLE,
    TRUE_RECIPROCAL_MODEL_READY,
    TRUE_RECIPROCAL_AVAILABLE,
    sha256,
    path: p,
    schema,
    raw_rows: raw.length,
    valid_directed_rows: directed.length,
    duplicate_keys: [...groups.entries()].filter(([, l]) => l.length > 1).length,
    exact_duplicates: exactDuplicates,
    feature_conflict_duplicates: featureConflictDuplicates,
    outcome_conflict_duplicates: outcomeConflictDuplicates,
    conflicting_duplicates: featureConflictDuplicates + outcomeConflictDuplicates,
    source_match_available: sourceMatchAvailable,
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
    incomplete,
    byKey
  }
}

module.exports = {
  detectNativeIdSchema,
  auditNativeIdCandidate,
  importNativeSpeedDating,
  parseCsvText,
  col,
  normalizeRowHash,
  classifyDuplicateGroup,
  GOLD_KEYS,
  NATIVE_PATH,
  REQUIRED,
  DECISION_A,
  DECISION_B
}
