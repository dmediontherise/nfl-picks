# Prediction Engine Module (`src/engine/`)

## Overview

The `src/engine` module implements a pure, deterministic, unit-tested NFL prediction engine based on the winning methodology identified in `research/RECOMMENDATION.md`: **Massey Least-Squares Power Ratings (`massey_rating`)**.

## Specification

- **Algorithm**: Massey Least-Squares system $(M + \lambda I) \cdot r = p$ with Ridge penalty $\lambda = 2.0$.
- **Home Field Advantage (HFA)**: $+2.0$ points for non-neutral venue games; $0.0$ points for neutral sites / Super Bowl.
- **Logistic Win Probability**: $P(\text{Home Win}) = \frac{1}{1 + e^{-\text{Margin}/7.0}}$.
- **Confidence Calibration**: Monotonic piecewise calibration mapping $|P(\text{Home Win}) - 0.5|$ to $[50.0, 98.0]$, capped at $\le 60.0$ for probabilities within $[0.42, 0.58]$.
- **Machine-Readable Drivers**: Decomposes projected margins into 3 to 4 active driver factors (drivers with 0.00 magnitude omitted) whose signed magnitude sum reconciles with pre-rounding projected margin to within $0.51$ points.

## Deviations from Research

1. **Market Total Score Derivation**: Projected home and away scores are derived from market total closing lines (`totalLine/2 ± margin/2`, default 44.0) rather than a fixed 22.0 baseline (`predictor.ts:148-151`).
2. **Injury & Roster Adjustment**: An injury term of 1.0 point per listed player injury, capped at 3.0 points per side, is incorporated into the projected margin (`predictor.ts:104-109`) which was absent in the research model. Note that the injury term is inert in `research/backtest-engine.ts` as no injury arrays are supplied during backtests.
3. **Tie Break Adjustment**: Exact score ties are broken by adding one point to the projected winner (`predictor.ts:156-159`), ensuring the engine never outputs drawn games.
