'use strict'

const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir } = require('../paths')
const { readJsonl } = require('../builders/cases')

function round(n) {
  return Math.round(n * 10000) / 10000
}

function loadPredictions(file) {
  return readJsonl(file)
}

function confusion(joined) {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const r of joined) {
    const pred = !!r.predict_mutual
    const truth = !!r.mutual_match
    if (pred && truth) tp += 1
    else if (pred && !truth) fp += 1
    else if (!pred && !truth) tn += 1
    else fn += 1
  }
  return { tp, fp, tn, fn }
}

function binaryMetrics(cm, n) {
  const { tp, fp, tn, fn } = cm
  const precision = tp + fp ? tp / (tp + fp) : 0
  const recall = tp + fn ? tp / (tp + fn) : 0
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
  const accuracy = n ? (tp + tn) / n : 0
  const tpr = recall
  const tnr = tn + fp ? tn / (tn + fp) : 0
  const balanced_accuracy = (tpr + tnr) / 2
  const denom = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
  const mcc = denom ? (tp * tn - fp * fn) / denom : 0
  const prevalence = n ? (tp + fn) / n : 0
  return {
    CRecall: round(recall),
    CPrecision: round(precision),
    SRecall: round(recall),
    SPrecision: round(precision),
    F1: round(f1),
    accuracy: round(accuracy),
    balanced_accuracy: round(balanced_accuracy),
    MCC: round(mcc),
    prevalence: round(prevalence),
    TRUE_POSITIVE_PAIRS: tp,
    FALSE_POSITIVE_PAIRS: fp,
    FALSE_NEGATIVE_PAIRS: fn,
    TRUE_NEGATIVE_PAIRS: tn,
    bilateral_accuracy: round(accuracy)
  }
}

function trapezoidAuc(points) {
  // points: [{x,y}] sorted by x ascending
  let area = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    area += (dx * (points[i].y + points[i - 1].y)) / 2
  }
  return area
}

function rankingCurves(joined) {
  const scored = joined
    .filter((r) => typeof r.score === 'number')
    .slice()
    .sort((a, b) => b.score - a.score)
  if (!scored.length) {
    return { AUPRC: null, AUROC: null, note: 'NO_SCORES' }
  }
  const P = scored.filter((r) => r.mutual_match).length
  const N = scored.length - P
  if (!P || !N) {
    return { AUPRC: null, AUROC: null, note: 'DEGENERATE_LABELS' }
  }
  let tp = 0
  let fp = 0
  const pr = [{ x: 0, y: 1 }]
  const roc = [{ x: 0, y: 0 }]
  for (const r of scored) {
    if (r.mutual_match) tp += 1
    else fp += 1
    const precision = tp / (tp + fp)
    const recall = tp / P
    pr.push({ x: recall, y: precision })
    roc.push({ x: fp / N, y: tp / P })
  }
  return { AUPRC: round(trapezoidAuc(pr)), AUROC: round(trapezoidAuc(roc)), note: null }
}

function calibration(joined, buckets = 10) {
  const scored = joined.filter((r) => typeof r.score === 'number')
  if (!scored.length) return { buckets: [], Brier: null, ECE: null }
  let brier = 0
  const bins = Array.from({ length: buckets }, () => ({ n: 0, sumScore: 0, sumY: 0 }))
  for (const r of scored) {
    const y = r.mutual_match ? 1 : 0
    const s = Math.max(0, Math.min(1, r.score))
    brier += (s - y) ** 2
    const idx = Math.min(buckets - 1, Math.floor(s * buckets))
    bins[idx].n += 1
    bins[idx].sumScore += s
    bins[idx].sumY += y
  }
  let ece = 0
  const outBuckets = bins.map((b, i) => {
    const conf = b.n ? b.sumScore / b.n : 0
    const acc = b.n ? b.sumY / b.n : 0
    if (b.n) ece += (b.n / scored.length) * Math.abs(acc - conf)
    return {
      bucket: i,
      n: b.n,
      mean_score: round(conf),
      empirical_rate: round(acc)
    }
  })
  return { buckets: outBuckets, Brier: round(brier / scored.length), ECE: round(ece) }
}

