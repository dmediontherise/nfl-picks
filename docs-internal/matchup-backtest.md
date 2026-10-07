# Matchup Model Backtest: Unit Efficiency, Scheme, and Red Zone

**Pre-registration timestamp:** 2026-10-06T16:25:00-04:00  
**Pre-registration SHA-256:** `f238f21ac6eea17759c620624eeaf9f8268c37511c43cf6901d871d7171c6d1d`  
**Pre-registration link:** [matchup-backtest-prereg.md](./matchup-backtest-prereg.md) 
**Integrity note:** The pre-registration file's SHA-256 is recorded; it binds that file's *content* to the backtest results. The ordering of the pre-registration file relative to the first holdout run is **not** independently evidenced, and the 16:25 timestamp is self-recorded. Coefficients and shrinkage constants are *stated* to be a-priori (none was tuned on 2024 or 2025 game outcomes) rather than proven so. See the Disclosure.  
**Disclosure:** The ordering of pre-registration and first holdout run is not independently evidenced (the first version of this document was untracked and edited after the results file was written); the decision-rule correction method described below was named after the run.

---

## Verdict Summary

**Verdict M1:** DO NOT ADOPT  
**Verdict M2:** DO NOT ADOPT  
**Verdict M3:** DO NOT ADOPT  

**M2 verdict scope:** The M2 verdict covers only the inputs `calculateM2Adjustment` actually uses — man/zone coverage tendency and the personnel-vs-front term. It does **not** cover Cover 2/3 (those counters are written but never read) or defensive front alignment beyond the personnel-vs-front term. This scope reflects what the code actually consumes in this backtest.

---

## 1. Executive Summary & Decision Rule Application

Under the project's pre-registered decision rule, all three candidate models fail out-of-sample adoption criteria. Plain Massey power ratings remain the best-performing candidate tested here. Adding unit-efficiency, scheme, or red-zone matchup adjustments produced no measurable improvement over that baseline in this backtest based on the data tested here.

### Pre-Registered Decision Rule (Verbatim)
A candidate is **ADOPT** only if:
1. **(a)** pooled paired-Brier improvement is positive with a bootstrap 95% interval excluding zero after correction, **and**
2. **(b)** the improvement has the same sign in 2024 and 2025 individually, **and**
3. **(c)** it beats at least 95% of its placebo permutations.

Otherwise, the verdict is **DO NOT ADOPT** (clearly no gain) or **INCONCLUSIVE** (positive but not clearing the bar). ATS and ROI are reported for full transparency but are **not** part of the decision rule.

### Decision Rule Evaluation Matrix

For criterion (a), the bootstrap paired-Brier p-values were corrected with Holm-Bonferroni across the three candidates (M1, M2, M3); Holm was the reading of "correction" in R6(a). Ordered raw p-values are M2 0.4932 < M3 0.6834 < M1 0.9024, so the first Holm threshold is 0.05/3 = 0.0167 and no candidate clears it; Holm-adjusted p-values are 1.0000 for all three.

| Candidate | (a) Pooled Paired-Brier Improvement [95% CI]; raw p, Holm-adj p (m=3) | (b) Consistency Across 2024 & 2025 | (c) Beats >= 95% Placebo Permutations | Verdict |
|---|---|---|---|---|
| **M1: Unit Efficiency** | **-0.004135** [-0.010461, +0.002039] (Worse than Massey); raw p 0.9024, Holm-adj p 1.0000 | No (+0.0051 in 2024, -0.0230 in 2025) | **35.5%** (Fails 95% threshold) | **DO NOT ADOPT** |
| **M2: Scheme Matchup** | **+0.000022** [-0.001928, +0.002065] (Straddles zero); raw p 0.4932, Holm-adj p 1.0000 | Mixed (-0.0002 in 2024, +0.0006 in 2025) | **57.0%** (Fails 95% threshold; no measurable improvement detected) | **DO NOT ADOPT** |
| **M3: Red Zone** | **-0.000627** [-0.003170, +0.001818] (Worse than Massey); raw p 0.6834, Holm-adj p 1.0000 | No (-0.0004 in 2024, -0.0011 in 2025) | **33.5%** (Fails 95% threshold) | **DO NOT ADOPT** |

