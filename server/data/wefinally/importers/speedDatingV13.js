'use strict'

/**
 * Speed Dating v1.3 rebuild: fingerprint identity (when iid/pid absent),
 * PRE_MATCH feature mapping, pair integrity stats.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir } = require('../paths')
const { LABEL_QUALITY } = require('../labelQuality')

const HOBBIES = [
  'sports',
  'tvsports',
  'exercise',
  'dining',
  'museums',
  'art',
  'hiking',
  'gaming',
  'clubbing',
  'reading',
  'tv',
  'theater',
  'movies',
  'concerts',
  'music',
  'shopping',
  'yoga'
]

const SUBJ_PREFS = [
  'attractive_important',
  'sincere_important',
  'intellicence_important',
  'funny_important',
  'ambtition_important',
  'shared_interests_important'
]

const PART_PREFS = [
  'pref_o_attractive',
  'pref_o_sincere',
  'pref_o_intelligence',
  'pref_o_funny',
  'pref_o_ambitious',
  'pref_o_shared_interests'
]

const POST_FORBIDDEN = new Set([
  'like',
  'guess_prob_liked',
  'attractive_partner',
  'sincere_partner',
  'intelligence_partner',
  'funny_partner',
  'ambition_partner',
  'shared_interests_partner',
  'attractive_o',
  'sinsere_o',
  'intelligence_o',
  'funny_o',
  'ambitous_o',
  'shared_interests_o',
  'decision',
  'decision_o',
  'dec',
  'dec_o',
  'match',
  'met'
])

const SENSITIVE = new Set([
  'race',
  'race_o',
  'samerace',
  'importance_same_race',
  'importance_same_religion',
  'field'
])

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)
}

function subjectFingerprint(r) {
  return [
    String(r.wave || ''),
    String(r.gender || ''),
    String(r.age || ''),
    ...SUBJ_PREFS.map((k) => String(r[k] ?? '')),
    ...HOBBIES.map((k) => String(r[k] ?? ''))
  ].join('|')
}

function partnerFingerprint(r) {
  return [
    String(r.wave || ''),
    String(r.age_o || ''),
    ...PART_PREFS.map((k) => String(r[k] ?? ''))
  ].join('|')
}

function prefsFromRow(r, keys) {
  const o = {}
  for (const k of keys) {
    const v = num(r[k])
    if (v != null) o[k] = v
  }
  return o
}

function hobbiesFromRow(r) {
  const o = {}
  for (const k of HOBBIES) {
    const v = num(r[k])
    if (v != null) o[k] = v
  }
  return o
}

function selfAttrFromRow(r) {
  const keys = ['attractive', 'sincere', 'intelligence', 'funny', 'ambition']
  const o = {}
  for (const k of keys) {
    const v = num(r[k])
    if (v != null) o[k] = v
  }
  return o
}

/**
 * Rebuild pairs from CSV rows with reconstructed identities.
 * Each directed encounter becomes one pair row oriented subject→partner,
 * then deduped to undirected canonical pairs.
 */
