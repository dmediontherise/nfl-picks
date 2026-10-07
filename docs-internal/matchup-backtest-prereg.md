# Matchup Model Backtest Pre-registration

**Pre-registration timestamp:** 2026-10-06T16:25:00-04:00

This document holds only what was fixed before evaluation: candidates, constants, protocol, metrics, and the decision rule. It contains no results and no verdicts.

---

## Candidate list

- **M1 - Unit Efficiency:** adjusts the Massey margin by matchup-specific pass/rush EPA efficiency of offense vs defense, shrunk toward league mean.
- **M2 - Scheme Matchup:** adjusts the Massey margin by scheme matchup terms - man/zone coverage rates vs opponent EPA by coverage, and offensive personnel groupings vs opponent EPA by personnel - with optional prior-season blending. Coverage-type (Cover 2/3) and defensive-front counts are charted for reporting but are not terms of the adjustment.
- **M3 - Red Zone:** adjusts the Massey margin by red zone points-per-trip efficiency (offense vs defense), shrunk toward league mean.

All candidates are additive margin adjustments on top of `predictMassey`; probabilities come from the shared logistic transform in `marginToPrediction`.

---

## Constants with a-priori rationale

None of the constants below were tuned on 2024 or 2025 game outcomes.

### M1 constants (research/matchup-models.ts)

| Constant | Value | A-priori rationale |
|---|---|---|
| `M1_K_PASS` | 150 | Dropbacks to reach 50% shrinkage toward league mean; pass sample sizes are the larger half of the distribution. |
| `M1_K_RUSH` | 100 | Carries to reach 50% shrinkage; slightly tighter than pass because per-carry outcomes are less noisy than per-dropback. |
| `M1_W_PASS` | 0.65 | Weight of pass-side advantage; pass efficiency carries more of expected-score variance a priori. |
| `M1_W_RUSH` | 0.35 | Complement of `M1_W_PASS`; weights sum to 1. |
| `M1_SCALE` | 15.0 | Converts unit-efficiency units to points of margin; kept small so an adjustment can move a spread only where the sample is large. |

### M2 constants (research/matchup-models.ts)

| Constant | Value | A-priori rationale |
|---|---|---|
| `M2_K_SCHEME` | 100 | Prior-season blend weight in plays: with 100 in-season charted plays, current and prior season count equally. |
| `M2_SCALE` | 10.0 | Converts scheme-advantage units to points of margin; smaller than M1's scale because scheme charting is coarser. |
| Man/zone default rates | 0.35 / 0.65 | Fallback league man/zone shares when a team has no charted plays; matches long-run league base rates. |
| Personnel default shares | 0.60 / 0.20 | Fallback 11/12 personnel shares when uncharted; reflects modern base rates. |
| Scheme mix | 0.7 coverage / 0.3 personnel | Coverage-vs-personnel split inside the scheme term; fixed a priori as the larger share to the better-charted dimension. |

### M3 constants (research/matchup-models.ts)

| Constant | Value | A-priori rationale |
|---|---|---|
| `M3_K_RZ` | 30 | Red zone trips to reach 50% shrinkage; roughly a 10-game sample, chosen because per-trip scoring is high variance. |
| `M3_SCALE` | 1.5 | Converts points-per-trip differential to margin points; red zone efficiency is a small slice of scoring. |
| League PPT fallback | 4.8 | League points per red zone trip when no trips are recorded; pre-set to the long-run NFL average. |

### Shared prediction constants (research/matchup-models.ts, `marginToPrediction`)

| Constant | Value | A-priori rationale |
|---|---|---|
| Baseline score | 22.0 | Symmetric scoring baseline used to convert a margin into predicted scores. |
| Logistic scale | 7.0 | Divisor in the win-probability sigmoid; a 7-point margin implies roughly 0.84 win probability. |

### Protocol constants (research/backtest-matchup.ts)

| Constant | Value | A-priori rationale |
|---|---|---|
| 2024 holdout | weeks >= 5 in postseason-inclusive filter (`seasonType == 2 && week >= 5`) or playoffs | First four weeks used as walk-forward warm-up. |
| 2025 holdout | weeks >= 13 in postseason-inclusive filter or playoffs | Replicates the project's baseline holdout definition. |
| Minimum games per season | 280 of 285 | Coverage guard; aborts the run if data ingestion regresses. |
| Placebo permutations | 200, seeds `20261006 + p` | Fixed seeds so the permutation test is reproducible. |
| Bootstrap resamples | 10,000, seeds `20261001/20261002/20261003` for M1/M2/M3 | Fixed seeds for a reproducible paired-Brier interval. |
| 2024 prior state | `null` | No 2023 prior is built (see the handling note in `matchup-backtest.md`); 2024 uses in-season 2024 charting only. |
| 2025 prior state | 2024 end-of-season state | Prior-season blending per `M2_K_SCHEME`. |

---

## Metrics

Collected on the pooled holdout and on each season's holdout:

1. Straight-up (SU) accuracy.
2. Brier score (lower is better) and log loss (lower is better).
3. ATS record, ATS win percentage with 95% Wilson interval.
4. ROI at -110 (reported for transparency; not part of the decision rule).
5. Paired bootstrap Brier improvement vs the `massey_rating` (Massey) baseline: mean, 95% percentile interval, one-sided p-value.
6. Holm-Bonferroni correction across the three candidates applied to the pooled paired-Brier p-value used in criterion (a).
7. Placebo permutation beat percentage (200 within-week permutations per candidate).
8. McNemar's test for SU correctness paired against the `massey_rating` baseline, pooled and per season.
9. Ablations of M2 by component: man/zone, personnel groupings, defensive front, and coverage type (Cover 2/3 mix), each reported as its own row.

---

## Decision Rule (Verbatim)

A candidate is **ADOPT** only if:
1. **(a)** pooled paired-Brier improvement is positive with a bootstrap 95% interval excluding zero after correction, **and**
2. **(b)** the improvement has the same sign in 2024 and 2025 individually, **and**
3. **(c)** it beats at least 95% of its placebo permutations.

Otherwise, the verdict is **DO NOT ADOPT** (clearly no gain) or **INCONCLUSIVE** (positive but not clearing the bar). ATS and ROI are reported for full transparency but are **not** part of the decision rule.