None of the three clears corrected criterion (a), so no verdict value changes under the corrected criteria; all three remain **DO NOT ADOPT**.

---


### Statistical Tests (McNemar & Holm-Bonferroni)

**Holm-Bonferroni (criterion (a)):** applied to the pooled paired-Brier p-values of M1, M2, M3 as reported in the evaluation matrix above; first threshold 0.05/3 = 0.0167, adjusted p = 1.0000 for all three.

**McNemar's test (SU, paired against `massey_rating`):** discordant SU pairs per candidate with two-sided exact binomial McNemar p-values, pooled and per season, reported as a table inside the metrics section below (section 2).

## 2. Full Backtest Metrics

Evaluated walk-forward across 328 total holdout games:
- **2024 Holdout:** Weeks 5–18 and playoffs (221 games; weeks 1–4 used as walk-forward warm-up).
- **2025 Holdout:** Weeks 13–18 and playoffs (107 games, replicating project baseline).
- **Pooled Holdout:** 328 games.

### Pooled Holdout (328 Games)

| Model | SU Accuracy | Brier Score | Log Loss | ATS Record | ATS Win % [95% Wilson CI] | ROI @ -110 | Paired Brier vs Massey [95% CI] | Placebo Beat % |
|---|---|---|---|---|---|---|---|---|
| **Massey Baseline** | **66.77%** (219/328) | **0.2151** | **0.6197** | 163-162-3 | 50.15% [44.75%, 55.55%] | -4.21% | Baseline | N/A |
| **M1 Unit Efficiency** | 65.55% (215/328) | 0.2192 | 0.6294 | 165-160-3 | 50.77% [45.36%, 56.16%] | -3.05% | -0.0041 [-0.0105, +0.0020] | 35.5% |
| **M2 Scheme Matchup** | 67.38% (221/328) | 0.2151 | 0.6196 | 161-164-3 | 49.54% [44.15%, 54.94%] | -5.38% | +0.0000 [-0.0019, +0.0021] | 57.0% |
| **M3 Red Zone** | 67.07% (220/328) | 0.2158 | 0.6222 | 166-159-3 | 51.08% [45.67%, 56.46%] | -2.47% | -0.0006 [-0.0032, +0.0018] | 33.5% |

### 2024 Holdout (221 Games: Weeks 5–18 + Postseason)

| Model | SU Accuracy | Brier Score | Log Loss | ATS Record | ATS Win % [95% Wilson CI] | ROI @ -110 |
|---|---|---|---|---|---|---|
| **Massey Baseline** | 69.23% (153/221) | 0.2067 | 0.6014 | 102-116-3 | 46.79% [40.32%, 53.37%] | -10.53% |
| **M1 Unit Efficiency** | 70.14% (155/221) | 0.2016 | 0.5906 | 113-105-3 | 51.83% [45.23%, 58.37%] | -1.03% |
| **M2 Scheme Matchup** | 68.78% (152/221) | 0.2069 | 0.6011 | 100-118-3 | 45.87% [39.43%, 52.45%] | -12.26% |
| **M3 Red Zone** | 70.59% (156/221) | 0.2071 | 0.6030 | 106-112-3 | 48.62% [42.10%, 55.20%] | -7.08% |

### 2025 Holdout (107 Games: Weeks 13–18 + Postseason)

| Model | SU Accuracy | Brier Score | Log Loss | ATS Record | ATS Win % [95% Wilson CI] | ROI @ -110 |
|---|---|---|---|---|---|---|
| **Massey Baseline** | 61.68% (66/107) | 0.2326 | 0.6575 | 61-46-0 | 57.01% [47.55%, 65.99%] | +8.84% |
| **M1 Unit Efficiency** | 56.07% (60/107) | 0.2556 | 0.7096 | 52-55-0 | 48.60% [39.38%, 57.94%] | -7.22% |
| **M2 Scheme Matchup** | 64.49% (69/107) | 0.2320 | 0.6576 | 61-46-0 | 57.01% [47.55%, 65.99%] | +8.84% |
| **M3 Red Zone** | 59.81% (64/107) | 0.2337 | 0.6618 | 60-47-0 | 56.07% [46.63%, 65.11%] | +7.05% |

