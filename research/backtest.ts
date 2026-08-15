import fs from 'fs';
import path from 'path';
import { Game } from './models/types';
import { MODELS } from './models';

interface ModelMetrics {
  games: number;
  atsExcluded: number;
  suAccuracy: number;
  atsAccuracy: number;
  atsRecord: string;
  brierScore: number;
  logLoss: number;
  meanAbsScoreError: number;
  roiAt110: number;
}

interface ModelResult {
  name: string;
  description: string;
  train: ModelMetrics;
  holdout: ModelMetrics;
}

export function calculateMetrics(games: Game[], predictions: Map<string, ReturnType<typeof MODELS[string]['predict']>>): ModelMetrics {
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
      roiAt110: 0
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

  const EPSILON = 1e-15;

  for (const g of games) {
    const pred = predictions.get(g.id);
    if (!pred) continue;

    // Straight Up Accuracy
    const actualWinner = g.homeScore > g.awayScore ? 'home' : (g.awayScore > g.homeScore ? 'away' : 'tie');
    const predWinner = pred.homeWinProb > 0.5 ? 'home' : (pred.homeWinProb < 0.5 ? 'away' : 'tie');
    if (actualWinner === predWinner) {
      suCorrect++;
    }

    // Brier Score & Log Loss
    const y = g.homeScore > g.awayScore ? 1.0 : (g.awayScore > g.homeScore ? 0.0 : 0.5);
    const p = Math.max(EPSILON, Math.min(1.0 - EPSILON, pred.homeWinProb));
    sumBrier += Math.pow(p - y, 2);
    sumLogLoss += -(y * Math.log(p) + (1.0 - y) * Math.log(1.0 - p));

    // Mean Absolute Score Error
    const errHome = Math.abs(pred.homeScore - g.homeScore);
    const errAway = Math.abs(pred.awayScore - g.awayScore);
    sumScoreError += (errHome + errAway) / 2.0;

    // ATS Metrics
    if (g.market.spread === null) {
      atsExcluded++;
    } else {
      const spread = g.market.spread; // negative = home favored
      const actualMargin = g.homeScore - g.awayScore;
      const coverMargin = actualMargin + spread; // > 0 means home covered

      let actualCover: 'home' | 'away' | 'push' = 'push';
      if (coverMargin > 0) actualCover = 'home';
      else if (coverMargin < 0) actualCover = 'away';

      if (pred.spreadPick === 'push' || actualCover === 'push') {
        pushes++;
      } else if (pred.spreadPick === actualCover) {
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

  // ROI at -110: win pays 10/11 (~0.90909) units, loss loses 1 unit.
  // Total bets = wins + losses + pushes
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
    roiAt110
  };
}

export function getBacktestHistory(allGames: Game[], targetTime: number): Game[] {
  return allGames.filter(g => new Date(g.date).getTime() < targetTime);
}

export function runBacktest(writeResults: boolean = true) {
  const dataPath = path.join(__dirname, 'data', '2025-season.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data file not found at ${dataPath}. Run fetch-2025.ts first.`);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const dataset: { games: Game[] } = JSON.parse(rawData);

  // Deterministically sort games by date and ID
  const allGames = [...dataset.games].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const trainGames = allGames.filter(g => g.seasonType === 2 && g.week <= 12);
  const holdoutGames = allGames.filter(g => (g.seasonType === 2 && g.week >= 13) || g.seasonType === 3);

  const modelResults: Record<string, ModelResult> = {};

  for (const [modelId, modelDef] of Object.entries(MODELS)) {
    const predictions = new Map<string, ReturnType<typeof modelDef.predict>>();

    for (let i = 0; i < allGames.length; i++) {
      const targetGame = allGames[i];
      // Pass only games that occurred strictly before targetGame's kickoff date
      const targetTime = new Date(targetGame.date).getTime();
      const history = getBacktestHistory(allGames, targetTime);

      const pred = modelDef.predict(targetGame, history);
      predictions.set(targetGame.id, pred);
    }

    const trainMetrics = calculateMetrics(trainGames, predictions);
    const holdoutMetrics = calculateMetrics(holdoutGames, predictions);

    modelResults[modelId] = {
      name: modelDef.name,
      description: modelDef.description,
      train: trainMetrics,
      holdout: holdoutMetrics
    };
  }

  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const outPath = path.join(resultsDir, 'backtest-2025.json');
  const outputJson = {
    generatedAt: "2026-08-15T11:20:00Z",
    season: 2025,
    modelsCompared: Object.keys(MODELS).length,
    trainGamesCount: trainGames.length,
    holdoutGamesCount: holdoutGames.length,
    models: modelResults
  };

  if (writeResults) {
    fs.writeFileSync(outPath, JSON.stringify(outputJson, null, 2), 'utf8');
    console.log(`Backtest complete. Results saved to ${outPath}`);
  }

  return outputJson;
}

if (require.main === module) {
  runBacktest(true);
}
