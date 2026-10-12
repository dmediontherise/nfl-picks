import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { predictGame } from '../src/engine/predictor';
import { HistoricalGame, PredictionInput } from '../src/engine/types';

export interface SeasonGame {
  id: string;
  week: number;
  seasonType: number;
  date: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  market: {
    spread: number | null;
    total: number | null;
    moneylineHome: number | null;
  };
}

export interface SplitMetrics {
  games: number;
  logLoss: number;
  brier: number;
  suAccuracy: number;
}

export interface CandidateResult {
  id: string;
  name: string;
  type: 'fixed' | 'decay';
  param: number;
  primary: SplitMetrics;
  weeks_1_4: SplitMetrics;
  weeks_5_9: SplitMetrics;
  weeks_10_18: SplitMetrics;
}

export interface CarryoverBacktestOutput {
  generatedAt: string;
  preRegistrationSha256: string;
  dataset: {
    yearPrior: number;
    yearTarget: number;
    priorGamesCount: number;
    targetRegularGamesCount: number;
  };
  decisionRule: string;
  decision: {
    winnerId: string;
    winnerSchedule: string;
    marginOverRunnerUp: number;
    runnerUpId: string;
  };
  candidates: CandidateResult[];
}

const EPSILON = 1e-15;

function computeMetrics(items: Array<{ game: SeasonGame; pred: ReturnType<typeof predictGame> }>): SplitMetrics {
  const n = items.length;
  if (n === 0) {
    return { games: 0, logLoss: 0, brier: 0, suAccuracy: 0 };
  }

  let sumLogLoss = 0;
  let sumBrier = 0;
  let suCorrect = 0;

  for (const { game, pred } of items) {
    const y = game.homeScore > game.awayScore ? 1.0 : (game.awayScore > game.homeScore ? 0.0 : 0.5);
    const p = Math.max(EPSILON, Math.min(1.0 - EPSILON, pred.homeWinProbability));
    sumBrier += Math.pow(p - y, 2);
    sumLogLoss += -(y * Math.log(p) + (1.0 - y) * Math.log(1.0 - p));

    const actualWinner = game.homeScore > game.awayScore ? 'home' : (game.awayScore > game.homeScore ? 'away' : 'tie');
    const predWinner = pred.winner === game.homeAbbr ? 'home' : (pred.winner === game.awayAbbr ? 'away' : 'tie');
    if (actualWinner === predWinner) suCorrect++;
  }

  return {
    games: n,
    logLoss: Number((sumLogLoss / n).toFixed(4)),
    brier: Number((sumBrier / n).toFixed(4)),
    suAccuracy: Number((suCorrect / n).toFixed(4)),
  };
}

export function getPreRegistrationSha256(): string {
  const docPath = path.resolve(__dirname, 'CARRYOVER.md');
  const content = fs.readFileSync(docPath, 'utf-8');
  const match = content.match(/<!-- PRE-REGISTRATION START -->([\s\S]*?)<!-- PRE-REGISTRATION END -->/);
  if (!match) throw new Error('Pre-registration block not found in research/CARRYOVER.md');
  return crypto.createHash('sha256').update(match[1].trim()).digest('hex');
}

export function buildCarryoverHistory(
  priorGames: SeasonGame[],
  allTargetGames: SeasonGame[],
  target: SeasonGame,
  wPrior: number
): HistoricalGame[] {
  const targetTime = new Date(target.date).getTime();

  // Prior season history with schedule weight
  const hPrior: HistoricalGame[] = priorGames.map(g => ({
    homeAbbr: g.homeAbbr,
    awayAbbr: g.awayAbbr,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    isNeutralSite: g.neutralSite,
    date: g.date,
    seasonType: g.seasonType,
    week: g.week,
    weight: wPrior,
  }));

  // Target season history strictly before target kickoff with weight 1.0
  const hTarget: HistoricalGame[] = allTargetGames
    .filter(g => new Date(g.date).getTime() < targetTime)
    .map(g => ({
      homeAbbr: g.homeAbbr,
      awayAbbr: g.awayAbbr,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      isNeutralSite: g.neutralSite,
      date: g.date,
      seasonType: g.seasonType,
      week: g.week,
      weight: 1.0,
    }));

  return [...hPrior, ...hTarget];
}