### McNemar SU Tests (paired against `massey_rating`, pooled and per season)

| Holdout | Candidate | b (candidate correct, Massey wrong) | c (candidate wrong, Massey correct) | Discordant n | McNemar p (exact, two-sided) |
|---|---|---|---|---|---|
| Pooled (328) | M1 Unit Efficiency | 15 | 19 | 34 | 0.6076 |
| Pooled (328) | M2 Scheme Matchup | 8 | 6 | 14 | 0.7905 |
| Pooled (328) | M3 Red Zone | 8 | 7 | 15 | 1.0000 |
| 2024 (221) | M1 Unit Efficiency | 12 | 10 | 22 | 0.8318 |
| 2024 (221) | M2 Scheme Matchup | 4 | 5 | 9 | 1.0000 |
| 2024 (221) | M3 Red Zone | 6 | 3 | 9 | 0.5078 |
| 2025 (107) | M1 Unit Efficiency | 3 | 9 | 12 | 0.1460 |
| 2025 (107) | M2 Scheme Matchup | 4 | 1 | 5 | 0.3750 |
| 2025 (107) | M3 Red Zone | 2 | 4 | 6 | 0.6875 |

No candidate showed a statistically detectable difference from the Massey baseline in SU correctness at any holdout (all p >= 0.146). McNemar is reported for transparency and is not part of the decision rule.

---

## 3. Placebo Permutation Analysis

To guard against data mining, each candidate was subjected to 200 within-week permutations (shuffling team ratings exclusively among teams playing in the exact same week, using fixed PRNG seeds).

- **M1 Unit Efficiency:** Beats only **35.5%** of placebo permutations. A randomly permuted unit efficiency rating produces a better Brier score than the true team unit efficiency 64.5% of the time. This is consistent with pass/rush EPA splits overfitting in-season samples and degrading general power ratings in this sample.
- **M2 Scheme Matchup:** Beats **57.0%** of placebo permutations. This is virtually indistinguishable from a 50/50 coin flip; no measurable improvement was detected in this sample.
- **M3 Red Zone:** Beats only **33.5%** of placebo permutations. Red zone scoring variance was not repeatable enough to yield a measurable improvement in this sample; in this test, the adjustment was associated with worse probability calibration.

---

## 4. Ablation Analysis: Scheme Subcomponents (M2)

To evaluate the specific sub-dimensions requested by the user, we isolated and ablated each component of M2 on the pooled holdout:

| Ablation Configuration | Pooled Brier Score | Difference vs Full M2 | Observations |
|---|---|---|---|---|
| **Full M2 Scheme Model** | 0.2151 | — | Man/zone and personnel-vs-front terms only; coverage-type (Cover 2/3) and defensive-front counts are charted but are not terms of the adjustment. |
| **Without Man vs Zone** | **0.2149** | -0.0002 (Better) | Removing man vs zone charting slightly *improves* calibration. |
| **Without Coverage Type (Cover 2/3 mix)** | 0.2151 | 0.0000 (No change) | **NOT TESTED.** This is not a test of Cover 2 or Cover 3: the counters are charted (`backtest-matchup.ts` tracks them) but never read by `calculateM2Adjustment`. M2 does not use Cover-2/3 data, so this backtest is silent on whether Cover 2 or Cover 3 matchups matter. |
| **Without Personnel (11, 12, 21 personnel)** | 0.2152 | +0.0001 (Negligible) | Personnel usage shares showed no measurable improvement over Massey in this sample. |
| **Without Defensive Front (3-4 vs 4-3 vs nickel+)** | 0.2152 | +0.0001 (Negligible) | Partially tested: the M2 verdict covers front only through the personnel-vs-front term (`matchup-models.ts:316`); it does not test front alignment beyond that (this row disables the same shared term as the personnel ablation, so the Brier value is identical). |

