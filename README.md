# Medi Picks 2026

NFL prediction app for the 2026 season, built on a Massey least-squares decision engine.
Every matchup gets a projected score, a win probability, spread and total picks with their
edges, a machine-readable breakdown of what drove the projection, and a written analysis
generated from those same numbers.

**Live site:** https://dmediontherise.github.io/nfl-picks

---

## Quick start

```bash
npm ci
npm start          # dev server
npm test           # app test suite
npm run test:research   # research + backtest harness tests
npm run build      # production build
npm run deploy     # build and publish to GitHub Pages (docs/ on main)
```

---

## How to read the model's track record

The engine is Massey least-squares power ratings, selected from five documented
methodologies backtested over the complete 2025 season — 285 games, 272 regular season plus
13 playoff. Models were fit on weeks 1–12; weeks 13–18 and the playoffs were held out.

**Holdout results (107 games):**

| Metric | Value |
|---|---|
| Straight-up accuracy | 61.68% |
| Against the spread | 57.01% (61-46-0) |
| Brier score | 0.2326 |

**Read the ATS number carefully.** Its 95% Wilson confidence interval is
**[47.55%, 65.99%]**, which straddles both 50% and the 52.38% break-even at -110 odds. The
winning model was also *selected on the holdout set*, which biases that figure upward; after
a Šidák adjustment across the five candidates, the adjusted p-value is **0.6199**.

So: **the against-the-spread edge is not statistically established.** One season of 107 games
is too small a sample to distinguish 57% from chance. The straight-up accuracy is the robust
result. Treat the ATS figure and the backtested ROI as historical description, never as a
projection — and do not size bets against them.

Full analysis, including every model's numbers and the limitations, is in
[`research/RECOMMENDATION.md`](research/RECOMMENDATION.md).

---

## 2026 season behaviour

- **Opens on** regular-season Week 1 (`seasonType=2`, `week=1`).
- **22 stages:** Weeks 1–18, then Wild Card, Divisional, Conference Championships, Super Bowl.
- **Preseason state:** before Week 1 all records are `0-0`, no scores render, and the playoff
  bracket shows TBD placeholders. Seeds appear only once standings actually support them —
  the bracket will not name a #1 seed or a bye before games are played.
- **Changing seasons:** edit the single constant `CURRENT_SEASON` in `src/data/nfl_data.ts`.
  Every API call, stage list, and UI label derives from it.

---

## What the engine produces

`predictGame(input)` in `src/engine/predictor.ts` is pure and deterministic — no network, no
clock, no randomness. It returns a `Prediction` containing:

- `winner`, `homeScore`, `awayScore`, `margin`
- `homeWinProbability` and a calibrated `confidence` that cannot exceed 60 when the game is
  near a coin flip
- `spreadPick` — team, line **signed relative to the picked team**, and edge
- `totalPick` — side, line, projected total, and edge
- `drivers[]` — the factors that produced the margin, each with a signed point magnitude

Drivers are not decorative: their signed magnitudes reconcile with the pre-rounding projected
margin, and a test asserts this over 100+ games. Factors contributing zero are omitted rather
than padded, so a typical game carries three drivers and more when injury data is present.

### Narratives

`buildNarrative(prediction, context)` composes the written analysis from those drivers — 5–8
sentences, leading with the largest factor, with structure that varies by the shape of the
game (dominant favourite, coin flip, model-vs-market disagreement). Tests assert that no two
narratives in a slate share a sentence and that **every numeral in the text traces back to a
field in the prediction**, so the prose cannot invent a statistic.

---

## Testing

```bash
npm test                                  # 34 tests, 6 suites
npm run test:research                     # research + backtest harness
npx tsx research/mutation/verify-mutants.ts   # mutation coverage
```

The research harness has its own mutation suite: ten mutations are applied to a scratch copy
of the tree and each must cause the tests to fail. It covers inverting the ATS cover
comparison, flipping the ROI sign, zeroing Elo's K factor, moving the train/holdout boundary,
altering the Wilson z constant, and — most importantly — **relaxing the history leakage guard
from `<` to `<=`**, which would let each game see its own result and silently inflate every
accuracy figure in the project.

Regenerating results is explicit and deterministic:

```bash
npx tsx research/backtest.ts
npx tsx research/backtest-engine.ts
npx tsx research/significance.ts
```

Running the test suite never writes to `research/results/`.

---

## Layout

```
src/engine/        pure decision engine, narrative generator, performance figures
src/services/      ESPN adapter, prediction consumer, Firebase user data
src/components/    analysis modal, playoff bracket, auth
research/          2025 dataset, five candidate models, backtests, significance analysis
research/mutation/ mutation harness proving the research tests actually detect regressions
docs/              GitHub Pages build output — generated by `npm run deploy`, never edit
```

`docs/` is published output. Hand-editing it will be overwritten on the next deploy.

---

## Stack

React 18 + TypeScript, Tailwind CSS, ESPN public API for schedules and odds, Firebase for
Google auth and prediction sync. The decision engine is dependency-free TypeScript.

---

## Disclaimer

For educational and entertainment purposes. Nothing here is financial advice, and the model's
historical performance does not predict future results. If you or someone you know has a
gambling problem, call **1-800-GAMBLER**.
