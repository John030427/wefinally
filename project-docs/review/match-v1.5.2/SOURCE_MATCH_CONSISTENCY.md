# Source Match Consistency v1.5.2

If `match` column present and `match != (dec && dec_o)`:

- quarantine `match_dec_inconsistent`
- **exclude** from valid directed / reverse / TRUE_CANONICAL_PAIR / Gold

If `match` absent: `source_match_available=false`; mutual derived from decisions only.

Reverse pairs also require consistent source match when available.
