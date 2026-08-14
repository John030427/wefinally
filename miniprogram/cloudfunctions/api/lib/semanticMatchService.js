const {
  buildSemanticRerankRequest,
  validateSemanticRerankResponse,
  mergeSemanticRerank
} = require('./matchSemanticRerank')
const { rerankMutualMatchCandidates } = require('./deepseek')
const { compileIntentProfile } = require('./intentProfile')

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (err) { return null }
}

function intentFor(user, setting) {
  return parseJson(setting && setting.intent_profile_json) || compileIntentProfile(Object.assign({}, user || {}, setting || {}, {
    mode: 'automatic'
  }))
}

async function semanticRerank(ranked, user, settingsByUserId) {
  const eligible = ranked.filter((item) => item.quality && item.quality.pass === true)
  if (!eligible.length) return { applied: false, reason: 'no_candidates', ranked }
  try {
    const currentSetting = settingsByUserId[String(user.id)] || {}
    const request = buildSemanticRerankRequest({
      topK: 10,
      candidates: eligible.map((item) => {
        const partnerSetting = settingsByUserId[String(item.candidate.id)] || {}
        return {
          internalUserId: item.candidate.id,
          quality: item.quality,
          mutualScore: item.mutualScore,
          viewSimilarity: item.viewSimilarity,
          scoreA: item.scoreA,
          scoreB: item.scoreB,
          intentA: intentFor(user, currentSetting),
          intentB: intentFor(item.candidate, partnerSetting),
          supplementA: currentSetting.other_requirements,
          supplementB: partnerSetting.other_requirements
        }
      })
    })
    const remote = await rerankMutualMatchCandidates(request)
    if (!remote || !remote.enabled || !remote.response) return { applied: false, reason: 'disabled', model: '', ranked }
    const validated = validateSemanticRerankResponse(remote.response, request)
    return Object.assign(
      mergeSemanticRerank(ranked, validated, { minConfidence: 0.65, maxWeight: 0.2 }),
      { model: remote.model || '' }
    )
  } catch (err) {
    return { applied: false, reason: 'fallback', model: '', ranked }
  }
}

function intentMatchGate(setting) {
  const profile = parseJson(setting && setting.intent_profile_json)
  if (!profile || !profile.mode) return null
  if (profile.mode === 'confirm' && !setting.intent_profile_confirmed_at) {
    return { code: 409, message: '请先确认 AI 对你的理解后再开始匹配', clarification_questions: profile.clarification_questions || [] }
  }
  if (Array.isArray(profile.contradictions) && profile.contradictions.length) {
    return { code: 409, message: '你的匹配补充存在需要先厘清的矛盾，请修改后再试', clarification_questions: profile.clarification_questions || [] }
  }
  return null
}

module.exports = { semanticRerank, intentMatchGate }
