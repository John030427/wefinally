# Sparse RAG + HY3 deployment contract

This document records the Task 4 contract only. No CloudBase collection,
function, environment variable, or production record was changed by this
task. Actual rollout evidence is intentionally absent and must be appended as
a new dated entry after a real execution.

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

No dated deployment, collection/index creation, backfill, smoke, metric, or
activation result is recorded here. Task 5 may append a dated evidence entry
after each real operation, including the reviewed commit, target function,
effective variables, bounded counts, smoke result, and rollback/activation
decision.
