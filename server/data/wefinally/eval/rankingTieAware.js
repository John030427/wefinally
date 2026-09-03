'use strict'

/**
 * Tie-aware ranking metrics (v1.5).
 * Equal-score groups contribute expected metrics under uniform random
 * within-group ordering — deterministic, not input-order dependent.
 */

function round(n, d = 4) {
  if (n == null || Number.isNaN(n)) return n
  const m = 10 ** d
  return Math.round(n * m) / m
}

/** Group candidates by score descending; within group order ignored. */
function scoreGroups(candidates) {
  const sorted = [...candidates].sort((a, b) => Number(b.score) - Number(a.score))
  const groups = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    const s = Number(sorted[i].score)
    while (j + 1 < sorted.length && Number(sorted[j + 1].score) === s) j++
    const items = sorted.slice(i, j + 1)
    const r = items.filter((c) => c.relevant).length
    groups.push({ score: s, g: items.length, r, items })
    i = j + 1
  }
  return groups
}

/**
 * Expected #relevant in top-k under random within-tie order.
 */
function expectedRelevantInTopK(groups, k) {
  let need = k
  let expRel = 0
  for (const grp of groups) {
    if (need <= 0) break
    if (grp.g <= need) {
      expRel += grp.r
      need -= grp.g
    } else {
      // take `need` of `grp.g` uniformly → E[relevants] = need * (r/g)
      expRel += need * (grp.r / grp.g)
      need = 0
    }
  }
  return expRel
}

function expectedPrecisionAtK(candidates, k) {
  if (!candidates || candidates.length < k) return null
  const groups = scoreGroups(candidates)
  return expectedRelevantInTopK(groups, k) / k
}

/**
 * Expected DCG@k for binary relevance (gain = rel).
 * Within a (partial) tie group, E[sum discount_i * rel_i] = (r/g)*sum discounts.
 */
function expectedDcgAt(groups, k) {
  let pos = 0 // 0-based
  let remaining = k
  let dcg = 0
  for (const grp of groups) {
    if (remaining <= 0) break
    const take = Math.min(grp.g, remaining)
    let discSum = 0
    for (let t = 0; t < take; t++) {
      discSum += 1 / Math.log2(pos + t + 2)
    }
    dcg += (grp.r / grp.g) * discSum
    pos += take
    remaining -= take
  }
  return dcg
}

function idealDcgAt(candidates, k) {
  const rels = candidates.map((c) => (c.relevant ? 1 : 0)).sort((a, b) => b - a)
  let s = 0
  for (let i = 0; i < Math.min(k, rels.length); i++) {
    s += rels[i] / Math.log2(i + 2)
  }
  return s
}

function expectedNdcgAt(candidates, k) {
  if (!candidates || candidates.length < k) return null
  const idcg = idealDcgAt(candidates, k)
  if (!idcg) return 0
  const groups = scoreGroups(candidates)
  return expectedDcgAt(groups, k) / idcg
}

/**
 * Expected MRR: E[1/rank of first relevant] under random within-tie order.
 */
function expectedMrr(candidates) {
  if (!candidates || candidates.length < 2) return null
  const groups = scoreGroups(candidates)
  const totalRel = groups.reduce((a, g) => a + g.r, 0)
  if (!totalRel) return 0

  let pos = 1 // 1-based absolute position
  let exp = 0
  for (const grp of groups) {
    if (grp.r === 0) {
      pos += grp.g
      continue
    }
    // Prob first relevant within group is at relative offset j (0..g-1)
    // = P(first j are non-rel) * P(j is rel | ...)
    const g = grp.g
    const r = grp.r
    const nNeg = g - r
    for (let j = 0; j < g; j++) {
      if (j > nNeg) break
      let p = 1
      for (let t = 0; t < j; t++) {
        p *= (nNeg - t) / (g - t)
      }
      p *= r / (g - j)
      exp += p * (1 / (pos + j))
    }
    // With probability 1 we eventually hit a relevant in this group (r>0),
    // so we stop — no later groups contribute.
    return exp
  }
  return exp
}

function rankingMetricsTieAware(queries) {
  const sizes = queries.map((q) => q.n_candidates).sort((a, b) => a - b)
  const pct = (p) =>
    sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor((sizes.length - 1) * p))] : 0
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

  const stats = {
    n_queries: sizes.length,
    min: sizes[0] || 0,
    median: pct(0.5),
    mean: sizes.length ? round(sizes.reduce((s, x) => s + x, 0) / sizes.length) : 0,
    p90: pct(0.9),
    max: sizes[sizes.length - 1] || 0,
    with_ge2: queries.filter((q) => q.n_candidates >= 2).length,
    with_ge3: queries.filter((q) => q.n_candidates >= 3).length,
    with_ge5: queries.filter((q) => q.n_candidates >= 5).length,
    with_ge10: queries.filter((q) => q.n_candidates >= 10).length
  }

  const usable1 = queries.filter((q) => q.n_candidates >= 2)
  const usable3 = queries.filter((q) => q.n_candidates >= 3)
  const usable5 = queries.filter((q) => q.n_candidates >= 5)

  const p1 = usable1.map((q) => expectedPrecisionAtK(q.candidates, 1)).filter((v) => v != null)
  const p3 = usable3.map((q) => expectedPrecisionAtK(q.candidates, 3)).filter((v) => v != null)
  const n1 = usable1.map((q) => expectedNdcgAt(q.candidates, 1)).filter((v) => v != null)
  const n3 = usable3.map((q) => expectedNdcgAt(q.candidates, 3)).filter((v) => v != null)
  const n5 = usable5.map((q) => expectedNdcgAt(q.candidates, 5)).filter((v) => v != null)
  const mrrs = usable1.map((q) => expectedMrr(q.candidates)).filter((v) => v != null)

  const degenerate = !stats.with_ge2
  return {
    query_stats: stats,
    precision_at_1: degenerate || !p1.length ? 'NOT_APPLICABLE' : round(mean(p1)),
    precision_at_3: !p3.length ? 'NOT_APPLICABLE' : round(mean(p3)),
    ndcg_at_1: degenerate || !n1.length ? 'NOT_APPLICABLE' : round(mean(n1)),
    ndcg_at_3: !n3.length ? 'NOT_APPLICABLE' : round(mean(n3)),
    ndcg_at_5: !n5.length ? 'NOT_APPLICABLE' : round(mean(n5)),
    MRR: degenerate || !mrrs.length ? 'NOT_APPLICABLE' : round(mean(mrrs)),
    RNDCG: degenerate
      ? 'NOT_APPLICABLE'
      : n3.length || n1.length
        ? round(((n3.length ? mean(n3) : 0) + (n1.length ? mean(n1) : 0)) / (n3.length && n1.length ? 2 : 1))
        : 'NOT_APPLICABLE',
    ranking_note: degenerate
      ? 'All ranking queries have candidate-set size < 2; Precision@K/NDCG NOT_APPLICABLE'
      : 'Tie-aware: expected metrics under uniform random within equal-score groups',
    tie_aware: true
  }
}

module.exports = {
  scoreGroups,
  expectedPrecisionAtK,
  expectedNdcgAt,
  expectedMrr,
  expectedRelevantInTopK,
  rankingMetricsTieAware,
  round
}
