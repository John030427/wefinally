# POST_DEPLOY_SMOKE_CHECKLIST

Execute only after authorized deploy. Checkboxes for humans.

## SUPER ADMIN

- [ ] Login Admin
- [ ] Dashboard loads; AI status is 正常/异常/状态未知 (not fake 正常 on missing data)
- [ ] Users list; OpenID only if super_admin projection
- [ ] Coordination context shows WF-D / A-B confirmation / next action
- [ ] Private badge vs shared badge visible

## CUSTOMER SERVICE

- [ ] Login
- [ ] Payload/UI: **no OpenID**
- [ ] Service queue / conversations
- [ ] Coordination A/B readable
- [ ] Orders/handoff/workbench without openid fields

## AUDITOR

- [ ] Member review GET/PUT works
- [ ] User detail: **no OpenID**, **no match_settings**, **no raw privacy logs**
- [ ] Withdrawals blocked

## FINANCE

- [ ] Orders list without OpenID
- [ ] Withdrawals; phone **masked**
- [ ] Member review blocked

## PARTNER

- [ ] Dashboard / own users only
- [ ] Member application list: no profile_snapshot / ab_test_fixture / openid
- [ ] Phone masked
- [ ] Cross-partner application blocked

## Mini Program (体验版)

- [ ] Login
- [ ] Profile
- [ ] AI Match Profile
- [ ] Match result / NO MATCH
- [ ] Love advisor / platform AI / date coordinator **loading UX**
- [ ] Error/retry
- [ ] Proposal + A/B confirmation
- [ ] Human service entry
- [ ] Payment path inspected config-only (**no live charge**)

## Two-WeChat A/B

- [ ] Real accounts only; do not claim PASS without run
- [ ] Follow existing A/B manual checklist in project docs
