# Directional Analysis

## Why directional LR worked
Subject-oriented Speed Dating rows provide declared preference weights + partner age/prefs + interests_correlate (pre-match).
LR learns P(A likes B) from alignment features; mutual labels are rarer and harder.

## Top |coefficients|
```json
[
  {
    "name": "bp_sinc",
    "w": -0.10250167619995205
  },
  {
    "name": "ap_shared",
    "w": 0.08693881459884457
  },
  {
    "name": "age_a",
    "w": 0.0837372513050825
  },
  {
    "name": "bp_shared",
    "w": -0.07155062207870996
  },
  {
    "name": "ap_attr",
    "w": -0.06818720921881784
  },
  {
    "name": "age_b",
    "w": -0.06738795248912045
  },
  {
    "name": "self_attr",
    "w": -0.06314235715460738
  },
  {
    "name": "ap_sinc",
    "w": 0.06182153453914937
  },
  {
    "name": "int_movies",
    "w": -0.05992447306081932
  },
  {
    "name": "ap_funny",
    "w": 0.05176459869911672
  },
  {
    "name": "bp_attr",
    "w": 0.025348196365971864
  },
  {
    "name": "bil_gap",
    "w": 0.02401940678013255
  }
]
```

## Directional-only DEV (P(A likes B))
```json
{
  "AUROC": 0.5534,
  "AVERAGE_PRECISION": 0.5031,
  "prevalence": 0.4608695652173913
}
```

## Score distributions by gold quadrant (product of p_ab,p_ba)
```json
{
  "YES_YES": {
    "n": 176,
    "mean": 0.25994455786110454,
    "p50": 0.25306711470387105
  },
  "YES_NO": {
    "n": 248,
    "mean": 0.26340123042322444,
    "p50": 0.25613630805420196
  },
  "NO_YES": {
    "n": 245,
    "mean": 0.2516476230110212,
    "p50": 0.24984941676223346
  },
  "NO_NO": {
    "n": 251,
    "mean": 0.2530783251189114,
    "p50": 0.2482372080691214
  }
}
```
