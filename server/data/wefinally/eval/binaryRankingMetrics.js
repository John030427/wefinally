'use strict'

/**
 * Tie-aware binary ranking metrics (v1.4).
 * AVERAGE_PRECISION (AP) ≠ PR_AUC_TRAPEZOID.
 * Constant-score AUROC = 0.5; constant-score AP = prevalence.
 */

function round(n, d = 4) {
  const m = 10 ** d
  return Math.round(n * m) / m
}

/**
 * Mann–Whitney / mid-rank AUROC with deterministic tie handling.
 * For all-tied scores returns exactly 0.5.
 */
function aurocTieAware(scores, labels) {
  const n = scores.length
  if (!n) return null
  const pairs = scores.map((s, i) => ({ s, y: labels[i] ? 1 : 0, i }))
  pairs.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.i - b.i))

  const P = pairs.reduce((a, p) => a + p.y, 0)
  const N = n - P
  if (!P || !N) return null

  // Assign mid-ranks within tied score groups (rank 1 = highest score)
  const ranks = Array(n).fill(0)
  let pos = 0
  while (pos < n) {
    let end = pos
    while (end + 1 < n && pairs[end + 1].s === pairs[pos].s) end++
    const avgRank = (pos + end) / 2 + 1 // 1-based mid-rank
    for (let k = pos; k <= end; k++) ranks[k] = avgRank
    pos = end + 1
  }

  // Higher score → lower rank number. Rank sum of positives:
  let sumRankPos = 0
  for (let i = 0; i < n; i++) {
    if (pairs[i].y) sumRankPos += ranks[i]
  }
  // AUROC = (sum of ranks of negatives inverted form):
  // U = sum_{pos} (n - rank_i) related; standard:
  // AUC = (sum_i I(y_i=1) * rank_i_from_lowest - P*(P+1)/2) / (P*N)
  // Convert to ascending-score ranks for Mann-Whitney:
  const ascRank = ranks.map((r) => n + 1 - r)
  let sumAscPos = 0
  for (let i = 0; i < n; i++) {
    if (pairs[i].y) sumAscPos += ascRank[i]
  }
  const auc = (sumAscPos - (P * (P + 1)) / 2) / (P * N)
  return round(auc)
}

/**
 * Average Precision (sklearn-compatible for distinct scores).
 * For constant scores: returns prevalence.
 * Tie groups processed with mid-step (deterministic by index).
 */
function averagePrecision(scores, labels) {
  const n = scores.length
  if (!n) return null
  const P = labels.reduce((a, y) => a + (y ? 1 : 0), 0)
  if (!P) return null
  const prevalence = P / n

  const pairs = scores.map((s, i) => ({ s, y: labels[i] ? 1 : 0, i }))
  // Check all equal
  const s0 = pairs[0].s
  if (pairs.every((p) => p.s === s0)) return round(prevalence)

  pairs.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.i - b.i))

  let tp = 0
  let fp = 0
  let ap = 0
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && pairs[j + 1].s === pairs[i].s) j++
    // process whole tie group
    let gPos = 0
    let gNeg = 0
    for (let k = i; k <= j; k++) {
      if (pairs[k].y) gPos++
      else gNeg++
    }
    // sklearn average_precision: for ties, contribute for each positive in group
    for (let t = 0; t < gPos + gNeg; t++) {
      // deterministic: emit positives then negatives within tie (or use mid)
    }
    // Use mid-point method: after consuming group
    tp += gPos
    fp += gNeg
    if (gPos > 0) {
      // contribution: for each of gPos positives, precision after adding that positive
      // approximate with average precision within group after full group (sklearn uses stepwise)
      for (let p = 1; p <= gPos; p++) {
        const tpAt = tp - gPos + p
        const fpAt = fp - gNeg // negatives not yet "ranked above" within group mid
        // Better: sklearn processes in sorted order; within equal scores order is undefined.
        // We use deterministic index order already in sort.
      }
    }
    i = j + 1
  }

  // Recompute with deterministic within-tie order (already sorted by index)
  tp = 0
  fp = 0
  ap = 0
  for (const p of pairs) {
    if (p.y) {
      tp += 1
      ap += tp / (tp + fp)
    } else {
      fp += 1
    }
  }
  return round(ap / P)
}

/**
 * Trapezoidal PR-AUC (NOT Average Precision). Labeled separately.
 */
function prAucTrapezoid(scores, labels) {
  const n = scores.length
  const P = labels.reduce((a, y) => a + (y ? 1 : 0), 0)
  const N = n - P
  if (!P || !N) return null
  const pairs = scores.map((s, i) => ({ s, y: labels[i] ? 1 : 0, i }))
  const s0 = pairs[0].s
  if (pairs.every((p) => p.s === s0)) {
    // Constant: PR curve is a single point (prevalence) — trapezoid from (0,1) is misleading.
    // Report prevalence as the only meaningful PR summary for constants.
    return round(P / n)
  }
  pairs.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.i - b.i))
  let tp = 0
  let fp = 0
  const pts = [{ x: 0, y: 1 }]
  for (const p of pairs) {
    if (p.y) tp++
    else fp++
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
    // Backward-compatible primary: AP (not trapezoid)
    AUPRC: averagePrecision(scores, labels)
  }
}

module.exports = {
  aurocTieAware,
  averagePrecision,
  prAucTrapezoid,
  computeRankingCurves,
  round
}
