# Prior-Season Carryover Weight Backtest

<!-- PRE-REGISTRATION START -->
## Pre-registration

**Pre-registration timestamp:** 2026-10-11T21:10:00-04:00

This pre-registration specifies the candidate schedules, evaluation dataset, primary metric, secondary metrics, and decision rule prior to final backtest execution.

### Objective
Determine the optimal weighting schedule for prior-season (2024) game history when predicting current-season (2025) games using the Massey Least-Squares engine.

### Candidate Schedules
Candidates evaluate prior-season weight $w$ applied to all 2024 games (seasonType 2 and 3), while all 2025 games kicking off strictly before the target game kick off enter with weight 1.0:

1. **Fixed weights ($w \in \{0, 0.1, 0.25, 0.5, 0.75, 1.0\}$)**:
   - `fixed_0`: $w = 0$
   - `fixed_0.1`: $w = 0.1$
   - `fixed_0.25`: $w = 0.25$
   - `fixed_0.5`: $w = 0.5$
   - `fixed_0.75`: $w = 0.75$
   - `fixed_1.0`: $w = 1.0$

2. **Linear decay schedules ($w_k = \max(0, 1 - (k-1)/N)$ for current-season week $k$ with $N \in \{4, 8, 12, 17\}$)**:
   - `decay_4`: $N = 4$
   - `decay_8`: $N = 8$
   - `decay_12`: $N = 12$
   - `decay_17`: $N = 17$

### Evaluation Dataset & Protocol
- Target games: All 2025 regular season games (weeks 1–18, seasonType 2).
- Engine constants: Unchanged from production engine (HFA = 2.0, Ridge $\lambda = 2.0$, Logistic scale = 7.0). No injury adjustments and no market inputs to rating.
- For each target game:
  - History consists of all 2024 games (seasonType 2 and 3) weighted by candidate schedule $w(k)$, plus all 2025 games kicking off strictly before the target game kickoff date/time weighted at 1.0.

### Metrics
- **Primary metric**: Multi-class / binary log loss on home win probabilities across all 2025 regular season games (weeks 1–18).
- **Secondary metrics**:
  - Brier score
  - Straight-up (SU) accuracy
  - Log loss segmented by season splits: Weeks 1–4, Weeks 5–9, Weeks 10–18.

### Decision Rule
- Select the candidate with the lowest primary log loss on the full 2025 regular season.
- If the winning candidate beats the runner-up by less than 0.002 in primary log loss, prefer the simpler schedule (fixed weight over linear decay, then lower $w$ or lower $N$).
<!-- PRE-REGISTRATION END -->

**Pre-registration SHA-256:** `feebf6b9f50d3fd6b25384db7fdfa3a77bfa035a4b3099f91ecf7c110ce4bb5a`

---

## Results

### Summary Table (2025 Regular Season, Weeks 1–18, N = 272 games)

| Candidate ID | Schedule Specification | Primary Log Loss | Primary Brier | Primary SU Accuracy | Weeks 1–4 Log Loss | Weeks 5–9 Log Loss | Weeks 10–18 Log Loss |
|---|---|---|---|---|---|---|---|
| **decay_4** | $\max(0, 1 - (k - 1) / 4)$ | **0.6255** | **0.2179** | **65.07%** | **0.5710** | 0.6589 | 0.6336 |
| `fixed_0.1` | $w = 0.1$ | 0.6394 | 0.2237 | 63.60% | 0.6033 | 0.6691 | 0.6408 |
| `decay_8` | $\max(0, 1 - (k - 1) / 8)$ | 0.6394 | 0.2237 | 62.87% | 0.5712 | 0.7120 | 0.6336 |
| `decay_12` | $\max(0, 1 - (k - 1) / 12)$ | 0.6431 | 0.2247 | 62.87% | 0.5715 | 0.7144 | 0.6396 |
| `fixed_0.25` | $w = 0.25$ | 0.6448 | 0.2257 | 63.60% | 0.5814 | 0.6860 | 0.6531 |
| `fixed_0` | $w = 0$ | 0.6511 | 0.2297 | 59.93% | 0.6798 | 0.6589 | 0.6336 |
| `decay_17` | $\max(0, 1 - (k - 1) / 17)$ | 0.6519 | 0.2282 | 62.87% | 0.5717 | 0.7198 | 0.6542 |
| `fixed_0.5` | $w = 0.5$ | 0.6582 | 0.2312 | 63.60% | 0.5740 | 0.7071 | 0.6721 |
| `fixed_0.75` | $w = 0.75$ | 0.6694 | 0.2358 | 62.50% | 0.5724 | 0.7214 | 0.6877 |
| `fixed_1.0` | $w = 1.0$ | 0.6784 | 0.2394 | 62.13% | 0.5721 | 0.7317 | 0.7005 |

### Selected Schedule for Task 045

**Decision**:
The winning schedule is **`decay_4`** ($N = 4$), which achieves a primary log loss of **0.6255**. It defeats the runner-up (`fixed_0.1` at 0.6394) by **0.0139** in primary log loss, well exceeding the pre-registered 0.002 margin required for simplification override.

Task 045 implementation instruction:
> **"Prior-season games weight $\max(0, 1 - (k - 1) / 4)$ in current-season week $k$."**

### Analysis and Disclosures
1. **Margin over Baselines**:
   - The winner (`decay_4`, log loss 0.6255) beats unweighted full carryover ($w = 1.0$, log loss 0.6784) by **0.0529** in log loss and +2.94% in straight-up accuracy.
   - The winner beats zero carryover ($w = 0$, log loss 0.6511) by **0.0256** in log loss and +5.14% in straight-up accuracy.
2. **What the Data Does Not Show**:
   - The data does not show that prior-season signal persists into mid-season: by Week 5 ($w_k = 0$), discarding prior-season games avoids degrading predictions in weeks 5–9 (log loss 0.6589 for `decay_4` vs 0.7317 for $w=1.0$).
   - The data does not show statistical justification for slow decays ($N=12, 17$) or heavy static weights ($w \ge 0.5$), both of which strictly underperform rapid decay and low weights.

