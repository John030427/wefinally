const assert = require('assert')
const {
  buildRerankRequest,
  validateRerankResponse
} = require('../../miniprogram/cloudfunctions/api/lib/matchAgentRerankPolicy')
const {
  MATCH_SCENARIO_NAMES,
  buildMatchScenario
} = require('./fixtures/match-scenarios')
const { rankCandidates } = require('../../miniprogram/cloudfunctions/api/lib/matchPolicy')

const rankedCandidates = MATCH_SCENARIO_NAMES
  .map((name) => buildMatchScenario(name))
  .map((scenario, index) => {
    const ranked = rankCandidates(
      scenario.owner,
      [scenario.candidate],
      scenario.settingsByUserId
    )
    if (!ranked.length) return null
    return Object.assign({ internalUserId: 900001 + index }, ranked[0])
  })
  .filter(Boolean)

const request = buildRerankRequest({
  evaluationId: 'offline_eval_20260726',
  candidates: rankedCandidates,
  topK: 3
})

assert.strictEqual(request.version, 'match_agent_rerank_v1')
assert.strictEqual(request.candidates.length, 3)
assert(request.candidates.every((candidate) => /^candidate_\d+$/.test(candidate.candidate_ref)))
assert(request.candidates.every((candidate) => candidate.quality_gate_pass === true))
assert(request.candidates.every((candidate) => candidate.side_a_percent <= 100))
assert(request.candidates.every((candidate) => candidate.side_b_percent <= 100))

const serialized = JSON.stringify(request).toLowerCase()
assert.strictEqual(
  serialized.includes('offline_eval_20260726'),
  false,
  '离线评估标识不得进入模型请求 JSON'
)
for (const forbidden of [
  'internaluserid',
  'user_id',
  'openid',
  'phone',
  'mobile',
  'contact',
  'address',
  'api_key',
  'secret',
  'private_key',
  'conversation_id'
]) {
  assert.strictEqual(serialized.includes(forbidden), false, forbidden)
}
for (const row of rankedCandidates) {
  assert.strictEqual(serialized.includes(String(row.internalUserId)), false)
}

const response = {
  version: 'match_agent_rerank_v1',
  ranking: request.candidates.map((candidate, index) => ({
    candidate_ref: candidate.candidate_ref,
    rank: index + 1,
    confidence: 0.8,
    evidence_codes: ['bilateral_score'],
    risk_codes: []
  }))
}
const validated = validateRerankResponse(response, request)
assert.deepStrictEqual(
  validated.map((item) => item.internalUserId),
  rankedCandidates.slice(0, 3).map((item) => item.internalUserId)
)

assert.throws(() => validateRerankResponse({
  version: 'match_agent_rerank_v1',
  ranking: request.candidates.map((candidate, index) => ({
    candidate_ref: index === 0 ? 'candidate_unknown' : candidate.candidate_ref,
    rank: index + 1,
    confidence: 1,
    evidence_codes: [],
    risk_codes: []
  }))
}, request), /未知候选引用/)

assert.throws(() => validateRerankResponse({
  version: 'match_agent_rerank_v1',
  ranking: [
    {
      candidate_ref: 'candidate_1',
      rank: 1,
      confidence: 1,
      evidence_codes: [],
      risk_codes: []
    },
    {
      candidate_ref: 'candidate_1',
      rank: 2,
      confidence: 1,
      evidence_codes: [],
      risk_codes: []
    },
    {
      candidate_ref: 'candidate_2',
      rank: 3,
      confidence: 1,
      evidence_codes: [],
      risk_codes: []
    }
  ]
}, request), /候选引用重复/)

assert.throws(() => buildRerankRequest({
  evaluationId: 'offline_eval_20260726',
  candidates: rankedCandidates,
  topK: 51
}), /Top-K/)

assert.throws(() => buildRerankRequest({
  evaluationId: 'offline_eval_20260726',
  candidates: rankedCandidates,
  topK: 0
}), /Top-K/)

console.log('PASS privacy-safe Top-K match Agent rerank policy')
