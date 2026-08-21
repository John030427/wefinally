# AI Interaction Surfaces Inventory

| Surface | Path | Classification | Changed |
|---|---|---|---|
| Shared AI chat | `miniprogram/pages/chat/` | CHAT_CONVERSATIONAL | YES |
| Love advisor landing | `miniprogram/pages/love-advisor/` | NOT_AI (routes into shared chat) | NO |
| Platform AI entry | profile / partner-login links | NOT_AI (routes into shared chat) | NO |
| Date coordination form | `miniprogram/pages/date-coordination/` | STRUCTURED_GENERATION / business UI (coordinator chat is shared chat) | NO |
| AI match profile | `miniprogram/pages/match-setting/` AI profile card | STRUCTURED_GENERATION | NO |
| AI match report | `miniprogram/pages/match-detail/` report block | STRUCTURED_GENERATION / STATIC_AI_RESULT | NO |
| VIP / rules copy | marketing/rules pages | STATIC_AI_RESULT / NOT_AI | NO |

## Scope note

Primary implementation is conversational / coordination AI via shared chat. Structured profile/report pages already have their own async status UX and were not redesigned.
