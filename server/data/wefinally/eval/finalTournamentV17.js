'use strict'

/**
 * Match v1.7 Track A — final structured tournament on speed-dating-native-v1.
 * TRAIN/CAL/DEV only until CHAMPION_LOCK; then wave 21 once as LOCKED_RETROSPECTIVE_TEST.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PATHS, ensureDir, REPO_ROOT } = require('../paths')
const {
  adaptBhargavaTabToNativeCsv,
  NATIVE_CSV,
  EXPECTED_SHA256,
  DATASET_VERSION
} = require('../importers/bhargavaDataverseAdapter')
const { importNativeSpeedDating } = require('../importers/nativeIdMigration')
const {
  buildNativeDirectionalFeatureView,
  buildNativeModelInput
} = require('./nativeFeatureView')
const { averagePrecision, aurocTieAware } = require('./binaryRankingMetrics')
const {
  expectedPrecisionAtK,
  expectedNdcgAt,
  expectedMrr
} = require('./rankingTieAware')
const {
  trainLogistic,
  predictLogistic,
  trainGBDT,
  predictGBDT,
  fitPlatt,
  applyPlatt
} = require('../ml/tabularBaselines')

const REVIEW = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.7')
const ARTIFACTS = path.join(PATHS.eval, 'predictions', 'match-final-tournament-v1.7')

const SPLIT_WAVES = {
  TRAIN: ['1', '2', '3', '4', '5', '7', '8', '9', '10', '11', '13', '14', '15'],
  CALIBRATION: ['17'],
  DEV: ['19'],
  LOCKED_RETROSPECTIVE_TEST: ['21']
}

const FEATURE_NAMES = ['gender', 'order', 'round', 'date', 'RA']

function sha256(obj) {
  return crypto.createHash('sha256').update(typeof obj === 'string' ? obj : JSON.stringify(obj)).digest('hex')
}

function round(n, d = 4) {
  if (n == null || Number.isNaN(n)) return null
  const m = 10 ** d
  return Math.round(n * m) / m
}

function vectorFromModelInput(mi) {
  const f = (mi && mi.features) || {}
  return FEATURE_NAMES.map((name) => {
    const v = f[name] != null ? Number(f[name]) : f[name.toLowerCase()] != null ? Number(f[name.toLowerCase()]) : 0
    return Number.isFinite(v) ? v : 0
  })
}

function partitionPairs(completePairs) {
  const out = { TRAIN: [], CALIBRATION: [], DEV: [], LOCKED_RETROSPECTIVE_TEST: [], OTHER: [] }
  for (const p of completePairs) {
    const w = String(p.row_ab.wave)
    let placed = false
    for (const [name, waves] of Object.entries(SPLIT_WAVES)) {
      if (waves.includes(w)) {
        out[name].push(p)
        placed = true
        break
      }
    }
    if (!placed) out.OTHER.push(p)
  }
  return out
}

function assertSplitIntegrity(parts) {
  const users = {}
  const pairs = {}
  const dirs = {}
  const report = { participant_overlap: [], pair_overlap: [], directed_overlap: [], ok: true }
  for (const [name, list] of Object.entries(parts)) {
    if (name === 'OTHER') continue
    users[name] = new Set()
    pairs[name] = new Set()
    dirs[name] = new Set()
    for (const p of list) {
      users[name].add(p.row_ab.iid)
      users[name].add(p.row_ab.pid)
      pairs[name].add(p.canonical_key)
      dirs[name].add(p.row_ab.directed_key)
      dirs[name].add(p.row_ba.directed_key)
    }
  }
  const names = ['TRAIN', 'CALIBRATION', 'DEV', 'LOCKED_RETROSPECTIVE_TEST']
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]
      const b = names[j]
      for (const u of users[a]) if (users[b].has(u)) report.participant_overlap.push({ a, b, u })
      for (const k of pairs[a]) if (pairs[b].has(k)) report.pair_overlap.push({ a, b, k })
      for (const d of dirs[a]) if (dirs[b].has(d)) report.directed_overlap.push({ a, b, d })
    }
  }
  report.ok =
    report.participant_overlap.length === 0 &&
    report.pair_overlap.length === 0 &&
    report.directed_overlap.length === 0
  report.counts = Object.fromEntries(names.map((n) => [n, parts[n].length]))
  return report
}

/** Fixed BEFORE looking at DEV — uses only RA + order heuristics. */
function ruleSimpleScore(mi) {
  const f = (mi && mi.features) || {}
  const ra = Number(f.RA ?? f.ra ?? 5)
  const order = Number(f.order ?? 10)
  // Higher RA → higher interest; slight early-order bump (defined a priori)
  let s = 0.15 + (ra / 10) * 0.55 + Math.max(0, (12 - order) / 12) * 0.15
  return Math.max(0.01, Math.min(0.99, s))
}

