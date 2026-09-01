# WeFinally Sparse RAG + HY3 Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a first-party, sanitized sparse-RAG corpus and bidirectional BM25 retrieval path that constrains CloudBase HY3 matching reranks while preserving deterministic hard gates and rollback.

**Architecture:** Versioned evidence chunks are synchronized into CloudBase NoSQL and loaded only for the current user plus hard-gate-eligible candidates. A pure sparse retriever computes category-constrained A→B and B→A BM25 evidence, then the existing validated HY3 reranker consumes the allowlisted evidence; `off`, `shadow`, and `active` modes control rollout.

**Tech Stack:** CommonJS Node.js, WeChat Cloud Functions, CloudBase NoSQL, `wx-server-sdk`, `@cloudbase/node-sdk`, existing Node selfchecks.

**Spec:** `docs/superpowers/specs/2026-09-01-wefinally-sparse-rag-hy3-production-design.md`

## Global Constraints

- Match v1.6/v1.7 and `speed-dating-native-v1` never enter corpus, prompts, examples, backfill, or production training.
- Production model is CloudBase group `cloudbase`, model `hy3`; Codex/Luna is development-only.
- Production RAG contains no vectors and must be identified as `sparse_bm25_v1`, not embedding RAG.
- Missing or unknown `MATCH_RAG_MODE` resolves to `off`.
- AI never adds candidates, bypasses hard gates, or directly writes matching conclusions.
- RAG failures return deterministic ranking and bounded error codes.
- No raw prompt, response, OpenID, phone, WeChat ID, exact address, employer, exact income, or secret is persisted or logged.
- Every production-code change follows red-green-refactor; the failing test output is recorded in the task report.

---

## File map

- Create `miniprogram/cloudfunctions/api/lib/sparseMatchRetrieval.js`: pure tokenizer, BM25 scorer, category-constrained bidirectional retrieval, conflict cap.
- Create `miniprogram/cloudfunctions/api/lib/matchRagRuntime.js`: strict mode resolution and shadow/active projection helpers.
- Create `miniprogram/cloudfunctions/api/lib/matchRagCorpus.js`: deterministic document projection, sync, load, paginated backfill using injected repository operations.
- Modify `miniprogram/cloudfunctions/api/lib/collections.js`: register `user_evidence_chunk`.
- Modify `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js`: allow server-side bootstrap for the new collection.
- Modify `miniprogram/cloudfunctions/api/lib/db.js`: expose deterministic document upsert, owner-scoped chunk load, stale disable, and paginated source reads.
- Modify `miniprogram/cloudfunctions/api/lib/semanticMatchService.js`: dispatch sparse retrieval by mode and keep shadow ordering deterministic.
- Modify `miniprogram/cloudfunctions/api/handlers/match.js`: synchronize chunks after settings save and inject corpus loading into manual matching.
- Modify `miniprogram/cloudfunctions/api/lib/formalMatching.js`: inject corpus loading and save redacted RAG metadata.
- Modify `miniprogram/cloudfunctions/api/lib/matchTestRunService.js`: use the same injected corpus contract in QA runs.
- Modify `miniprogram/cloudfunctions/api/index.js`: add worker-authenticated dry-run/backfill/smoke actions.
- Modify `miniprogram/cloudfunctions/match-worker/index.js`: route explicit RAG backfill events to `api` while preserving timer matching.
- Create `server/selfcheck/match-sparse-rag.js`: pure retrieval and mode behavioral coverage.
- Create `server/selfcheck/match-rag-corpus.js`: corpus sync/backfill behavior with an in-memory repository.
- Create `server/selfcheck/match-rag-integration.js`: off/shadow/active and HY3 evidence-boundary coverage.
- Modify `server/package.json`: include the new selfchecks in `selfcheck:cloud-match` and add focused scripts.
- Create `project-docs/review/match-rag-hy3-production/DEPLOYMENT.md`: exact resource, rollout, smoke, activation, and rollback record.

