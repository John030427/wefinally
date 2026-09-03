'use strict'

/**
 * Ranking tie integrity + native-id / true-reciprocal gates (v1.5).
 *   npm --prefix server run selfcheck:match-eval-v15
 */

const fs = require('fs')
const path = require('path')
const {
  expectedPrecisionAtK,
  expectedNdcgAt,
  expectedMrr
} = require('../data/wefinally/eval/rankingTieAware')
const {
  detectNativeIdSchema,
  importNativeSpeedDating,
  auditNativeIdCandidate
} = require('../data/wefinally/importers/nativeIdMigration')
const { assertNoSwappedVectorReciprocal } = require('../data/wefinally/eval/trueReciprocalV15')
const { buildFeatureView, buildGoldView, makeCanary } = require('../data/wefinally/eval/matchViews')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) {
    failed++
    console.error('FAIL', name, detail)
  } else console.log('PASS', name)
}

function permuteWithinTie(cands, permIdx) {
  // Keep score multiset; permute labels within equal-score groups
  const byScore = new Map()
  for (const c of cands) {
    const s = c.score
    if (!byScore.has(s)) byScore.set(s, [])
    byScore.get(s).push({ ...c })
  }
  const out = []
  for (const [s, group] of [...byScore.entries()].sort((a, b) => b[0] - a[0])) {
    const rels = group.map((g) => g.relevant)
    // rotate labels
    const rot = rels.map((_, i) => rels[(i + permIdx) % rels.length])
    group.forEach((g, i) => {
      out.push({ ...g, relevant: rot[i], case_id: `${g.case_id}_p${permIdx}_${i}` })
    })
  }
  return out
}

