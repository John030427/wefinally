'use strict'

/**
 * Offline sandbox ML baselines for Speed Dating v1.3.
 * Pure Node — no production deploy. Research/reference only.
 */

function sigmoid(z) {
  if (z > 30) return 1
  if (z < -30) return 0
  return 1 / (1 + Math.exp(-z))
}

function extractVector(fv) {
  const a = fv.person_a || {}
  const b = fv.person_b || {}
  const ap = fv.a_preferences || {}
  const bp = fv.b_preferences || {}
  const pre = fv.pre_date_information || {}
  const d = fv.directional || {}
  const bil = fv.bilateral_features || {}
  const interests = a.interests || {}
  const vals = [
    Number(a.age) || 0,
    Number(b.age) || 0,
    Number(a.gender) || 0,
    Number(pre.d_age) || 0,
    Number(pre.interests_correlate) || 0,
    Number(d.a_to_b) || 0,
    Number(d.b_to_a) || 0,
    Number(bil.min) || 0,
    Number(bil.mean) || 0,
    Number(bil.geom) || 0,
    Number(bil.gap) || 0,
    Number(bil.product) || 0,
    Number(ap.attractive_important) || 0,
    Number(ap.sincere_important) || 0,
    Number(ap.funny_important) || 0,
    Number(ap.shared_interests_important) || 0,
    Number(bp.pref_o_attractive) || 0,
    Number(bp.pref_o_sincere) || 0,
    Number(bp.pref_o_funny) || 0,
    Number(bp.pref_o_shared_interests) || 0,
    Number(interests.sports) || 0,
    Number(interests.music) || 0,
    Number(interests.reading) || 0,
    Number(interests.movies) || 0,
    Number((a.self_attr && a.self_attr.attractive) || 0),
    Number((a.self_attr && a.self_attr.intelligence) || 0)
  ]
  return vals
}

function standardize(X) {
  const d = X[0].length
  const mean = Array(d).fill(0)
  const std = Array(d).fill(0)
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j]
  for (let j = 0; j < d; j++) mean[j] /= X.length || 1
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / (X.length || 1)) || 1
  const Xs = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]))
  return { Xs, mean, std }
}

function applyStandard(row, mean, std) {
  return row.map((v, j) => (v - mean[j]) / (std[j] || 1))
}

/** L2 logistic regression with class weighting */
function trainLogistic(X, y, { lr = 0.05, epochs = 80, l2 = 0.01, posWeight = null } = {}) {
  const { Xs, mean, std } = standardize(X)
  const d = Xs[0].length
  const w = Array(d).fill(0)
  let b = 0
  const nPos = y.filter(Boolean).length
  const nNeg = y.length - nPos
  const pw = posWeight != null ? posWeight : nNeg / Math.max(1, nPos)
  for (let ep = 0; ep < epochs; ep++) {
    let gw = Array(d).fill(0)
    let gb = 0
    for (let i = 0; i < Xs.length; i++) {
      const z = Xs[i].reduce((s, v, j) => s + v * w[j], 0) + b
      const p = sigmoid(z)
      const weight = y[i] ? pw : 1
      const err = (p - (y[i] ? 1 : 0)) * weight
      for (let j = 0; j < d; j++) gw[j] += err * Xs[i][j]
      gb += err
    }
    for (let j = 0; j < d; j++) {
      gw[j] = gw[j] / Xs.length + l2 * w[j]
      w[j] -= lr * gw[j]
    }
    b -= (lr * gb) / Xs.length
  }
  return {
    type: 'LR',
    w,
    b,
    mean,
    std,
    feature_names: [
      'age_a',
      'age_b',
      'gender_a',
      'd_age',
      'interests_corr',
      'dir_a',
      'dir_b',
      'bil_min',
      'bil_mean',
      'bil_geom',
      'bil_gap',
      'bil_prod',
      'ap_attr',
      'ap_sinc',
      'ap_funny',
      'ap_shared',
      'bp_attr',
      'bp_sinc',
      'bp_funny',
      'bp_shared',
      'int_sports',
      'int_music',
      'int_reading',
      'int_movies',
      'self_attr',
      'self_intel'
    ],
    coefficients: null
  }
}

function predictLogistic(model, x) {
  const xs = applyStandard(x, model.mean, model.std)
  const z = xs.reduce((s, v, j) => s + v * model.w[j], 0) + model.b
  return sigmoid(z)
}