function bootstrapCI(joined, keyFn, rounds = 200, seed = 7) {
  // cluster by wave when available
  const clusters = new Map()
  for (const r of joined) {
    const k = r.wave != null ? String(r.wave) : r.case_id
    if (!clusters.has(k)) clusters.set(k, [])
    clusters.get(k).push(r)
  }
  const keys = [...clusters.keys()]
  let a = seed >>> 0
  const rand = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const samples = []
  for (let i = 0; i < rounds; i++) {
    const bag = []
    for (let j = 0; j < keys.length; j++) {
      const k = keys[Math.floor(rand() * keys.length)]
      bag.push(...clusters.get(k))
    }
    samples.push(keyFn(bag))
  }
  samples.sort((x, y) => x - y)
  const lo = samples[Math.floor(0.025 * samples.length)]
  const hi = samples[Math.min(samples.length - 1, Math.floor(0.975 * samples.length))]
  return { lo: round(lo), hi: round(hi), method: 'bootstrap_wave_cluster', rounds }
}

function buildRankingQueries(cases, goldById, predById, opts = {}) {
  // Directed ranking: query = subject iid + wave; candidates = partners actually met.
  const mode = opts.mode || 'mutual' // 'mutual' | 'directional'
  const index = new Map()
  for (const c of cases) {
    const wave = c.wave != null ? String(c.wave) : String(c.person_a?.wave || '')
    const iid = c.iid || c.person_a?.id
    if (!iid) continue
    const qk = `${iid}::${wave}`
    if (!index.has(qk)) index.set(qk, [])
    index.get(qk).push(c.case_id)
  }
  const queries = []
  for (const [qk, caseIds] of index) {
    const uniq = [...new Set(caseIds)]
    const candidates = uniq.map((id) => {
      const g = goldById.get(id)
      const p = predById.get(id)
      let relevant = false
      if (mode === 'directional') relevant = !!(g && g.a_decision)
      else relevant = !!(g && g.mutual_match)
      return {
        case_id: id,
        relevant,
        score: p && typeof p.score === 'number' ? p.score : p && p.predict_mutual ? 1 : 0
      }
    })
    candidates.sort((a, b) => b.score - a.score)
    queries.push({ query_key: qk, n_candidates: candidates.length, candidates })
  }
  return queries
}

function queryStats(queries) {
  const sizes = queries.map((q) => q.n_candidates).sort((a, b) => a - b)
  if (!sizes.length) {
    return { n_queries: 0 }
  }
  const pct = (p) => sizes[Math.min(sizes.length - 1, Math.floor((sizes.length - 1) * p))]
  const mean = sizes.reduce((s, x) => s + x, 0) / sizes.length
  return {
    n_queries: sizes.length,
    min: sizes[0],
    median: pct(0.5),
    mean: round(mean),
    p90: pct(0.9),
    max: sizes[sizes.length - 1],
    with_ge2: sizes.filter((x) => x >= 2).length,
    with_ge3: sizes.filter((x) => x >= 3).length,
    with_ge5: sizes.filter((x) => x >= 5).length
  }
}

function dcgAt(rels, k) {
  let s = 0
  for (let i = 0; i < Math.min(k, rels.length); i++) {
    s += (Math.pow(2, rels[i]) - 1) / Math.log2(i + 2)
  }
  return s
}

