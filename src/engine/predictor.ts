import { Driver, Prediction, PredictionInput, SpreadPick, TotalPick } from './types';

const MODEL_VERSION = 'massey-v1.0.0';
const DEFAULT_HFA = 2.0;
const RIDGE_LAMBDA = 2.0;
const DEFAULT_TOTAL = 44.0;
const LOGISTIC_SCALE = 7.0;

function solveLinearSystem(M: number[][], p: number[]): number[] {
  const n = M.length;
  const A = M.map((row, i) => [...row, p[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    const pivot = A[i][i];
    if (Math.abs(pivot) > 1e-12) {
      for (let j = i; j <= n; j++) A[i][j] /= pivot;
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = A[k][i];
          for (let j = i; j <= n; j++) {
            A[k][j] -= factor * A[i][j];
          }
        }
      }
    }
  }

  return A.map(row => row[n]);
}

export function predictGame(input: PredictionInput): Prediction {
  const { game, history, homeInjuries = [], awayInjuries = [] } = input;

  // Determine Home Field Advantage (HFA)
  const isSuperBowl = game.seasonType === 3 && game.week === 5;
  const HFA = (game.isNeutralSite || isSuperBowl) ? 0.0 : DEFAULT_HFA;

  // Extract unique teams from history + current game
  const teamSet = new Set<string>();
  for (const g of history) {
    if (g.homeAbbr) teamSet.add(g.homeAbbr);
    if (g.awayAbbr) teamSet.add(g.awayAbbr);
  }
  teamSet.add(game.homeAbbr);
  teamSet.add(game.awayAbbr);

  const teams = Array.from(teamSet).sort();
  const teamIndex: Record<string, number> = {};
  teams.forEach((t, idx) => { teamIndex[t] = idx; });
  const n = teams.length;

  // Count games per team for driver descriptions and total scoring rates
  const gameCounts: Record<string, number> = {};
  const teamPF: Record<string, number> = {};
  const teamPA: Record<string, number> = {};
  teams.forEach(t => { gameCounts[t] = 0; teamPF[t] = 0; teamPA[t] = 0; });

  let totalLeaguePoints = 0;
  let totalLeagueGames = 0;

  // Build Massey matrix M (n x n) and target vector p (n x 1)
  const M: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const p: number[] = Array(n).fill(0);

  for (const g of history) {
    if (!g.homeAbbr || !g.awayAbbr) continue;
    const hIdx = teamIndex[g.homeAbbr];
    const aIdx = teamIndex[g.awayAbbr];
    if (hIdx === undefined || aIdx === undefined) continue;

    gameCounts[g.homeAbbr] = (gameCounts[g.homeAbbr] || 0) + 1;
    gameCounts[g.awayAbbr] = (gameCounts[g.awayAbbr] || 0) + 1;

    if (g.homeScore !== undefined && g.awayScore !== undefined) {
      teamPF[g.homeAbbr] = (teamPF[g.homeAbbr] || 0) + g.homeScore;
      teamPA[g.homeAbbr] = (teamPA[g.homeAbbr] || 0) + g.awayScore;
      teamPF[g.awayAbbr] = (teamPF[g.awayAbbr] || 0) + g.awayScore;
      teamPA[g.awayAbbr] = (teamPA[g.awayAbbr] || 0) + g.homeScore;
      totalLeaguePoints += (g.homeScore + g.awayScore);
      totalLeagueGames += 2;
    }

    const hfaG = g.isNeutralSite ? 0 : DEFAULT_HFA;
    const diff = (g.homeScore - g.awayScore) - hfaG;

    M[hIdx][hIdx] += 1;
    M[aIdx][aIdx] += 1;
    M[hIdx][aIdx] -= 1;
    M[aIdx][hIdx] -= 1;

    p[hIdx] += diff;
    p[aIdx] -= diff;
  }

  // Ridge Regularization (lambda = 2.0)
  for (let i = 0; i < n; i++) {
    M[i][i] += RIDGE_LAMBDA;
  }

  const solution = solveLinearSystem(M, p);
  const ratings: Record<string, number> = {};
  teams.forEach((t, i) => { ratings[t] = solution[i] ?? 0; });

  const rHome = ratings[game.homeAbbr] ?? 0;
  const rAway = ratings[game.awayAbbr] ?? 0;

  // Injury & Roster Modifiers (1.0 pt per key injury, capped at 3.0 pts)
  const homePenalty = Math.min(3.0, homeInjuries.length * 1.0);
  const awayPenalty = Math.min(3.0, awayInjuries.length * 1.0);
  const injuryAdj = awayPenalty - homePenalty; // Positive if away injured, negative if home injured

  // Pre-rounding projected margin (reconciles 100% with sum of drivers)
  const projectedMarginPre = rHome - rAway + HFA + injuryAdj;

  // Build Machine-Readable Drivers (Requirement 6: omit drivers with magnitude 0.00)
  const homeGameCount = gameCounts[game.homeAbbr] || 0;
  const awayGameCount = gameCounts[game.awayAbbr] || 0;

  const rawDrivers: Driver[] = [
    {
      key: 'home_massey_rating',
      label: `${game.homeAbbr} Power Rating`,
      magnitude: Math.abs(rHome),
      direction: rHome >= 0 ? 'home' : 'away',
      detail: `Home team ${game.homeAbbr} base Massey rating is ${rHome >= 0 ? '+' : ''}${rHome.toFixed(2)} points over ${homeGameCount} games.`
    },
    {
      key: 'away_massey_rating',
      label: `${game.awayAbbr} Opponent Rating`,
      magnitude: Math.abs(rAway),
      direction: rAway <= 0 ? 'home' : 'away',
      detail: `Away team ${game.awayAbbr} base Massey rating is ${rAway >= 0 ? '+' : ''}${rAway.toFixed(2)} points over ${awayGameCount} games.`
    },
    {
      key: 'home_field_advantage',
      label: 'Home Field Advantage',
      magnitude: HFA,
      direction: HFA > 0 ? 'home' : 'neutral',
      detail: HFA > 0 ? `Home field advantage at venue adds ${HFA.toFixed(2)} points for ${game.homeAbbr}.` : `Neutral venue/Super Bowl provides 0.00 home field advantage.`
    },
    {
      key: 'roster_injury_modifier',
      label: 'Roster Availability Modifier',
      magnitude: Math.abs(injuryAdj),
      direction: injuryAdj > 0 ? 'home' : (injuryAdj < 0 ? 'away' : 'neutral'),
      detail: `Roster availability and injury adjustment contributes ${injuryAdj >= 0 ? '+' : ''}${injuryAdj.toFixed(2)} net points.`
    }
  ];

  // Omit drivers with 0.00 magnitude
  const drivers = rawDrivers.filter(d => Number(d.magnitude.toFixed(2)) > 0);

  // Total Score Projection (Requirement 1: Non-algebraic, team history + market blend)
  const marketTotal = game.market?.total;
  const totalLine = typeof marketTotal === 'number' && !isNaN(marketTotal) ? marketTotal : DEFAULT_TOTAL;

  const leagueAvgScoring = totalLeagueGames > 0 ? (totalLeaguePoints / totalLeagueGames) : 22.0;

  const hCount = gameCounts[game.homeAbbr] || 0;
  const aCount = gameCounts[game.awayAbbr] || 0;

  const hOffR = hCount > 0 ? ((teamPF[game.homeAbbr] / hCount) / leagueAvgScoring) : 1.0;
  const hDefR = hCount > 0 ? ((teamPA[game.homeAbbr] / hCount) / leagueAvgScoring) : 1.0;
  const aOffR = aCount > 0 ? ((teamPF[game.awayAbbr] / aCount) / leagueAvgScoring) : 1.0;
  const aDefR = aCount > 0 ? ((teamPA[game.awayAbbr] / aCount) / leagueAvgScoring) : 1.0;

  const baseTeamMarket = totalLine / 2.0;
  const histHomeProj = baseTeamMarket * hOffR * aDefR;
  const histAwayProj = baseTeamMarket * aOffR * hDefR;
  const histTotalProj = histHomeProj + histAwayProj;

  // Blend history team scoring rates (30%) with market line (70%)
  const projectedTotalVal = Number((0.3 * histTotalProj + 0.7 * totalLine).toFixed(1));

  const homeScoreRaw = projectedTotalVal / 2.0 + projectedMarginPre / 2.0;
  const awayScoreRaw = projectedTotalVal / 2.0 - projectedMarginPre / 2.0;

  let homeScore = Math.max(0, Math.round(homeScoreRaw));
  let awayScore = Math.max(0, Math.round(awayScoreRaw));

  if (homeScore === awayScore) {
    if (projectedMarginPre >= 0) homeScore += 1;
    else awayScore += 1;
  }

  const margin = homeScore - awayScore;
  const winner = margin > 0 ? game.homeAbbr : game.awayAbbr;

  // Win Probability
  const rawWinProb = 1.0 / (1.0 + Math.exp(-projectedMarginPre / LOGISTIC_SCALE));
  const homeWinProbability = Number(Math.max(0.01, Math.min(0.99, rawWinProb)).toFixed(4));

  // Calibrated Confidence
  const dev = Math.abs(homeWinProbability - 0.5);
  let confidenceRaw = 50.0;
  if (dev <= 0.08) {
    confidenceRaw = 50.0 + (dev / 0.08) * 10.0;
  } else {
    confidenceRaw = 60.0 + ((dev - 0.08) / 0.42) * 38.0;
  }
  const confidence = Number(Math.min(99.0, Math.max(50.0, confidenceRaw)).toFixed(1));

  // Market Picks (Spread & Total) - Requirement 3: line re-signed for picked team
  const marketSpread = game.market?.spread ?? null;
  const hasSpread = typeof marketSpread === 'number' && !isNaN(marketSpread);

  let spreadPick: SpreadPick;
  if (hasSpread) {
    const rawLine = marketSpread as number;
    const coverMargin = projectedMarginPre + rawLine;
    const edge = Number(Math.abs(coverMargin).toFixed(2));
    const pickTeam = coverMargin >= 0 ? game.homeAbbr : game.awayAbbr;

    // Line relative to picked team:
    // If pickTeam is home team: line is rawLine (e.g. -3.5 for home favorite)
    // If pickTeam is away team: line is -rawLine (e.g. +3.5 if home was -3.5)
    const teamLine = pickTeam === game.homeAbbr ? rawLine : -rawLine;

    spreadPick = { team: pickTeam, line: teamLine, edge };
  } else {
    const edge = Number(Math.abs(projectedMarginPre).toFixed(2));
    spreadPick = { team: winner, line: 0, edge };
  }

  const totalEdge = Number(Math.abs(projectedTotalVal - totalLine).toFixed(2));
  const totalPick: TotalPick = {
    side: projectedTotalVal >= totalLine ? 'over' : 'under',
    line: totalLine,
    projected: projectedTotalVal,
    edge: totalEdge
  };

  return {
    winner,
    homeScore,
    awayScore,
    margin,
    projectedMargin: projectedMarginPre,
    homeWinProbability,
    confidence,
    spreadPick,
    totalPick,
    marketSpread,
    drivers,
    modelVersion: MODEL_VERSION
  };
}
