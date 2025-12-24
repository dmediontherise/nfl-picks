# Medi Picks 2025

**Medi Picks 2025** is an advanced NFL prediction application powered by Medi Jinx AI. It provides real-time analysis, score predictions, and spread insights for every NFL matchup.

## Key Features

### 🏈 Real-time Game Tracking
- **Live Scoreboard:** Displays real-time scores, game clocks, and quarters for all active NFL games.
- **Auto-Refresh:** Data updates automatically every 60 seconds to ensure you never miss a play.
- **Week Selection:** Navigate through the entire end-of-season schedule (Weeks 14-18) to plan ahead or review past performance.
- **Smart Schedule:** Automatically defaults to the current active week for instant access to live action.

### 🧠 Medi Jinx Intel
- **Elo-Based Prediction Engine:** Utilizes a robust NFELO-style model that calculates win probabilities and spreads based on team efficiency ratings and QB "Value Over Replacement" adjustments.
- **Dynamic Narrative:** The "Medi Intel" engine crafts varied, personality-driven stories for each matchup, reacting to the spread, score differential, and motivation levels (e.g., "Business Trip" vs "Playoff Preview").
- **Medi Retrospective:** (New) Post-game analysis that synthesizes real headlines to explain the "Key to Victory" and identify standout performers for completed matchups.
- **Real News Integration:** Fetches live news from the ESPN API and weaves actual headlines (injuries, roster moves) into the analysis to adjust predictions dynamically.
- **Dynamic Leverage:** Visualizes the "Tug of War" between teams based on real-time Offensive, Defensive, and Quarterback ratings.

### 📊 Performance Tracking
- **Cloud Sync:** Sign in with Google to sync your predictions and records across all your devices (Desktop, Mobile, Tablet).
- **Season Standings:** Tracks your Win/Loss and ATS (Against The Spread) record vs. the Medi Picks AI week-over-week.
- **Results Caching:** Automatically caches final scores to build a persistent history of your performance.
- **CSV Export:** Download your picks and the AI's picks for offline analysis.

## Technology Stack
- **Frontend:** React (TypeScript), Tailwind CSS
- **Data Source:** ESPN Public API (Live Scores, News, Odds)
- **Auth & Storage:** Firebase (Google Auth, Firestore)
- **Persistence:** Hybrid (Cloud Sync + LocalStorage fallback)

## Usage
1.  **Analyze:** Click any matchup to view the Medi Jinx prediction and intelligence report.
2.  **Predict:** Enter your own score prediction in the modal.
3.  **Track:** Watch the live scores on the dashboard and check the "Standings" to see who is winning the season—you or the machine.
4.  **Sync:** Click the "Sign In" button to save your history to the cloud.