function randomScore() {
  return Math.random()
}

function binaryMetrics(scores, labels) {
  const n = scores.length
  const pos = labels.filter(Boolean).length
  const neg = n - pos
  const prevalence = n ? pos / n : 0
  // threshold 0.5 for classification metrics
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  let brier = 0
  for (let i = 0; i < n; i++) {
    const y = labels[i] ? 1 : 0
    const p = scores[i]
    brier += (p - y) ** 2
    const pred = p >= 0.5 ? 1 : 0
    if (pred === 1 && y === 1) tp++
    else if (pred === 1 && y === 0) fp++
    else if (pred === 0 && y === 0) tn++
    else fn++
  }
  const prec = tp + fp ? tp / (tp + fp) : 0
  const rec = tp + fn ? tp / (tp + fn) : 0
  const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0
  const mccDen = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
  const mcc = mccDen ? (tp * tn - fp * fn) / mccDen : 0
  // ECE 10 buckets
  const buckets = Array.from({ length: 10 }, () => ({ n: 0, conf: 0, pos: 0 }))
  for (let i = 0; i < n; i++) {
    const idx = Math.min(9, Math.floor(Math.max(0, Math.min(0.999, scores[i])) * 10))
    buckets[idx].n++
    buckets[idx].conf += scores[i]
    if (labels[i]) buckets[idx].pos++
  }
  let ece = 0
  for (const b of buckets) {
    if (!b.n) continue
    ece += (b.n / n) * Math.abs(b.conf / b.n - b.pos / b.n)
  }
  return {
    n,
    prevalence: round(prevalence),
    AVERAGE_PRECISION: averagePrecision(scores, labels),
    AUROC: aurocTieAware(scores, labels),
    MCC: round(mcc),
    Precision: round(prec),
    Recall: round(rec),
    F1: round(f1),
    Brier: round(brier / Math.max(1, n)),
    ECE: round(ece),
    tp,
    fp,
    tn,
    fn
  }
}

function rankingMetrics(pairs, scoreByKey, labelFn) {
  // group by query iid from row_ab
  const byQ = new Map()
  for (const p of pairs) {
    const q = p.row_ab.iid
    if (!byQ.has(q)) byQ.set(q, [])
    byQ.get(q).push({
      score: scoreByKey.get(p.canonical_key),
      relevant: !!labelFn(p)
    })
  }
  const p1 = []
  const p3 = []
  const n3 = []
  const n5 = []
  const mrr = []
  for (const cands of byQ.values()) {
    if (cands.length < 1) continue
    const a = expectedPrecisionAtK(cands, 1)
    if (a != null) p1.push(a)
    if (cands.length >= 3) {
      const b = expectedPrecisionAtK(cands, 3)
      if (b != null) p3.push(b)
      const c = expectedNdcgAt(cands, 3)
      if (c != null) n3.push(c)
    }
    if (cands.length >= 5) {
      const d = expectedNdcgAt(cands, 5)
      if (d != null) n5.push(d)
    }
    const e = expectedMrr(cands)
    if (e != null) mrr.push(e)
  }
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return {
    n_queries: byQ.size,
    P_at_1: round(mean(p1)),
    P_at_3: round(mean(p3)),
    NDCG_at_3: round(mean(n3)),
    NDCG_at_5: round(mean(n5)),
    MRR: round(mean(mrr))
  }
}

