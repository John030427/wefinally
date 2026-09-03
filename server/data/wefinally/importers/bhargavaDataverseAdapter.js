'use strict'

/**
 * Minimal v1.6 adapter: Harvard Dataverse Bhargava/Fisman CC0 speed-dating
 * replication → native iid/pid CSV expected by v1.5.2 pipeline.
 *
 * Source license: CC0 1.0 (dataset-level on Dataverse).
 * Derives dec_o / match from reverse directed rows (native bilateral IDs).
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PATHS, ensureDir } = require('../paths')

const SOURCE_ID = 'speed-dating-bhargava-dataverse'
const DATASET_VERSION = 'speed-dating-native-v1'
const ADAPTER_VERSION = 'bhargava-dataverse-v1'

const RAW_DIR = () => path.join(PATHS.raw, 'speed-dating-bhargava-dataverse')
const RAW_TAB = () => path.join(RAW_DIR(), 'ReplicationData_Stata12.tab')
const NATIVE_CSV = () => path.join(PATHS.raw, 'speed-dating', 'speed-dating-native-iid-pid.csv')
const MANIFEST = () => path.join(PATHS.manifests, `${DATASET_VERSION}.json`)

const EXPECTED_SHA256 =
  '8616BD64ADE62C07D8668229C926761ED7A2F59A3F97B8064BD69EFC3E07F81C'

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase()
}

function parseTab(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
  if (!lines.length) throw new Error('EMPTY_TAB')
  const headers = lines[0].split('\t').map((h) => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const obj = {}
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = cols[j] != null ? cols[j].trim() : ''
    rows.push(obj)
  }
  return { headers, rows }
}

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Build native CSV with derived partner decision + mutual match.
 */
function adaptBhargavaTabToNativeCsv(opts = {}) {
  const tabPath = opts.tabPath || RAW_TAB()
  const outPath = opts.outPath || NATIVE_CSV()
  if (!fs.existsSync(tabPath)) {
    return {
      ok: false,
      status: 'MANUAL_IMPORT_REQUIRED',
      message:
        'Missing Dataverse tab. Download https://dataverse.harvard.edu/api/access/datafile/2509001 → ' +
        tabPath,
      expected_sha256: EXPECTED_SHA256
    }
  }

  const hash = sha256File(tabPath)
  if (hash !== EXPECTED_SHA256) {
    return {
      ok: false,
      status: 'CHECKSUM_MISMATCH',
      expected_sha256: EXPECTED_SHA256,
      actual_sha256: hash,
      path: tabPath
    }
  }

  const text = fs.readFileSync(tabPath, 'utf8')
  const { headers, rows } = parseTab(text)
  const need = ['iid', 'pid', 'wave', 'dec']
  for (const n of need) {
    if (!headers.includes(n)) {
      return { ok: false, status: 'BLOCKED_SCHEMA', missing: n, headers }
    }
  }

  // Index by wave|iid|pid → dec (directional subject decision)
  const decByKey = new Map()
  for (const r of rows) {
    const iid = String(Number(r.iid))
    const pid = String(Number(r.pid))
    const wave = String(Number(r.wave))
    if (![iid, pid, wave].every((x) => Number.isFinite(Number(x)))) continue
    const dec = Number(r.dec)
    if (![0, 1].includes(dec)) continue
    decByKey.set(`${wave}|${iid}|${pid}`, dec)
  }

  const outHeaders = [
    'iid',
    'pid',
    'wave',
    'dec',
    'dec_o',
    'match',
    'gender',
    'order',
    'round',
    'date',
    'RA',
    'id',
    'partner'
  ]
  // NOTE: attr is intentionally omitted from native CSV — post-interaction rating leakage.

  const outRows = []
  let missingReverse = 0
  for (const r of rows) {
    const iidN = Number(r.iid)
    const pidN = Number(r.pid)
    const waveN = Number(r.wave)
    const dec = Number(r.dec)
    if (![iidN, pidN, waveN].every((x) => Number.isFinite(x)) || iidN === pidN) continue
    if (![0, 1].includes(dec)) continue
    const wave = String(waveN)
    const iid = String(iidN)
    const pid = String(pidN)
    const revDec = decByKey.get(`${wave}|${pid}|${iid}`)
    if (revDec == null) {
      missingReverse++
      continue
    }
    const match = dec === 1 && revDec === 1 ? 1 : 0
    outRows.push({
      iid,
      pid,
      wave,
      dec: String(dec),
      dec_o: String(revDec),
      match: String(match),
      gender: r.gender != null ? String(r.gender) : '',
      order: r.order != null ? String(r.order) : '',
      round: r.round != null ? String(r.round) : '',
      date: r.date != null ? String(r.date) : '',
      RA: r.RA != null ? String(r.RA) : '',
      id: r.id != null ? String(r.id) : '',
      partner: r.partner != null ? String(r.partner) : ''
    })
  }

  ensureDir(path.dirname(outPath))
  const lines = [outHeaders.join(',')]
  for (const row of outRows) {
    lines.push(outHeaders.map((h) => csvEscape(row[h])).join(','))
  }
  const csvBody = lines.join('\n') + '\n'
  fs.writeFileSync(outPath, csvBody, 'utf8')
  const csvSha = crypto.createHash('sha256').update(csvBody).digest('hex').toUpperCase()

  const manifest = {
    source_id: SOURCE_ID,
    dataset_version: DATASET_VERSION,
    adapter_version: ADAPTER_VERSION,
    license_status: 'APPROVED_EVAL_ONLY',
    license_name: 'CC0 1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    license_confidence: 'high',
    provenance: {
      publisher: 'Harvard Dataverse',
      persistent_id: 'doi:10.7910/DVN/27893',
      file_id: 2509001,
      file_name: 'ReplicationData_Stata12.tab',
      authors: ['Bhargava, Saurabh', 'Fisman, Ray'],
      citation:
        'Bhargava, Saurabh; Fisman, Ray, 2014, "Replication data for: Contrast Effects in Sequential Decisions: Evidence from Speed Dating", https://doi.org/10.7910/DVN/27893, Harvard Dataverse, V1',
      download_url: 'https://dataverse.harvard.edu/api/access/datafile/2509001',
      note:
        'Engineering governance audit — not formal legal advice. Dataset-level CC0 on Dataverse; underlying experiment subjects remain real people (PII risk medium).'
    },
    raw_tab_sha256: EXPECTED_SHA256,
    native_csv_sha256: csvSha,
    schema_sha256: crypto.createHash('sha256').update(outHeaders.join(',')).digest('hex').toUpperCase(),
    rows_out: outRows.length,
    missing_reverse_dropped: missingReverse,
    derived_fields: ['dec_o', 'match'],
    omitted_fields: ['attr'],
    omit_reason: {
      attr: 'POST_OUTCOME_FORBIDDEN — participant post-date attractiveness rating'
    },
    production_model_training_allowed: false,
    rag_allowed: false,
    use_for_eval: true,
    use_for_dev: true,
    use_for_training: false,
    generated_at: new Date().toISOString(),
    local_paths: {
      raw_tab: tabPath,
      native_csv: outPath,
      raw_committed: false
    }
  }

  ensureDir(PATHS.manifests)
  fs.writeFileSync(MANIFEST(), JSON.stringify(manifest, null, 2))

  return {
    ok: true,
    status: 'ADAPTED',
    ...manifest
  }
}

module.exports = {
  SOURCE_ID,
  DATASET_VERSION,
  ADAPTER_VERSION,
  EXPECTED_SHA256,
  RAW_TAB,
  NATIVE_CSV,
  adaptBhargavaTabToNativeCsv
}
