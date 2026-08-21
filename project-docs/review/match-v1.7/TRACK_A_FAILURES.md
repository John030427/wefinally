# TRACK_A_FAILURES

Four-state (DEV champion):

```json
{
  "YY": {
    "n": 37,
    "mean": 0.284,
    "p90": 0.2899,
    "high_conf_rate": 0
  },
  "YN": {
    "n": 48,
    "mean": 0.2835,
    "p90": 0.2894,
    "high_conf_rate": 0
  },
  "NY": {
    "n": 86,
    "mean": 0.2798,
    "p90": 0.285,
    "high_conf_rate": 0
  },
  "NN": {
    "n": 54,
    "mean": 0.2813,
    "p90": 0.2884,
    "high_conf_rate": 0
  },
  "one_sided_high_conf_rate": 0
}
```

Core concern: YN/NY must not receive high reciprocal confidence.
