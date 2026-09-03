# FEATURE_SCOPE

| Field | Class | Notes |
|-------|-------|-------|
| iid,pid,wave,id,partner | IDENTITY_METADATA_ONLY | |
| dec,dec_o,match | POST_OUTCOME_FORBIDDEN | gold |
| attr | POST_OUTCOME_FORBIDDEN | omitted |
| gender | PRE_OUTCOME_ALLOWED | subject gender |
| order | PRE_OUTCOME_ALLOWED | encounter order within wave — research feature, not WeFinally profile compatibility |
| round | PRE_OUTCOME_ALLOWED | session size proxy |
| date | PRE_OUTCOME_ALLOWED | event date index |
| RA | PRE_OUTCOME_ALLOWED | Research-assistant attractiveness rating of the **partner** used in Bhargava/Fisman contrast analysis; contemporaneous to decisions, not participant post-date `attr`. Still **not** a WeFinally semantic profile feature. |

This is NOT a rich WeFinally semantic-profile benchmark.