### Component-by-Component Findings:
1. **Man vs Zone Coverage:** In theory, quarterbacks exhibit distinct efficiency profiles against man vs zone. In practice, defensive coordinators alter coverage distribution on a game-plan basis, and pass-play sample sizes (~25-35 pass plays per week) are too small to reliably project weekly matchups.
2. **Cover 2 and Cover 3 Mix — NOT TESTED:** Charted coverage tags account for ~49% of snaps, but `calculateM2Adjustment` does not read the Cover-2/3 counters (they are written and never consumed), so this backtest is silent on whether Cover 2 or Cover 3 matchups matter. Testing that hypothesis would require a new, separately pre-registered candidate with its own holdout run.
3. **11 Personnel, 12 Personnel, 21 Personnel:** Nearly all NFL offenses operate out of 11 personnel 60–75% of the time. The marginal variance between 11, 12, and 21 personnel packages showed no measurable improvement out-of-sample in this backtest.
4. **3-4 vs 4-3 Base Fronts:** Modern defenses play nickel or dime (5+ defensive backs) on over 65% of snaps. In this backtest the M2 verdict covers defensive front only through the personnel-vs-front term; front alignment beyond that was not tested (see §4).

---

## 5. Candidate Model Specifications & Pre-Registration Rationale

### M1: Unit Efficiency (`unit_efficiency`)
- Pass and rush efficiency shrinkage constants were set a priori: $k_{pass} = 150$ dropbacks, $k_{rush} = 100$ carries.
- Weighting: $w_{pass} = 0.65$, $w_{rush} = 0.35$.
- Margin scaling: $c_{unit} = 15.0$.

### M2: Scheme Matchup (`scheme_matchup`)
- Tested under live-use constraints: in-season evidence blended with prior-season tendencies ($w_{prior} = 100 / (n + 100)$).
- 2025 games blended with 2024 prior season scheme data.
- **2024 games and 2023 participation:** 2024 M2 games were **not** blended with 2023 priors - 2023 participation was dropped. `runFullMatchupBacktest` calls `evaluateCandidatesOnGames(games2024, weeklyStates2024, null)` (`research/backtest-matchup.ts:528`), passing a null prior state, and `blend()` returns current-season values only when `priorState` is null (`research/matchup-models.ts:194`). The reason is data availability, not schema: the run's data manifest declares PBP only for 2024 and 2025 (`research/data/nflverse-cache.ts:10-11`; there is no `pbp_2023` key), and `buildSeasonWeeklyStatesStream` accepts only `pbp_2024 | pbp_2025` keys (`research/backtest-matchup.ts:160`), so no 2023 prior state can be constructed. 2023 participation (`pbp_participation_2023.csv`) is declared (`nflverse-cache.ts:12`) and is schema-identical to 2024, but cannot be joined to a 2023 PBP season that is not loaded.
- Scaling factor: $c_{scheme} = 10.0$.

### M3: Red Zone (`red_zone`)
- Heavy shrinkage: $k_{rz} = 30$ trips (~10 games equivalent) to reflect high sample variance.
- Scaling factor: $c_{rz} = 1.5$.

---

## 6. What This Backtest Cannot Speak To

1. **Roster Injuries:** Historical depth charts with daily injury statuses do not exist in the nflverse backtest data. The engine's roster injury modifier is therefore inert in historical backtests.
2. **2026 Live Scheme Feeds:** Current-season participation data (`pbp_participation_2026.csv`) returns HTTP 404 until post-season publication; scheme models must always rely on prior-season priors in-season.
3. **Defensive Front Alignment:** Front classification (3-4 vs 4-3 vs nickel+) is an inferred headcount proxy, not an officially charted alignment.
4. **Pass-Only Coverage Fill:** Coverage types are charted exclusively on pass plays (~49% of all plays). Run plays contain no coverage tags.

---

## 7. Recommendation for Task 027

**Do not wire unit efficiency, scheme tendencies, or red zone splits into the live prediction engine.**
The empirical evidence indicates intervals straddling zero for M2 and M3 and worse calibration for M1 in this sample; across candidates, additions did not meet the pre-registered adoption criteria (failures on at least one criterion). The Massey least-squares decision engine remains the best-performing candidate tested here and stays the decision core. The null findings in this sample should not be interpreted as proof that the tested scheme effects do not exist; only that no measurable improvement was detected under the tested design.
Task 027 should treat unit stats and scheme priors as **contextual descriptive displays and narrative drivers** for user analysis, rather than margin modifiers that corrupt prediction accuracy.
