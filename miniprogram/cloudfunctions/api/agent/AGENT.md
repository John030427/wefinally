# WeFinally Agent Core

The Agent Core is a provider-neutral boundary for platform service, love advice, and date coordination.

## Safety Contract

- Classify prompt injection, privacy requests, high-risk requests, and irrelevant requests before model use.
- Build only bounded context: four recent turns, an 800-character summary, up to four reviewed knowledge items, and a character budget.
- Return sanitized output. Do not send OpenID, internal identifiers, contact details, exact addresses, other-user records, or model reasoning to a client.

## Dependencies

`generateDecision` accepts an injected provider request function and falls back deterministically when providers are unavailable. It reads MiniMax or DeepSeek configuration from runtime environment variables.

`createAgentRepositories` requires an injected database adapter with `insert(collection, document)`. Its methods return safe DTOs only; raw database documents are never returned.
