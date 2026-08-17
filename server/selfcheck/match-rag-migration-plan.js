const assert = require('assert')
const {
  planMatchRagInfrastructure,
  planMatchObservabilityProjection
} = require('../../miniprogram/cloudfunctions/api/lib/matchRagMigrationPlan')

const plan = planMatchRagInfrastructure()
assert.strictEqual(plan.pending_user_confirmation, true)
assert.ok(plan.collections.some((item) => item.physical === 'user_evidence_chunks'))
assert.ok(plan.env_vars.some((item) => item.key === 'MATCH_EMBEDDING_PROVIDER'))
assert.strictEqual(plan.backfill_job.mode, 'dry_run_only')
assert.ok(!JSON.stringify(plan).includes('apiKey'))
assert.ok(!JSON.stringify(plan).includes('openid'))

const view = planMatchObservabilityProjection({
  retrieval_version: 'semantic_retrieval_v1',
  score_version: 'algo_evidence_v3',
  report_schema_version: 'match_report_v2',
  fixture_simulation_status: 'scheduled',
  failure_reason_code: 'semantic_retrieval_unavailable',
  prompt: 'SECRET PROMPT',
  embedding: [0.1, 0.2]
})
assert.strictEqual(view.retrieval_version, 'semantic_retrieval_v1')
assert.strictEqual(view.score_version, 'algo_evidence_v3')
assert.strictEqual(view.report_version, 'match_report_v2')
assert.strictEqual(view.redacted, true)
assert.strictEqual(view.prompt, undefined)
assert.strictEqual(view.embedding, undefined)

console.log('PASS match RAG migration dry-run and redacted observability projection')