function fourState(pairs, scoreByKey) {
  const buckets = {
    YY: [],
    YN: [],
    NY: [],
    NN: []
  }
  for (const p of pairs) {
    const key = p.a_decision && p.b_decision ? 'YY' : p.a_decision && !p.b_decision ? 'YN' : !p.a_decision && p.b_decision ? 'NY' : 'NN'
    buckets[key].push(scoreByKey.get(p.canonical_key))
  }
  const summarize = (arr) => {
    if (!arr.length) return { n: 0, mean: null, p90: null, high_conf_rate: null }
    const sorted = [...arr].sort((a, b) => a - b)
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length
    const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)]
    const high = arr.filter((s) => s >= 0.7).length / arr.length
    return { n: arr.length, mean: round(mean), p90: round(p90), high_conf_rate: round(high) }
  }
  return {
    YY: summarize(buckets.YY),
    YN: summarize(buckets.YN),
    NY: summarize(buckets.NY),
    NN: summarize(buckets.NN),
    one_sided_high_conf_rate: round(
      [...buckets.YN, ...buckets.NY].filter((s) => s >= 0.7).length /
        Math.max(1, buckets.YN.length + buckets.NY.length)
    )
  }
}

function scoreDirectional(modelName, model, mi) {
  if (modelName === 'Z_RANDOM') return randomScore()
  if (modelName === 'RULE_SIMPLE') return ruleSimpleScore(mi)
  if (modelName === 'LR_DIRECTIONAL') return predictLogistic(model, vectorFromModelInput(mi))
  if (modelName === 'GBDT_DIRECTIONAL') return predictGBDT(model, vectorFromModelInput(mi))
  throw new Error(`unknown model ${modelName}`)
}

function recipAgg(name, pab, pba) {
  if (name === 'RECIP_MIN') return Math.min(pab, pba)
  if (name === 'RECIP_PRODUCT') return pab * pba
  if (name === 'RECIP_GEOMEAN') return Math.sqrt(Math.max(0, pab * pba))
  if (name === 'RECIP_HARMONIC') return pab + pba === 0 ? 0 : (2 * pab * pba) / (pab + pba)
  if (name === 'RECIP_ASYMMETRY_PENALTY') return Math.min(pab, pba) * (1 - Math.abs(pab - pba))
  throw new Error(name)
}

function predictPairScores(pairs, dirModelName, dirModel, aggName, calibrator) {
  const byKey = new Map()
  const details = []
  for (const p of pairs) {
    const fvAb = buildNativeDirectionalFeatureView(p.row_ab)
    const fvBa = buildNativeDirectionalFeatureView(p.row_ba)
    const inAb = buildNativeModelInput(fvAb)
    const inBa = buildNativeModelInput(fvBa)
    const p_ab = scoreDirectional(dirModelName, dirModel, inAb)
    const p_ba = scoreDirectional(dirModelName, dirModel, inBa)
    let score = recipAgg(aggName, p_ab, p_ba)
    if (calibrator) score = applyPlatt(calibrator, score)
    byKey.set(p.canonical_key, score)
    details.push({
      canonical_key: p.canonical_key,
      p_ab,
      p_ba,
      score,
      a_decision: !!p.a_decision,
      b_decision: !!p.b_decision,
      mutual: !!p.mutual_match
    })
  }
  return { byKey, details }
}

function evalReciprocal(pairs, byKey) {
  const scores = pairs.map((p) => byKey.get(p.canonical_key))
  const labels = pairs.map((p) => (p.mutual_match ? 1 : 0))
  const bin = binaryMetrics(scores, labels)
  const rank = rankingMetrics(pairs, byKey, (p) => p.mutual_match)
  const states = fourState(pairs, byKey)
  // one-sided FP among high-confidence reciprocal scores
  let high = 0
  let highOneSided = 0
  for (const p of pairs) {
    const s = byKey.get(p.canonical_key)
    if (s < 0.7) continue
    high++
    const one = (p.a_decision && !p.b_decision) || (!p.a_decision && p.b_decision)
    if (one || !p.mutual_match) highOneSided++
  }
  return {
    ...bin,
    ranking: rank,
    four_state: states,
    high_conf_n: high,
    high_conf_one_sided_or_false_rate: high ? round(highOneSided / high) : null
  }
}

