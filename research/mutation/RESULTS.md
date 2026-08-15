# Research Mutation Testing Results

## Summary
- Total Mutations Tested: 10
- Mutations Killed: 10
- Mutations Survived: 0
- Mutation Coverage: 100%

## Mutation Registry & Verification Results

### 1. ATS Cover Comparison Inverted (`>` ↔ `<`)
- **Target File**: `research/backtest.ts`
- **Mutation**: `if (coverMargin > 0) actualCover = 'home';` → `if (coverMargin < 0) actualCover = 'home';`
- **Status**: KILLED
- **Killing Test**: `hand-computed fixture: ATS win/loss/push classification & roiAt110`
- **Observed Failure**: Expected ATS record `'3-1-1'`, got `'1-3-1'`.

### 2. ROI Loss Term Sign Flipped (`-` ↔ `+`)
- **Target File**: `research/backtest.ts`
- **Mutation**: `const netUnits = wins * (10 / 11) - losses;` → `const netUnits = wins * (10 / 11) + losses;`
- **Status**: KILLED
- **Killing Test**: `hand-computed fixture: ATS win/loss/push classification & roiAt110`
- **Observed Failure**: Expected `roiAt110` of `0.3455`, got `0.7455`.

### 3. Leakage Guard Relaxed in Backtest (`<` ↔ `<=`)
- **Target File**: `research/backtest.ts`
- **Mutation**: `return allGames.filter(g => new Date(g.date).getTime() < targetTime);` → `return allGames.filter(g => new Date(g.date).getTime() <= targetTime);`
- **Status**: KILLED
- **Killing Test**: `leakage guard: history contains no game at or after target kickoff date...`
- **Observed Failure**: Leakage detected: history game date is `>=` target game date and target game present in its own history.

### 4. Leakage Guard Relaxed in Engine Backtest (`<` ↔ `<=`)
- **Target File**: `research/backtest-engine.ts`
- **Mutation**: `return allGames.filter(g => new Date(g.date).getTime() < targetTime);` → `return allGames.filter(g => new Date(g.date).getTime() <= targetTime);`
- **Status**: KILLED
- **Killing Test**: `leakage guard: history contains no game at or after target kickoff date...`
- **Observed Failure**: Leakage detected: engine history game date is `>=` target game date.

### 5. Elo K Factor Set to 0 (`K = 20` → `K = 0`)
- **Target File**: `research/models/elo.ts`
- **Mutation**: `const K = 20;` → `const K = 0;`
- **Status**: KILLED
- **Killing Test**: `model fixture: Elo K factor updates ratings after history games`
- **Observed Failure**: Expected `homeWinProb > 0.65`, got `0.5689` (ratings failed to update).

### 6. Elo Home-Field Advantage Set to 0 (`HFA = 48` → `HFA = 0`)
- **Target File**: `research/models/elo.ts`
- **Mutation**: `const HFA = game.neutralSite ? 0 : 48;` → `const HFA = 0;`
- **Status**: KILLED
- **Killing Test**: `model fixture: Elo HFA grants home team > 0.55 win probability...`
- **Observed Failure**: Expected `homeWinProb > 0.55`, got `0.5000` (HFA omitted).

### 7. Train/Holdout Week Boundary Shifted (`12` → `13`)
- **Target File**: `research/backtest.ts`
- **Mutation**: `const trainGames = allGames.filter(g => g.seasonType === 2 && g.week <= 12);` → `const trainGames = allGames.filter(g => g.seasonType === 2 && g.week <= 13);`
- **Status**: KILLED
- **Killing Test**: `backtest fixture: runBacktest produces expected train and holdout game counts`
- **Observed Failure**: Expected `trainGamesCount` of `178`, got `194`.

### 8. Wilson Interval Constant Altered (`z = 1.96` → `z = 1.64`)
- **Target File**: `research/significance.ts`
- **Mutation**: `const z = 1.959963984540054;` → `const z = 1.6448536269514722;`
- **Status**: KILLED
- **Killing Test**: `hand-computed fixture: Wilson 95% interval and Sidak adjustment`
- **Observed Failure**: Expected lower Wilson bound `0.4755`, got `0.4950`.

### 9. Šidák Selection Exponent Changed (`modelsCompared` → `1`)
- **Target File**: `research/significance.ts`
- **Mutation**: `const selectionAdjustedPValue = Number((1 - Math.pow(1 - winningPValueCoinflip, modelsCompared)).toFixed(4));` → `const selectionAdjustedPValue = Number((1 - Math.pow(1 - winningPValueCoinflip, 1)).toFixed(4));`
- **Status**: KILLED
- **Killing Test**: `hand-computed fixture: Wilson 95% interval and Sidak adjustment`
- **Observed Failure**: Expected `selectionAdjustedPValue` of `0.6199`, got `0.1687`.

### 10. Massey Score Formula Inverted
- **Target File**: `research/models/massey.ts`
- **Mutation**: `const homeScore = Math.max(0, Math.round(22.0 + predictedMargin / 2));` → `const homeScore = Math.max(0, Math.round(22.0 - predictedMargin / 2));`
- **Status**: KILLED
- **Killing Test**: `model fixture: Massey model projects higher score for stronger team`
- **Observed Failure**: Expected `homeScore > awayScore` for stronger team, got `homeScore < awayScore`.
