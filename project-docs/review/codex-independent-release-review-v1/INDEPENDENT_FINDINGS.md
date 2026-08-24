# INDEPENDENT_FINDINGS

| ID | Severity | Finding | Result |
|---|---|---|---|
| CDEX-01 | P0 | Missing Express `admin_role` claim defaulted to `super_admin`, authorizing privileged writes | FIXED, fail closed |
| CDEX-02 | P0 | Express partner audit used promoter ownership and ignored current `assigned_partner_id`; former partner could review after reassignment | FIXED, current assignment enforced |
| CDEX-03 | P1 | AI send/retry reserved single-flight only after async network check; rapid clicks launched competing turns and stranded an old loader | FIXED, synchronous turn reservation |
| CDEX-04 | P1 | Cloud member review was non-atomic; concurrent approve/reject both committed and corrupted audit `from_status` | FIXED, existing CloudBase transaction adapter used |
| CDEX-05 | P2 | VIP activity helper ignored injected time, making deterministic policy checks date-sensitive | FIXED, injected clock honored |

No product policy, matching weights, model architecture, schedules, or financial semantics changed.
