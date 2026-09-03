'use strict'

/**
 * Label-blind PRE_MATCH feature view for native directional rows (v1.5.2).
 * Identifiers (iid/pid/wave) are metadata only — never model features.
 */

const FORBIDDEN_PRED_KEYS = new Set([
  'dec',
  'dec_o',
  'decision',
  'decision_o',
  'match',
  'mutual_match',
  'a_decision',
  'b_decision',
  'gold',
  'ground_truth',
  'label',
  '_eval_only',
  '__gold_canary'
])

const GOLD_OR_POST = new Set([
  ...FORBIDDEN_PRED_KEYS,
  'like',
  'guess_prob_liked',
  'prob',
  'met',
  'attractive_o',
  'sinsere_o',
  'sincere_o',
  'intelligence_o',
  'funny_o',
  'ambitous_o',
  'ambitious_o',
  'shared_interests_o',
  'attractive_partner',
  'sincere_partner',
  'intelligence_partner',
  'funny_partner',
  'ambition_partner',
  'shared_interests_partner',
  'attr',
  'sinc',
  'intel',
  'fun',
  'amb',
  'shar',
  'attr_o',
  'sinc_o',
  'intel_o',
  'fun_o',
  'amb_o',
  'shar_o'
])

const SENSITIVE_FAIRNESS_ONLY = new Set([
  'race',
  'race_o',
  'samerace',
  'importance_same_race',
  'importance_same_religion',
  'religion'
])

/** Metadata only — never copied into features for scoring */
const IDENTITY_METADATA = new Set([
  'iid',
  'pid',
  'wave',
  'directed_key',
  'reverse_key',
  'row_index',
  'id',
  'partner'
])

const PRE_MATCH_FEATURE_ALLOWED = new Set([
  'gender',
  'order',
  'round',
  'date',
  'ra', // research-assistant photo attractiveness (Bhargava/Fisman); PRE relative to subject decision
  'age',
  'age_o',
  'd_age',
  'field',
  'attractive_important',
  'sincere_important',
  'intellicence_important',
  'intelligence_important',
  'funny_important',
  'ambtition_important',
  'ambition_important',
  'shared_interests_important',
  'pref_o_attractive',
  'pref_o_sincere',
  'pref_o_intelligence',
  'pref_o_funny',
  'pref_o_ambitious',
  'pref_o_shared_interests',
  'attractive',
  'sincere',
  'intelligence',
  'funny',
  'ambition',
  'sports',
  'tvsports',
  'exercise',
  'dining',
  'museums',
  'art',
  'hiking',
  'gaming',
  'clubbing',
  'reading',
  'tv',
  'theater',
  'movies',
  'concerts',
  'music',
  'shopping',
  'yoga',
  'interests_correlate',
  'expected_happy_with_sd_people',
  'expected_num_interested_in_me',
  'expected_num_matches',
  'pref_attractive',
  'pref_sincere',
  'hobby_sports',
  'hobby_music',
  'self_attractive'
])