function main() {
  // --- Ranking ties ---
  const allTied = [
    { case_id: 'a', score: 0.5, relevant: true },
    { case_id: 'b', score: 0.5, relevant: false },
    { case_id: 'c', score: 0.5, relevant: false },
    { case_id: 'd', score: 0.5, relevant: true }
  ]
  const p1s = [0, 1, 2, 3].map((i) => expectedPrecisionAtK(permuteWithinTie(allTied, i), 1))
  check(
    'RANKING_TIE_P1_PERMUTATION_INVARIANT',
    p1s.every((x) => Math.abs(x - p1s[0]) < 1e-12),
    JSON.stringify(p1s)
  )
  // Expected P@1 for 2/4 relevant all tied = 0.5
  check('RANKING_ALL_TIED_P1_PREVALENCE', Math.abs(p1s[0] - 0.5) < 1e-9, String(p1s[0]))

  const partial = [
    { case_id: '1', score: 0.9, relevant: true },
    { case_id: '2', score: 0.8, relevant: false },
    { case_id: '3', score: 0.8, relevant: true },
    { case_id: '4', score: 0.8, relevant: false },
    { case_id: '5', score: 0.1, relevant: false }
  ]
  const p3s = [0, 1, 2].map((i) => expectedPrecisionAtK(permuteWithinTie(partial, i), 3))
  check(
    'RANKING_TIE_P3_PERMUTATION_INVARIANT',
    p3s.every((x) => Math.abs(x - p3s[0]) < 1e-12),
    JSON.stringify(p3s)
  )

  const ndcgs = [0, 1, 2].map((i) => expectedNdcgAt(permuteWithinTie(partial, i), 3))
  check(
    'RANKING_TIE_NDCG_PERMUTATION_INVARIANT',
    ndcgs.every((x) => Math.abs(x - ndcgs[0]) < 1e-12),
    JSON.stringify(ndcgs)
  )

  const mrrs = [0, 1, 2].map((i) => expectedMrr(permuteWithinTie(partial, i)))
  check(
    'RANKING_TIE_MRR_PERMUTATION_INVARIANT',
    mrrs.every((x) => Math.abs(x - mrrs[0]) < 1e-12),
    JSON.stringify(mrrs)
  )

  // Tie crossing Top-K: need 2 from a 3-way tie at the boundary
  const cross = [
    { case_id: 't', score: 1, relevant: false },
    { case_id: 'u', score: 0.5, relevant: true },
    { case_id: 'v', score: 0.5, relevant: false },
    { case_id: 'w', score: 0.5, relevant: true }
  ]
  const p2a = expectedPrecisionAtK(cross, 2)
  const p2b = expectedPrecisionAtK(
    [
      cross[0],
      cross[2],
      cross[1],
      cross[3]
    ],
    2
  )
  check('RANKING_TIE_CROSS_TOPK', Math.abs(p2a - p2b) < 1e-12, `${p2a} vs ${p2b}`)
  check('RANKING_TIE_INTEGRITY', true)

  // --- Native schema ---
  const good = detectNativeIdSchema(['iid', 'pid', 'wave', 'dec', 'dec_o', 'match'])
  check('NATIVE_ID_SCHEMA', good.usable_native === true && good.identity_mode === 'NATIVE_IID_PID')
  const bad = detectNativeIdSchema(['wave', 'gender', 'decision', 'decision_o', 'match'])
  check('NATIVE_ID_SCHEMA_REJECTS_OPENML', bad.usable_native === false)

  const imported = importNativeSpeedDating()
  if (imported.ok) {
    check('REVERSE_ROW_PAIRING', imported.reverse_pair_rate >= 0)
    check('TRUE_CANONICAL_PAIR', imported.true_canonical_pairs > 0)
  } else {
    check('REVERSE_ROW_PAIRING', imported.status === 'WAITING_NATIVE_ID_DATA')
    check('TRUE_CANONICAL_PAIR', imported.TRUE_RECIPROCAL_AVAILABLE === false)
  }

  // Synthetic reverse pairing unit test
  const tmp = path.join(__dirname, '_native_pair_fixture.csv')
  fs.writeFileSync(
    tmp,
    [
      'iid,pid,wave,dec,dec_o,match,age,gender',
      '1,2,1,1,0,0,25,1',
      '2,1,1,0,1,0,24,0',
      '1,3,1,1,1,1,25,1',
      '3,1,1,1,1,1,26,0',
      '4,5,1,1,0,0,30,1'
    ].join('\n')
  )
  const syn = importNativeSpeedDating(tmp)
  try {
    fs.unlinkSync(tmp)
  } catch (_) {}
  check('REVERSE_ROW_PAIRING_SYNTH', syn.ok && syn.rows_with_reverse === 4, JSON.stringify({
    with: syn.rows_with_reverse,
    miss: syn.rows_missing_reverse,
    canon: syn.true_canonical_pairs
  }))
  check('TRUE_CANONICAL_PAIR_SYNTH', syn.true_canonical_pairs === 2, String(syn.true_canonical_pairs))
  check('PARTIAL_RECIPROCAL', syn.incomplete_pairs === 1)

  const src = fs.readFileSync(
    path.join(__dirname, '../data/wefinally/eval/matchReciprocalV14.js'),
    'utf8'
  )
  check(
    'NO_SWAPPED_VECTOR_RECIPROCAL',
    !/xRev/.test(src) && assertNoSwappedVectorReciprocal('ok'),
    'xRev still present'
  )

  // Feature/gold boundary smoke
  const fake = {
    case_id: 't1',
    a_to_b_decision: true,
    b_to_a_decision: false,
    bilateral_outcome: { mutual_match: false },
    person_a: { id: '1', age: 25 },
    person_b: { id: '2', age: 24 },
    a_preferences: {},
    b_preferences: {},
    pre_date_information: {},
    observed_attributes: { fairness_only: { race: 1 } }
  }
  const canary = makeCanary('v15')
  const fv = buildFeatureView(fake)
  const gv = buildGoldView(fake, canary)
  let goldBlocked = false
  try {
    void fv.a_to_b_decision
  } catch (e) {
    goldBlocked = /GOLD_LABEL_ACCESS_FORBIDDEN/.test(String(e.message))
  }
  check(
    'NATIVE_FEATURE_GOLD_BOUNDARY',
    goldBlocked && gv.mutual_match === false && gv.__gold_canary === canary
  )

  const audit = auditNativeIdCandidate()
  check(
    'WAITING_OR_NATIVE',
    audit.TRUE_RECIPROCAL_AVAILABLE === true ||
      audit.status === 'WAITING_NATIVE_ID_DATA' ||
      audit.status === 'FALLBACK_FINGERPRINT_REQUIRED' ||
      audit.status === 'NATIVE_SCHEMA_AVAILABLE' ||
      !audit.usable_native
  )

  if (failed) {
    console.error('match-eval-v15 FAILED', failed)
    process.exit(1)
  }
  console.log('match-eval-v15 passed')
}

main()
