# Privacy Field Matrix

| Field | super_admin | customer_service | auditor | partner | Model |
|---|---|---|---|---|---|
| support_code | Y | Y | Y | Y (if present) | limited |
| phone | Y (ops) | masked/limited | N | masked only | N |
| openid | Y (tech) | N | N | N | N |
| exact_address | Y (ops) | limited | N | N | N |
| raw_ai_conversation | Y (ops) | Y (ops) | N | N | N |
| coordination_private_a/b | Y | Y (service) | N | N | N |
| shared_coordination | Y | Y | N | N | limited |
| AI profile summary | Y | Y | N | N | staging |
| raw model prompt | N (not casually) | N | N | N | N |
| match result | Y | limited | N | N | N |