function rebuildPairsFromRows(rows) {
  const quarantine = []
  const hasIid = rows.some((r) => r.iid !== undefined && r.iid !== '' && r.pid !== undefined && r.pid !== '')
  const identityMode = hasIid ? 'NATIVE_IID_PID' : 'PAIR_IDENTITY_UNCERTAIN'
  const TRUE_RECIPROCAL_AVAILABLE = !!hasIid

  const directed = []
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx]
    const wave = String(r.wave || '0')
    let iid
    let pid
    if (hasIid) {
      iid = String(Number(r.iid))
      pid = String(Number(r.pid))
      if (!Number.isFinite(Number(r.iid)) || !Number.isFinite(Number(r.pid)) || iid === pid) {
        quarantine.push({ reason: 'bad_iid_pid', idx })
        continue
      }
    } else {
      iid = `fp_${hashId([subjectFingerprint(r)])}`
      pid = `fp_${hashId([partnerFingerprint(r)])}`
      if (iid === pid) {
        quarantine.push({ reason: 'fingerprint_collision_self', idx, wave })
        continue
      }
    }

    const aYes = Number(r.decision) === 1
    const bYes = Number(r.decision_o) === 1
    const matchFlag = Number(r.match) === 1
    if (matchFlag !== (aYes && bYes)) {
      quarantine.push({
        reason: 'match_dec_inconsistent',
        idx,
        wave,
        iid,
        pid,
        decision: aYes,
        decision_o: bYes,
        match: matchFlag
      })
      // still keep pair with decision-derived mutual; record quarantine note
    }

    directed.push({
      idx,
      wave,
      iid,
      pid,
      aYes,
      bYes,
      matchFlag,
      row: r
    })
  }

  // Canonical undirected pairs: wave|min(iid,pid)|max
  const map = new Map()
  for (const d of directed) {
    const lo = d.iid < d.pid ? d.iid : d.pid
    const hi = d.iid < d.pid ? d.pid : d.iid
    const key = `${d.wave}|${lo}|${hi}`
    const fromLo = d.iid === lo
    const p = map.get(key) || {
      key,
      wave: d.wave,
      lo,
      hi,
      dec_lo_to_hi: null,
      dec_hi_to_lo: null,
      rows: [],
      inconsistent: false,
      feature_row_lo: null,
      feature_row_hi: null
    }
    p.rows.push(d.idx)
    if (fromLo) {
      if (p.dec_lo_to_hi !== null && p.dec_lo_to_hi !== d.aYes) p.inconsistent = true
      p.dec_lo_to_hi = d.aYes
      if (p.dec_hi_to_lo === null) p.dec_hi_to_lo = d.bYes
      else if (p.dec_hi_to_lo !== d.bYes) p.inconsistent = true
      p.feature_row_lo = d.row
    } else {
      if (p.dec_hi_to_lo !== null && p.dec_hi_to_lo !== d.aYes) p.inconsistent = true
      p.dec_hi_to_lo = d.aYes
      if (p.dec_lo_to_hi === null) p.dec_lo_to_hi = d.bYes
      else if (p.dec_lo_to_hi !== d.bYes) p.inconsistent = true
      p.feature_row_hi = d.row
    }
    // Also keep a subject-oriented encounter record for ranking queries
    map.set(key, p)
  }

  const pairs = []
  const encounterRows = [] // one row per directed encounter for ranking (subject perspective)

  for (const d of directed) {
    const r = d.row
    encounterRows.push({
      case_id: `sd_enc_${d.wave}_${d.iid}_${d.pid}`,
      source: {
        source_id: 'speed-dating',
        source_record_id: `wave${d.wave}_enc_${d.idx}`,
        source_license: 'odc-pddl-claimed-unverified',
        derivation_method: identityMode,
        provenance_uncertainty: 'high',
        identity_mode: identityMode
      },
      person_a: {
        id: d.iid,
        wave: d.wave,
        age: num(r.age),
        gender: num(r.gender),
        self_attr: selfAttrFromRow(r),
        interests: hobbiesFromRow(r)
      },
      person_b: {
        id: d.pid,
        wave: d.wave,
        age: num(r.age_o)
      },
      a_preferences: prefsFromRow(r, SUBJ_PREFS),
      b_preferences: prefsFromRow(r, PART_PREFS),
      a_to_b_decision: d.aYes,
      b_to_a_decision: d.bYes,
      bilateral_outcome: {
        mutual_match: d.aYes && d.bYes,
        one_sided: d.aYes !== d.bYes,
        A_decision: d.aYes,
        B_decision: d.bYes,
        match_flag: d.matchFlag
      },
      observed_attributes: {
        note: 'historical_observation — not product_policy; race/ethnicity fairness-only',
        fairness_only: {
          // stored for fairness audit only — FeatureView must strip
          race: r.race,
          race_o: r.race_o,
          samerace: r.samerace
        }
      },
      pre_date_information: {
        interests_correlate: num(r.interests_correlate),
        expected_happy_with_sd_people: num(r.expected_happy_with_sd_people),
        d_age: num(r.d_age)
      },
      post_interaction_ratings: {
        like: num(r.like)
      },
      ground_truth_type: 'observed_bilateral_decision',
      label_quality: LABEL_QUALITY.GOLD_OBSERVED,
      evaluation_only: true,
      rag_eligible: false,
      sandbox: true,
      wave: d.wave,
      iid: d.iid,
      pid: d.pid,
      entity_key: `match:wave${d.wave}:p${d.iid}`
    })
  }

  for (const [key, p] of map.entries()) {
    if (p.inconsistent) {
      quarantine.push({ reason: 'bilateral_inconsistent', key, rows: p.rows })
      continue
    }
    const aYes = !!p.dec_lo_to_hi
    const bYes = !!p.dec_hi_to_lo
    const featLo = p.feature_row_lo || p.feature_row_hi || {}
    const featHi = p.feature_row_hi || p.feature_row_lo || {}
    pairs.push({
      case_id: `sd_pair_${key.replace(/\|/g, '_')}`,
      source: {
        source_id: 'speed-dating',
        source_record_id: key,
        source_license: 'odc-pddl-claimed-unverified',
        derivation_method: identityMode,
        provenance_uncertainty: 'high',
        identity_mode: identityMode,
        pair_label: hasIid ? 'TRUE_CANONICAL_PAIR' : 'PAIR_IDENTITY_UNCERTAIN',
        TRUE_RECIPROCAL_AVAILABLE
      },
      person_a: {
        id: p.lo,
        wave: p.wave,
        age: num(featLo.age) ?? num(featHi.age_o),
        gender: num(featLo.gender),
        self_attr: selfAttrFromRow(featLo),
        interests: hobbiesFromRow(featLo)
      },
      person_b: {
        id: p.hi,
        wave: p.wave,
        age: num(featLo.age_o) ?? num(featHi.age),
        gender: num(featHi.gender),
        self_attr: selfAttrFromRow(featHi),
        interests: hobbiesFromRow(featHi)
      },
      a_preferences: prefsFromRow(featLo, SUBJ_PREFS),
      b_preferences: Object.keys(prefsFromRow(featHi, SUBJ_PREFS)).length
        ? prefsFromRow(featHi, SUBJ_PREFS)
        : prefsFromRow(featLo, PART_PREFS),
      a_to_b_decision: aYes,
      b_to_a_decision: bYes,
      bilateral_outcome: {
        mutual_match: aYes && bYes,
        one_sided: aYes !== bYes,
        A_decision: aYes,
        B_decision: bYes
      },
      observed_attributes: {
        note: 'historical_observation — not product_policy; race/ethnicity fairness-only'
      },
      pre_date_information: {
        interests_correlate: num(featLo.interests_correlate),
        d_age: num(featLo.d_age)
      },
      post_interaction_ratings: {},
      ground_truth_type: 'observed_bilateral_decision',
      label_quality: LABEL_QUALITY.GOLD_OBSERVED,
      evaluation_only: true,
      rag_eligible: false,
      sandbox: true,
      wave: p.wave,
      iid: p.lo,
      pid: p.hi,
      entity_key: `match:wave${p.wave}:pair_${p.lo}_${p.hi}`
    })
  }

  // Ranking uses directed encounters (subject query → partners)
  const stats = computeQueryStats(encounterRows)

  return {
    identityMode,
    TRUE_RECIPROCAL_AVAILABLE,
    pair_identity_status: hasIid ? 'TRUE_CANONICAL_PAIR' : 'PAIR_IDENTITY_UNCERTAIN',
    pairs,
    encounterRows,
    quarantined: quarantine,
    stats,
    raw_count: rows.length,
    POST_FORBIDDEN: [...POST_FORBIDDEN],
    SENSITIVE: [...SENSITIVE],
    PRE_MATCH_ALLOWED: [
      'age',
      'age_o',
      'gender',
      'd_age',
      ...SUBJ_PREFS,
      ...PART_PREFS,
      ...HOBBIES,
      'attractive',
      'sincere',
      'intelligence',
      'funny',
      'ambition',
      'interests_correlate',
      'expected_happy_with_sd_people'
    ]
  }
}

