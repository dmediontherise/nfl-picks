# NFL Model Recommendation — 2025 Season Backtest

## Winning Methodology

**Winner**: **Massey Least-Squares Power Ratings (`massey_rating`)**

The Massey Least-Squares Power Ratings model achieved the highest out-of-sample Against-The-Spread (ATS) accuracy on the 2025 NFL holdout set (**57.01% ATS**, 95% Wilson confidence interval [47.55%, 65.99%], **61–46–0** record, **+8.84% ROI** at -110 odds). While this point estimate exceeds the sportsbook 52.38% break-even rate on this sample, the 95% Wilson interval straddles both 50.0% and 52.38%, meaning an outperforming ATS edge is not statistically established.

---

## 2025 Season Backtest Results

All models evaluate game projections using a walk-forward rating harness built sequentially from games preceding each target kickoff (train set: Weeks 1–12, 178 games; out-of-sample holdout set: Weeks 13–18 + Playoffs, 107 games), using literature parameters without fitting dataset coefficients.

| Model ID | Model Name | Train SU | Train ATS | Holdout SU | Holdout ATS (95% Wilson CI) | Holdout ATS Record | Holdout Brier | Holdout ROI (-110) |
|---|---|---|---|---|---|---|---|---|
| **massey_rating** | **Massey Least-Squares Power Ratings** | **60.11%** | **46.89%** | **61.68%** | **57.01% [47.55%, 65.99%]** | **61-46-0** | **0.2326** | **+8.84%** |
| `dvoa_efficiency` | DVOA Opponent-Adjusted Efficiency | 60.11% | 49.15% | 63.55% | 56.07% [46.60%, 65.13%] | 60-47-0 | 0.2245 | +7.05% |
| `pythagorean_reg` | Pythagorean Expectation Regression | 60.67% | 49.43% | 63.55% | 54.21% [44.76%, 63.36%] | 58-49-0 | 0.2238 | +3.48% |
| `market_blend` | Market-Blend Consensus Model | 68.54% | 46.33% | 60.75% | 52.83% [43.41%, 62.05%] | 56-50-1 | 0.2180 | +0.85% |
| `elo_qb` | FiveThirtyEight / nfelo Margin-of-Victory Elo | 61.80% | 47.46% | 65.42% | 50.47% [41.10%, 59.80%] | 54-53-0 | 0.2189 | -3.65% |

---

## Exact Parameters for Implementation (Task 002 Engine)

Task 002 should implement the **Massey Least-Squares Power Ratings** engine using the exact specification below:

```typescript
// Core Parameters
const HFA = 2.0;               // Home Field Advantage in points
const RIDGE_LAMBDA = 2.0;      // Ridge regularization penalty (lambda)
const BASELINE_SCORE = 22.0;   // Baseline points per team
const LOGISTIC_SCALE = 7.0;    // Margin logistic scaling factor

// Mathematical Form:
// Solve (M + lambda * I) * r = p
// Where M_ij is game count matrix, p_i is net point diff minus HFA
// Predicted Margin = (r_home - r_away) + HFA
// Home Win Prob = 1 / (1 + exp(-Predicted Margin / 7.0))
// Home Score = round(22.0 + Predicted Margin / 2)
// Away Score = round(22.0 - Predicted Margin / 2)
```

---

## Limitations & Disclosures

1. **Selection Bias**: Selecting the winning model as the highest performer on the holdout split introduces selection bias. The reported 57.01% holdout figure reflects this optimistic selection effect across 5 candidate models. After Šidák adjustment for selection bias, the result is not statistically significant (p = 0.6199).
2. **Realistic 2026 Expectation**: Due to sample size constraints (107 games) and wide confidence intervals [47.55%, 65.99%], the realistic expected ATS performance for the 2026 season is materially lower than the 57.01% holdout point estimate and should be assumed near the 50.0%–52.38% baseline range.
3. **Honest Bottom Line**: The straight-up (SU) accuracy (61.68%) and Brier score calibration (0.2326) represent the robust quantitative output of the Massey model; an outperforming ATS betting edge is not statistically established on this sample.
4. **Negative Evidence on Train Split**: While `massey_rating` achieved 57.01% ATS (61-46-0) on the holdout split, it went 83-94-1 (46.89%) ATS on the train split (Weeks 1-12). Every candidate model finished below 50% ATS on train.
5. **Full-Season Break-Even Performance**: Across all 285 games of the season, `massey_rating` produced a 144-140 (50.70%) ATS record, below the standard sportsbook break-even threshold of 52.38% (-110 vigorish).
6. **Opening vs. Closing Lines**: Spreads in the backtest reflect available consensus closing lines. In real-time production, lines move dynamically between opening and kickoff.
7. **Absence of In-Game Injuries**: The Massey model operates purely on point differential history without manual adjustment for late-week starting QB injuries.
