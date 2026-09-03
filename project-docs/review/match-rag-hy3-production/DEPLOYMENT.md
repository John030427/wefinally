# Sparse RAG + HY3 deployment contract

This document records the rollout contract and the dated production evidence.

## Resource contract

| Logical name | CloudBase name | Purpose |
|---|---|---|
| `user_evidence_chunk` | `user_evidence_chunks` | Versioned, sanitized first-party sparse evidence |

Required indexes on `user_evidence_chunks`:

```json
[
  {"Name":"owner_evidence_unique","Keys":[{"Name":"owner_user_id","Direction":"1"},{"Name":"evidence_key","Direction":"1"}],"Unique":true},
  {"Name":"owner_enabled","Keys":[{"Name":"owner_user_id","Direction":"1"},{"Name":"enabled","Direction":"1"}],"Unique":false},
  {"Name":"content_hash","Keys":[{"Name":"content_hash","Direction":"1"}],"Unique":false}
]
```

The API's external source page size is fixed at 20 users; callers cannot
override it. The repository may read at most 21 rows internally (20 rows to
process plus one lookahead row to detect continuation). Each invocation
accepts at most 10 processing pages (`page_limit` is clamped to `1..10`) and
continues with the returned `next_cursor`. Backfill is idempotent: unchanged
chunks are not rewritten and removed chunks are disabled.

## Function configuration contract

Deploy the `api` and `match-worker` functions from the same reviewed commit.
Preserve all unrelated existing environment variables. The RAG-specific
configuration is:

| Variable | Allowed/required value | Boundary |
|---|---|---|
| `MATCH_RAG_MODE` | `off`, `shadow`, or `active` | Unknown or missing resolves to `off`; rollout starts in `shadow`. |
| `MATCH_RAG_MODEL` | `hy3` | RAG provider/model remains CloudBase `cloudbase`/`hy3`. |
| `MATCH_RAG_RETRIEVAL_VERSION` | `sparse_bm25_v1` | Must match the corpus and retrieval contract. |
| `MATCH_WORKER_SECRET` | Existing secret, never recorded here | Required for internal worker actions; do not rotate or print as part of this task. |

No embedding vendor, vector index, prompt, model response, raw profile text,
OpenID, phone number, WeChat ID, or secret belongs in the corpus or logs.

## Authenticated backfill invocations

The worker action is the supported entry point. Use the configured secret from
the deployment environment without placing its value in a command transcript.

Dry run, first page:

```json
{
  "action": "backfillRagCorpus",
  "payload": {
    "dry_run": true,
    "cursor": 0,
    "page_limit": 1,
    "worker_secret": "$MATCH_WORKER_SECRET"
  }
}
```

Real backfill uses the same payload with `dry_run: false`; repeat with each
returned `next_cursor` until it is `null`. Never use a page size other than the
server-enforced source page of 20. `dry_run` must be a JSON boolean;
`cursor` must be a non-negative safe integer and `page_limit` must be an
integer (the server clamps its numeric value to `1..10`). Invalid types are
rejected before any database read or write. Every invocation must report only
counts, versions, duration, cursor, and bounded error codes.

## Shadow smoke contract

Invoke `smokeSparseRag` only with an explicit `fixture_only: true` payload and
sanitized fixture profiles. The API does not query the user collection for a
smoke run. The response is limited to RAG mode/version, provider/model status,
bounded bilateral/final scores, bounded reason, and evidence keys. It must not
contain `sanitized_text`, prompt/response data, identity/contact fields, or
real user records.

The QA smoke matrix must include these fixture cases:

1. compatible profiles with bilateral evidence;
2. asymmetric preference evidence;
3. explicit marriage/baby conflict;
4. insufficient evidence;
5. provider failure/timeout fallback.

The smoke must prove that hard-gate candidates are unchanged and that HY3
cannot add a candidate or relax a deterministic gate.

## Activation gates

Set `MATCH_RAG_MODE=active` only after all of the following are evidenced:

- focused sparse corpus, worker, and integration checks pass;
- cloud-match, agent, safety, release-guard, and E2E checks pass;
- dry-run and paginated real backfill report zero unhandled failures;
- eligible source-user and corpus-owner counts reconcile;
- smoke covers all five cases above, with no PII in responses or logs;
- shadow comparison shows no candidate-set change, duplicate claim, or match-run failure;
- CloudBase invocation, error, and timeout metrics remain healthy.

## Rollback

