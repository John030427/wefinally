'use strict'

/**
 * v1.8 — recompute ranking metrics with both-sides queries.
 * Does NOT retrain / reselect champion / change pair-level AP/AUROC.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PATHS, ensureDir, REPO_ROOT } = require('../paths')
const { adaptBhargavaTabToNativeCsv, NATIVE_CSV, EXPECTED_SHA256 } = require('../importers/bhargavaDataverseAdapter')
const { importNativeSpeedDating } = require('../importers/nativeIdMigration')
const {
  buildNativeDirectionalFeatureView,
  buildNativeModelInput
} = require('./nativeFeatureView')
const { averagePrecision, aurocTieAware } = require('./binaryRankingMetrics')
const {
  reciprocalRankingBothSides,
  directionalRankingBothSides,
  reciprocalRankingOneSidedLegacy,
  uniqueParticipantsWithCandidates,
  flipPairOrientation
} = require('./rankingBothSides')
const {
  predictLogistic,
  predictGBDT,
  applyPlatt
} = require('../ml/tabularBaselines')
const { FEATURE_NAMES, ruleSimpleScore, SPLIT_WAVES } = require('./finalTournamentV17')

const REVIEW17 = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.7')
const REVIEW18 = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.8')
const ARTIFACT = path.join(PATHS.eval, 'predictions', 'match-final-tournament-v1.7', 'champion_artifact.json')

function vectorFromModelInput(mi) {
  const f = (mi && mi.features) || {}
  return FEATURE_NAMES.map((name) => {
    const v = f[name] != null ? Number(f[name]) : f[name.toLowerCase()] != null ? Number(f[name.toLowerCase()]) : 0
    return Number.isFinite(v) ? v : 0
  })
}

function partitionPairs(completePairs) {
  const out = { TRAIN: [], CALIBRATION: [], DEV: [], LOCKED_RETROSPECTIVE_TEST: [] }
  for (const p of completePairs) {
    const w = String(p.row_ab.wave)
    for (const [name, waves] of Object.entries(SPLIT_WAVES)) {
      if (waves.includes(w)) {
        out[name].push(p)
        break
      }
    }
  }
  return out
}

function scoreDirectional(name, model, mi) {
  if (name === 'RULE_SIMPLE') return ruleSimpleScore(mi)
  if (name === 'Z_RANDOM') return Math.random()
  if (name === 'LR_DIRECTIONAL') return predictLogistic(model, vectorFromModelInput(mi))
  if (name === 'GBDT_DIRECTIONAL') return predictGBDT(model, vectorFromModelInput(mi))
  throw new Error(name)
}

function recipAgg(name, pab, pba) {
  if (name === 'RECIP_MIN') return Math.min(pab, pba)
  if (name === 'RECIP_PRODUCT') return pab * pba
  if (name === 'RECIP_GEOMEAN') return Math.sqrt(Math.max(0, pab * pba))
  if (name === 'RECIP_HARMONIC') return pab + pba === 0 ? 0 : (2 * pab * pba) / (pab + pba)
  if (name === 'RECIP_ASYMMETRY_PENALTY') return Math.min(pab, pba) * (1 - Math.abs(pab - pba))
  throw new Error(name)
}

function pairLevel(pairs, byKey) {
  const scores = pairs.map((p) => byKey.get(p.canonical_key))
  const labels = pairs.map((p) => (p.mutual_match ? 1 : 0))
  return {
    AVERAGE_PRECISION: averagePrecision(scores, labels),
    AUROC: aurocTieAware(scores, labels)
  }
}

function buildScores(pairs, dirName, model, agg, calibrator) {
  const byKey = new Map()
  const dirScores = new Map()
  for (const p of pairs) {
    const inAb = buildNativeModelInput(buildNativeDirectionalFeatureView(p.row_ab))
    const inBa = buildNativeModelInput(buildNativeDirectionalFeatureView(p.row_ba))
    const p_ab = scoreDirectional(dirName, model, inAb)
    const p_ba = scoreDirectional(dirName, model, inBa)
    let score = recipAgg(agg, p_ab, p_ba)
    if (calibrator) score = applyPlatt(calibrator, score)
    byKey.set(p.canonical_key, score)
    dirScores.set(p.canonical_key, { p_ab, p_ba })
  }
  return { byKey, dirScores }
}

function main() {
  ensureDir(REVIEW18)
  const adapted = adaptBhargavaTabToNativeCsv()
  if (!adapted.ok || adapted.raw_tab_sha256 !== EXPECTED_SHA256) throw new Error('RAW_MISMATCH')
  const imported = importNativeSpeedDating(NATIVE_CSV(), {
    featuresAvailable: true,
    modelReady: true,
    requireFeatures: true
  })
  const parts = partitionPairs(imported.completePairs)
  const champ = JSON.parse(fs.readFileSync(path.join(REVIEW17, 'CHAMPION_LOCK.json'), 'utf8'))
  const metrics17 = JSON.parse(fs.readFileSync(path.join(REVIEW17, 'METRICS.json'), 'utf8'))
  if (!fs.existsSync(ARTIFACT)) throw new Error('MISSING_CHAMPION_ARTIFACT')
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'))

  const dirName = champ.model_family
  const agg = champ.aggregator
  const model = artifact.model
  const calibrator = artifact.calibrator

  const evaluateSplit = (name, pairs) => {
    const { byKey, dirScores } = buildScores(pairs, dirName, model, agg, calibrator)
    const pair = pairLevel(pairs, byKey)
    const legacy = reciprocalRankingOneSidedLegacy(pairs, byKey)
    const both = reciprocalRankingBothSides(pairs, byKey)
    const dirBoth = directionalRankingBothSides(pairs, (p) => dirScores.get(p.canonical_key))
    const nUnique = uniqueParticipantsWithCandidates(pairs)
    const flipped = flipPairOrientation(pairs)
    // scores keyed by same canonical_key — orientation flip must not change both-sides metrics
    const bothFlip = reciprocalRankingBothSides(flipped, byKey)
    return {
      split: name,
      n_pairs: pairs.length,
      unique_participants: nUnique,
      pair_level: pair,
      ranking_legacy_one_sided: legacy,
      ranking_both_sides: both,
      directional_both_sides: dirBoth,
      orientation_invariant:
        JSON.stringify(both) === JSON.stringify(bothFlip) && both.n_queries === nUnique,
      query_count_equals_unique_participants: both.n_queries === nUnique
    }
  }

  const dev = evaluateSplit('DEV', parts.DEV)
  const locked = evaluateSplit('LOCKED_RETROSPECTIVE_TEST', parts.LOCKED_RETROSPECTIVE_TEST)

  // Pair-level must match v1.7 recorded champion metrics (within tiny float)
  const oldDevAp = metrics17.champion.dev_metrics.AVERAGE_PRECISION
  const oldLockedAp = metrics17.locked_retrospective.champion.AVERAGE_PRECISION
  const apUnchanged =
    Math.abs(dev.pair_level.AVERAGE_PRECISION - oldDevAp) < 1e-6 &&
    Math.abs(locked.pair_level.AVERAGE_PRECISION - oldLockedAp) < 1e-6

  const out = {
    champion_unchanged: true,
    structured_status_unchanged: metrics17.structured_status,
    pair_level_ap_auroc_unchanged: apUnchanged,
    old_dev_ranking_queries: metrics17.champion.dev_metrics.ranking.n_queries || null,
    note_old_ranking:
      'v1.7 rankingMetrics grouped only by row_ab.iid (canonical orientation) — one-sided',
    DEV: dev,
    LOCKED_RETROSPECTIVE_TEST: locked,
    bootstrap_wave_dev: 'DEGENERATE_SINGLE_CLUSTER',
    generated_at: new Date().toISOString()
  }

  fs.writeFileSync(path.join(REVIEW18, 'RANKING_BOTH_SIDES.json'), JSON.stringify(out, null, 2))
  console.log(
    JSON.stringify(
      {
        ap_unchanged: apUnchanged,
        dev_queries_old_approx: 'one-sided',
        dev_queries_new: dev.ranking_both_sides.n_queries,
        locked_queries_new: locked.ranking_both_sides.n_queries,
        orientation_invariant: dev.orientation_invariant && locked.orientation_invariant
      },
      null,
      2
    )
  )
  if (!apUnchanged) throw new Error('PAIR_LEVEL_CHANGED_UNEXPECTEDLY')
  if (!dev.query_count_equals_unique_participants || !locked.query_count_equals_unique_participants) {
    throw new Error('QUERY_COUNT_MISMATCH')
  }
  if (!dev.orientation_invariant || !locked.orientation_invariant) {
    throw new Error('ORIENTATION_NOT_INVARIANT')
  }
  return out
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

module.exports = { main }