/** Shallow gradient boosting of depth-1 stumps (pure JS) */
function trainGBDT(X, y, { nTrees = 40, lr = 0.1, posWeight = null } = {}) {
  const { Xs, mean, std } = standardize(X)
  const n = Xs.length
  const d = Xs[0].length
  const nPos = y.filter(Boolean).length
  const nNeg = n - nPos
  const pw = posWeight != null ? posWeight : Math.min(8, nNeg / Math.max(1, nPos))
  // init with log-odds
  const p0 = nPos / Math.max(1, n)
  let F = Array(n).fill(Math.log((p0 + 1e-6) / (1 - p0 + 1e-6)))
  const trees = []
  for (let t = 0; t < nTrees; t++) {
    const residuals = []
    for (let i = 0; i < n; i++) {
      const p = sigmoid(F[i])
      const w = y[i] ? pw : 1
      residuals.push(w * ((y[i] ? 1 : 0) - p))
    }
    // find best stump
    let best = { feat: 0, thr: 0, left: 0, right: 0, score: -Infinity }
    for (let j = 0; j < d; j++) {
      const vals = Xs.map((r) => r[j]).sort((a, b) => a - b)
      const thr = vals[Math.floor(vals.length * 0.5)]
      let sl = 0
      let sr = 0
      let nl = 0
      let nr = 0
      for (let i = 0; i < n; i++) {
        if (Xs[i][j] <= thr) {
          sl += residuals[i]
          nl++
        } else {
          sr += residuals[i]
          nr++
        }
      }
      const left = nl ? sl / nl : 0
      const right = nr ? sr / nr : 0
      const score = nl * left * left + nr * right * right
      if (score > best.score) best = { feat: j, thr, left, right, score }
    }
    trees.push(best)
    for (let i = 0; i < n; i++) {
      F[i] += lr * (Xs[i][best.feat] <= best.thr ? best.left : best.right)
    }
  }
  // feature importance by |leaf| usage
  const imp = Array(d).fill(0)
  for (const tr of trees) imp[tr.feat] += Math.abs(tr.left) + Math.abs(tr.right)
  return { type: 'GBDT', trees, lr, mean, std, importance: imp }
}

function predictGBDT(model, x) {
  const xs = applyStandard(x, model.mean, model.std)
  let F = 0
  for (const tr of model.trees) {
    F += model.lr * (xs[tr.feat] <= tr.thr ? tr.left : tr.right)
  }
  return sigmoid(F)
}

function trainDirectionalModels(trainCases, buildFeatureView) {
  const X = []
  const yDir = []
  const yMut = []
  for (const c of trainCases) {
    const fv = buildFeatureView(c)
    X.push(extractVector(fv))
    yDir.push(!!c.a_to_b_decision)
    yMut.push(!!(c.bilateral_outcome && c.bilateral_outcome.mutual_match))
  }
  const lrDir = trainLogistic(X, yDir)
  lrDir.coefficients = lrDir.feature_names.map((name, i) => ({ name, w: lrDir.w[i] }))
  const gbdtDir = trainGBDT(X, yDir)
  const lrMut = trainLogistic(X, yMut)
  const gbdtMut = trainGBDT(X, yMut)
  return { lrDir, gbdtDir, lrMut, gbdtMut }
}

function scoreWithModel(model, fv, agg = 'PRODUCT') {
  const x = extractVector(fv)
  let pA
  if (model.type === 'LR') pA = predictLogistic(model, x)
  else pA = predictGBDT(model, x)
  // Reverse directional approx using bilateral symmetry on same vector (sandbox)
  const pB = fv.directional ? Number(fv.directional.b_to_a) || pA : pA
  let mutual
  if (agg === 'MIN') mutual = Math.min(pA, pB)
  else if (agg === 'GEOM') mutual = Math.sqrt(pA * pB)
  else if (agg === 'MEAN') mutual = (pA + pB) / 2
  else mutual = pA * pB
  return { pA, pB, mutual }
}

/** Platt scaling on calibration set */
function fitPlatt(scores, labels) {
  // fit a,b for sigmoid(a*s+b) ≈ y via simple GD
  let a = 1
  let b = 0
  for (let ep = 0; ep < 100; ep++) {
    let ga = 0
    let gb = 0
    for (let i = 0; i < scores.length; i++) {
      const p = sigmoid(a * scores[i] + b)
      const err = p - (labels[i] ? 1 : 0)
      ga += err * scores[i]
      gb += err
    }
    a -= 0.05 * (ga / scores.length)
    b -= 0.05 * (gb / scores.length)
  }
  return { a, b, type: 'platt' }
}

function applyPlatt(cal, score) {
  return sigmoid(cal.a * score + cal.b)
}

/** Empirical bucket calibrator */
function fitEmpirical(scores, labels, buckets = 10) {
  const bins = Array.from({ length: buckets }, () => ({ n: 0, pos: 0 }))
  for (let i = 0; i < scores.length; i++) {
    const idx = Math.min(buckets - 1, Math.floor(Math.max(0, Math.min(0.999, scores[i])) * buckets))
    bins[idx].n++
    if (labels[i]) bins[idx].pos++
  }
  return {
    type: 'empirical',
    rates: bins.map((b) => (b.n ? b.pos / b.n : 0))
  }
}

function applyEmpirical(cal, score) {
  const idx = Math.min(cal.rates.length - 1, Math.floor(Math.max(0, Math.min(0.999, score)) * cal.rates.length))
  return cal.rates[idx]
}

module.exports = {
  extractVector,
  trainLogistic,
  predictLogistic,
  trainGBDT,
  predictGBDT,
  trainDirectionalModels,
  scoreWithModel,
  fitPlatt,
  applyPlatt,
  fitEmpirical,
  applyEmpirical,
  sigmoid
}