function num(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function buildNativeDirectionalFeatureView(directedRow) {
  if (!directedRow || !directedRow.raw) {
    throw new Error('TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW')
  }
  if (!directedRow.iid || !directedRow.pid || directedRow.wave == null) {
    throw new Error('TRUE_REVERSE_REQUIRES_NATIVE_SUBJECT_ROW: missing iid/pid/wave')
  }
  const raw = directedRow.raw
  const features = {}
  const fairness_only = {}
  const excluded = []

  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim()
    const lk = key.toLowerCase()
    if (IDENTITY_METADATA.has(lk) || IDENTITY_METADATA.has(key)) {
      excluded.push(key)
      continue
    }
    if (GOLD_OR_POST.has(lk) || GOLD_OR_POST.has(key)) {
      excluded.push(key)
      continue
    }
    if (SENSITIVE_FAIRNESS_ONLY.has(lk)) {
      fairness_only[key] = v
      continue
    }
    if (!PRE_MATCH_FEATURE_ALLOWED.has(lk) && !PRE_MATCH_FEATURE_ALLOWED.has(key)) {
      excluded.push(key)
      continue
    }
    const n = num(v)
    features[key] = n != null ? n : String(v)
  }

  // Hard exclude identity keys if somehow present
  for (const id of ['iid', 'pid', 'wave']) {
    if (Object.prototype.hasOwnProperty.call(features, id)) delete features[id]
  }

  const metadata = {
    wave: directedRow.wave,
    iid: directedRow.iid,
    pid: directedRow.pid,
    directed_key: directedRow.directed_key
  }

  const view = {
    case_id: `native_${directedRow.wave}_${directedRow.iid}_${directedRow.pid}`,
    metadata,
    features,
    fairness_only_present: Object.keys(fairness_only).length > 0,
    excluded_fields: excluded,
    gold_present: false
  }

  return new Proxy(view, {
    get(t, prop) {
      if (typeof prop === 'symbol') return t[prop]
      const key = String(prop)
      if (FORBIDDEN_PRED_KEYS.has(key) || key === 'raw') {
        throw new Error(`GOLD_LABEL_ACCESS_FORBIDDEN: ${key}`)
      }
      // Block top-level identity masquerading as features
      if (key === 'iid' || key === 'pid' || key === 'wave') {
        throw new Error(`MODEL_FEATURE_IDENTITY_FORBIDDEN: use metadata.${key}`)
      }
      const val = t[prop]
      if (key === 'features' && val && typeof val === 'object') {
        return new Proxy(val, {
          get(ft, fp) {
            if (typeof fp === 'symbol') return ft[fp]
            const fk = String(fp)
            if (FORBIDDEN_PRED_KEYS.has(fk) || IDENTITY_METADATA.has(fk)) {
              throw new Error(`GOLD_LABEL_ACCESS_FORBIDDEN: features.${fk}`)
            }
            return ft[fp]
          },
          has(ft, fp) {
            const fk = String(fp)
            if (FORBIDDEN_PRED_KEYS.has(fk) || IDENTITY_METADATA.has(fk)) return false
            return fp in ft
          }
        })
      }
      return val
    },
    has(t, prop) {
      const key = String(prop)
      if (FORBIDDEN_PRED_KEYS.has(key) || key === 'raw') return false
      return prop in t
    }
  })
}

function trivialLabelBlindDirectionalScorer(modelInput) {
  // Accepts ONLY model input: { features } — never full FeatureView with metadata
  const f = (modelInput && modelInput.features) || {}
  const age = num(f.age) ?? 30
  const ageO = num(f.age_o) ?? age
  const prefA = num(f.pref_attractive) ?? num(f.attractive_important) ?? 50
  const prefS = num(f.pref_sincere) ?? num(f.sincere_important) ?? 50
  const hobby = (num(f.hobby_sports) ?? num(f.sports) ?? 5) + (num(f.hobby_music) ?? num(f.music) ?? 5)
  const selfA = num(f.self_attractive) ?? num(f.attractive) ?? 5
  const ra = num(f.RA) ?? num(f.ra)
  const order = num(f.order)
  const gender = num(f.gender)
  const dAge = Math.abs(age - ageO)
  let s =
    0.35 +
    (prefA / 100) * 0.15 +
    (prefS / 100) * 0.1 +
    (hobby / 20) * 0.15 +
    (selfA / 10) * 0.1 -
    Math.min(0.2, dAge * 0.01)
  // Sparse native Bhargava subset: use RA / order / gender when richer prefs absent
  if (ra != null) s += (ra / 10) * 0.2 - 0.1
  if (order != null) s += Math.min(0.05, order * 0.002)
  if (gender != null) s += gender * 0.01
  return Math.max(0.01, Math.min(0.99, s))
}

const MODEL_INPUT_FORBIDDEN = new Set([
  ...FORBIDDEN_PRED_KEYS,
  ...IDENTITY_METADATA,
  'metadata',
  'iid',
  'pid',
  'wave',
  'directed_key',
  'reverse_key',
  'row_index',
  'case_id',
  'raw',
  'excluded_fields',
  'fairness_only_present',
  'gold_present'
])

/**
 * Strict model input: ONLY { features }. No metadata / identity / gold.
 */
