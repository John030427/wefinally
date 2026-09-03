'use strict'

/**
 * v1.6 benchmark resolution CLI
 *   npm --prefix server run data:wefinally:benchmark-v16
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PATHS, ensureDir, REPO_ROOT } = require('./paths')
const { adaptBhargavaTabToNativeCsv, NATIVE_CSV, DATASET_VERSION } = require('./importers/bhargavaDataverseAdapter')
const { importNativeSpeedDating, auditNativeIdCandidate } = require('./importers/nativeIdMigration')
const {
  buildPredictionPairInput,
  buildEvaluatorGold,
  predictTrueDirectionalPairs,
  evalBinary
} = require('./eval/trueReciprocalV15')
const { trivialLabelBlindDirectionalScorer } = require('./eval/nativeFeatureView')

const REVIEW = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.6')

function pctile(sorted, p) {
  if (!sorted.length) return null
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
  return sorted[i]
}

function candidateStats(directed) {
  const byUser = new Map()
  for (const d of directed || []) {
    byUser.set(d.iid, (byUser.get(d.iid) || 0) + 1)
  }
  const counts = [...byUser.values()].sort((a, b) => a - b)
  const mean = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0
  return {
    n_queries: byUser.size,
    candidate_count: {
      min: counts[0] ?? null,
      p10: pctile(counts, 0.1),
      median: pctile(counts, 0.5),
      mean: Number(mean.toFixed(2)),
      p90: pctile(counts, 0.9),
      max: counts[counts.length - 1] ?? null
    },
    queries_ge2: counts.filter((c) => c >= 2).length,
    queries_ge3: counts.filter((c) => c >= 3).length,
    queries_ge5: counts.filter((c) => c >= 5).length,
    queries_ge10: counts.filter((c) => c >= 10).length
  }
}

function buildGroupedSplit(completePairs) {
  // Group by wave; reserve highest wave ids for sealed (no outcome inspection beyond counts)
  const byWave = new Map()
  for (const p of completePairs) {
    const wave = String(p.row_ab.wave)
    if (!byWave.has(wave)) byWave.set(wave, [])
    byWave.get(wave).push(p.canonical_key)
  }
  const waves = [...byWave.keys()].sort((a, b) => Number(a) - Number(b))
  if (waves.length < 4) {
    return {
      status: 'NO_FRESH_SEALED_AVAILABLE',
      reason: 'fewer than 4 waves for train/cal/dev/sealed',
      waves,
      partitions: null
    }
  }
  const sealedWave = waves[waves.length - 1]
  const devWave = waves[waves.length - 2]
  const calWave = waves[waves.length - 3]
  const trainWaves = waves.slice(0, -3)
  const part = (keys, name) => ({
    name,
    n_pairs: keys.length,
    // store only keys — sealed outcomes not analyzed in v1.6
    canonical_keys_sha256: crypto
      .createHash('sha256')
      .update(keys.slice().sort().join('\n'))
      .digest('hex')
  })
  const trainKeys = trainWaves.flatMap((w) => byWave.get(w))
  const calKeys = byWave.get(calWave)
  const devKeys = byWave.get(devWave)
  const sealedKeys = byWave.get(sealedWave)
  return {
    status: 'GROUPED_BY_WAVE',
    fresh_sealed_status: 'CREATED_UNOPENED',
    waves: {
      train: trainWaves,
      calibration: [calWave],
      dev: [devWave],
      sealed: [sealedWave]
    },
    partitions: {
      TRAIN: part(trainKeys, 'TRAIN'),
      CALIBRATION: part(calKeys, 'CALIBRATION'),
      DEV: part(devKeys, 'DEV'),
      SEALED: part(sealedKeys, 'SEALED')
    },
    note: 'SEALED reserved for v1.7 tournament — no outcome metrics computed in v1.6'
  }
}

function negativeControlSmoke(completePairs) {
  const gold = buildEvaluatorGold(completePairs)
  const inputs = completePairs.map(buildPredictionPairInput)
  const labels = gold.map((g) => (g.mutual_match ? 1 : 0))
  const n = labels.length
  const pos = labels.filter((x) => x === 1).length
  const controls = {}

  const run = (name, scoreFn) => {
    const api = predictTrueDirectionalPairs(inputs, scoreFn)
    const m = evalBinary(api.predictions, gold)
    controls[name] = {
      auroc: m.AUROC,
      average_precision: m.AVERAGE_PRECISION,
      n,
      positive_rate: Number((pos / n).toFixed(4))
    }
  }

  run('ALL_NEGATIVE', () => 0)
  run('ALL_POSITIVE', () => 1)
  run('RANDOM', () => Math.random())
  run('DETERMINISTIC_BASELINE_SMOKE', trivialLabelBlindDirectionalScorer)

  return {
    outcome_positive_rate_mutual: Number((pos / n).toFixed(4)),
    n_pairs: n,
    controls,
    note: 'Smoke only — not a model tournament'
  }
}

function main() {
  ensureDir(REVIEW)
  const adapted = adaptBhargavaTabToNativeCsv()
  if (!adapted.ok) {
    console.error(JSON.stringify(adapted, null, 2))
    process.exit(2)
  }

  const audit = auditNativeIdCandidate(NATIVE_CSV())
  const imported = importNativeSpeedDating(NATIVE_CSV(), {
    featuresAvailable: true,
    modelReady: false,
    requireFeatures: true
  })

  if (!imported.ok && imported.status !== 'TRUE_RECIPROCAL_FEATURES_AVAILABLE') {
    // ok may be false when modelReady false — check gates
  }

  const gates = {
    NATIVE_SCHEMA_AVAILABLE: !!imported.NATIVE_SCHEMA_AVAILABLE,
    NATIVE_ROWS_VALID: !!imported.NATIVE_ROWS_VALID,
    REVERSE_PAIRING_VALID: !!imported.REVERSE_PAIRING_VALID,
    TRUE_RECIPROCAL_FEATURES_AVAILABLE: !!imported.TRUE_RECIPROCAL_FEATURES_AVAILABLE,
    TRUE_RECIPROCAL_MODEL_READY: !!imported.TRUE_RECIPROCAL_MODEL_READY,
    TRUE_RECIPROCAL_AVAILABLE: !!imported.TRUE_RECIPROCAL_AVAILABLE
  }

  const cand = candidateStats(imported.directed)
  const split = buildGroupedSplit(imported.completePairs || [])
  ensureDir(path.join(PATHS.splits, DATASET_VERSION))
  const splitPath = path.join(PATHS.splits, `${DATASET_VERSION}-manifest.json`)
  fs.writeFileSync(
    splitPath,
    JSON.stringify(
      {
        dataset_version: DATASET_VERSION,
        ...split,
        split_manifest_sha256: null,
        generated_at: new Date().toISOString()
      },
      null,
      2
    )
  )
  const splitBody = fs.readFileSync(splitPath)
  const splitSha = crypto.createHash('sha256').update(splitBody).digest('hex').toUpperCase()
  const splitObj = JSON.parse(splitBody.toString('utf8'))
  splitObj.split_manifest_sha256 = splitSha
  fs.writeFileSync(splitPath, JSON.stringify(splitObj, null, 2))

  let smoke = null
  // DEV-only smoke: exclude sealed wave keys
  if (split.partitions && imported.completePairs) {
    const sealedSha = split.partitions.SEALED.canonical_keys_sha256
    const sealedSet = new Set(
      (imported.completePairs || [])
        .filter((p) => String(p.row_ab.wave) === String(split.waves.sealed[0]))
        .map((p) => p.canonical_key)
    )
    const openPairs = imported.completePairs.filter((p) => !sealedSet.has(p.canonical_key))
    smoke = negativeControlSmoke(openPairs)
    smoke.sealed_pairs_excluded = sealedSet.size
    smoke.sealed_keys_fingerprint = sealedSha
  } else if (imported.completePairs && imported.completePairs.length) {
    smoke = negativeControlSmoke(imported.completePairs)
  }

  const identity = {
    unique_users: new Set(
      (imported.directed || []).flatMap((d) => [d.iid, d.pid])
    ).size,
    directed_interactions: (imported.directed || []).length,
    unique_physical_pairs: imported.true_canonical_pairs,
    duplicate_exact: imported.exact_duplicates,
    feature_conflict_duplicates: imported.feature_conflict_duplicates,
    outcome_conflict_duplicates: imported.outcome_conflict_duplicates,
    missing_reverse: imported.incomplete_pairs,
    reverse_available: imported.REVERSE_PAIRING_VALID
  }

  const report = {
    adapted,
    audit_status: audit.status,
    gates,
    identity,
    candidate_query_stats: cand,
    split_status: split.status,
    fresh_sealed_status: split.fresh_sealed_status || 'NOT_AVAILABLE',
    negative_control_smoke: smoke,
    generated_at: new Date().toISOString()
  }

  fs.writeFileSync(path.join(REVIEW, 'BENCHMARK_INGEST_SMOKE.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: true, gates, candidate_median: cand.candidate_count.median, pairs: imported.true_canonical_pairs }, null, 2))

  const hardOk =
    gates.NATIVE_SCHEMA_AVAILABLE &&
    gates.NATIVE_ROWS_VALID &&
    gates.REVERSE_PAIRING_VALID &&
    gates.TRUE_RECIPROCAL_FEATURES_AVAILABLE &&
    cand.candidate_count.median > 1

  if (!hardOk) {
    console.error('BENCHMARK_GATES_FAILED', gates, cand.candidate_count)
    process.exit(1)
  }
}

if (require.main === module) main()

module.exports = { main, candidateStats, buildGroupedSplit, negativeControlSmoke }
