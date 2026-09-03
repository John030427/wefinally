/**
 * Bilateral needs ↔ offers matching.
 * A→B and B→A are scored independently, then combined with min-sensitive aggregation.
 * AI_INFERRED low-confidence items never act as hard gates.
 */

const { SOURCE_KINDS } = require('./aiMatchProfile')
const { identityOverlapScore } = require('./userIdentityTags')

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function harmonicMean(aValue, bValue) {
  const a = Number(aValue || 0)
  const b = Number(bValue || 0)
  if (a <= 0 || b <= 0) return 0
  return round2((2 * a * b) / (a + b))
}

/** Extra penalty when one side is strong and the other is weak */
function bilateralAggregate(aToB, bToA) {
  const a = Number(aToB || 0)
  const b = Number(bToA || 0)
  const harmonic = harmonicMean(a, b)
  const minSide = Math.min(a, b)
  // Min-sensitive: pull toward weaker side so 95/40 cannot rank like 95/88
  return round2(0.65 * harmonic + 0.35 * minSide)
}

function textTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function itemMatchScore(need, offers = []) {
  if (!need || !need.value) return null
  if (need.kind === SOURCE_KINDS.AI_INFERRED && Number(need.confidence || 0) < 0.7) {
    return null
  }
  const needTokens = textTokens(need.value)
  if (!needTokens.length) return null
  let best = 0
  for (const offer of offers) {
    if (!offer || !offer.value) continue
    if (offer.kind === SOURCE_KINDS.AI_INFERRED && Number(offer.confidence || 0) < 0.55) continue
    const offerTokens = textTokens(offer.value)
    if (!offerTokens.length) continue
    const shared = needTokens.filter((token) => offerTokens.some((item) => item.includes(token) || token.includes(item)))
    const ratio = shared.length / needTokens.length
    const confidenceBoost = Math.min(1, Number(need.confidence || 0.7) * Number(offer.confidence || 0.7))
    best = Math.max(best, ratio * 100 * confidenceBoost)
  }
  return round2(best)
}

function scoreNeedsAgainstOffers(needs = [], offers = []) {
  const scored = []
  let total = 0
  let weight = 0
  for (const need of needs) {
    const score = itemMatchScore(need, offers)
    if (score == null) continue
    const itemWeight = need.kind === SOURCE_KINDS.USER_DECLARED ? 1.2 : 0.7
    scored.push({ value: need.value, score, kind: need.kind })
    total += score * itemWeight
    weight += itemWeight
  }
  if (!weight) {
    return { score: null, compared: false, items: scored }
  }
  return { score: round2(total / weight), compared: true, items: scored }
}

function scoreOneWay(viewerProfile = {}, candidateProfile = {}) {
  const needs = viewerProfile.needs || []
  const offers = candidateProfile.can_offer || []
  const dealbreakers = viewerProfile.dealbreakers || []

  const needsFit = scoreNeedsAgainstOffers(needs, offers)
  const dealFit = scoreNeedsAgainstOffers(
    dealbreakers.map((item) => ({
      ...item,
      value: String(item.value || '').replace(/^避免：/, '')
    })),
    // dealbreakers succeed when candidate does NOT obviously offer the forbidden thing
    offers.map((item) => ({ ...item, value: `兼容_${item.value}` }))
  )

  const identity = identityOverlapScore(
    viewerProfile.identities && viewerProfile.identities.tags,
    candidateProfile.identities && candidateProfile.identities.tags
  )

  const parts = []
  if (needsFit.compared) parts.push({ key: 'needs_offers', score: needsFit.score, weight: 0.7 })
  if (identity.compared) parts.push({ key: 'identity_context', score: identity.score, weight: 0.3 })

  if (!parts.length) {
    return {
      score: null,
      compared: false,
      needs_fit: needsFit,
      identity,
      dealbreakers_checked: dealFit.items.length
    }
  }

  const weighted = parts.reduce((sum, part) => sum + part.score * part.weight, 0)
  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0)
  return {
    score: round2(weighted / weightSum),
    compared: true,
    needs_fit: needsFit,
    identity,
    dealbreakers_checked: dealFit.items.length,
    parts
  }
}

function scoreBilateralProfiles(profileA = {}, profileB = {}) {
  const aToB = scoreOneWay(profileA, profileB)
  const bToA = scoreOneWay(profileB, profileA)
  const mutual = (aToB.compared && bToA.compared)
    ? bilateralAggregate(aToB.score, bToA.score)
    : null
  return {
    a_to_b: aToB,
    b_to_a: bToA,
    mutual_score: mutual,
    aggregation: 'min_sensitive_harmonic',
    asymmetric: aToB.compared && bToA.compared
      ? Math.abs(Number(aToB.score) - Number(bToA.score)) >= 25
      : false
  }
}

/**
 * Blend structured mutual score with bilateral needs score.
 * Deterministic; safe when AI profiles missing.
 */
function blendStructuredWithBilateral(structuredMutual, bilateral, options = {}) {
  const structured = Number(structuredMutual)
  if (!Number.isFinite(structured)) return structuredMutual
  if (!bilateral || bilateral.mutual_score == null) return round2(structured)
  const weight = Math.min(0.35, Math.max(0.15, Number(options.bilateralWeight || 0.25)))
  return round2((1 - weight) * structured + weight * Number(bilateral.mutual_score))
}

module.exports = {
  harmonicMean,
  bilateralAggregate,
  scoreNeedsAgainstOffers,
  scoreOneWay,
  scoreBilateralProfiles,
  blendStructuredWithBilateral
}