function computeQueryStats(encounters) {
  const byQ = new Map()
  for (const e of encounters) {
    const qk = `${e.iid}::${e.wave}`
    if (!byQ.has(qk)) byQ.set(qk, new Set())
    byQ.get(qk).add(e.pid)
  }
  const sizes = [...byQ.values()].map((s) => s.size).sort((a, b) => a - b)
  const pct = (p) => (sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor((sizes.length - 1) * p))] : 0)
  const mean = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0
  return {
    n_queries: sizes.length,
    min: sizes[0] || 0,
    p10: pct(0.1),
    median: pct(0.5),
    mean: Math.round(mean * 1000) / 1000,
    p90: pct(0.9),
    max: sizes[sizes.length - 1] || 0,
    with_ge2: sizes.filter((x) => x >= 2).length,
    with_ge3: sizes.filter((x) => x >= 3).length,
    with_ge5: sizes.filter((x) => x >= 5).length,
    with_ge10: sizes.filter((x) => x >= 10).length
  }
}

function writeIntegrityReports(result) {
  ensureDir(PATHS.reports)
  fs.writeFileSync(
    path.join(PATHS.reports, 'speed-dating-pair-integrity.md'),
    [
      '# Speed Dating Pair Integrity (v1.3)',
      '',
      `- identity_mode: **${result.identityMode}**`,
      `- raw encounter rows: ${result.raw_count}`,
      `- directed encounters kept: ${result.encounterRows.length}`,
      `- canonical undirected pairs: ${result.pairs.length}`,
      `- quarantined records: ${result.quarantined.length}`,
      '',
      '## Ranking query candidate stats (directed)',
      '',
      '```json',
      JSON.stringify(result.stats, null, 2),
      '```',
      '',
      result.stats.median > 1
        ? 'PASS: median candidates > 1 — real ranking possible.'
        : 'FAIL: median candidates still 1 — reconstruction bug.',
      '',
      '## Quarantine sample',
      '',
      '```json',
      JSON.stringify(result.quarantined.slice(0, 20), null, 2),
      '```',
      ''
    ].join('\n')
  )

  fs.writeFileSync(
    path.join(PATHS.reports, 'speed-dating-feature-timing-audit.md'),
    [
      '# Speed Dating Feature Timing Audit (v1.3)',
      '',
      'WeFinally matching is PRE-date. Offline models must not use post-meeting partner evaluations.',
      '',
      '## PRE_MATCH_ALLOWED',
      '',
      ...result.PRE_MATCH_ALLOWED.map((f) => `- ${f}`),
      '',
      '## POST_INTERACTION_FORBIDDEN',
      '',
      ...result.POST_FORBIDDEN.map((f) => `- ${f}`),
      '',
      '## SENSITIVE_FAIRNESS_ONLY',
      '',
      ...result.SENSITIVE.map((f) => `- ${f}`),
      '',
      '## UNKNOWN_EXCLUDE',
      '',
      '- Any field not listed above is excluded by default.',
      '',
      'Outcome fields `decision` / `decision_o` / `match` are always EVALUATOR_ONLY.',
      ''
    ].join('\n')
  )
}

