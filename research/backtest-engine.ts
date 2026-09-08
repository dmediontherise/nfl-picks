import fs from 'fs';
import path from 'path';
import { predictGame } from '../src/engine/predictor';
import { GameMarket, HistoricalGame, PredictionInput } from '../src/engine/types';

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
  market: GameMarket;
}

interface EngineMetrics {
  games: number;
  atsExcluded: number;
  suAccuracy: number;
  atsAccuracy: number;
  atsRecord: string;
  brierScore: number;
  logLoss: number;
  meanAbsScoreError: number;
  roiAt110: number;
  totalPickAccuracy: number;
  meanAbsTotalError: number;
}

export function calculateEngineMetrics(
  games: SeasonGame[],
  predictions: Map<string, ReturnType<typeof predictGame>>
): EngineMetrics {
  const n = games.length;
  if (n === 0) {
    return {
      games: 0,
      atsExcluded: 0,
      suAccuracy: 0,
      atsAccuracy: 0,
      atsRecord: '0-0-0',
      brierScore: 0,
      logLoss: 0,
      meanAbsScoreError: 0,
      roiAt110: 0,
      totalPickAccuracy: 0,
      meanAbsTotalError: 0
    };
  }

  let suCorrect = 0;
  let atsExcluded = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let sumBrier = 0;
  let sumLogLoss = 0;
  let sumScoreError = 0;
  let totalCorrect = 0;
  let totalDecided = 0;
  let sumAbsTotalError = 0;

  const EPSILON = 1e-15;

  for (const g of games) {
    const pred = predictions.get(g.id);
    if (!pred) continue;

    // Straight-Up Accuracy
    const actualWinner = g.homeScore > g.awayScore ? 'home' : (g.awayScore > g.homeScore ? 'away' : 'tie');
    const predWinner = pred.winner === g.homeAbbr ? 'home' : (pred.winner === g.awayAbbr ? 'away' : 'tie');
    if (actualWinner === predWinner) {
      suCorrect++;
    }

    // Brier Score & Log Loss
    const y = g.homeScore > g.awayScore ? 1.0 : (g.awayScore > g.homeScore ? 0.0 : 0.5);
    const p = Math.max(EPSILON, Math.min(1.0 - EPSILON, pred.homeWinProbability));
    sumBrier += Math.pow(p - y, 2);
    sumLogLoss += -(y * Math.log(p) + (1.0 - y) * Math.log(1.0 - p));

    // Score Error
    const errHome = Math.abs(pred.homeScore - g.homeScore);
    const errAway = Math.abs(pred.awayScore - g.awayScore);
    sumScoreError += (errHome + errAway) / 2.0;

    // Total Pick Metrics
    if (g.homeScore !== undefined && g.awayScore !== undefined) {
      const realizedTotal = g.homeScore + g.awayScore;
      const projTotal = pred.totalPick.projected;
      const marketTotalLine = pred.totalPick.line;

      sumAbsTotalError += Math.abs(projTotal - realizedTotal);

      if (realizedTotal !== marketTotalLine) {
        const actualTotalOutcome = realizedTotal > marketTotalLine ? 'over' : 'under';
        if (pred.totalPick.side === actualTotalOutcome) {
          totalCorrect++;
        }
        totalDecided++;
      }
    }

    // ATS Metrics
    if (g.market.spread === null) {
      atsExcluded++;
    } else {
      const spread = g.market.spread; // negative = home favored
      const actualMargin = g.homeScore - g.awayScore;
      const coverMargin = actualMargin + spread;

      let actualCover: 'home' | 'away' | 'push' = 'push';
      if (coverMargin > 0) actualCover = 'home';
      else if (coverMargin < 0) actualCover = 'away';

      const predPickTeam = pred.spreadPick.team;
      let predPickSide: 'home' | 'away' | 'push' = 'push';
      if (predPickTeam === g.homeAbbr) predPickSide = 'home';
      else if (predPickTeam === g.awayAbbr) predPickSide = 'away';

      if (predPickSide === 'push' || actualCover === 'push') {
        pushes++;
      } else if (predPickSide === actualCover) {
        wins++;
      } else {
        losses++;
      }
    }
  }

  const suAccuracy = Number((suCorrect / n).toFixed(4));
  const atsDecisions = wins + losses;
  const atsAccuracy = atsDecisions > 0 ? Number((wins / atsDecisions).toFixed(4)) : 0;
  const atsRecord = `${wins}-${losses}-${pushes}`;
  const brierScore = Number((sumBrier / n).toFixed(4));
  const logLoss = Number((sumLogLoss / n).toFixed(4));
  const meanAbsScoreError = Number((sumScoreError / n).toFixed(4));
  const totalPickAccuracy = totalDecided > 0 ? Number((totalCorrect / totalDecided).toFixed(4)) : 0;
  const meanAbsTotalError = Number((sumAbsTotalError / n).toFixed(4));

  const totalBets = wins + losses + pushes;
  const netUnits = wins * (10 / 11) - losses;
  const roiAt110 = totalBets > 0 ? Number((netUnits / totalBets).toFixed(4)) : 0;

  return {
    games: n,
    atsExcluded,
    suAccuracy,
    atsAccuracy,
    atsRecord,
    brierScore,
    logLoss,
    meanAbsScoreError,
    roiAt110,
    totalPickAccuracy,
    meanAbsTotalError
  };
}

