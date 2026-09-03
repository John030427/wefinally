# MINIPROGRAM_RELEASE_AUDIT

## Identity

| Field | Expected | Actual |
|---|---|---|
| AppID | `wx91c6559ea4490a29` | Match in `project.config.json` |
| CloudBase env | `cloud1-d4gy8l52g08bba326` | Match in `cloudbaserc.json` |

## Client API path

`miniprogram/utils/cloudApi.js` always calls Cloud function **`api`** (`wx.cloud.callFunction({ name: 'api' })`).

HTTP gateway also exposes `/api` → function `api`.

## Declared cloud functions in cloudbaserc

`api`, `agent-graph`, `match-worker` only.

## Release guards run

- `selfcheck:release-guard` → PASS
- `miniprogram-source-syntax` → PASS (46 JS files)
- `ai-chat-waiting-ux` → PASS
- `e2e:wefinally` → 14/14 PASS

## Upload / publish

**NOT performed.**

Recommended first human target after authorization: **体验版** (not 正式版).

## Channels to distinguish

| Channel | This audit |
|---|---|
| 开发版 | Local/dev tools |
| 体验版 | Recommended first validation |
| 审核版 | After smoke |
| 正式版 | Only after explicit release approval |

## Flags

Do not enable debug-only QA flags for formal client (`selfcheck:release-guard` covers logic). Live flag check (`selfcheck:release-guard:live`) not required for audit-only.