function abstentionAnalysis(pairs, byKey) {
  const scored = pairs
    .map((p) => ({ p, s: byKey.get(p.canonical_key) }))
    .sort((a, b) => b.s - a.s)
  const ops = {
    HIGH_PRECISION: 0.75,
    BALANCED: 0.5,
    HIGH_COVERAGE: 0.25
  }
  const out = { ALWAYS_TOP1: null, ABSTAIN: {} }
  // ALWAYS_TOP1: per query take top score
  const byQ = new Map()
  for (const { p, s } of scored) {
    const q = p.row_ab.iid
    if (!byQ.has(q) || byQ.get(q).s < s) byQ.set(q, { p, s })
  }
  let hit = 0
  let oneSided = 0
  for (const { p } of byQ.values()) {
    if (p.mutual_match) hit++
    if ((p.a_decision && !p.b_decision) || (!p.a_decision && p.b_decision)) oneSided++
  }
  out.ALWAYS_TOP1 = {
    coverage: 1,
    recommendation_rate: 1,
    mutual_hit_among_recommended: round(hit / Math.max(1, byQ.size)),
    one_sided_false_recommendation: round(oneSided / Math.max(1, byQ.size)),
    n_recommended: byQ.size
  }
  for (const [name, thr] of Object.entries(ops)) {
    const rec = scored.filter((x) => x.s >= thr)
    const nRec = rec.length
    const mutual = rec.filter((x) => x.p.mutual_match).length
    const ones = rec.filter(
      (x) =>
        (x.p.a_decision && !x.p.b_decision) || (!x.p.a_decision && x.p.b_decision)
    ).length
    const recovered = mutual
    const totalMutual = pairs.filter((p) => p.mutual_match).length
    out.ABSTAIN[name] = {
      threshold: thr,
      coverage: round(nRec / Math.max(1, pairs.length)),
      recommendation_rate: round(nRec / Math.max(1, pairs.length)),
      no_match_rate: round(1 - nRec / Math.max(1, pairs.length)),
      mutual_hit_among_recommended: nRec ? round(mutual / nRec) : null,
      one_sided_false_recommendation: nRec ? round(ones / nRec) : null,
      mutual_pairs_recovered: round(recovered / Math.max(1, totalMutual)),
      n_recommended: nRec
    }
  }
  return out
}

function bootstrapCI(pairs, byKey, metricFn, B = 200) {
  // group by wave
  const byWave = new Map()
  for (const p of pairs) {
    const w = String(p.row_ab.wave)
    if (!byWave.has(w)) byWave.set(w, [])
    byWave.get(w).push(p)
  }
  const waves = [...byWave.keys()]
  const samples = []
  for (let b = 0; b < B; b++) {
    const boot = []
    for (let i = 0; i < waves.length; i++) {
      const w = waves[Math.floor(Math.random() * waves.length)]
      boot.push(...byWave.get(w))
    }
    if (boot.length < 10) continue
    const m = metricFn(boot, byKey)
    if (m != null) samples.push(m)
  }
  samples.sort((a, b) => a - b)
  if (!samples.length) return { mean: null, lo: null, hi: null, n: 0 }
  const lo = samples[Math.floor(0.025 * (samples.length - 1))]
  const hi = samples[Math.floor(0.975 * (samples.length - 1))]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return { mean: round(mean), lo: round(lo), hi: round(hi), n: samples.length }
}

function fitDirectional(trainPairs, modelName) {
  if (modelName === 'Z_RANDOM' || modelName === 'RULE_SIMPLE') return null
  const X = []
  const y = []
  for (const p of trainPairs) {
    // use both directed subject rows as directional training examples
    for (const row of [p.row_ab, p.row_ba]) {
      const fv = buildNativeDirectionalFeatureView(row)
      const mi = buildNativeModelInput(fv)
      X.push(vectorFromModelInput(mi))
      y.push(!!row.a_decision)
    }
  }
  if (modelName === 'LR_DIRECTIONAL') return trainLogistic(X, y, { epochs: 100, l2: 0.02 })
  if (modelName === 'GBDT_DIRECTIONAL') return trainGBDT(X, y, { nTrees: 50, lr: 0.08 })
  throw new Error(modelName)
}

