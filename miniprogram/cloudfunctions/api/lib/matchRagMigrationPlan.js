// ponytail: dry-run only. No CloudBase writes without explicit user confirmation.
function planMatchRagInfrastructure() {
  return {
    pending_user_confirmation: true,
    collections: [
      {
        logical: 'user_evidence_chunk',
        physical: 'user_evidence_chunks',
        indexes: ['owner_user_id + category', 'content_hash'],
        estimated_docs: '1-10 per active user',
        rollback: 'drop collection; matching falls back to stub in-memory chunks'
      },
      {
        logical: 'user_evidence_embedding',
        physical: 'user_evidence_embeddings',
        indexes: ['evidence_key unique', 'owner_user_id'],
        estimated_docs: 'same as chunks',
        rollback: 'drop collection; set MATCH_EMBEDDING_PROVIDER=stub'
      }
    ],
    env_vars: [
      { key: 'MATCH_EMBEDDING_PROVIDER', default: 'stub', notes: 'none|stub|<real provider after confirmation>' }
    ],
    feature_flags: [
      { key: 'semantic_retrieval', default: 'stub_local', notes: 'real provider pending_user_confirmation' }
    ],
    backfill_job: {
      mode: 'dry_run_only',
      idempotent: true,
      page_size: 100,
      pauseable: true
    }
  }
}

function planMatchObservabilityProjection(row = {}) {
  return {
    retrieval_version: row.retrieval_version || null,
    score_version: row.score_version || row.score_schema_version || null,
    report_version: row.report_schema_version || null,
    fixture_simulation_status: row.fixture_simulation_status || null,
    failure_reason_code: row.failure_reason_code || null,
    // never expose prompt/free text/embeddings/secrets
    redacted: true
  }
}

module.exports = {
  planMatchRagInfrastructure,
  planMatchObservabilityProjection
}
