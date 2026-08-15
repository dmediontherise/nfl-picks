# Medi Picks 2026

**Medi Picks 2026** is an advanced NFL prediction application powered by a quantitative Massey decision engine. It provides analysis, score projections, spread edges, and machine-readable driver breakdowns for every 2026 NFL season matchup.

## 2026 Season Behavior

The application is configured for the **2026 NFL season**:
- **Default Stage**: Opens on regular-season Week 1 (`seasonType=2`, `week=1`).
- **22 Stage Coverage**: Offers navigation across all 18 regular season weeks and all 4 postseason stages (Wild Card, Divisional, Conference Championships, Super Bowl).
- **Preseason Baseline**: All team records begin at `0-0` before Week 1 kickoff.
- **Configuring Future Seasons**: To update the application season for future years, modify the single exported constant `export const CURRENT_SEASON = 2026` in `src/data/nfl_data.ts`. All API calls and UI labels derive from this constant.

## How to read the model's track record

Historical model performance is evaluated over a 107-game out-of-sample holdout set from the 2025 season:
- **Holdout ATS Point Estimate**: 57.01% (61–46–0 record across $n = 107$ games).
- **95% Wilson Confidence Interval**: [47.55%, 65.99%].
- **Interpretation**: Because the 95% confidence interval straddles both 50.0% and the 52.38% sportsbook break-even threshold, single-season historical ATS performance is subject to sample variance and selection bias and is not a projection of future performance.

## Key Features

### 🏈 Full Season Schedule & Stage Navigation
- **22 Season Stages:** Seamlessly switch between regular season Weeks 1–18 and Postseason stages (Wild Card, Divisional, Conference Championships, Super Bowl).
- **ESPN Realtime Adapter:** Queries current season schedules with explicit `dates` parameters.
- **Pre-Kickoff UI:** Displays clean match cards with spread lines and kickoff dates for upcoming games.

### 🧠 Quantitative Decision Engine & Driver Intel
- **Massey Least-Squares Engine:** Pure, deterministic engine under `src/engine/` fit on historical efficiency with ridge penalty and logistic win probability scaling.
- **Machine-Readable Drivers:** Every prediction decomposes projected point margins into 4 explicit driver factors with signed point magnitudes and evidence details.
- **Calibrated Confidence:** Win probabilities map monotonically to calibrated confidence scores.

### 📊 Performance Tracking
- **Cloud Sync:** Sign in with Google to sync predictions across devices.
- **Season Standings:** Tracks user and AI performance.
- **CSV Export:** Export picks and predictions for offline analysis.

## Technology Stack
- **Frontend:** React (TypeScript), Tailwind CSS
- **Decision Engine:** Pure TypeScript Massey Least-Squares Solver (`src/engine/`)
- **Data Source:** ESPN Public API
- **Auth & Storage:** Firebase (Google Auth, Firestore)
