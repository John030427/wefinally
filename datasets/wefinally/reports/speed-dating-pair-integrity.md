# Speed Dating Pair Integrity (v1.3)

- identity_mode: **IDENTITY_RECONSTRUCTED_FROM_PREMATCH_FINGERPRINT**
- raw encounter rows: 8378
- directed encounters kept: 8378
- canonical undirected pairs: 8306
- quarantined records: 32

## Ranking query candidate stats (directed)

```json
{
  "n_queries": 549,
  "min": 5,
  "p10": 8,
  "median": 16,
  "mean": 15.188,
  "p90": 21,
  "max": 22,
  "with_ge2": 549,
  "with_ge3": 549,
  "with_ge5": 549,
  "with_ge10": 462
}
```

PASS: median candidates > 1 — real ranking possible.

## Quarantine sample

```json
[
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_5cf348059e69|fp_8a00a72d2079",
    "rows": [
      828,
      838
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_8a00a72d2079|fp_a44fb43b10ec",
    "rows": [
      829,
      839
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_8a00a72d2079|fp_ed5bcdc16cac",
    "rows": [
      830,
      840
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_382af5d4f37e|fp_8a00a72d2079",
    "rows": [
      831,
      841
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_8a00a72d2079|fp_b931a7116b0f",
    "rows": [
      833,
      843
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_2e8deadb4b3f|fp_8a00a72d2079",
    "rows": [
      834,
      844
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_23c0fc2700b6|fp_8a00a72d2079",
    "rows": [
      836,
      846
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_5db312104729|fp_8a00a72d2079",
    "rows": [
      837,
      847
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_9fc76d4c5eb7|fp_c83291e7e538",
    "rows": [
      910,
      911
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_a8e89e898a2e|fp_c83291e7e538",
    "rows": [
      920,
      921
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_c83291e7e538|fp_fe29b61a73b7",
    "rows": [
      930,
      931
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_5888b35b2ac2|fp_c83291e7e538",
    "rows": [
      940,
      941
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_17641478ae65|fp_c83291e7e538",
    "rows": [
      960,
      961
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_0c16f4f390e7|fp_c83291e7e538",
    "rows": [
      970,
      971
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_a87a1a4311f3|fp_c83291e7e538",
    "rows": [
      990,
      991
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "3|fp_51621565d246|fp_c83291e7e538",
    "rows": [
      1000,
      1001
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "13|fp_835d91ceea06|fp_bacef760e9d8",
    "rows": [
      4851,
      4852
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "13|fp_513d85a33955|fp_835d91ceea06",
    "rows": [
      4860,
      4861
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "13|fp_68e73e5f3a73|fp_835d91ceea06",
    "rows": [
      4869,
      4870
    ]
  },
  {
    "reason": "bilateral_inconsistent",
    "key": "13|fp_835d91ceea06|fp_89de77001fad",
    "rows": [
      4878,
      4879
    ]
  }
]
```
