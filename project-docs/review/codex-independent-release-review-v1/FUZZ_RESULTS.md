# FUZZ_RESULTS

Seed: `1475287569` (`0x57ef1a11`)

| Target | Unique cases | Result |
|---|---:|---|
| RBAC/privacy DTO | 5,000 | PASS |
| Partner unknown fields | 2,000 | PASS |
| Coordination states | 5,000 | PASS |
| AI waiting double-click race | 2,000 | PASS |
| Malformed AI replies | 2,000 | PASS |
| Partner IDOR/scope | 2,000 | PASS |
| **Total** | **18,000** | **PASS** |

The full deterministic pass was repeated 10 times after fixes; all repeats passed. External AI calls: 0. CloudBase AI calls: 0.