function rankingMetrics(queries) {
  const stats = queryStats(queries)
  const usable1 = queries.filter((q) => q.n_candidates >= 2)
  const usable3 = queries.filter((q) => q.n_candidates >= 3)
  const usable5 = queries.filter((q) => q.n_candidates >= 5)

  const pAt = (q, k) => {
    if (q.n_candidates < k) return null
    const top = q.candidates.slice(0, k)
    return top.filter((c) => c.relevant).length / k
  }
  const ndcgAt = (q, k) => {
    if (q.n_candidates < k) return null
    const rels = q.candidates.slice(0, k).map((c) => (c.relevant ? 1 : 0))
    const ideal = [...q.candidates]
      .map((c) => (c.relevant ? 1 : 0))
      .sort((a, b) => b - a)
      .slice(0, k)
    const idcg = dcgAt(ideal, k)
    if (!idcg) return 0
    return dcgAt(rels, k) / idcg
  }
  const mrrOf = (q) => {
    if (q.n_candidates < 2) return null
    const idx = q.candidates.findIndex((c) => c.relevant)
    return idx < 0 ? 0 : 1 / (idx + 1)
  }

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  const p1vals = usable1.map((q) => pAt(q, 1)).filter((v) => v != null)
  const p3vals = usable3.map((q) => pAt(q, 3)).filter((v) => v != null)
  const n1 = usable1.map((q) => ndcgAt(q, 1)).filter((v) => v != null)
  const n3 = usable3.map((q) => ndcgAt(q, 3)).filter((v) => v != null)
  const n5 = usable5.map((q) => ndcgAt(q, 5)).filter((v) => v != null)
  const mrrs = usable1.map(mrrOf).filter((v) => v != null)

  const degenerate = !stats.with_ge2

  return {
    query_stats: {
      ...stats,
      with_ge10: queries.filter((q) => q.n_candidates >= 10).length
    },
    precision_at_1: degenerate || !p1vals.length ? 'NOT_APPLICABLE' : round(mean(p1vals)),
    precision_at_3: !p3vals.length ? 'NOT_APPLICABLE' : round(mean(p3vals)),
    ndcg_at_1: degenerate || !n1.length ? 'NOT_APPLICABLE' : round(mean(n1)),
    ndcg_at_3: !n3.length ? 'NOT_APPLICABLE' : round(mean(n3)),
    ndcg_at_5: !n5.length ? 'NOT_APPLICABLE' : round(mean(n5)),
    MRR: degenerate || !mrrs.length ? 'NOT_APPLICABLE' : round(mean(mrrs)),
    RNDCG: degenerate
      ? 'NOT_APPLICABLE'
      : n3.length || n1.length
        ? round(
            ((n3.length ? mean(n3) : 0) + (n1.length ? mean(n1) : 0)) / (n3.length && n1.length ? 2 : 1)
          )
        : 'NOT_APPLICABLE',
    ranking_note: degenerate
      ? 'All ranking queries have candidate-set size < 2; Precision@K/NDCG NOT_APPLICABLE'
      : null
  }
}

function mineFailures(joined, casesById) {
  const failed_cases = []
  for (const r of joined) {
    const pred = !!r.predict_mutual
    const truth = !!r.mutual_match
    const oneSided = !!r.one_sided
    if (pred && !truth) {
      failed_cases.push({
        case_id: r.case_id,
        failure_type: oneSided ? 'ONE_SIDED_FALSE_POSITIVE' : 'FALSE_POSITIVE_MUTUAL',
        score: r.score,
        predict_mutual: pred,
        mutual_match: truth
      })
      if (typeof r.score === 'number' && r.score >= 0.75) {
        failed_cases.push({
          case_id: r.case_id,
          failure_type: 'HIGH_SCORE_FALSE_POSITIVE',
          score: r.score
        })
      }
    }
    if (!pred && truth) {
      failed_cases.push({
        case_id: r.case_id,
        failure_type: 'FALSE_NEGATIVE_MUTUAL',
        score: r.score,
        predict_mutual: pred,
        mutual_match: truth
      })
      if (typeof r.score === 'number' && r.score <= 0.35) {
        failed_cases.push({
          case_id: r.case_id,
          failure_type: 'LOW_SCORE_TRUE_POSITIVE',
          score: r.score
        })
      }
    }
  }
  return failed_cases
}

