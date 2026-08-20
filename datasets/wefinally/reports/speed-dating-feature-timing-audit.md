# Speed Dating Feature Timing Audit (v1.3)

WeFinally matching is PRE-date. Offline models must not use post-meeting partner evaluations.

## PRE_MATCH_ALLOWED

- age
- age_o
- gender
- d_age
- attractive_important
- sincere_important
- intellicence_important
- funny_important
- ambtition_important
- shared_interests_important
- pref_o_attractive
- pref_o_sincere
- pref_o_intelligence
- pref_o_funny
- pref_o_ambitious
- pref_o_shared_interests
- sports
- tvsports
- exercise
- dining
- museums
- art
- hiking
- gaming
- clubbing
- reading
- tv
- theater
- movies
- concerts
- music
- shopping
- yoga
- attractive
- sincere
- intelligence
- funny
- ambition
- interests_correlate
- expected_happy_with_sd_people

## POST_INTERACTION_FORBIDDEN

- like
- guess_prob_liked
- attractive_partner
- sincere_partner
- intelligence_partner
- funny_partner
- ambition_partner
- shared_interests_partner
- attractive_o
- sinsere_o
- intelligence_o
- funny_o
- ambitous_o
- shared_interests_o
- decision
- decision_o
- dec
- dec_o
- match
- met

## SENSITIVE_FAIRNESS_ONLY

- race
- race_o
- samerace
- importance_same_race
- importance_same_religion
- field

## UNKNOWN_EXCLUDE

- Any field not listed above is excluded by default.

Outcome fields `decision` / `decision_o` / `match` are always EVALUATOR_ONLY.
