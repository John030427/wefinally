'use strict'

const crypto = require('crypto')

const FORBIDDEN_FEATURE_KEYS = new Set([
  'a_to_b_decision',
  'b_to_a_decision',
  'bilateral_outcome',
  'match',
  'dec',
  'dec_o',
  'decision',
  'decision_o',
  'mutual_match',
  'ground_truth',
  'ground_truth_type',
  'label',
  'gold',
  'target',
  'accepted',
  'positive',
  'is_match',
  '__gold_canary',
  'a_decision',
  'b_decision'
])

function stripForbidden(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(stripForbidden)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_FEATURE_KEYS.has(k)) continue
    out[k] = typeof v === 'object' && v !== null ? stripForbidden(v) : v
  }
  return out
}

function guardProxy(target, path = '') {
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'symbol') return t[prop]
      const key = String(prop)
      if (FORBIDDEN_FEATURE_KEYS.has(key)) {
        throw new Error(`GOLD_LABEL_ACCESS_FORBIDDEN: ${path}${key}`)
      }
      const val = t[prop]
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return guardProxy(val, `${path}${key}.`)
      }
      return val
    },
    has(t, prop) {
      if (FORBIDDEN_FEATURE_KEYS.has(String(prop))) return false
      return prop in t
    }
  })
}

function buildFeatureView(caseObj) {
  const personA = stripForbidden(caseObj.person_a || {})
  const personB = stripForbidden(caseObj.person_b || {})
  // Drop sensitive fairness-only and post-interaction blobs if present on case
  const pre = stripForbidden(caseObj.pre_date_information || {})
  const aPref = stripForbidden(caseObj.a_preferences || {})
  const bPref = stripForbidden(caseObj.b_preferences || {})
  const dirA = directionalCompat(aPref, personB, pre)
  const dirB = directionalCompat(bPref, personA, pre)
  const bilateral = {
    min: Math.min(dirA, dirB),
    mean: (dirA + dirB) / 2,
    geom: Math.sqrt(Math.max(0, dirA) * Math.max(0, dirB)),
    gap: Math.abs(dirA - dirB),
    product: dirA * dirB
  }
  const raw = {
    case_id: caseObj.case_id,
    participant_a_pseudo_id: personA.id || caseObj.person_a?.id || caseObj.iid || null,
    participant_b_pseudo_id: personB.id || caseObj.person_b?.id || caseObj.pid || null,
    iid: caseObj.iid || personA.id || null,
    pid: caseObj.pid || personB.id || null,
    person_a: personA,
    person_b: personB,
    a_preferences: aPref,
    b_preferences: bPref,
    pre_date_information: pre,
    directional: { a_to_b: dirA, b_to_a: dirB },
    bilateral_features: bilateral,
    wave: caseObj.wave != null ? caseObj.wave : personA.wave || null,
    entity_key: caseObj.entity_key || null,
    source_id: caseObj.source?.source_id || null,
    encounter_metadata: {
      sandbox: !!caseObj.sandbox,
      evaluation_only: !!caseObj.evaluation_only
    }
  }
  return guardProxy(raw)
}

function directionalCompat(prefs, otherPerson, pre) {
  let s = 0.5
  const age = Number(otherPerson && otherPerson.age)
  const dAge = Number(pre && pre.d_age)
  if (Number.isFinite(dAge)) s += Math.max(0, 0.15 - Math.abs(dAge) * 0.01)
  else if (Number.isFinite(age)) s += 0.05
  const prefVals = Object.values(prefs || {}).filter((v) => typeof v === 'number')
  if (prefVals.length) {
    const mean = prefVals.reduce((a, b) => a + b, 0) / prefVals.length
    s += (mean / 100 - 0.2) * 0.2
  }
  const interests = (otherPerson && otherPerson.interests) || {}
  const iv = Object.values(interests).filter((v) => typeof v === 'number')
  if (iv.length) s += (iv.reduce((a, b) => a + b, 0) / iv.length / 10 - 0.5) * 0.1
  const corr = Number(pre && pre.interests_correlate)
  if (Number.isFinite(corr)) s += corr * 0.15
  return Math.max(0, Math.min(1, s))
}

function buildGoldView(caseObj, canary) {
  const a = !!caseObj.a_to_b_decision
  const b = !!caseObj.b_to_a_decision
  const mutual =
    !!(caseObj.bilateral_outcome && (caseObj.bilateral_outcome.mutual_match || caseObj.bilateral_outcome.mutual_message)) ||
    (a && b)
  return {
    case_id: caseObj.case_id,
    a_decision: a,
    b_decision: b,
    mutual_match: mutual,
    one_sided: a !== b,
    __gold_canary: canary
  }
}

function makeCanary(seed = '') {
  return crypto.createHash('sha256').update(`canary:${seed}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 24)
}

function assertNoGoldInPrediction(pred, canary) {
  const blob = JSON.stringify(pred)
  for (const k of FORBIDDEN_FEATURE_KEYS) {
    if (new RegExp(`"${k}"\\s*:`).test(blob) && k !== 'case_id') {
      // allow only case_id; reject gold-like keys as object keys
      if (k === 'source_id') continue
    }
  }
  if (canary && blob.includes(canary)) {
    throw new Error('GOLD_LABEL_ACCESS_FORBIDDEN: canary leaked into prediction')
  }
  if (/"a_to_b_decision"|"b_to_a_decision"|"mutual_match"|"__gold_canary"|"bilateral_outcome"/.test(blob)) {
    throw new Error('GOLD_LABEL_ACCESS_FORBIDDEN: gold field in prediction artifact')
  }
}

module.exports = {
  FORBIDDEN_FEATURE_KEYS,
  buildFeatureView,
  buildGoldView,
  makeCanary,
  guardProxy,
  stripForbidden,
  assertNoGoldInPrediction,
  directionalCompat
}
