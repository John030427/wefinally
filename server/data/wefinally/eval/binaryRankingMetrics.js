'use strict'

/**
 * Tie-aware binary ranking metrics (v1.4 review-fix).
 * AVERAGE_PRECISION uses distinct-score thresholds (sklearn-compatible).
 * Mixed-tie permutations within a score group must not change AP.
 */

function round(n, d = 4) {
  const m = 10 ** d
  return Math.round(n * m) / m
}

function aurocTieAware(scores, labels) {
  const n = scores.length
  if (!n) return null
  const pairs = scores.map((s, i) => ({ s, y: labels[i] ? 1 : 0, i }))
  pairs.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.i - b.i))

  const P = pairs.reduce((a, p) => a + p.y, 0)
  const N = n - P
  if (!P || !N) return null

  const ranks = Array(n).fill(0)
  let pos = 0
  while (pos < n) {
    let end = pos
    while (end + 1 < n && pairs[end + 1].s === pairs[pos].s) end++
    const avgRank = (pos + end) / 2 + 1
    for (let k = pos; k <= end; k++) ranks[k] = avgRank
    pos = end + 1
  }

  const ascRank = ranks.map((r) => n + 1 - r)
  let sumAscPos = 0
  for (let i = 0; i < n; i++) {
    if (pairs[i].y) sumAscPos += ascRank[i]
  }
  return round((sumAscPos - (P * (P + 1)) / 2) / (P * N))
}

/**
 * Distinct-score groups in descending score order.
 * Within a group, only (n_pos, n_neg) matter — label order ignored.
 */
function distinctScoreGroups(scores, labels) {
  const n = scores.length
  const pairs = scores.map((s, i) => ({ s: Number(s), y: labels[i] ? 1 : 0 }))
  pairs.sort((a, b) => b.s - a.s)
  const groups = []
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && pairs[j + 1].s === pairs[i].s) j++
    let gPos = 0
    let gNeg = 0
    for (let k = i; k <= j; k++) {
      if (pairs[k].y) gPos++
      else gNeg++
    }
    groups.push({ score: pairs[i].s, gPos, gNeg })
    i = j + 1
  }
  return groups
}

/**
 * Average Precision via distinct thresholds (sklearn average_precision_score).
 * AP = Σ (R_t - R_{t-1}) * P_t over descending distinct score thresholds.
 * Constant scores ⇒ prevalence.
 */
function averagePrecision(scores, labels) {
  const n = scores.length
  if (!n) return null
  const P = labels.reduce((a, y) => a + (y ? 1 : 0), 0)
  if (!P) return null

  const groups = distinctScoreGroups(scores, labels)
  let tp = 0
  let fp = 0
  let recallPrev = 0
  let ap = 0
  for (const g of groups) {
    tp += g.gPos
    fp += g.gNeg
    const prec = tp / (tp + fp)
    const rec = tp / P
    ap += (rec - recallPrev) * prec
    recallPrev = rec
  }
  return round(ap)
}

/**
 * Trapezoidal PR-AUC on distinct-threshold PR points (tie-invariant).
 * Constant scores ⇒ prevalence (single meaningful level).
 */
function prAucTrapezoid(scores, labels) {
  const n = scores.length
  const P = labels.reduce((a, y) => a + (y ? 1 : 0), 0)
  const N = n - P
  if (!P || !N) return null

  const groups = distinctScoreGroups(scores, labels)
  if (groups.length === 1) return round(P / n)

  let tp = 0
  let fp = 0
  const pts = [{ x: 0, y: 1 }]
  for (const g of groups) {
    tp += g.gPos
    fp += g.gNeg
    pts.push({ x: tp / P, y: tp / (tp + fp) })
  }
  let area = 0
  for (let i = 1; i < pts.length; i++) {
    area += ((pts[i].x - pts[i - 1].x) * (pts[i].y + pts[i - 1].y)) / 2
  }
  return round(area)
}

function computeRankingCurves(scores, labels) {
  return {
    AUROC: aurocTieAware(scores, labels),
    AVERAGE_PRECISION: averagePrecision(scores, labels),
    PR_AUC_TRAPEZOID: prAucTrapezoid(scores, labels),
    AUPRC: averagePrecision(scores, labels)
  }
}

module.exports = {
  aurocTieAware,
  averagePrecision,
  prAucTrapezoid,
  computeRankingCurves,
  distinctScoreGroups,
  round
}
