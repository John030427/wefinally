'use strict'

/**
 * Match Evolution v1.4 — reciprocal aggregation experiments (DEV only).
 *   node server/data/wefinally/eval/matchReciprocalV14.js
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { PATHS, ensureDir, REPO_ROOT } = require('../paths')
const { readJsonl } = require('../builders/cases')
const { loadPart } = require('../builders/sealedAccess')
const { rebuildPairsFromRows, persistV13Artifacts, subjectFingerprint, partnerFingerprint } = require('../importers/speedDatingV13')
const { splitSpeedDatingV13 } = require('../builders/splitSpeedDatingV13')
const { auditNativeIdCandidate } = require('../importers/nativeIdMigration')
const { buildFeatureView, buildGoldView, makeCanary } = require('./matchViews')
const { scoreModel } = require('./scoreMatch')
const { predictOne, mulberry32 } = require('./predictMatch')
const {
  trainDirectionalModels,
  scoreWithModel,
  extractVector,
  predictLogistic,
  predictGBDT,
  fitPlatt,
  applyPlatt,
  trainLogistic,
  trainGBDT
} = require('../ml/tabularBaselines')
const { aurocTieAware, averagePrecision } = require('./binaryRankingMetrics')

const RUN_ID = 'match-reciprocal-v1.4'
const REVIEW = path.join(REPO_ROOT, 'project-docs', 'review', 'match-v1.4')

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line)
    const o = {}
    headers.forEach((h, i) => {
      o[h] = cols[i]
    })
    return o
  })
}
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ',' && !inQ) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function writeReview(name, body) {
  ensureDir(REVIEW)
  fs.writeFileSync(path.join(REVIEW, name), body)
}

function summarize(scored) {
  const m = scored.metrics || {}
  return {
    n: scored.n,
    AUROC: m.AUROC,
    AVERAGE_PRECISION: m.AVERAGE_PRECISION ?? m.AUPRC,
    PR_AUC_TRAPEZOID: m.PR_AUC_TRAPEZOID,
    AUPRC: m.AVERAGE_PRECISION ?? m.AUPRC,
    MCC: m.MCC,
    Precision: m.CPrecision,
    Recall: m.CRecall,
    F1: m.F1,
    one_sided_FP: m.one_sided_false_positive_rate,
    P_at_1: m.precision_at_1,
    P_at_3: m.precision_at_3,
    NDCG_at_3: m.ndcg_at_3,
    NDCG_at_5: m.ndcg_at_5,
    MRR: m.MRR,
    RNDCG: m.RNDCG,
    Brier: m.calibration?.Brier,
    ECE: m.calibration?.ECE,
    query_stats: m.query_stats,
    failure_types: scored.failure_types
  }
}

function evalPreds(cases, preds, name) {
  const canary = makeCanary(name)
  return summarize(
    scoreModel({
      cases,
      goldViews: cases.map((c) => buildGoldView(c, canary)),
      predictionRows: preds,
      model: name
    })
  )
}

function heuristicPreds(cases, model) {
  const rng = mulberry32(42)
  return cases.map((c) => predictOne(model, buildFeatureView(c), { rng }))
}

function directionalPairScores(cases, lrDir, gbdtDir) {
  // v1.5: NEVER approximate P(B→A) via swapped vectors.
  // Without native reverse subject rows, p_ba is unavailable.
  return cases.map((c) => {
    const fv = buildFeatureView(c)
    const x = extractVector(fv)
    const p_ab_lr = predictLogistic(lrDir, x)
    const p_ab_gbdt = predictGBDT(gbdtDir, x)
    return {
      case_id: c.case_id,
      p_ab_lr,
      p_ba_lr: null,
      p_ab_gbdt,
      p_ba_gbdt: null,
      p_ba_feat: null,
      gap_lr: null,
      mutual: !!(c.bilateral_outcome && c.bilateral_outcome.mutual_match),
      a_yes: !!c.a_to_b_decision,
      b_yes: !!c.b_to_a_decision,
      fv,
      SUBJECT_RANKING_WITH_UNCERTAIN_PARTNER_IDENTITY: true,
      PAIR_IDENTITY_UNCERTAIN: true,
      TRUE_RECIPROCAL_AVAILABLE: false,
      note: 'NO_SWAPPED_VECTOR_RECIPROCAL — p_ba requires native reverse subject row'
    }
  })
}

function recipPred(rows, name, scoreFn, th = 0.35) {
  return rows.map((r) => {
    const score = scoreFn(r)
    return {
      case_id: r.case_id,
      model: name,
      predict_mutual: score >= th,
      score,
      path: name,
      status: 'OFFLINE_V14',
      compatibility_score: Math.round(score * 100)
    }
  })
}

function harmonic(a, b) {
  if (a + b === 0) return 0
  return (2 * a * b) / (a + b)
}

function auditIdentity(rows, rebuilt) {
  const subjMap = new Map()
  const partMap = new Map()
  for (const r of rows) {
    const sf = subjectFingerprint(r)
    const pf = partnerFingerprint(r)
    if (!subjMap.has(sf)) subjMap.set(sf, [])
    if (!partMap.has(pf)) partMap.set(pf, [])
    subjMap.get(sf).push({
      wave: r.wave,
      age: r.age,
      gender: r.gender,
      idx: subjMap.get(sf).length
    })
    partMap.get(pf).push({ wave: r.wave, age_o: r.age_o })
  }

  const ambiguousSubjects = []
  for (const [fp, list] of subjMap) {
    const waves = new Set(list.map((x) => String(x.wave)))
    // Same fingerprint across different waves can be OK (same person) or collision;
    // within one wave, multiplicity = encounters for that person (expected).
    const byWave = new Map()
    for (const x of list) {
      const w = String(x.wave)
      byWave.set(w, (byWave.get(w) || 0) + 1)
    }
    // Incompatible: same fingerprint but conflicting age/gender within same wave (should not happen if fp includes them)
    const ages = new Set(list.map((x) => String(x.age)))
    const genders = new Set(list.map((x) => String(x.gender)))
    if (ages.size > 1 || genders.size > 1) {
      ambiguousSubjects.push({ fp: fp.slice(0, 80), ages: [...ages], genders: [...genders], n: list.length })
    }
  }

  const multiplicity = [...subjMap.values()].map((l) => l.length).sort((a, b) => a - b)
  const pct = (p) => multiplicity[Math.min(multiplicity.length - 1, Math.floor((multiplicity.length - 1) * p))] || 0

  // Partner fp appearing with many distinct subject fps in same wave → weak partner identity
  const partnerAmbiguity = []
  const partByWave = new Map()
  for (const r of rows) {
    const key = `${r.wave}|${partnerFingerprint(r)}`
    if (!partByWave.has(key)) partByWave.set(key, new Set())
    partByWave.get(key).add(subjectFingerprint(r))
  }
  for (const [k, subjs] of partByWave) {
    if (subjs.size > 1) {
      // expected: one partner meets many subjects — not a collision
    }
  }

  // Collision candidate: identical subject fingerprint used in same wave with impossible dual profiles
  const collisionCandidates = ambiguousSubjects.length

  const byWavePart = new Map()
  for (const e of rebuilt.encounterRows) {
    const k = `${e.wave}|${e.iid}`
    byWavePart.set(k, (byWavePart.get(k) || 0) + 1)
  }
  const perPart = [...byWavePart.values()].sort((a, b) => a - b)

  return {
    identity_mode: rebuilt.identityMode,
    status: 'IDENTITY_RECONSTRUCTION_UNCERTAIN',
    pair_identity_status: 'PAIR_IDENTITY_UNCERTAIN',
    TRUE_RECIPROCAL_AVAILABLE: false,
    raw_rows: rows.length,
    unique_subject_fingerprints: subjMap.size,
    unique_partner_fingerprints: partMap.size,
    directed_encounters: rebuilt.encounterRows.length,
    canonical_pairs: rebuilt.pairs.length,
    quarantined: rebuilt.quarantined.length,
    query_stats: rebuilt.stats,
    fingerprint_multiplicity: {
      min: multiplicity[0] || 0,
      p50: pct(0.5),
      p90: pct(0.9),
      max: multiplicity[multiplicity.length - 1] || 0
    },
    rows_per_participant_wave: {
      min: perPart[0] || 0,
      median: perPart[Math.floor(perPart.length / 2)] || 0,
      max: perPart[perPart.length - 1] || 0
    },
    ambiguous_subject_fingerprints: ambiguousSubjects.slice(0, 20),
    ambiguous_subject_count: ambiguousSubjects.length,
    collision_candidates: collisionCandidates,
    fingerprint_fields_subject: [
      'wave',
      'gender',
      'age',
      '*_important prefs',
      'hobby self-ratings'
    ],
    fingerprint_fields_partner: ['wave', 'age_o', 'pref_o_*'],
    forbidden_in_fingerprint: ['decision', 'decision_o', 'match', 'like', '*_partner', '*_o ratings'],
    note: 'Fingerprint is participant-invariant PRE_MATCH only; not native iid/pid. Prefer NATIVE_ID_DATASET when available.'
  }
}

function quadrantAnalysis(rows) {
  const buckets = {
    YY: [],
    YN: [],
    NY: [],
    NN: []
  }
  for (const r of rows) {
    const key = `${r.a_yes ? 'Y' : 'N'}${r.b_yes ? 'Y' : 'N'}`
    buckets[key].push(r.p_ab_lr * r.p_ba_lr)
  }
  const stats = (arr) => {
    if (!arr.length) return null
    const s = arr.slice().sort((a, b) => a - b)
    return {
      n: s.length,
      mean: s.reduce((a, b) => a + b, 0) / s.length,
      p50: s[Math.floor(s.length / 2)]
    }
  }
  return {
    YES_YES: stats(buckets.YY),
    YES_NO: stats(buckets.YN),
    NO_YES: stats(buckets.NY),
    NO_NO: stats(buckets.NN)
  }
}

function main() {
  ensureDir(REVIEW)
  console.log('=== Match Reciprocal v1.4 ===')

  // Ensure data
  const csvPath = path.join(PATHS.raw, 'speed-dating', 'speed-dating.csv')
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const rebuilt = rebuildPairsFromRows(rows)
  persistV13Artifacts(rebuilt)
  const manifest = splitSpeedDatingV13()
  const train = loadPart('TRAIN_CORE')
  const cal = loadPart('CALIBRATION')
  const dev = loadPart('DEV')

  const identityAudit = auditIdentity(rows, rebuilt)
  const nativeIdAudit = auditNativeIdCandidate()
  const trueReciprocal =
    rebuilt.TRUE_RECIPROCAL_AVAILABLE === true && nativeIdAudit.TRUE_RECIPROCAL_AVAILABLE === true

  // Train directional models
  const models = trainDirectionalModels(train, buildFeatureView)
  const dirDev = directionalPairScores(dev, models.lrDir, models.gbdtDir)
  const dirCal = directionalPairScores(cal, models.lrDir, models.gbdtDir)

  if (!trueReciprocal) {
    console.log('TRUE_RECIPROCAL_AVAILABLE=false — skipping reciprocal aggregators (v1.5)')
    const experiments = {
      Z_RANDOM: evalPreds(dev, heuristicPreds(dev, 'Z_RANDOM'), 'Z_RANDOM'),
      B: evalPreds(dev, heuristicPreds(dev, 'B'), 'B'),
      C: evalPreds(dev, heuristicPreds(dev, 'C'), 'C'),
      LR_DIR_AB_ONLY: evalPreds(
        dev,
        recipPred(dirDev, 'LR_DIR_AB_ONLY', (r) => r.p_ab_lr),
        'LR_DIR_AB_ONLY'
      )
    }
    writeReview(
      'RECIPROCAL_EXPERIMENTS.md',
      [
        '# Reciprocal Experiments (v1.4 runner under v1.5 gate)',
        '',
        '**TRUE_RECIPROCAL_AVAILABLE=false**',
        '',
        'Fingerprint identity → PAIR_IDENTITY_UNCERTAIN.',
        'Swapped-vector p_ba removed. Reciprocal aggregators not run.',
        'Label: SUBJECT_RANKING_WITH_UNCERTAIN_PARTNER_IDENTITY',
        '',
        '```json',
        JSON.stringify({ experiments, nativeIdAudit, identityAudit: { status: identityAudit.status } }, null, 2),
        '```',
        ''
      ].join('\n')
    )
    console.log('Champion: BLOCKED_TRUE_RECIPROCAL')
    return {
      TRUE_RECIPROCAL_AVAILABLE: false,
      experiments,
      identityAudit,
      nativeIdAudit
    }
  }

  // Meta features for reciprocal meta-models (native path only)
  function metaX(r) {
    return [
      r.p_ab_lr,
      r.p_ba_lr,
      Math.min(r.p_ab_lr, r.p_ba_lr),
      Math.max(r.p_ab_lr, r.p_ba_lr),
      (r.p_ab_lr + r.p_ba_lr) / 2,
      r.p_ab_lr * r.p_ba_lr,
      Math.abs(r.p_ab_lr - r.p_ba_lr),
      Math.sqrt(Math.max(0, r.p_ab_lr * r.p_ba_lr)),
      Number(r.fv.bilateral_features?.gap) || 0,
      Number(r.fv.pre_date_information?.interests_correlate) || 0
    ]
  }
  const Xtr = dirCal.map(metaX) // use CAL for meta to reduce DEV leak; also include train subsample
  const ytr = dirCal.map((r) => r.mutual)
  // Better: train meta on TRAIN directional outputs
  const dirTrain = directionalPairScores(train.slice(0, 3000), models.lrDir, models.gbdtDir)
  const Xm = dirTrain.map(metaX)
  const ym = dirTrain.map((r) => r.mutual)
  const metaLr = trainLogistic(Xm, ym, { epochs: 60 })
  const metaGbdt = trainGBDT(Xm, ym, { nTrees: 30 })

  const experiments = {}
  const configs = [
    ['Z_RANDOM', () => heuristicPreds(dev, 'Z_RANDOM')],
    ['B', () => heuristicPreds(dev, 'B')],
    ['C', () => heuristicPreds(dev, 'C')],
    [
      'LR_DIR_PRODUCT',
      () =>
        recipPred(dirDev, 'LR_DIR_PRODUCT', (r) => r.p_ab_lr * r.p_ba_lr)
    ],
    ['GBDT_DIR_PRODUCT', () => recipPred(dirDev, 'GBDT_DIR_PRODUCT', (r) => r.p_ab_gbdt * r.p_ba_gbdt)],
    ['RECIP_MIN', () => recipPred(dirDev, 'RECIP_MIN', (r) => Math.min(r.p_ab_lr, r.p_ba_lr))],
    ['RECIP_PRODUCT', () => recipPred(dirDev, 'RECIP_PRODUCT', (r) => r.p_ab_lr * r.p_ba_lr)],
    [
      'RECIP_GEOMEAN',
      () => recipPred(dirDev, 'RECIP_GEOMEAN', (r) => Math.sqrt(Math.max(0, r.p_ab_lr * r.p_ba_lr)))
    ],
    ['RECIP_HARMONIC', () => recipPred(dirDev, 'RECIP_HARMONIC', (r) => harmonic(r.p_ab_lr, r.p_ba_lr))],
    [
      'RECIP_ASYMMETRY_PENALTY',
      () =>
        recipPred(
          dirDev,
          'RECIP_ASYMMETRY_PENALTY',
          (r) => Math.min(r.p_ab_lr, r.p_ba_lr) * (1 - Math.abs(r.p_ab_lr - r.p_ba_lr))
        )
    ],
    [
      'RECIP_LOGIT_META',
      () =>
        recipPred(dirDev, 'RECIP_LOGIT_META', (r) => predictLogistic(metaLr, metaX(r)), 0.3)
    ],
    [
      'RECIP_GBDT_META',
      () => recipPred(dirDev, 'RECIP_GBDT_META', (r) => predictGBDT(metaGbdt, metaX(r)), 0.3)
    ]
  ]

  const scoreFns = {
    RECIP_MIN: (r) => Math.min(r.p_ab_lr, r.p_ba_lr),
    RECIP_PRODUCT: (r) => r.p_ab_lr * r.p_ba_lr,
    RECIP_GEOMEAN: (r) => Math.sqrt(Math.max(0, r.p_ab_lr * r.p_ba_lr)),
    RECIP_HARMONIC: (r) => harmonic(r.p_ab_lr, r.p_ba_lr),
    RECIP_ASYMMETRY_PENALTY: (r) =>
      Math.min(r.p_ab_lr, r.p_ba_lr) * (1 - Math.abs(r.p_ab_lr - r.p_ba_lr)),
    RECIP_LOGIT_META: (r) => predictLogistic(metaLr, metaX(r)),
    RECIP_GBDT_META: (r) => predictGBDT(metaGbdt, metaX(r)),
    LR_DIR_PRODUCT: (r) => r.p_ab_lr * r.p_ba_lr,
    GBDT_DIR_PRODUCT: (r) => r.p_ab_gbdt * r.p_ba_gbdt
  }

  console.log('Running', configs.length, 'DEV configs')
  for (const [name, fn] of configs) {
    const preds = fn()
    experiments[name] = evalPreds(dev, preds, name)
    console.log(name, 'AP', experiments[name].AVERAGE_PRECISION, 'MCC', experiments[name].MCC, 'P@1', experiments[name].P_at_1)
  }

  // Calibration provenance: fit Platt on the SAME raw scoreFn as bestRecip
  const recipNames = Object.keys(experiments).filter((k) => k.startsWith('RECIP_'))
  let bestRecip = recipNames[0]
  for (const k of recipNames) {
    if ((experiments[k].AVERAGE_PRECISION || 0) > (experiments[bestRecip].AVERAGE_PRECISION || 0)) bestRecip = k
  }
  const baseScoreFn = scoreFns[bestRecip]
  if (typeof baseScoreFn !== 'function') {
    throw new Error(`CALIBRATOR_BASE_MODEL_MATCHES_NAME: missing scoreFn for ${bestRecip}`)
  }
  const calScores = dirCal.map((r) => baseScoreFn(r))
  const calLabs = dirCal.map((r) => r.mutual)
  const platt = fitPlatt(calScores, calLabs)
  const calibratedName = `${bestRecip}_PLATT`
  const calibrated = recipPred(dirDev, calibratedName, (r) => applyPlatt(platt, baseScoreFn(r)), 0.35)
  const calArtifact = {
    base_model: bestRecip,
    calibrated_model_name: calibratedName,
    base_score_artifact_sha256: crypto
      .createHash('sha256')
      .update(calScores.map((s) => s.toFixed(6)).join(','))
      .digest('hex')
      .slice(0, 16),
    calibrator: platt,
    calibration_split: 'CALIBRATION',
    provenance_ok: calibratedName.startsWith(bestRecip + '_')
  }
  if (!calArtifact.provenance_ok) {
    throw new Error('CALIBRATOR_BASE_MODEL_MATCHES_NAME failed')
  }
  experiments[calibratedName] = evalPreds(dev, calibrated, calibratedName)
  experiments[calibratedName].calibration_provenance = calArtifact

  // Abstention sim on RECIP_MIN
  const minPreds = recipPred(dirDev, 'tmp', (r) => Math.min(r.p_ab_lr, r.p_ba_lr))
  const byQ = new Map()
  for (let i = 0; i < dev.length; i++) {
    const qk = `${dev[i].iid}::${dev[i].wave}`
    if (!byQ.has(qk)) byQ.set(qk, [])
    byQ.get(qk).push({
      score: minPreds[i].score,
      mutual: !!(dev[i].bilateral_outcome && dev[i].bilateral_outcome.mutual_match)
    })
  }
  const abstention = {}
  for (const th of [0.2, 0.3, 0.4, 0.5, 0.6]) {
    let cov = 0
    let hits = 0
    let forced = 0
    for (const cands of byQ.values()) {
      cands.sort((a, b) => b.score - a.score)
      if (cands[0].mutual) forced++
      if (cands[0].score >= th) {
        cov++
        if (cands[0].mutual) hits++
      }
    }
    abstention[`th_${th}`] = {
      coverage: cov / byQ.size,
      precision_when_recommend: cov ? hits / cov : null,
      always_top1_hit: forced / byQ.size
    }
  }

  // Champion selection
  const candidates = Object.entries(experiments)
  let champion = null
  const baselineAP = experiments.B?.AVERAGE_PRECISION || 0
  for (const [name, m] of candidates) {
    if (name.startsWith('Z_')) continue
    if (!champion) {
      champion = { name, metrics: m }
      continue
    }
    const apGain = (m.AVERAGE_PRECISION || 0) - (champion.metrics.AVERAGE_PRECISION || 0)
    const onesidedOk = (m.one_sided_FP || 0) <= (champion.metrics.one_sided_FP || 0) + 0.03
    const recallOk = (m.Recall || 0) >= 0.05 || (champion.metrics.Recall || 0) < 0.05
    if (apGain > 0.01 && onesidedOk && recallOk) champion = { name, metrics: m }
  }
  const clear =
    champion && (champion.metrics.AVERAGE_PRECISION || 0) > baselineAP + 0.02
      ? champion
      : { name: 'NO_CLEAR_CHAMPION', metrics: champion?.metrics || null, runner_up: champion?.name }

  const artifactHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ models: 'lrDir+gbdtDir+meta', run: RUN_ID }))
    .digest('hex')

  const championObj = {
    champion_display_name: clear.name,
    model_family: clear.name.startsWith('RECIP_') ? 'reciprocal_meta' : clear.name.startsWith('LR') ? 'logistic' : clear.name,
    model_variant: clear.name,
    artifact_path: `datasets/wefinally/eval/predictions/${RUN_ID}/`,
    artifact_sha256: artifactHash.slice(0, 16),
    feature_schema_sha256: crypto.createHash('sha256').update('v1.4-meta-10').digest('hex').slice(0, 16),
    calibrator: clear.name.includes('PLATT') ? platt : null,
    threshold: 0.35,
    training_split: 'TRAIN_CORE',
    calibration_split: 'CALIBRATION',
    selection_split: 'DEV',
    metrics: clear.metrics,
    mapping_note: 'Explicit name == predictor; no LR_MUTUAL alias ambiguity'
  }

  // Directional analysis
  const coefs = (models.lrDir.coefficients || []).slice().sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
  const quadrants = quadrantAnalysis(dirDev)

  // Directional P(A likes B) metrics
  const dirScores = dirDev.map((r) => r.p_ab_lr)
  const dirLabs = dirDev.map((r) => r.a_yes)
  const directionalOnly = {
    AUROC: aurocTieAware(dirScores, dirLabs),
    AVERAGE_PRECISION: averagePrecision(dirScores, dirLabs),
    prevalence: dirLabs.filter(Boolean).length / dirLabs.length
  }

  // Fresh sealed?
  const freshSealed = 'NO_FRESH_SEALED_AVAILABLE'
  // Prior sealed consumed; all waves already assigned in v1.3

  // Failure analysis for best recip — use same scoreFns map
  const bestPreds = recipPred(dirDev, bestRecip, scoreFns[bestRecip] || scoreFns.RECIP_PRODUCT)
  const failures = []
  for (let i = 0; i < dev.length; i++) {
    const pred = bestPreds[i].predict_mutual
    const truth = !!(dev[i].bilateral_outcome && dev[i].bilateral_outcome.mutual_match)
    const oneSided = dev[i].a_to_b_decision !== dev[i].b_to_a_decision
    if (pred && !truth) {
      failures.push({
        case_id: dev[i].case_id,
        type: oneSided ? 'ONE_SIDED_FALSE_POSITIVE' : 'FALSE_POSITIVE_MUTUAL',
        score: bestPreds[i].score
      })
    }
    if (!pred && truth) failures.push({ case_id: dev[i].case_id, type: 'FALSE_NEGATIVE_MUTUAL', score: bestPreds[i].score })
  }

  // HY3
  const hasCreds =
    !!(process.env.TCB_SECRET_ID || process.env.TENCENTCLOUD_SECRETID || process.env.SECRETID) &&
    !!(process.env.TCB_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY || process.env.SECRETKEY)
  const hy3 = hasCreds
    ? { status: 'SKIPPED_BUDGET_OFFLINE_FIRST', note: 'Creds present but offline metric/reciprocal work prioritized; no auto bulk hy3' }
    : { status: 'BLOCKED_BY_EXTERNAL_MANUAL_ACTION' }

  // Write review docs
  writeReview(
    'METRIC_AUDIT.md',
    [
      '# Metric Audit v1.4',
      '',
      '## Finding',
      'Previous `AUPRC` was **PR trapezoid area** with a spurious (0,1) start and **order-dependent ties**.',
      'Constant predictors therefore did not yield AUROC=0.5 / AP=prevalence.',
      '',
      '## Fix',
      '- `AUROC`: Mann–Whitney mid-rank (tie-aware) → constant ⇒ 0.5',
      '- `AVERAGE_PRECISION`: sklearn-style AP; constant ⇒ prevalence',
      '- `PR_AUC_TRAPEZOID`: separate name',
      '- `AUPRC` alias now means **AVERAGE_PRECISION**',
      '',
      'Module: `server/data/wefinally/eval/binaryRankingMetrics.js`',
      'Selfcheck: `selfcheck:match-eval-metrics-v14`',
      ''
    ].join('\n')
  )

  writeReview(
    'IDENTITY_RECONSTRUCTION_AUDIT.md',
    [
      '# Identity Reconstruction Audit',
      '',
      '```json',
      JSON.stringify(identityAudit, null, 2),
      '```',
      '',
      'Status: **IDENTITY_RECONSTRUCTION_UNCERTAIN** (fingerprint proxy; no native iid/pid).',
      'Ranking candidates are multi-partner under this proxy; collisions possible if two people share age/gender/prefs/hobbies in a wave.',
      ''
    ].join('\n')
  )

  writeReview(
    'DIRECTIONAL_ANALYSIS.md',
    [
      '# Directional Analysis',
      '',
      '## Why directional LR worked',
      'Subject-oriented Speed Dating rows provide declared preference weights + partner age/prefs + interests_correlate (pre-match).',
      'LR learns P(A likes B) from alignment features; mutual labels are rarer and harder.',
      '',
      '## Top |coefficients|',
      '```json',
      JSON.stringify(coefs.slice(0, 12), null, 2),
      '```',
      '',
      '## Directional-only DEV (P(A likes B))',
      '```json',
      JSON.stringify(directionalOnly, null, 2),
      '```',
      '',
      '## Score distributions by gold quadrant (product of p_ab,p_ba)',
      '```json',
      JSON.stringify(quadrants, null, 2),
      '```',
      ''
    ].join('\n')
  )

  writeReview(
    'RECIPROCAL_EXPERIMENTS.md',
    [
      '# Reciprocal Experiments',
      '',
      '```json',
      JSON.stringify(experiments, null, 2),
      '```',
      '',
      `Best reciprocal by AP: **${bestRecip}**`,
      `Champion decision: **${championObj.champion_display_name}**`,
      ''
    ].join('\n')
  )

  writeReview(
    'CALIBRATION_AND_ABSTENTION.md',
    [
      '# Calibration and Abstention',
      '',
      'compatibility_score ≠ mutual_interest_probability.',
      '',
      '## Calibration provenance (FIXED review-02)',
      '```json',
      JSON.stringify(calArtifact, null, 2),
      '```',
      '',
      '## Abstention (RECIP_MIN top-1)',
      '```json',
      JSON.stringify(abstention, null, 2),
      '```',
      ''
    ].join('\n')
  )

  writeReview(
    'HY3_STATUS.md',
    ['# HY3 Status', '', '```json', JSON.stringify(hy3, null, 2), '```', ''].join('\n')
  )

  writeReview(
    'FAILURE_ANALYSIS.md',
    [
      `# Failure Analysis (${bestRecip} on DEV)`,
      '',
      `Total flagged: ${failures.length}`,
      '',
      '```json',
      JSON.stringify(
        {
          by_type: failures.reduce((o, f) => {
            o[f.type] = (o[f.type] || 0) + 1
            return o
          }, {}),
          sample: failures.slice(0, 20)
        },
        null,
        2
      ),
      '```',
      ''
    ].join('\n')
  )

  writeReview(
    'FINAL_EVALUATION.md',
    [
      '# Final Evaluation (DEV only)',
      '',
      `- Fresh sealed: **${freshSealed}**`,
      `- Prior sealed: CONSUMED — not retuned`,
      `- Champion: **${championObj.champion_display_name}**`,
      `- RAG: RAG_NOT_TESTED_MEANINGFULLY`,
      `- Production: KEEP_CURRENT_PRODUCTION`,
      '',
      'Gains vs B must be interpreted with bootstrap caution; many deltas are small.',
      ''
    ].join('\n')
  )

  const metricsJson = { experiments, champion: championObj, directionalOnly, abstention, quadrants }
  writeReview('METRICS.json', JSON.stringify(metricsJson, null, 2))
  writeReview('EXPERIMENTS.json', JSON.stringify({ configs: configs.map((c) => c[0]), results: experiments }, null, 2))
  writeReview(
    'FAILURE_SUMMARY.json',
    JSON.stringify(
      {
        model: bestRecip,
        counts: failures.reduce((o, f) => {
          o[f.type] = (o[f.type] || 0) + 1
          return o
        }, {})
      },
      null,
      2
    )
  )

  const queryStats = experiments.C?.query_stats || rebuilt.stats

  writeReview(
    'README.md',
    [
      '# Match Reciprocal v1.4 — Review Bundle',
      '',
      '## Answers',
      '',
      '1. **Was AUROC/AUPRC wrong?** Yes — trapezoid PR mislabeled as AUPRC; ties order-dependent; constants not 0.5/prevalence.',
      '2. **Fixed?** Tie-aware AUROC + Average Precision; PR_AUC_TRAPEZOID renamed separately.',
      `3. **Identity trustworthy?** ${identityAudit.status} — fingerprint reconstruction; mark IDENTITY_RECONSTRUCTION_UNCERTAIN.`,
      `4. **Multiple real encounters?** Candidate median=${queryStats.median}; with_ge5=${queryStats.with_ge5}.`,
      '5. **Excluded post-interaction?** like, *_partner, attractive_o, decision/match — see feature timing audit.',
      '6. **Why directional LR?** Learns P(A→B) from prefs/alignment; mutual is harder/rarer.',
      `7. **Best reciprocal?** ${bestRecip}`,
      '8. **Asymmetry penalty?** See RECIP_ASYMMETRY_PENALTY vs MIN/PRODUCT in METRICS.json.',
      '9. **Calibration?** Platt fitted on CAL; keep score≠probability.',
      '10. **Abstention?** Higher thresholds raise precision_when_recommend, lower coverage.',
      `11. **HY3?** ${hy3.status}`,
      '12. **HY3 help?** N/A',
      '13. **RAG?** RAG_NOT_TESTED_MEANINGFULLY',
      `14. **DEV champion?** ${championObj.champion_display_name}`,
      '15. **Statistically meaningful?** Mostly small AP deltas — treat as exploratory.',
      `16. **Fresh sealed?** ${freshSealed}`,
      '17. **Unproven?** Native iid/pid identity; production transfer; live hy3.',
      '18. **Production?** KEEP_CURRENT_PRODUCTION',
      ''
    ].join('\n')
  )

  const runManifest = {
    run_id: RUN_ID,
    base_commit: '073f0973d4216af1f3fb882478613865438742d6',
    branch: 'experiment/match-reciprocal-v1.4',
    final_commit: null,
    source_status: 'speed-dating REVIEW_REQUIRED sandbox rag=false',
    dataset_counts: { raw: rows.length, encounters: rebuilt.encounterRows.length },
    split_counts: manifest.counts,
    integrity_status: 'PENDING_TESTS',
    metric_audit_status: 'FIXED',
    identity_audit_status: 'UNCERTAIN',
    candidate_query_stats: queryStats,
    experiment_count: configs.length,
    champion: championObj,
    baseline_metrics: { B: experiments.B, C: experiments.C },
    hy3_status: hy3.status,
    rag_status: 'RAG_NOT_TESTED_MEANINGFULLY',
    fresh_sealed_status: freshSealed,
    tests: {},
    blockers: [hy3.status === 'BLOCKED_BY_EXTERNAL_MANUAL_ACTION' ? 'HY3_CREDS' : null].filter(Boolean),
    generated_at: new Date().toISOString()
  }
  writeReview('RUN_MANIFEST.json', JSON.stringify(runManifest, null, 2))

  ensureDir(PATHS.eval)
  fs.writeFileSync(path.join(PATHS.eval, 'match-v1.4-latest.json'), JSON.stringify({ runManifest, experiments }, null, 2))

  console.log('Champion:', championObj.champion_display_name)
  console.log('Review bundle:', REVIEW)
  return { championObj, experiments, identityAudit, hy3, runManifest }
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

module.exports = { main }
