# NFL Prediction Methodologies Survey

This document surveys five publicly-documented, quantitative NFL game-prediction methodologies evaluated as candidates for the engine backtest.

---

## 1. FiveThirtyEight / nfelo Margin-of-Victory Elo

- **Mechanism**: Elo rates teams dynamically based on game outcomes, adjusted for point differential (Margin of Victory multiplier). Teams gain or lose rating points proportional to outcome surprise relative to pre-game win expectations and home field advantage (HFA).
- **Inputs**: Historical game scores, home/away status, neutral field indicator.
- **Published Claims**: nfelo documents that Margin of Victory Elo provides an objective rating framework for forecasting game margins and win probabilities based on point differentials and home field advantage.
- **Implementation deviations**: This implementation omits starting signal-caller rating adjustments and prior-season rating carryover or mean reversion (all teams start unseeded at 1500 rating).
- **Source URL**: https://www.nfeloapp.com

---

## 2. DVOA-Style Opponent-Adjusted Efficiency

- **Mechanism**: Calculates opponent-adjusted offensive and defensive scoring efficiency ratings. Points scored and allowed per game are iteratively adjusted for the strength of each opponent faced, creating decoupled offensive ($Off_i$) and defensive ($Def_i$) rating vectors normalized to league average scoring.
- **Inputs**: Points scored, points allowed, opponent defensive and offensive efficiency ratings.
- **Published Claims**: FTN Fantasy / Football Outsiders documents that DVOA evaluates success on each play compared to a league baseline based on situation, opponent, and venue.
- **Implementation deviations**: Evaluates scoring efficiency per game rather than play-by-play DVOA success rates due to game-level dataset constraints.
- **Source URL**: https://ftnfantasy.com/dvoa

---

## 3. Massey Least-Squares Power Ratings

- **Mechanism**: Formulates team strength ratings as the least-squares solution to a system of linear equations $M \cdot r = p$, where $M$ represents game pair counts, $p$ represents total point differential accumulated minus home field advantage, and $r$ represents absolute team rating values. A ridge regularization penalty ($\lambda$) is applied to stabilize early-season estimates.
- **Inputs**: Pairwise game outcomes, point differentials, home field indicator matrix.
- **Published Claims**: Kenneth Massey (1997) demonstrates that least-squares point-differential ratings generate optimal, unbiased linear predictors of game margins.
- **Implementation deviations**: Uses fixed ridge regularization parameter ($\lambda = 2.0$) and home field advantage ($HFA = 2.0$) across the 2025 season.
- **Source URL**: https://masseyratings.com/theory/massey.htm

---

## 4. Pythagorean Expectation & Point Differential Regression

- **Mechanism**: Estimates team win expectation using Bill James / Daryl Morey's exponent power formula ($PF^\gamma / (PF^\gamma + PA^\gamma)$ with $\gamma = 2.37$ for NFL football). Net point differential per game is shrunk towards the league mean ($\mu = 0$) using Bayesian prior shrinkage ($S = 5$ games) to eliminate single-possession variance.
- **Inputs**: Cumulative points scored ($PF$), cumulative points allowed ($PA$), games played ($n$).
- **Published Claims**: Pro Football Reference notes that Pythagorean win expectation estimates expected winning percentage from total points scored and allowed, reducing single-possession outcome noise.
- **Implementation deviations**: Shrinks game point differential towards zero with fixed prior $S = 5.0$ games rather than multi-season prior variance.
- **Source URL**: https://www.pro-football-reference.com/about/pythagoras.htm

---

## 5. Market-Blend Consensus Model

- **Mechanism**: Combines a fundamental quantitative model margin with the closing sportsbook spread using a weighted linear combination: $\text{Margin}_{\text{blend}} = w \cdot \text{Margin}_{\text{model}} + (1 - w) \cdot (-\text{Spread}_{\text{market}})$. This leverages market closing efficiency while retaining model edge.
- **Inputs**: Fundamental model margin prediction, closing market point spread.
- **Published Claims**: Action Network documents that consensus betting data and sportsbook closing lines reflect market sentiment and point spread efficiency across the NFL schedule.
- **Implementation deviations**: Uses a fixed blend weight ($w = 0.50$) combining Massey projected margin with market closing spread.
- **Source URL**: https://www.actionnetwork.com/nfl/public-betting
