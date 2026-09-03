# WeFinally Sparse RAG + HY3 Production Design

## Status

Approved in chat on 2026-09-01. Implementation uses a Luna Max coding agent; the deployed runtime uses CloudBase `hy3`, never Codex/Luna as an application API.

## Goal

Complete and deploy the existing WeFinally matching-RAG skeleton without adding a new embedding vendor. The production flow must retrieve sanitized first-party evidence, constrain HY3 reranking to that evidence, preserve deterministic hard gates, and fall back safely when retrieval or AI is unavailable.

## Source and governance boundary

- Match v1.6/v1.7 remains an offline ranking benchmark only.
- `speed-dating-native-v1` is excluded from the RAG corpus, prompts, examples, backfill, and production training because its manifest declares `rag_allowed=false` and `production_training_allowed=false`.
- The production corpus contains only sanitized WeFinally first-party profile and match-setting evidence.
- No OpenID, phone number, WeChat ID, exact address, employer, exact income, secrets, raw prompt, or model response may be stored in RAG documents or observability records.
- AI output cannot create candidates, relax hard gates, or become a hard condition.

## Architecture

```text
profile/settings save or backfill
  -> buildEvidenceChunks (existing sanitization and evidence keys)
  -> tokenize + normalized sparse document
  -> user_evidence_chunks (versioned NoSQL corpus)

formal matching
  -> deterministic hard gates
  -> deterministic bilateral ranking
  -> load corpus only for the owner and eligible candidates
  -> bidirectional BM25 retrieval, category allowlist, Top-K=3
  -> evidence allowlist
  -> CloudBase hy3 constrained JSON rerank
  -> low-weight final score blend
  -> match claim transaction
```

This is sparse retrieval-augmented generation. It must not be described as embedding or vector RAG. The existing `none` and test-only `stub` embedding modes remain available for compatibility tests but are not production modes.

## Runtime modes

`MATCH_RAG_MODE` accepts exactly:

- `off`: skip sparse retrieval and keep deterministic matching.
- `shadow`: run retrieval and HY3 validation, persist redacted diagnostics, but do not change canonical ordering.
- `active`: allow validated retrieval and HY3 scores to contribute through the existing capped final-score blend.

Unknown or missing values resolve to `off`. Deployment starts in `shadow`; it switches to `active` only after cloud smoke tests pass. Any retrieval, schema, timeout, or provider failure returns the deterministic result and a bounded reason code.

## Corpus schema

Collection: `user_evidence_chunks`

Each document contains:

- `_id`: deterministic hash-based evidence document ID.
- `owner_user_id`: internal numeric user ID.
- `evidence_key`: stable evidence allowlist key.
- `category`: existing `CHUNK_CATEGORIES` value.
- `sanitized_text`: sanitized source text, capped by the existing chunk builder.
- `tokens`: normalized unigrams/bigrams used by sparse retrieval.
- `content_hash`: existing content hash.
- `chunk_version`: `evidence_chunk_v1`.
- `retrieval_version`: `sparse_bm25_v1`.
- `source_profile_version`: stable hash of retrieval-relevant user/settings inputs.
- `enabled`: boolean tombstone state.
- `updated_at`: server timestamp.

Indexes:

- unique compound index on `owner_user_id + evidence_key`;
- compound index on `owner_user_id + enabled`;
- non-unique index on `content_hash`.

The collection is server-only. Mini-program clients receive only evidence summaries already permitted by the match result contract.

## Synchronization and backfill

- Saving matching settings synchronizes that user's chunks idempotently.
- Removed source fields disable stale chunks instead of leaving them retrievable.
- A worker-only action backfills approved users in pages of 20.
- Backfill supports `dry_run`, cursor continuation, a maximum page count, and idempotent reruns.
- Backfill logs counts, versions, duration, and error codes only; it never logs chunk text.

## Sparse retrieval

- Tokenization is deterministic Chinese character unigram + bigram normalization with bounded synonym expansion.
- BM25 is calculated over the eligible candidate corpus loaded for one matching run; current production scale is 59 users and the eligible pool remains capped at 50.
- Query-to-document category mappings and conflict checks reuse the existing retrieval contract.
- A-to-B and B-to-A retrieval are computed separately.
- Top-K is 3 per direction.
- Explicit marriage/baby conflicts retain the existing deterministic score cap.
- Empty or insufficient evidence yields `sparse_retrieval_insufficient`, never a fabricated positive score.

## HY3 reranking

- Production provider is CloudBase group `cloudbase`, model `hy3`.
- HY3 receives sanitized retrieved text and evidence keys only.
- Existing JSON schema, candidate-reference validation, evidence-key allowlist, retry limit, timeout, and maximum rerank weight remain enforced.
- HY3 failure never prevents a deterministic match run from completing.
- Runtime metadata records provider/model/schema/version/latency/token usage/error class without storing prompts or responses.

## Deployment

1. Create the NoSQL collection and indexes after local tests pass.
2. Deploy code to `api` and `match-worker`, preserving all unrelated environment variables.
3. Set `MATCH_RAG_MODE=shadow` and `MATCH_RAG_MODEL=hy3` on both functions.
4. Run a dry-run backfill, then the real paginated backfill.
5. Invoke a bounded QA smoke covering compatible, asymmetric, conflict, insufficient-evidence, and provider-failure cases.
6. Verify function logs contain no PII and no new error/timeout spike.
7. Set `MATCH_RAG_MODE=active` only when every activation gate passes.

Rollback sets `MATCH_RAG_MODE=off`. Corpus data remains inert and recoverable; no collection deletion is part of rollback.

## Activation gates

- All existing match, safety, member, agent, release-guard, and E2E checks pass.
- New sparse-retrieval, corpus-sync, backfill, shadow-mode, and failure-fallback checks pass.
- Backfill reports zero unhandled failures and corpus counts match eligible source users.
- QA smoke proves hard gates remain unchanged and HY3 cannot add candidates.
- Shadow comparison produces no claim duplication or match-run failure.
- Cloud function invocation, error, and timeout metrics remain healthy.

## Non-goals

- No vector database or embedding provider is added in this phase.
- No model is trained or fine-tuned.
- No v1.6/v1.7 benchmark row is copied into production.
- No automatic learning from dates, chats, or outcomes is enabled.
- No replacement of the deterministic core ranker is attempted.