export function runCarryoverBacktest(writeResults: boolean = true): CarryoverBacktestOutput {
  const preregSha256 = getPreRegistrationSha256();

  const data2024Path = path.resolve(__dirname, 'data/2024-season.json');
  const data2025Path = path.resolve(__dirname, 'data/2025-season.json');

  const d2024: { games: SeasonGame[] } = JSON.parse(fs.readFileSync(data2024Path, 'utf-8'));
  const d2025: { games: SeasonGame[] } = JSON.parse(fs.readFileSync(data2025Path, 'utf-8'));

  // Prior season: all 2024 games (seasonType 2 and 3)
  const priorGames = d2024.games.filter(g => g.seasonType === 2 || g.seasonType === 3);

  // Current season: deterministically sort 2025 games by date then ID
  const all2025 = [...d2025.games].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  // Target evaluation games: 2025 regular season (weeks 1-18, seasonType 2)
  const targetGames = all2025.filter(g => g.seasonType === 2 && g.week >= 1 && g.week <= 18);

  const candidateDefs: Array<{
    id: string;
    name: string;
    type: 'fixed' | 'decay';
    param: number;
    weightFn: (week: number) => number;
  }> = [
    { id: 'fixed_0', name: 'w = 0', type: 'fixed', param: 0, weightFn: () => 0 },
    { id: 'fixed_0.1', name: 'w = 0.1', type: 'fixed', param: 0.1, weightFn: () => 0.1 },
    { id: 'fixed_0.25', name: 'w = 0.25', type: 'fixed', param: 0.25, weightFn: () => 0.25 },
    { id: 'fixed_0.5', name: 'w = 0.5', type: 'fixed', param: 0.5, weightFn: () => 0.5 },
    { id: 'fixed_0.75', name: 'w = 0.75', type: 'fixed', param: 0.75, weightFn: () => 0.75 },
    { id: 'fixed_1.0', name: 'w = 1.0', type: 'fixed', param: 1.0, weightFn: () => 1.0 },
    { id: 'decay_4', name: 'decay N=4', type: 'decay', param: 4, weightFn: (k) => Math.max(0, 1 - (k - 1) / 4) },
    { id: 'decay_8', name: 'decay N=8', type: 'decay', param: 8, weightFn: (k) => Math.max(0, 1 - (k - 1) / 8) },
    { id: 'decay_12', name: 'decay N=12', type: 'decay', param: 12, weightFn: (k) => Math.max(0, 1 - (k - 1) / 12) },
    { id: 'decay_17', name: 'decay N=17', type: 'decay', param: 17, weightFn: (k) => Math.max(0, 1 - (k - 1) / 17) },
  ];

  const candidateResults: CandidateResult[] = [];

  for (const c of candidateDefs) {
    const evaluated: Array<{ game: SeasonGame; pred: ReturnType<typeof predictGame> }> = [];

    for (const target of targetGames) {
      const wPrior = c.weightFn(target.week);
      const history = buildCarryoverHistory(priorGames, all2025, target, wPrior);

      const input: PredictionInput = {
        game: {
          id: target.id,
          homeAbbr: target.homeAbbr,
          awayAbbr: target.awayAbbr,
          isNeutralSite: target.neutralSite,
          seasonType: target.seasonType,
          week: target.week,
          market: target.market,
        },
        history,
      };

      const pred = predictGame(input);
      evaluated.push({ game: target, pred });
    }

    const primary = computeMetrics(evaluated);
    const weeks_1_4 = computeMetrics(evaluated.filter(x => x.game.week >= 1 && x.game.week <= 4));
    const weeks_5_9 = computeMetrics(evaluated.filter(x => x.game.week >= 5 && x.game.week <= 9));
    const weeks_10_18 = computeMetrics(evaluated.filter(x => x.game.week >= 10 && x.game.week <= 18));

    candidateResults.push({
      id: c.id,
      name: c.name,
      type: c.type,
      param: c.param,
      primary,
      weeks_1_4,
      weeks_5_9,
      weeks_10_18,
    });
  }

  // Sort candidates by primary log loss ascending
  const sorted = [...candidateResults].sort((a, b) => a.primary.logLoss - b.primary.logLoss);
  const best = sorted[0];
  const second = sorted[1];
  const margin = Number((second.primary.logLoss - best.primary.logLoss).toFixed(4));

  let winner = best;
  // If margin < 0.002, prefer simpler schedule (fixed over decay, then lower w or N)
  if (margin < 0.002) {
    if (second.type === 'fixed' && best.type === 'decay') {
      winner = second;
    } else if (second.param < best.param) {
      winner = second;
    }
  }

  const winnerSchedule =
    winner.type === 'decay'
      ? `max(0, 1 - (k - 1) / ${winner.param})`
      : `w = ${winner.param}`;

  const output: CarryoverBacktestOutput = {
    generatedAt: '2026-10-11T21:10:00Z',
    preRegistrationSha256: preregSha256,
    dataset: {
      yearPrior: 2024,
      yearTarget: 2025,
      priorGamesCount: priorGames.length,
      targetRegularGamesCount: targetGames.length,
    },
    decisionRule: 'Lowest primary log loss on 2025 regular season; prefer simpler schedule if margin < 0.002',
    decision: {
      winnerId: winner.id,
      winnerSchedule,
      marginOverRunnerUp: margin,
      runnerUpId: sorted.find(c => c.id !== winner.id)!.id,
    },
    candidates: candidateResults,
  };

  if (writeResults) {
    const resultsDir = path.resolve(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    const outPath = path.resolve(resultsDir, 'carryover-2025.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`Wrote carryover backtest results to ${outPath}`);
  }

  return output;
}

if (require.main === module) {
  runCarryoverBacktest(true);
}
