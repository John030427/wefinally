'use strict'

/**
 * Label-blind PRE_MATCH feature view for native directional rows (v1.5.1).
 * Never exposes gold decisions or post-interaction partner ratings.
 */

const GOLD_OR_POST = new Set([
  'dec',
  'dec_o',
  'decision',
  'decision_o',
  'match',
  'mutual_match',
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

const PRE_MATCH_ALLOWED = new Set([
  'wave',
  'iid',
  'pid',
  'gender',
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
  // synthetic fixture fields
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

/**
 * @param {object} directedRow - import row with .raw and ids
 * @returns {object} feature view (no gold)
 */
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
    if (GOLD_OR_POST.has(lk) || GOLD_OR_POST.has(key)) {
      excluded.push(key)
      continue
    }
    if (SENSITIVE_FAIRNESS_ONLY.has(lk)) {
      fairness_only[key] = v
      continue
    }
    if (!PRE_MATCH_ALLOWED.has(lk) && !PRE_MATCH_ALLOWED.has(key)) {
      // unknown => exclude
      excluded.push(key)
      continue
    }
    const n = num(v)
    features[key] = n != null ? n : String(v)
  }

  const view = {
    case_id: `native_${directedRow.wave}_${directedRow.iid}_${directedRow.pid}`,
    wave: directedRow.wave,
    iid: directedRow.iid,
    pid: directedRow.pid,
    directed_key: directedRow.directed_key,
    features,
    fairness_only_present: Object.keys(fairness_only).length > 0,
    excluded_fields: excluded,
    gold_present: false
  }

  return new Proxy(view, {
    get(t, prop) {
      if (typeof prop === 'symbol') return t[prop]
      const key = String(prop)
      if (
        GOLD_OR_POST.has(key) ||
        key === 'a_decision' ||
        key === 'b_decision' ||
        key === 'mutual_match' ||
        key === 'raw'
      ) {
        throw new Error(`GOLD_LABEL_ACCESS_FORBIDDEN: ${key}`)
      }
      return t[prop]
    }
  })
}

/**
 * Deterministic label-blind scorer from PRE_MATCH features only.
 * Not a product model — integrity / synthetic smoke only.
 */
function trivialLabelBlindDirectionalScorer(featureView) {
  const f = featureView.features || {}
  const age = num(f.age) ?? 30
  const ageO = num(f.age_o) ?? age
  const prefA = num(f.pref_attractive) ?? num(f.attractive_important) ?? 50
  const prefS = num(f.pref_sincere) ?? num(f.sincere_important) ?? 50
  const hobby = (num(f.hobby_sports) ?? num(f.sports) ?? 5) + (num(f.hobby_music) ?? num(f.music) ?? 5)
  const selfA = num(f.self_attractive) ?? num(f.attractive) ?? 5
  const dAge = Math.abs(age - ageO)
  let s =
    0.35 +
    (prefA / 100) * 0.15 +
    (prefS / 100) * 0.1 +
    (hobby / 20) * 0.15 +
    (selfA / 10) * 0.1 -
    Math.min(0.2, dAge * 0.01)
  return Math.max(0.01, Math.min(0.99, s))
}

function assertNoGoldInPrediction(pred) {
  const s = JSON.stringify(pred)
  for (const g of ['a_decision', 'b_decision', 'mutual_match', '"dec"', 'decision_o']) {
    if (s.includes(g) && !s.includes('gold_present')) {
      // allow documenting absence
    }
  }
  if (pred && (pred.a_decision != null || pred.dec != null || pred.match != null)) {
    throw new Error('NO_GOLD_DERIVED_NATIVE_PREDICTION')
  }
  return true
}

module.exports = {
  buildNativeDirectionalFeatureView,
  trivialLabelBlindDirectionalScorer,
  assertNoGoldInPrediction,
  GOLD_OR_POST,
  PRE_MATCH_ALLOWED,
  SENSITIVE_FAIRNESS_ONLY
}