function buildNativeModelInput(featureView) {
  const src = featureView && featureView.features ? featureView.features : {}
  const features = {}
  for (const [k, v] of Object.entries(src)) {
    const lk = String(k).toLowerCase()
    if (MODEL_INPUT_FORBIDDEN.has(k) || MODEL_INPUT_FORBIDDEN.has(lk) || IDENTITY_METADATA.has(lk)) {
      continue
    }
    features[k] = typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v
  }
  const modelInput = { features }
  assertModelInputClean(modelInput)
  return new Proxy(modelInput, {
    get(t, prop) {
      if (typeof prop === 'symbol') return t[prop]
      const key = String(prop)
      if (key === 'features') {
        return new Proxy(t.features, {
          get(ft, fp) {
            if (typeof fp === 'symbol') return ft[fp]
            const fk = String(fp)
            if (MODEL_INPUT_FORBIDDEN.has(fk) || IDENTITY_METADATA.has(fk)) {
              throw new Error(`MODEL_INPUT_IDENTITY_FORBIDDEN: features.${fk}`)
            }
            return ft[fp]
          },
          has(ft, fp) {
            const fk = String(fp)
            if (MODEL_INPUT_FORBIDDEN.has(fk) || IDENTITY_METADATA.has(fk)) return false
            return fp in ft
          }
        })
      }
      if (MODEL_INPUT_FORBIDDEN.has(key) || key === 'metadata') {
        throw new Error(`MODEL_INPUT_IDENTITY_FORBIDDEN: ${key}`)
      }
      return undefined
    },
    has(t, prop) {
      return String(prop) === 'features'
    },
    ownKeys() {
      return ['features']
    },
    getOwnPropertyDescriptor(t, prop) {
      if (prop === 'features') {
        return { configurable: true, enumerable: true, writable: false, value: t.features }
      }
      return undefined
    }
  })
}

function collectModelInputForbidden(obj, path = '', found = []) {
  if (obj == null || typeof obj !== 'object') return found
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectModelInputForbidden(v, `${path}[${i}]`, found))
    return found
  }
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase()
    if (k !== 'features' && (MODEL_INPUT_FORBIDDEN.has(k) || MODEL_INPUT_FORBIDDEN.has(lk))) {
      found.push(path ? `${path}.${k}` : k)
    }
    if (k === 'features' && v && typeof v === 'object') {
      for (const fk of Object.keys(v)) {
        if (MODEL_INPUT_FORBIDDEN.has(fk) || IDENTITY_METADATA.has(fk.toLowerCase())) {
          found.push(`features.${fk}`)
        }
      }
    } else if (k !== 'features') {
      collectModelInputForbidden(v, path ? `${path}.${k}` : k, found)
    }
  }
  return found
}

function assertModelInputClean(modelInput) {
  const hits = collectModelInputForbidden(modelInput)
  if (hits.length) {
    throw new Error(`MODEL_INPUT_CONTAINS_IDENTITY: ${hits.join(',')}`)
  }
  if (!modelInput || typeof modelInput.features !== 'object') {
    throw new Error('MODEL_INPUT_REQUIRES_FEATURES')
  }
  return true
}

function collectForbiddenKeys(obj, path = '', found = []) {
  if (obj == null || typeof obj !== 'object') return found
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectForbiddenKeys(v, `${path}[${i}]`, found))
    return found
  }
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase()
    if (FORBIDDEN_PRED_KEYS.has(k) || FORBIDDEN_PRED_KEYS.has(lk)) {
      found.push(path ? `${path}.${k}` : k)
    }
    collectForbiddenKeys(v, path ? `${path}.${k}` : k, found)
  }
  return found
}

function assertNoGoldInPrediction(pred) {
  const hits = collectForbiddenKeys(pred)
  if (hits.length) {
    throw new Error(`NO_GOLD_IN_PREDICTION_ARTIFACT: ${hits.join(',')}`)
  }
  return true
}

module.exports = {
  buildNativeDirectionalFeatureView,
  buildNativeModelInput,
  trivialLabelBlindDirectionalScorer,
  assertNoGoldInPrediction,
  assertModelInputClean,
  collectForbiddenKeys,
  collectModelInputForbidden,
  FORBIDDEN_PRED_KEYS,
  MODEL_INPUT_FORBIDDEN,
  GOLD_OR_POST,
  PRE_MATCH_FEATURE_ALLOWED,
  PRE_MATCH_ALLOWED: PRE_MATCH_FEATURE_ALLOWED,
  IDENTITY_METADATA,
  SENSITIVE_FAIRNESS_ONLY
}
