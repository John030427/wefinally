# BUGS_DISPROVED

1. Future/nested partner fields leaking through allowlist DTOs: disproved by 2,000 seeded cases on both Express and Cloud projections.
2. Malformed/old coordination confirmations arranging a proposal: disproved by 5,000 seeded state cases plus existing concurrency suites.
3. Matching duplicate/self-pair/claim regression on the frozen implementation: existing atomic claim, formal matching, Cloud Match, and E2E suites passed; no reproducible defect found.
