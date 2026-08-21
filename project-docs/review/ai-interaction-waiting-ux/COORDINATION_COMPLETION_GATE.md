# Coordination Completion Gate

Loader remains until:

1. Backend/agent response returns completely (no streaming)
2. Gate accepts **at least one** of:
   - non-empty assistant text
   - valid normalized `patchPreview`
3. If raw `patch_preview` / `patchPreview` is present → `normalizePatchPreview` must succeed (else error)
4. Minimum display time elapsed (~400ms)

Then same bubble → `status=completed`.

**Rejected (error + retry):**

- empty / whitespace-only success payload with no valid patch
- malformed patch object that fails normalization
- platform primary empty **and** legacy empty
- love_advisor empty response (no fake generic copy)

**Accepted:**

- valid text only
- valid patch only (coordinator)
- platform empty/malformed primary + valid legacy text (continuous loader)

Patch actions render only when:

- `item.status === 'completed'`
- `item.patchPreview` is truthy / valid

Business confirm path uses separate `patchSubmitting` — not the generating spinner.