function main() {
  ensureDir(REVIEW)
  ensureDir(ARTIFACTS)
  const adapted = adaptBhargavaTabToNativeCsv()
  if (!adapted.ok) throw new Error(JSON.stringify(adapted))
  if (adapted.raw_tab_sha256 !== EXPECTED_SHA256) throw new Error('RAW_SHA_MISMATCH')

  const imported = importNativeSpeedDating(NATIVE_CSV(), {
    featuresAvailable: true,
    modelReady: true,
    requireFeatures: true
  })
  if (!imported.TRUE_RECIPROCAL_AVAILABLE) throw new Error('TRUE_RECIPROCAL_UNAVAILABLE')
  if (imported.valid_directed_rows !== 7674) throw new Error(`directed ${imported.valid_directed_rows}`)
  if (imported.true_canonical_pairs !== 3837) throw new Error(`pairs ${imported.true_canonical_pairs}`)
  if (imported.unique_participants !== 474) throw new Error(`users ${imported.unique_participants}`)
  if (imported.incomplete_pairs !== 0) throw new Error('missing reverse')

  const parts = partitionPairs(imported.completePairs)
  const splitIntegrity = assertSplitIntegrity(parts)
  if (!splitIntegrity.ok) {
    // Speed dating reuses people across waves historically — document, do not invent new splits
    console.warn('SPLIT_PARTICIPANT_OVERLAP_EXPECTED_ACROSS_WAVES', splitIntegrity.participant_overlap.length)
  }

  // Note: same person can appear in multiple waves in original experiment.
  // Pair/directed overlap across our wave partitions must still be zero.
  const pairDirOk = splitIntegrity.pair_overlap.length === 0 && splitIntegrity.directed_overlap.length === 0
  if (!pairDirOk) throw new Error('SPLIT_PAIR_OR_DIRECTED_OVERLAP')

  const train = parts.TRAIN
  const cal = parts.CALIBRATION
  const dev = parts.DEV
  const locked = parts.LOCKED_RETROSPECTIVE_TEST

  const dirModels = ['Z_RANDOM', 'RULE_SIMPLE', 'LR_DIRECTIONAL', 'GBDT_DIRECTIONAL']
  const aggs = [
    'RECIP_MIN',
    'RECIP_PRODUCT',
    'RECIP_GEOMEAN',
    'RECIP_HARMONIC',
    'RECIP_ASYMMETRY_PENALTY'
  ]

  const fitted = {}
  for (const m of dirModels) fitted[m] = fitDirectional(train, m)

  const devDirectional = {}
  for (const m of dirModels) {
    const scores = []
    const labels = []
    for (const p of dev) {
      for (const row of [p.row_ab, p.row_ba]) {
        const fv = buildNativeDirectionalFeatureView(row)
        const mi = buildNativeModelInput(fv)
        scores.push(scoreDirectional(m, fitted[m], mi))
        labels.push(row.a_decision ? 1 : 0)
      }
    }
    const byKeyDir = new Map()
    // ranking: for each subject, score candidates by directional model
    for (const p of dev) {
      const fv = buildNativeDirectionalFeatureView(p.row_ab)
      const mi = buildNativeModelInput(fv)
      byKeyDir.set(p.canonical_key, scoreDirectional(m, fitted[m], mi))
    }
    // Build per-query candidate lists using directed rows from DEV wave subjects
    const byQ = new Map()
    for (const p of dev) {
      const q = p.row_ab.iid
      if (!byQ.has(q)) byQ.set(q, [])
      byQ.get(q).push({
        score: scoreDirectional(m, fitted[m], buildNativeModelInput(buildNativeDirectionalFeatureView(p.row_ab))),
        relevant: !!p.row_ab.a_decision
      })
    }
    const p1 = []
    const p3 = []
    const n3 = []
    const mrr = []
    for (const cands of byQ.values()) {
      const a = expectedPrecisionAtK(cands, 1)
      if (a != null) p1.push(a)
      if (cands.length >= 3) {
        const b = expectedPrecisionAtK(cands, 3)
        if (b != null) p3.push(b)
        const c = expectedNdcgAt(cands, 3)
        if (c != null) n3.push(c)
      }
      const e = expectedMrr(cands)
      if (e != null) mrr.push(e)
    }
    const mean = (arr) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null)
    devDirectional[m] = {
      ...binaryMetrics(scores, labels),
      ranking: {
        P_at_1: round(mean(p1)),
        P_at_3: round(mean(p3)),
        NDCG_at_3: round(mean(n3)),
        MRR: round(mean(mrr))
      }
    }
  }

  const recipGrid = []
  for (const m of dirModels) {
    for (const agg of aggs) {
      // calibrate on CAL using this (m,agg)
      const calPred = predictPairScores(cal, m, fitted[m], agg, null)
      const calScores = cal.map((p) => calPred.byKey.get(p.canonical_key))
      const calLabels = cal.map((p) => !!p.mutual_match)
      const plat = fitPlatt(calScores, calLabels)
      const raw = predictPairScores(dev, m, fitted[m], agg, null)
      const calDev = predictPairScores(dev, m, fitted[m], agg, plat)
      const rawEval = evalReciprocal(dev, raw.byKey)
      const calEval = evalReciprocal(dev, calDev.byKey)
      const abstain = abstentionAnalysis(dev, calDev.byKey)
      recipGrid.push({
        directional_model: m,
        aggregator: agg,
        raw: rawEval,
        calibrated: calEval,
        calibrator: plat,
        abstention: abstain
      })
    }
  }

  // Select champion: prefer Pareto on AP, one-sided FP, P@1 — exclude Z_RANDOM from champion
  const candidates = recipGrid.filter((c) => c.directional_model !== 'Z_RANDOM')
  candidates.sort((a, b) => {
    const ap = (b.calibrated.AVERAGE_PRECISION || 0) - (a.calibrated.AVERAGE_PRECISION || 0)
    if (Math.abs(ap) > 0.005) return ap
    const fp =
      (a.calibrated.high_conf_one_sided_or_false_rate || 1) -
      (b.calibrated.high_conf_one_sided_or_false_rate || 1)
    if (Math.abs(fp) > 0.01) return fp
    return (b.calibrated.ranking.P_at_1 || 0) - (a.calibrated.ranking.P_at_1 || 0)
  })
  const ruleRef = recipGrid.find(
    (c) => c.directional_model === 'RULE_SIMPLE' && c.aggregator === 'RECIP_MIN'
  )
  const best = candidates[0]
  const ruleAp = ruleRef.calibrated.AVERAGE_PRECISION || 0
  const bestAp = best.calibrated.AVERAGE_PRECISION || 0
  const deltaAp = bestAp - ruleAp

  // bootstrap CI on DEV for champion and rule
  const champPred = predictPairScores(
    dev,
    best.directional_model,
    fitted[best.directional_model],
    best.aggregator,
    best.calibrator
  )
  const rulePred = predictPairScores(dev, 'RULE_SIMPLE', null, 'RECIP_MIN', ruleRef.calibrator)
  const bootApChamp = bootstrapCI(dev, champPred.byKey, (ps, bk) => {
    const s = ps.map((p) => bk.get(p.canonical_key))
    const y = ps.map((p) => (p.mutual_match ? 1 : 0))
    return averagePrecision(s, y)
  })
  const bootApRule = bootstrapCI(dev, rulePred.byKey, (ps, bk) => {
    const s = ps.map((p) => bk.get(p.canonical_key))
    const y = ps.map((p) => (p.mutual_match ? 1 : 0))
    return averagePrecision(s, y)
  })
  const bootDelta = {
    mean: round((bootApChamp.mean || 0) - (bootApRule.mean || 0)),
    // approximate: not paired bootstrap of delta; report separate CIs
    champ: bootApChamp,
    rule: bootApRule
  }

  let structuredStatus = 'NO_CLEAR_STRUCTURED_WINNER'
  const singleWaveDev = new Set(dev.map((p) => String(p.row_ab.wave))).size < 2
  // Single-wave DEV → wave bootstrap degenerate; do not claim CLEAR from DEV alone.
  if (deltaAp > 0.01) {
    structuredStatus = singleWaveDev
      ? 'STRUCTURED_SMALL_UNCERTAIN_IMPROVEMENT'
      : bootApChamp.lo != null && bootApRule.hi != null && bootApChamp.lo > bootApRule.hi && deltaAp > 0.03
        ? 'STRUCTURED_CLEAR_IMPROVEMENT'
        : 'STRUCTURED_SMALL_UNCERTAIN_IMPROVEMENT'
  } else if (deltaAp < -0.01) {
    structuredStatus = 'STRUCTURED_REGRESSION'
  }

  const featureSchema = { names: FEATURE_NAMES, version: 'v1.7-sparse-cc0' }
  const artifact = {
    directional_model: best.directional_model,
    aggregator: best.aggregator,
    model: fitted[best.directional_model],
    calibrator: best.calibrator,
    feature_schema: featureSchema
  }
  const artifactSha = sha256(artifact)
  const featureSchemaSha = sha256(featureSchema)

  const championLock = {
    status: 'LOCKED',
    track: 'A',
    model: `${best.directional_model}+${best.aggregator}+Platt`,
    model_family: best.directional_model,
    aggregator: best.aggregator,
    features: FEATURE_NAMES,
    training_waves: SPLIT_WAVES.TRAIN,
    calibration_wave: SPLIT_WAVES.CALIBRATION,
    selection_split: 'DEV',
    threshold_operating_points: best.abstention.ABSTAIN,
    calibrator: best.calibrator,
    artifact_sha256: artifactSha,
    feature_schema_sha256: featureSchemaSha,
    code_commit: null,
    structured_status: structuredStatus,
    dev_metrics: best.calibrated,
    vs_rule_delta_ap: round(deltaAp),
    bootstrap: bootDelta,
    holdout_label: 'LOCKED_RETROSPECTIVE_TEST',
    holdout_is_fresh_sealed: false,
    generated_at: new Date().toISOString()
  }
  fs.writeFileSync(path.join(REVIEW, 'CHAMPION_LOCK.json'), JSON.stringify(championLock, null, 2))

  // === ONLY NOW open wave 21 once ===
  const lockedChamp = predictPairScores(
    locked,
    best.directional_model,
    fitted[best.directional_model],
    best.aggregator,
    best.calibrator
  )
  const lockedRule = predictPairScores(locked, 'RULE_SIMPLE', null, 'RECIP_MIN', ruleRef.calibrator)
  const lockedRandom = predictPairScores(locked, 'Z_RANDOM', null, 'RECIP_MIN', null)
  const lockedEval = {
    label: 'LOCKED_RETROSPECTIVE_TEST',
    NOT_FRESH_SEALED: true,
    wave: '21',
    n_pairs: locked.length,
    champion: evalReciprocal(locked, lockedChamp.byKey),
    rule_simple: evalReciprocal(locked, lockedRule.byKey),
    z_random: evalReciprocal(locked, lockedRandom.byKey)
  }
  const lockedStatus =
    (lockedEval.champion.AVERAGE_PRECISION || 0) + 0.02 < (lockedEval.rule_simple.AVERAGE_PRECISION || 0)
      ? 'REGRESSION'
      : 'PASS'

  const metrics = {
    dataset_version: DATASET_VERSION,
    split_integrity: {
      ...splitIntegrity,
      note:
        'Participant reuse across waves is a property of the original experiment; pair/directed keys do not overlap across partitions.',
      pair_directed_ok: pairDirOk
    },
    track_a_directional_dev: devDirectional,
    track_a_reciprocal_dev: recipGrid.map((c) => ({
      directional_model: c.directional_model,
      aggregator: c.aggregator,
      calibrated: c.calibrated,
      abstention_balanced: c.abstention.ABSTAIN.BALANCED
    })),
    champion: championLock,
    locked_retrospective: lockedEval,
    locked_status: lockedStatus,
    structured_status: structuredStatus
  }
  fs.writeFileSync(path.join(REVIEW, 'METRICS.json'), JSON.stringify(metrics, null, 2))
  fs.writeFileSync(path.join(ARTIFACTS, 'champion_artifact.json'), JSON.stringify(artifact, null, 2))

  console.log(
    JSON.stringify(
      {
        structured_status: structuredStatus,
        champion: championLock.model,
        delta_ap: round(deltaAp),
        locked_status: lockedStatus,
        locked_ap: lockedEval.champion.AVERAGE_PRECISION,
        rule_locked_ap: lockedEval.rule_simple.AVERAGE_PRECISION
      },
      null,
      2
    )
  )
  return metrics
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

module.exports = { main, SPLIT_WAVES, FEATURE_NAMES, ruleSimpleScore }
