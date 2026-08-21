# Duplicate Pair Audit v1.5.1

Before `Map` construction, group by `wave|iid|pid`:

- **EXACT_DUPLICATE** — keep one, count dropped
- **CONFLICTING_DUPLICATE** — quarantine all copies; exclude from TRUE_CANONICAL_PAIR

`NO_SILENT_DIRECTED_KEY_OVERWRITE` throws if a duplicate still enters the map.
