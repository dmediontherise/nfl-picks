import { Driver, PlayerInjury, Prediction, PredictionInput, SpreadPick, TotalPick } from './types';

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

// Status multiplier: Out/IR/Suspension 1.0, Doubtful 0.75, Questionable 0.35, Active 0.0
export function getStatusMultiplier(statusStr?: string): number {
  const status = (statusStr || '').toLowerCase().trim();
  if (status === 'out' || status === 'injured reserve' || status === 'ir' || status === 'suspension') {
    return 1.0;
  }
  if (status === 'doubtful') {
    return 0.75;
  }
  if (status === 'questionable') {
    return 0.35;
  }
  if (status === 'active') {
    return 0.0;
  }
  return 0.0;
}

// Position & depth chart base weights (in points of margin when player is Out)
export function getPositionBaseWeight(positionStr?: string, depthChartRank?: number, group?: string, isDisplacedStarter?: boolean): number {
  if (group === 'practiceSquad') {
    return 0.0;
  }

  const pos = (positionStr || '').toUpperCase().trim();
  // A displaced starter (was rank 1 before ESPN auto-promoted his replacement)
  // is weighted by the role he would occupy if healthy.
  const isStarter = depthChartRank === 1 || isDisplacedStarter === true;

  if (isStarter) {
    switch (pos) {
      case 'QB':
        return 5.5;
      case 'WR':
        return 1.4;
      case 'DE':
      case 'EDGE':
        return 1.3;
      case 'LT':
      case 'OT':
      case 'T':
        return 1.2;
      case 'RB':
      case 'CB':
        return 1.0;
      default:
        // other starter (e.g. TE, C, G, DT, DL, LB, S, PK, P, FB, LS)
        return 0.6;
    }
  } else {
    // Backup player
    switch (pos) {
      case 'QB':
        return 0.5;
      case 'WR':
      case 'RB':
      case 'LT':
      case 'OT':
      case 'T':
      case 'DE':
      case 'EDGE':
      case 'CB':
        return 0.2;
      default:
        // other backup
        return 0.1;
    }
  }
}

export function calculatePlayerInjuryPenalty(injury: PlayerInjury): number {
  const multiplier = getStatusMultiplier(injury.status);
  if (multiplier === 0.0) return 0.0;
  const baseWeight = getPositionBaseWeight(injury.position, injury.depthChartRank, injury.group, injury.isDisplacedStarter);
  return baseWeight * multiplier;
}

// Cap team injury penalty at 10.0 points to prevent extreme cumulative blowouts
// while allowing full expression of QB (5.5) + multiple key starters (WR1/LT/EDGE/CB1 up to ~4.5 pts).
export const MAX_TEAM_INJURY_PENALTY = 10.0;

export interface TeamInjuryEvaluation {
  penalty: number;
  unclippedPenalty: number;
  playerPenalties: Array<{ player: PlayerInjury; penalty: number }>;
}

export function calculateTeamInjuryPenalty(injuries: PlayerInjury[] = []): TeamInjuryEvaluation {
  let sum = 0;
  const playerPenalties: Array<{ player: PlayerInjury; penalty: number }> = [];

  for (const inj of injuries) {
    const penalty = calculatePlayerInjuryPenalty(inj);
    if (penalty > 0) {
      playerPenalties.push({ player: inj, penalty });
      sum += penalty;
    }
  }

  playerPenalties.sort((a, b) => b.penalty - a.penalty);
  const penalty = Math.min(MAX_TEAM_INJURY_PENALTY, sum);
  return { penalty, unclippedPenalty: sum, playerPenalties };
}

function formatTeamAbsenceDetails(teamAbbr: string, list: Array<{ player: PlayerInjury; penalty: number }>): string {
  if (list.length === 0) return '';
  const top = list.slice(0, 3).map(x => `${x.player.name} (${x.player.position}, ${x.player.status}: -${x.penalty.toFixed(2)} pts)`);
  const remaining = list.length - top.length;
  const extra = remaining > 0 ? ` (+${remaining} more)` : '';
  return `${teamAbbr} [${top.join(', ')}${extra}]`;
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

  // Injury & Roster Availability Modifiers
  const homeResult = calculateTeamInjuryPenalty(homeInjuries);
  const awayResult = calculateTeamInjuryPenalty(awayInjuries);
  const homePenalty = homeResult.penalty;
  const awayPenalty = awayResult.penalty;
  const injuryAdj = awayPenalty - homePenalty; // Positive if away injured, negative if home injured

  // Pre-rounding projected margin (reconciles 100% with sum of drivers)
  const projectedMarginPre = rHome - rAway + HFA + injuryAdj;

  // Build Machine-Readable Drivers (Requirement 6: omit drivers with magnitude 0.00)
  const homeGameCount = gameCounts[game.homeAbbr] || 0;
  const awayGameCount = gameCounts[game.awayAbbr] || 0;

  let injuryDetail = `Roster availability and injury adjustment contributes ${injuryAdj >= 0 ? '+' : ''}${injuryAdj.toFixed(2)} net points.`;
  if (homeResult.playerPenalties.length > 0 && awayResult.playerPenalties.length > 0) {
    injuryDetail = `${formatTeamAbsenceDetails(game.homeAbbr, homeResult.playerPenalties)}; ${formatTeamAbsenceDetails(game.awayAbbr, awayResult.playerPenalties)}. Net availability impact: ${injuryAdj >= 0 ? '+' : ''}${injuryAdj.toFixed(2)} pts to ${game.homeAbbr}.`;
  } else if (homeResult.playerPenalties.length > 0) {
    injuryDetail = `${formatTeamAbsenceDetails(game.homeAbbr, homeResult.playerPenalties)}. Reduces ${game.homeAbbr} margin by ${homePenalty.toFixed(2)} pts.`;
  } else if (awayResult.playerPenalties.length > 0) {
    injuryDetail = `${formatTeamAbsenceDetails(game.awayAbbr, awayResult.playerPenalties)}. Shifts margin +${awayPenalty.toFixed(2)} pts toward ${game.homeAbbr}.`;
  }

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
      detail: injuryDetail
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