### Task 1: Pure sparse retrieval and strict runtime modes

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/sparseMatchRetrieval.js`
- Create: `miniprogram/cloudfunctions/api/lib/matchRagRuntime.js`
- Create: `server/selfcheck/match-sparse-rag.js`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `tokenizeSparse(text): string[]`
- Produces: `scoreBm25(queryTokens, documents, options?): Array<{document, score}>`
- Produces: `retrieveSparseBidirectional(pair, corpusByUserId, options?): Promise<RetrievalResult>`
- Produces: `resolveRagMode(env): 'off'|'shadow'|'active'`
- Produces: `applyRagMode(mode, originalRanked, enrichedRanked): RankedItem[]`

- [ ] **Step 1: Write the failing behavior test**

Use literal fixtures for synonym, asymmetric, conflict, empty-evidence, and ordering cases. The key assertions are:

```js
assert.deepStrictEqual(resolveRagMode({ MATCH_RAG_MODE: 'SHADOW' }), 'shadow')
assert.deepStrictEqual(resolveRagMode({ MATCH_RAG_MODE: 'unexpected' }), 'off')
assert.ok(result.a_to_b.top_evidence[0].evidence_key.startsWith('values_self:'))
assert.notStrictEqual(result.a_to_b.score, result.b_to_a.score)
assert.ok(conflict.a_to_b.score <= 20)
assert.strictEqual(insufficient.reason, 'sparse_retrieval_insufficient')
assert.deepStrictEqual(applyRagMode('shadow', original, enriched).map(x => x.candidate.id), [2, 3])
```

- [ ] **Step 2: Run RED and record the expected missing-module failure**

Run: `node server/selfcheck/match-sparse-rag.js`

- [ ] **Step 3: Implement the minimal pure modules**

Use bounded character unigram/bigram tokens, existing synonym groups, BM25 constants `k1=1.2`, `b=0.75`, category mappings from `matchSemanticRetrieval.js`, `TOP_K=3`, and `RETRIEVAL_VERSION='sparse_bm25_v1'`. Return no raw vectors.

- [ ] **Step 4: Run GREEN and regression checks**

Run: `node server/selfcheck/match-sparse-rag.js`

Run: `node server/selfcheck/match-semantic-retrieval.js`

- [ ] **Step 5: Commit**

```bash
git add miniprogram/cloudfunctions/api/lib/sparseMatchRetrieval.js miniprogram/cloudfunctions/api/lib/matchRagRuntime.js server/selfcheck/match-sparse-rag.js server/package.json
git commit -m "feat(match): add sparse bidirectional RAG retrieval"
```

### Task 2: Versioned corpus synchronization and backfill

**Files:**
- Create: `miniprogram/cloudfunctions/api/lib/matchRagCorpus.js`
- Create: `server/selfcheck/match-rag-corpus.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collections.js`
- Modify: `miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/lib/db.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `buildEvidenceChunks(user, settings)` and `tokenizeSparse(text)`
- Produces: `projectCorpusDocuments(user, settings, timestamp): CorpusDocument[]`
- Produces: `syncUserCorpus(user, settings, repository): Promise<{upserted, disabled, source_profile_version}>`
- Produces: `loadCorpusForUserIds(userIds, repository): Promise<Record<string, CorpusDocument[]>>`
- Produces: `backfillCorpus(options, repository): Promise<BackfillResult>`
- Repository requires: `listUsersPage({afterId, limit})`, `findSetting(userId)`, `listChunksByOwnerIds(ids)`, `upsertChunk(document)`, `disableChunks(ownerUserId, activeEvidenceKeys)`.

- [ ] **Step 1: Write the failing corpus behavior test**

Use an in-memory repository and assert literal outcomes:

```js
assert.strictEqual(first.upserted, 3)
assert.strictEqual(second.upserted, 0)
assert.strictEqual(afterRemoval.disabled, 1)
assert.ok(rows.every(row => row.retrieval_version === 'sparse_bm25_v1'))
assert.ok(rows.every(row => !JSON.stringify(row).includes('openid')))
assert.deepStrictEqual(dryRun, { scanned: 2, eligible: 2, written: 0, disabled: 0, dry_run: true, next_cursor: 2 })
```

- [ ] **Step 2: Run RED**

Run: `node server/selfcheck/match-rag-corpus.js`

- [ ] **Step 3: Implement corpus projection and repository methods**

Document IDs are `rag_chunk_${sha256(owner_user_id:evidence_key).slice(0,32)}`. `source_profile_version` hashes only retrieval-relevant sanitized chunk identities. Upsert skips unchanged documents; stale evidence keys are tombstoned with `enabled=false`. Pagination is ordered by numeric user `id` and bounded to 20 rows.

- [ ] **Step 4: Run GREEN and database contract regressions**

Run: `node server/selfcheck/match-rag-corpus.js`

Run: `node server/selfcheck/cloudbase-migration.js`

Run: `node server/selfcheck/collection-bootstrap-policy.js`

- [ ] **Step 5: Commit**

