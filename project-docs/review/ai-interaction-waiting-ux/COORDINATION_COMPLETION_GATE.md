# Coordination Completion Gate

Loader remains until:

1. Backend/agent response returns completely (no streaming)
2. Reply content extracted
3. If `patch_preview` / `patchPreview` present → `normalizePatchPreview` succeeds
4. Minimum display time elapsed

Then same bubble → `status=completed` with content and optional valid `patchPreview`.

Patch actions (`确认修改` / `暂不修改` / primary resolution) render only when:

- `item.status === 'completed'`
- `item.patchPreview` is truthy / valid

If raw patch exists but normalization fails → error bubble (no half UI).

Business confirm path uses separate `patchSubmitting` — not the generating spinner.