If any activation gate fails, set `MATCH_RAG_MODE=off` on both `api` and
`match-worker`. This leaves the corpus inert and recoverable and restores the
deterministic matcher; do not delete the collection as part of rollback.

## Actual execution evidence

### 2026-09-01 — `cloud1-d4gy8l52g08bba326` (`ap-shanghai`)

- Reviewed branch: `codex/rag-hy3-production`; deployed code includes
  `e1f0a27`, the HY3 contract fixes `5b7de76` and `0df80b9`, and redacted
  provider diagnostics `850a657`, plus the enforced provider deadline in
  `b1bcab5` / `b1558fa`.
- Existing Event Functions were updated in place. `api` remains
  `Nodejs16.13`; `match-worker` remains `Nodejs20.19`; the existing worker
  timer trigger was preserved. Both converged to `Active` / `Available`.
- Unrelated environment variables were preserved. Final effective RAG
  variables on both functions are `MATCH_RAG_MODE=shadow`,
  `MATCH_RAG_MODEL=hy3`, and
  `MATCH_RAG_RETRIEVAL_VERSION=sparse_bm25_v1`.
- `api` also has `DEEPSEEK_MATCH_RERANK_ENABLED=true` and an explicit bounded
  rerank timeout of 12000 ms. These values were verified after the final
  configuration update; `active` alone is not treated as enabling the model.
- Created private collection `user_evidence_chunks` with the three required
  indexes: `owner_evidence_unique`, `owner_enabled`, and `content_hash`.
- Dry-run backfill request `66409d3f-3858-4541-af72-3d367f98ff5e` scanned 59
  users, found 2 eligible owners, and wrote 0 rows. Real backfill request
  `3325006b-d418-44d9-addf-fffdee7191d3` scanned the same 59 users and wrote
  3 chunks for 2 owners with no unhandled failure and no continuation cursor.
- Corpus verification found 3 enabled `evidence_chunk_v1` rows for 2 owners,
  all on `sparse_bm25_v1`, with valid evidence keys and no raw profile,
  contact, identity, vector, or embedding fields.
- HY3 base smoke succeeded on `cloudbase` / `hy3`. The initial rerank smoke
  exposed two adapter defects (an unsupported OpenAI-only response-format
  option and a missing `enabled` propagation); both received regression tests,
  were fixed, reviewed locally, redeployed, and re-run.
- Shadow smoke evidence:
  - compatible: `bba93804-0b96-4613-8ba5-3dc27a712f83`, HY3 success, 8 evidence
    keys, exact candidate sequence preserved;
  - asymmetric: `0f5689f4-d6b9-4d81-bbe6-65474e38153d`, bounded
    `low_confidence` deterministic fallback, exact sequence preserved;
  - marriage/baby conflict: `a23a4d80-bfe4-44b8-9d0b-30d350bf9d47`, no
    eligible candidate before provider invocation;
  - insufficient evidence: `278f8fc6-e5e5-483f-8b13-54f89b99b9ce`, no
    eligible candidate and no evidence keys;
  - invalid provider configuration: `dc10fadb-a90e-4afd-9ba4-2e8a4edd4546`,
    bounded `provider_config_invalid` fallback with exact sequence preserved;
    the valid `hy3` configuration was restored and verified.
- Activation smoke request `d9dd4d07-6ec9-4a6a-8c28-431dbced9697` ran in
  `active`, used `cloudbase` / `hy3`, returned 8 evidence keys, and preserved
  the exact one-candidate input/output set with zero invalid references.
- Provider-timeout smoke request `7414d006-e05b-4878-a7a3-95e274f8026d`
  enforced a 1 ms application deadline, returned bounded `timeout` in about
  0.5 seconds, and preserved the exact candidate sequence. The production
  timeout was then restored and verified at 12000 ms.
- `miniprogram/cloudbaserc.json` now declares `api` as `Nodejs16.13`, matching
  the live function. The worker and agent graph declarations remain
  `Nodejs20.19`; this prevents a future config-driven deploy from silently
  changing the API runtime.
- The monitoring time-series endpoint had not yet emitted samples for these
  fresh invocations at close-out. Direct invocation envelopes reported success
  with no function error or timeout; this metrics-ingestion delay remains an
  explicit post-deployment observation item rather than being reported as
  zero errors.

Final activation decision after independent review: keep `shadow` until the
CloudBase invocation/error/timeout metric window returns usable samples and is
reviewed. The temporary `active` smoke succeeded, but direct invocation
receipts do not substitute for the written metrics gate. Rollback remains
setting `MATCH_RAG_MODE=off` on both functions; the private corpus can remain
intact.