function persistV13Artifacts(result) {
  ensureDir(PATHS.cleaned)
  // Ranking benchmark uses directed encounters
  fs.writeFileSync(
    path.join(PATHS.cleaned, 'speed-dating-encounters-v1.3.jsonl'),
    result.encounterRows.map((c) => JSON.stringify(c)).join('\n') + '\n'
  )
  fs.writeFileSync(
    path.join(PATHS.cleaned, 'speed-dating-pairs-v1.3.jsonl'),
    result.pairs.map((c) => JSON.stringify(c)).join('\n') + '\n'
  )
  // Keep cleaned/speed-dating.jsonl as encounters for eval pipeline compatibility
  fs.writeFileSync(
    path.join(PATHS.cleaned, 'speed-dating.jsonl'),
    result.encounterRows.map((c) => JSON.stringify(c)).join('\n') + '\n'
  )
  if (result.quarantined.length) {
    ensureDir(PATHS.quarantine)
    fs.writeFileSync(
      path.join(PATHS.quarantine, 'speed-dating-inconsistent-v1.3.jsonl'),
      result.quarantined.map((c) => JSON.stringify(c)).join('\n') + '\n'
    )
  }
  writeIntegrityReports(result)
  return {
    encounters: result.encounterRows.length,
    pairs: result.pairs.length,
    quarantined: result.quarantined.length,
    stats: result.stats,
    identityMode: result.identityMode
  }
}

module.exports = {
  rebuildPairsFromRows,
  persistV13Artifacts,
  writeIntegrityReports,
  computeQueryStats,
  subjectFingerprint,
  partnerFingerprint,
  HOBBIES,
  SUBJ_PREFS,
  PART_PREFS,
  POST_FORBIDDEN,
  SENSITIVE
}