function scoreModel({ cases, goldViews, predictionRows, model }) {
  const goldById = new Map(goldViews.map((g) => [g.case_id, g]))
  const predById = new Map(predictionRows.map((p) => [p.case_id, p]))
  const joined = []
  for (const c of cases) {
    const g = goldById.get(c.case_id)
    const p = predById.get(c.case_id)
    if (!g || !p) continue
    joined.push({
      case_id: c.case_id,
      wave: c.wave != null ? c.wave : c.person_a?.wave,
      predict_mutual: !!p.predict_mutual,
      score: p.score,
      mutual_match: !!g.mutual_match,
      one_sided: !!g.one_sided,
      a_decision: !!g.a_decision,
      b_decision: !!g.b_decision
    })
  }
  const cm = confusion(joined)
  const metrics = {
    ...binaryMetrics(cm, joined.length),
    ...rankingCurves(joined),
    calibration: calibration(joined),
    one_sided_false_positive_rate: round(
      joined.filter((r) => r.predict_mutual && r.one_sided).length / (joined.length || 1)
    ),
    hard_gate_violation_rate: 0
  }
  const queries = buildRankingQueries(cases, goldById, predById, { mode: 'mutual' })
  const dirQueries = buildRankingQueries(cases, goldById, predById, { mode: 'directional' })
  const rank = rankingMetrics(queries)
  const dirRank = rankingMetrics(dirQueries)
  metrics.precision_at_1 = rank.precision_at_1
  metrics.precision_at_3 = rank.precision_at_3
  metrics.ndcg = rank.ndcg_at_3
  metrics.ndcg_at_1 = rank.ndcg_at_1
  metrics.ndcg_at_3 = rank.ndcg_at_3
  metrics.ndcg_at_5 = rank.ndcg_at_5
  metrics.MRR = rank.MRR
  metrics.RNDCG = rank.RNDCG
  metrics.query_stats = rank.query_stats
  metrics.ranking_note = rank.ranking_note
  metrics.directional_ranking = {
    precision_at_1: dirRank.precision_at_1,
    precision_at_3: dirRank.precision_at_3,
    ndcg_at_1: dirRank.ndcg_at_1,
    ndcg_at_3: dirRank.ndcg_at_3,
    ndcg_at_5: dirRank.ndcg_at_5,
    MRR: dirRank.MRR
  }

  metrics.F1_ci95 = bootstrapCI(joined, (bag) => {
    const c = confusion(bag)
    const prec = c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0
    const rec = c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0
    return prec + rec ? (2 * prec * rec) / (prec + rec) : 0
  })

  const failed_cases = mineFailures(joined, null)
  const byType = {}
  for (const f of failed_cases) byType[f.failure_type] = (byType[f.failure_type] || 0) + 1

  return {
    model,
    n: joined.length,
    metrics,
    failed_cases_count: failed_cases.length,
    failure_types: byType,
    failed_cases: failed_cases.slice(0, 50),
    path: predictionRows[0]?.path || null,
    status: predictionRows[0]?.status || null
  }
}

function writeFailureArtifacts(runId, model, failed_cases) {
  ensureDir(PATHS.failures)
  const file = path.join(PATHS.failures, `${runId}-${model}-failed_cases.jsonl`)
  fs.writeFileSync(
    file,
    failed_cases.map((f) => JSON.stringify(f)).join('\n') + (failed_cases.length ? '\n' : '')
  )
  return file
}

module.exports = {
  scoreModel,
  loadPredictions,
  confusion,
  binaryMetrics,
  buildRankingQueries,
  rankingMetrics,
  queryStats,
  mineFailures,
  writeFailureArtifacts,
  bootstrapCI,
  calibration
}
