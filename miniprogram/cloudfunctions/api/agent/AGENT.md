# WeFinally Agent Core

The Agent Core is a provider-neutral boundary for platform service, love advice, and date coordination.

## Safety Contract

- Classify prompt injection, privacy requests, high-risk requests, and irrelevant requests before model use.
- Build only bounded context: four recent turns, an 800-character summary, up to four reviewed knowledge items, and a character budget.
- Return sanitized output. Do not send OpenID, internal identifiers, contact details, exact addresses, other-user records, or model reasoning to a client.

## Dependencies

`generateDecision` accepts an injected provider request function and falls back deterministically when DeepSeek is unavailable. DeepSeek is the only runtime model provider; WeFinally session, message, summary, and business state never depend on a provider conversation identifier.

## Date Coordination Mutations

- Each participant owns an isolated `date_coordinator` session linked by one `coordination_id`.
- DeepSeek may request status lookup, match lookup, partner notification, or `create_date_application_patch` only.
- A patch request creates a two-hour preview and never mutates the current application.
- Only the authenticated owner can confirm a preview. Confirmation validates the base version, increments `coordination_version`, supersedes old proposals and confirmations, and recomputes overlap.
- Partner messages contain only WeFinally-generated shareable summaries. Never copy the requesting participant's raw message, reason, or full application.

`createAgentRepositories` requires an injected database adapter with `insert(collection, document)`. Its methods return safe DTOs only; raw database documents are never returned.

## LangGraph Orchestration Boundary

- `LANGGRAPH_ENABLED` defaults to `false`; typed timeouts, unavailable functions, invalid results, and invalid checkpoints fall back to the existing deterministic Agent path.
- `LANGGRAPH_SHADOW_MODE=true` may compare graph decisions but must never execute a graph-requested tool.
- The API creates `usr_<HMAC>` actor references and WeFinally `wf_thread_<HMAC>` thread IDs. It never sends OpenID, phone numbers, secrets, exact addresses, or provider conversation IDs to the graph.
- The graph can pause, resume, classify, and propose one action. It cannot import the business database, payment, membership, or user repository modules.
- Only `langgraphToolBridge.js` may dispatch graph actions. It enforces the exact tool allowlist, ownership, `coordinationVersion`, bounded DTOs, and an injected idempotency claim before business writes.
- Platform customer service is the only API route enabled for the first opt-in. Date coordination remains on the existing path until the current application schema has a tested, lossless mapping to both isolated graph preference states.
- Checkpoint storage contains bounded, sanitized workflow state with an expiry time. A malformed checkpoint returns `invalid_checkpoint` without exposing storage data or a stack trace.
