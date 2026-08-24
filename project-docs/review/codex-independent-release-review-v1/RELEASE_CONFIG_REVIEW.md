# RELEASE_CONFIG_REVIEW

- `miniprogram/cloudbaserc.json`: api, agent-graph, match-worker only
- Mini Program AppID and CloudBase environment match the frozen audit
- match-worker trigger remains `0 0 16 ? * TUE,THU *` (Asia/Shanghai Wednesday/Friday)
- login/report-worker remain active-no-change and were not added to cloudbaserc
- API and agent-graph deployment need remains unchanged
- `CLOUD_ONLY`/HTTP topology conclusions remain unchanged

No configuration or release-plan source change was required. No deployment/upload occurred.