```bash
git add miniprogram/cloudfunctions/api/lib/matchRagCorpus.js miniprogram/cloudfunctions/api/lib/collections.js miniprogram/cloudfunctions/api/lib/collectionBootstrapPolicy.js miniprogram/cloudfunctions/api/lib/db.js server/selfcheck/match-rag-corpus.js server/package.json
git commit -m "feat(match): persist sanitized sparse RAG corpus"
```

### Task 3: Integrate off, shadow, and active matching behavior

**Files:**
- Create: `server/selfcheck/match-rag-integration.js`
- Modify: `miniprogram/cloudfunctions/api/lib/semanticMatchService.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/match.js`
- Modify: `miniprogram/cloudfunctions/api/lib/formalMatching.js`
- Modify: `miniprogram/cloudfunctions/api/lib/matchTestRunService.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `retrieveSparseBidirectional`, `resolveRagMode`, `applyRagMode`, and `loadCorpusForUserIds`.
- Extends: `semanticRerank(ranked, user, settingsByUserId, options = {})` where `options.ragMode` overrides environment only in tests and `options.loadCorpus(userIds)` is injected by production callers.
- Produces: rerank metadata `{rag_mode, retrieval_version, corpus_version, shadow, provider, model, reason}` without prompt or response text.

- [ ] **Step 1: Write the failing integration test**

Cover these observable contracts:

```js
assert.deepStrictEqual(off.ranked.map(x => x.candidate.id), originalIds)
assert.deepStrictEqual(shadow.ranked.map(x => x.candidate.id), originalIds)
assert.strictEqual(shadow.rag.shadow, true)
assert.deepStrictEqual(active.ranked.map(x => x.candidate.id), hy3ValidatedIds)
assert.deepStrictEqual(providerFailure.ranked.map(x => x.candidate.id), originalIds)
assert.strictEqual(providerFailure.degraded, true)
assert.strictEqual(hardGateInputToHy3.every(x => allowedCandidateIds.has(x.candidate_ref)), true)
```

- [ ] **Step 2: Run RED**

Run: `node server/selfcheck/match-rag-integration.js`

- [ ] **Step 3: Implement mode dispatch and dependency injection**

`off` returns deterministic `withFinalScores` without corpus access. `shadow` performs retrieval and validated HY3 rerank but returns original canonical ordering and scores. `active` uses the existing capped final-score blend. Missing corpus, invalid JSON, timeouts, and provider errors return deterministic ordering with a bounded reason.

After `saveSetting`, call `syncUserCorpus` with server-side repository methods. Manual, QA, and formal paths inject the same owner-scoped loader. Persist only redacted RAG metadata into score detail and claim audit.

- [ ] **Step 4: Run GREEN and matching regressions**

Run: `node server/selfcheck/match-rag-integration.js`

Run: `npm --prefix server run selfcheck:cloud-match`

- [ ] **Step 5: Commit**

```bash
git add miniprogram/cloudfunctions/api/lib/semanticMatchService.js miniprogram/cloudfunctions/api/handlers/match.js miniprogram/cloudfunctions/api/lib/formalMatching.js miniprogram/cloudfunctions/api/lib/matchTestRunService.js server/selfcheck/match-rag-integration.js server/package.json
git commit -m "feat(match): integrate sparse RAG shadow and active modes"
```

### Task 4: Worker backfill, smoke actions, and deployment contract

**Files:**
- Modify: `miniprogram/cloudfunctions/api/index.js`
- Modify: `miniprogram/cloudfunctions/match-worker/index.js`
- Create: `server/selfcheck/match-rag-worker.js`
- Create: `project-docs/review/match-rag-hy3-production/DEPLOYMENT.md`
- Modify: `server/package.json`

**Interfaces:**
- Adds authenticated API actions `backfillRagCorpus` and `smokeSparseRag` guarded by `assertInternalWorkerSecret`.
- `backfillRagCorpus` accepts `{dry_run, cursor, page_limit, worker_secret}` with `page_limit` clamped to `1..10` and source page size fixed at 20.
- `smokeSparseRag` accepts fixture-only sanitized profiles and returns redacted mode/version/score/evidence-key metadata.
- `match-worker` routes `event.action === 'backfillRagCorpus'` and `event.action === 'smokeSparseRag'`; an absent action preserves `runFormalMatchBatch` timer behavior.

- [ ] **Step 1: Write the failing worker behavior test**

Invoke an extracted pure event mapper and assert exact API actions and bounded payloads; assert smoke projection contains evidence keys but no `sanitized_text`, prompt, response, OpenID, or secret.

- [ ] **Step 2: Run RED**

Run: `node server/selfcheck/match-rag-worker.js`

- [ ] **Step 3: Implement worker actions and deployment record**

Keep worker authentication unchanged. The deployment record lists collection/index names, environment variables, dry-run and real backfill invocations, shadow smoke cases, activation gates, `MATCH_RAG_MODE=off` rollback, and leaves actual result fields blank until deployment evidence is captured as new dated entries rather than placeholders.

- [ ] **Step 4: Run GREEN and full local verification**

Run: `node server/selfcheck/match-rag-worker.js`

Run: `npm --prefix server run selfcheck:cloud-match`

Run: `npm --prefix server run selfcheck:agent`

Run: `npm --prefix server run selfcheck:safety`

Run: `npm --prefix server run selfcheck:release-guard`

Run: `npm --prefix server run e2e:wefinally`

- [ ] **Step 5: Commit**

```bash
git add miniprogram/cloudfunctions/api/index.js miniprogram/cloudfunctions/match-worker/index.js server/selfcheck/match-rag-worker.js server/package.json project-docs/review/match-rag-hy3-production/DEPLOYMENT.md
git commit -m "feat(match): add sparse RAG backfill and smoke controls"
```

### Task 5: CloudBase resources, shadow deployment, backfill, activation, and evidence

**Files:**
- Modify: `project-docs/review/match-rag-hy3-production/DEPLOYMENT.md`

**Interfaces:**
- Cloud environment: `cloud1-d4gy8l52g08bba326`, region `ap-shanghai`.
- Collection: `user_evidence_chunks`.
- Function configuration preserves every unrelated remote variable and adds `MATCH_RAG_MODE=shadow`, `MATCH_RAG_MODEL=hy3`, `MATCH_RAG_RETRIEVAL_VERSION=sparse_bm25_v1`.

- [ ] **Step 1: Re-run deployment gates from a clean worktree**

Run the full Task 4 verification set plus `git diff --check` and `git status --short`.

- [ ] **Step 2: Create the collection and indexes through CloudBase management tools**

Create `user_evidence_chunks`, then create:

```json
[
  {"Name":"owner_evidence_unique","Keys":[{"Name":"owner_user_id","Direction":"1"},{"Name":"evidence_key","Direction":"1"}],"Unique":true},
  {"Name":"owner_enabled","Keys":[{"Name":"owner_user_id","Direction":"1"},{"Name":"enabled","Direction":"1"}],"Unique":false},
  {"Name":"content_hash","Keys":[{"Name":"content_hash","Direction":"1"}],"Unique":false}
]
```

- [ ] **Step 3: Deploy `api` and `match-worker` in shadow mode**

Use CloudBase function management, preserve all existing variables, update code from `miniprogram/cloudfunctions`, and verify function status, runtime, modification time, and effective RAG variables after deployment.

- [ ] **Step 4: Run dry-run then real backfill**

Invoke `match-worker` with `action=backfillRagCorpus`, first `dry_run=true`, then `dry_run=false`, following `next_cursor` until empty. Confirm zero unhandled failures and compare distinct corpus owners with approved users that have retrieval-relevant settings.

- [ ] **Step 5: Run shadow smoke and inspect logs/metrics**

Cover compatible, asymmetric, conflict, insufficient evidence, and provider-failure fixtures. Verify candidate set invariance, no PII in returned/logged data, no duplicate claim, and healthy invocation/error/timeout metrics.

- [ ] **Step 6: Activate or roll back by gate**

If every activation gate passes, set `MATCH_RAG_MODE=active` on `api` and `match-worker`, invoke smoke once more, and record evidence. If any gate fails, set both functions to `MATCH_RAG_MODE=off`, record the failed gate, and leave the corpus inert.

- [ ] **Step 7: Commit deployment evidence**

```bash
git add project-docs/review/match-rag-hy3-production/DEPLOYMENT.md
git commit -m "docs(deploy): record sparse RAG HY3 rollout evidence"
```

---

## Plan self-review

- Every design requirement maps to Tasks 1–5.
- Task interfaces use the same `sparse_bm25_v1`, `MATCH_RAG_MODE`, corpus schema, and loader contract.
- Cloud writes occur only after local and review gates.
- Deployment rollback is configuration-only and recoverable.
- No task uses v1.6/v1.7 as RAG corpus or claims model training.
