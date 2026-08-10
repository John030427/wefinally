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
