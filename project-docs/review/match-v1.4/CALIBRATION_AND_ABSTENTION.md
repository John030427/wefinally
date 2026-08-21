# Calibration and Abstention

compatibility_score ≠ mutual_interest_probability.

## Abstention (RECIP_MIN top-1)
```json
{
  "th_0.2": {
    "coverage": 1,
    "precision_when_recommend": 0.3150684931506849,
    "always_top1_hit": 0.3150684931506849
  },
  "th_0.3": {
    "coverage": 1,
    "precision_when_recommend": 0.3150684931506849,
    "always_top1_hit": 0.3150684931506849
  },
  "th_0.4": {
    "coverage": 1,
    "precision_when_recommend": 0.3150684931506849,
    "always_top1_hit": 0.3150684931506849
  },
  "th_0.5": {
    "coverage": 0.7808219178082192,
    "precision_when_recommend": 0.3333333333333333,
    "always_top1_hit": 0.3150684931506849
  },
  "th_0.6": {
    "coverage": 0.2328767123287671,
    "precision_when_recommend": 0.17647058823529413,
    "always_top1_hit": 0.3150684931506849
  }
}
```

## Platt calibrator
```json
{
  "a": 0.7177069210250336,
  "b": -1.1136213697039605,
  "type": "platt"
}
```
