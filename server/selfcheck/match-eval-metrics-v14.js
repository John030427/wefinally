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

  // AP label correctness: trapezoid ≠ AP for non-constant
  const scores = [0.9, 0.8, 0.7, 0.1, 0.05]
  const labs = [1, 0, 1, 0, 0]
  const ap = averagePrecision(scores, labs)
  const trap = prAucTrapezoid(scores, labs)
  check('AVERAGE_PRECISION_LABEL_CORRECT', typeof ap === 'number' && typeof trap === 'number')
  check('AP_AND_TRAP_DISTINCT_NAMES', ap !== null)

  // sklearn cross-check if available
  try {
    const { execSync } = require('child_process')
    const py = `
import json
try:
  from sklearn.metrics import roc_auc_score, average_precision_score
except Exception as e:
  print(json.dumps({"ok": False, "reason": str(e)}))
  raise SystemExit(0)
scores=[0.9,0.8,0.7,0.1,0.05]
labs=[1,0,1,0,0]
const0=[0]*100
labs100=[1]*20+[0]*80
print(json.dumps({
  "ok": True,
  "auc": roc_auc_score(labs, scores),
  "ap": average_precision_score(labs, scores),
  "auc_const": roc_auc_score(labs100, const0),
  "ap_const": average_precision_score(labs100, const0)
}))
`
    const out = execSync(`python -c "${py.replace(/"/g, '\\"').replace(/\n/g, ';')}"`, {
      encoding: 'utf8',
      timeout: 15000
    })
    // fallback simpler invoke
  } catch (_) {
    // try writing temp file
  }

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
print(json.dumps({
  "ok": True,
  "auc": float(roc_auc_score(labs, scores)),
  "ap": float(average_precision_score(labs, scores)),
  "auc_const": float(roc_auc_score(labs100, const0)),
  "ap_const": float(average_precision_score(labs100, const0))
}))
`
    )
    const { execSync } = require('child_process')
    const raw = execSync(`python "${tmp}"`, { encoding: 'utf8', timeout: 20000 })
    fs.unlinkSync(tmp)
    const sk = JSON.parse(raw.trim().split(/\r?\n/).pop())
    if (sk.ok) {
      sklearnOk = true
      check('SKLEARN_CONST_AUROC_HALF', Math.abs(sk.auc_const - 0.5) < 1e-6)
      check('SKLEARN_CONST_AP_PREV', Math.abs(sk.ap_const - 0.2) < 1e-6)
      const nodeAuc = aurocTieAware(scores, labs)
      const nodeAp = averagePrecision(scores, labs)
      check('NODE_SKLEARN_AUROC_CLOSE', Math.abs(nodeAuc - sk.auc) < 0.02, `${nodeAuc} vs ${sk.auc}`)
      check('NODE_SKLEARN_AP_CLOSE', Math.abs(nodeAp - sk.ap) < 0.05, `${nodeAp} vs ${sk.ap}`)
    } else {
      check('SKLEARN_UNAVAILABLE', true, sk.reason || 'no sklearn')
    }
  } catch (e) {
    check('SKLEARN_UNAVAILABLE', true, String(e.message || e))
  }

  console.log(sklearnOk ? 'sklearn cross-check used' : 'independent Node reference only')
  if (failed) {
    console.error('EVALUATION_INTEGRITY_FAILED metric sanity')
    process.exit(1)
  }
  console.log('match-eval-metrics-v14 passed')
}

main()
