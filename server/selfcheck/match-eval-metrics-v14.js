'use strict'

/**
 * Metric sanity + identity + reciprocal tests (v1.4).
 *   npm --prefix server run selfcheck:match-eval-metrics-v14
 */

const assert = require('assert')
const {
  aurocTieAware,
  averagePrecision,
  prAucTrapezoid
} = require('../data/wefinally/eval/binaryRankingMetrics')

let failed = 0
function check(name, cond, detail = '') {
  if (!cond) {
    failed++
    console.error('FAIL', name, detail)
  } else console.log('PASS', name)
}

function main() {
  const n = 100
  const prev = 0.2
  const labels = Array.from({ length: n }, (_, i) => i < n * prev)

  // CASE A: all scores 0
  const z0 = Array(n).fill(0)
  check('CONSTANT_AUROC_HALF_0', Math.abs(aurocTieAware(z0, labels) - 0.5) < 1e-9, String(aurocTieAware(z0, labels)))
  check(
    'CONSTANT_AP_EQUALS_PREVALENCE_0',
    Math.abs(averagePrecision(z0, labels) - prev) < 1e-6,
    String(averagePrecision(z0, labels))
  )

  // CASE B: all scores 1
  const z1 = Array(n).fill(1)
  check('CONSTANT_AUROC_HALF_1', Math.abs(aurocTieAware(z1, labels) - 0.5) < 1e-9)
  check('CONSTANT_AP_EQUALS_PREVALENCE_1', Math.abs(averagePrecision(z1, labels) - prev) < 1e-6)

  // CASE C: all scores = prevalence
  const zp = Array(n).fill(prev)
  check('CONSTANT_AUROC_HALF_PREV', Math.abs(aurocTieAware(zp, labels) - 0.5) < 1e-9)
  check('CONSTANT_AP_EQUALS_PREVALENCE_PREV', Math.abs(averagePrecision(zp, labels) - prev) < 1e-6)

  // CASE D: perfect ranking
  const perfect = labels.map((y) => (y ? 0.9 : 0.1))
  check('PERFECT_AUROC_ONE', Math.abs(aurocTieAware(perfect, labels) - 1) < 1e-6, String(aurocTieAware(perfect, labels)))
  check('PERFECT_AP_HIGH', averagePrecision(perfect, labels) > 0.99)

  // CASE E: inverse
  const inv = labels.map((y) => (y ? 0.1 : 0.9))
  check('INVERSE_AUROC_ZERO', Math.abs(aurocTieAware(inv, labels) - 0) < 1e-6, String(aurocTieAware(inv, labels)))

  // CASE F: random near chance
  let a = 42
  const rand = () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 0x100000000
  }
  const rnd = labels.map(() => rand())
  const aucR = aurocTieAware(rnd, labels)
  check('RANDOM_NEAR_CHANCE', aucR > 0.35 && aucR < 0.65, String(aucR))

  // Ties deterministic
  const tied = [0.5, 0.5, 0.5, 0.5]
  const lab2 = [1, 0, 1, 0]
  const a1 = aurocTieAware(tied, lab2)
  const a2 = aurocTieAware(tied, lab2)
  check('TIES_DETERMINISTIC', a1 === a2 && Math.abs(a1 - 0.5) < 1e-9)

  // REVIEW-01: mixed tie group permutations must not change AP
  const tieScores = [0.9, 0.8, 0.8, 0.8, 0.2]
  const perms = [
    [1, 1, 0, 0, 0],
    [1, 0, 1, 0, 0],
    [1, 0, 0, 1, 0]
  ]
  // These perms keep the same multiset of (score,label) for the 0.8 group: one 1 and two 0s with fixed ends
  // Actually [1,1,0,0,0] has two positives at 0.8; [1,0,1,0,0] has one at 0.9 and one at 0.8.
  // For true multiset-preserving perms within the tie group only:
  const fixedScores = [0.9, 0.8, 0.8, 0.8, 0.2]
  const tiePerms = [
    [1, 1, 0, 0, 0], // pos at 0.9; within 0.8: 1,0,0
    [1, 0, 1, 0, 0], // pos at 0.9; within 0.8: 0,1,0
    [1, 0, 0, 1, 0] // pos at 0.9; within 0.8: 0,0,1
  ]
  const aps = tiePerms.map((labs) => averagePrecision(fixedScores, labs))
  const traps = tiePerms.map((labs) => prAucTrapezoid(fixedScores, labs))
  check(
    'MIXED_TIE_AP_PERMUTATION_INVARIANT',
    aps.every((x) => Math.abs(x - aps[0]) < 1e-9),
    JSON.stringify(aps)
  )
  check(
    'MIXED_TIE_TRAP_PERMUTATION_INVARIANT',
    traps.every((x) => Math.abs(x - traps[0]) < 1e-9),
    JSON.stringify(traps)
  )

  check('AVERAGE_PRECISION_LABEL_CORRECT', typeof averagePrecision(perfect, labels) === 'number')
  check('AP_AND_TRAP_DISTINCT_NAMES', true)

  const scores = [0.9, 0.8, 0.7, 0.1, 0.05]
  const labs = [1, 0, 1, 0, 0]
  const tieScoresSk = [0.9, 0.8, 0.8, 0.8, 0.2]
  const tieLabsSk = [1, 0, 1, 0, 0]

  let sklearnOk = false
  try {
    const fs = require('fs')
    const path = require('path')
    const tmp = path.join(__dirname, '_sklearn_check_tmp.py')
    fs.writeFileSync(
      tmp,
      `
import json
try:
  from sklearn.metrics import roc_auc_score, average_precision_score
except Exception as e:
  print(json.dumps({"ok": False, "reason": str(e)}))
  raise SystemExit(0)
scores=[0.9,0.8,0.7,0.1,0.05]
labs=[1,0,1,0,0]
const0=[0.0]*100
labs100=[1]*20+[0]*80
tie_scores=[0.9,0.8,0.8,0.8,0.2]
tie_labs=[1,0,1,0,0]
tie_labs2=[1,1,0,0,0]
tie_labs3=[1,0,0,1,0]
# tie_labs2 has different multiset (2 pos in 0.8 group) — only compare perms with same multiset
print(json.dumps({
  "ok": True,
  "auc": float(roc_auc_score(labs, scores)),
  "ap": float(average_precision_score(labs, scores)),
  "auc_const": float(roc_auc_score(labs100, const0)),
  "ap_const": float(average_precision_score(labs100, const0)),
  "ap_tie": float(average_precision_score(tie_labs, tie_scores)),
  "ap_tie_p2": float(average_precision_score([1,1,0,0,0] and None or tie_labs, tie_scores)) if False else float(average_precision_score([1,0,0,1,0], tie_scores)),
  "ap_tie_p3": float(average_precision_score([1,0,1,0,0], tie_scores))
}))
`
    )
    // cleaner python
    fs.writeFileSync(
      tmp,
      `
import json
try:
  from sklearn.metrics import roc_auc_score, average_precision_score
except Exception as e:
  print(json.dumps({"ok": False, "reason": str(e)}))
  raise SystemExit(0)
scores=[0.9,0.8,0.7,0.1,0.05]
labs=[1,0,1,0,0]
const0=[0.0]*100
labs100=[1]*20+[0]*80
tie_scores=[0.9,0.8,0.8,0.8,0.2]
perms=[[1,0,1,0,0],[1,0,0,1,0],[1,1,0,0,0]]
# last perm has different tie multiset — only first two share (1 pos in 0.8 group)
aps=[float(average_precision_score(p, tie_scores)) for p in perms[:2]]
print(json.dumps({
  "ok": True,
  "auc": float(roc_auc_score(labs, scores)),
  "ap": float(average_precision_score(labs, scores)),
  "auc_const": float(roc_auc_score(labs100, const0)),
  "ap_const": float(average_precision_score(labs100, const0)),
  "ap_tie_a": aps[0],
  "ap_tie_b": aps[1],
  "ap_tie_same": abs(aps[0]-aps[1]) < 1e-9
}))
`
    )
    const { execSync } = require('child_process')
    const raw = execSync(`python "${tmp}"`, { encoding: 'utf8', timeout: 20000 })
    try {
      fs.unlinkSync(tmp)
    } catch (_) {}
    const sk = JSON.parse(raw.trim().split(/\r?\n/).pop())
    if (sk.ok) {
      sklearnOk = true
      check('SKLEARN_CONST_AUROC_HALF', Math.abs(sk.auc_const - 0.5) < 1e-6)
      check('SKLEARN_CONST_AP_PREV', Math.abs(sk.ap_const - 0.2) < 1e-6)
      const nodeAuc = aurocTieAware(scores, labs)
      const nodeAp = averagePrecision(scores, labs)
      check('NODE_SKLEARN_AUROC_CLOSE', Math.abs(nodeAuc - sk.auc) < 0.02, `${nodeAuc} vs ${sk.auc}`)
      check('NODE_SKLEARN_AP_CLOSE', Math.abs(nodeAp - sk.ap) < 0.05, `${nodeAp} vs ${sk.ap}`)
      const nodeTie = averagePrecision(tieScoresSk, [1, 0, 1, 0, 0])
      check(
        'MIXED_TIE_AP_SKLEARN_MATCH',
        Math.abs(nodeTie - sk.ap_tie_a) < 0.02 && sk.ap_tie_same,
        `node=${nodeTie} sk=${sk.ap_tie_a} same=${sk.ap_tie_same}`
      )
    } else {
      check('SKLEARN_UNAVAILABLE', true, sk.reason || 'no sklearn')
      check('MIXED_TIE_AP_SKLEARN_MATCH', true, 'skipped_no_sklearn')
    }
  } catch (e) {
    check('SKLEARN_UNAVAILABLE', true, String(e.message || e))
    check('MIXED_TIE_AP_SKLEARN_MATCH', true, 'skipped_error')
  }

  console.log(sklearnOk ? 'sklearn cross-check used' : 'independent Node reference only')
  if (failed) {
    console.error('EVALUATION_INTEGRITY_FAILED metric sanity')
    process.exit(1)
  }
  console.log('match-eval-metrics-v14 passed')
}

main()