export function getEngineHistory(allGames: SeasonGame[], targetTime: number): SeasonGame[] {
  return allGames.filter(g => new Date(g.date).getTime() < targetTime);
}

export function runEngineBacktest(writeResults: boolean = true) {
  const dataPath = path.join(__dirname, 'data', '2025-season.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data file not found at ${dataPath}. Run fetch-2025.ts first.`);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const dataset: { games: SeasonGame[] } = JSON.parse(rawData);

  // Deterministically sort games by date and ID
  const allGames = [...dataset.games].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const predictions = new Map<string, ReturnType<typeof predictGame>>();

  for (let i = 0; i < allGames.length; i++) {
    const targetGame = allGames[i];
    const targetTime = new Date(targetGame.date).getTime();

    // History: games played strictly before targetGame's kickoff
    const rawHistory = getEngineHistory(allGames, targetTime);

    const history: HistoricalGame[] = rawHistory.map(g => ({
      homeAbbr: g.homeAbbr,
      awayAbbr: g.awayAbbr,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      isNeutralSite: g.neutralSite,
      date: g.date,
      seasonType: g.seasonType,
      week: g.week
    }));

    const input: PredictionInput = {
      game: {
        id: targetGame.id,
        homeAbbr: targetGame.homeAbbr,
        awayAbbr: targetGame.awayAbbr,
        isNeutralSite: targetGame.neutralSite,
        seasonType: targetGame.seasonType,
        week: targetGame.week,
        market: targetGame.market
      },
      history
    };

    const pred = predictGame(input);
    predictions.set(targetGame.id, pred);
  }

  const trainGames = allGames.filter(g => g.seasonType === 2 && g.week <= 12);
  const holdoutGames = allGames.filter(g => (g.seasonType === 2 && g.week >= 13) || g.seasonType === 3);

  const trainMetrics = calculateEngineMetrics(trainGames, predictions);
  const holdoutMetrics = calculateEngineMetrics(holdoutGames, predictions);

  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const outPath = path.join(resultsDir, 'engine-2025.json');
  const outputJson = {
    generatedAt: "2026-08-15T11:43:00Z",
    season: 2025,
    engineVersion: 'massey-v1.0.0',
    train: trainMetrics,
    holdout: holdoutMetrics
  };

  if (writeResults) {
    fs.writeFileSync(outPath, JSON.stringify(outputJson, null, 2), 'utf8');
    console.log(`Engine backtest complete. Results written to ${outPath}`);
  }

  return outputJson;
}

if (require.main === module) {
  runEngineBacktest(true);
}
