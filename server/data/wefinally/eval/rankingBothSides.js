'use strict'

/**
 * Bilateral ranking query construction (v1.8).
 * Reciprocal score S(A,B) enters BOTH query A and query B.
 * Directional p_ab / p_ba enter their true subject queries.
 */

const {
  expectedPrecisionAtK,
  expectedNdcgAt,
  expectedMrr
} = require('./rankingTieAware')

function round(n, d = 4) {
  if (n == null || Number.isNaN(n)) return null
  const m = 10 ** d
  return Math.round(n * m) / m
}

function mean(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function summarizeQueries(byQ) {
  const p1 = []
  const p3 = []
  const n3 = []
  const n5 = []
  const mrr = []
  for (const cands of byQ.values()) {
    if (!cands.length) continue
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
  return {
    n_queries: byQ.size,
    P_at_1: round(mean(p1)),
    P_at_3: round(mean(p3)),
    NDCG_at_3: round(mean(n3)),
    NDCG_at_5: round(mean(n5)),
    MRR: round(mean(mrr))
  }
}

/**
 * Reciprocal both-sides ranking.
 * scoreByKey: canonical_key -> reciprocal score
 */
function reciprocalRankingBothSides(pairs, scoreByKey) {
  const byQ = new Map()
  const push = (qid, cand, score, relevant) => {
    if (!byQ.has(qid)) byQ.set(qid, [])
    byQ.get(qid).push({ candidate: cand, score, relevant: !!relevant })
  }
  for (const p of pairs) {
    const a = String(p.row_ab.iid)
    const b = String(p.row_ab.pid)
    const s = scoreByKey.get(p.canonical_key)
    const rel = !!p.mutual_match
    push(a, b, s, rel)
    push(b, a, s, rel)
  }
  return summarizeQueries(byQ)
}

/**
 * Directional both-sides ranking from true subject rows.
 * For each pair, score A→B under query A and B→A under query B.
 * getDirectionalScores(pair) -> { p_ab, p_ba }
 */
function directionalRankingBothSides(pairs, getDirectionalScores) {
  const byQ = new Map()
  const push = (qid, cand, score, relevant) => {
    if (!byQ.has(qid)) byQ.set(qid, [])
    byQ.get(qid).push({ candidate: cand, score, relevant: !!relevant })
  }
  for (const p of pairs) {
    const a = String(p.row_ab.iid)
    const b = String(p.row_ab.pid)
    const { p_ab, p_ba } = getDirectionalScores(p)
    push(a, b, p_ab, !!p.row_ab.a_decision)
    push(b, a, p_ba, !!p.row_ba.a_decision)
  }
  return summarizeQueries(byQ)
}

/** One-sided (legacy buggy) reciprocal ranking — for correction delta docs only. */
function reciprocalRankingOneSidedLegacy(pairs, scoreByKey) {
  const byQ = new Map()
  for (const p of pairs) {
    const q = String(p.row_ab.iid)
    if (!byQ.has(q)) byQ.set(q, [])
    byQ.get(q).push({
      score: scoreByKey.get(p.canonical_key),
      relevant: !!p.mutual_match
    })
  }
  return summarizeQueries(byQ)
}

function uniqueParticipantsWithCandidates(pairs) {
  const s = new Set()
  for (const p of pairs) {
    s.add(String(p.row_ab.iid))
    s.add(String(p.row_ab.pid))
  }
  return s.size
}

/**
 * Flip canonical orientation row_ab ↔ row_ba for invariance test.
 */
function flipPairOrientation(pairs) {
  return pairs.map((p) => ({
    ...p,
    row_ab: p.row_ba,
    row_ba: p.row_ab,
    a_decision: p.b_decision,
    b_decision: p.a_decision,
    mutual_match: p.mutual_match,
    canonical_key: p.canonical_key
  }))
}

module.exports = {
  reciprocalRankingBothSides,
  directionalRankingBothSides,
  reciprocalRankingOneSidedLegacy,
  uniqueParticipantsWithCandidates,
  flipPairOrientation,
  summarizeQueries
}
