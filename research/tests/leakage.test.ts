import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { MODELS } from '../models';
import { getBacktestHistory } from '../backtest';
import { getEngineHistory } from '../backtest-engine';
import { predictGame } from '../../src/engine/predictor';
import { HistoricalGame, PredictionInput } from '../../src/engine/types';

test('leakage guard: history contains no game at or after target kickoff date and excludes target id (backtest.ts and backtest-engine.ts)', () => {
  const dataPath = path.join(__dirname, '..', 'data', '2025-season.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const dataset = JSON.parse(rawData);

  const allGames = [...dataset.games].sort((a: any, b: any) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  assert.ok(allGames.length >= 50, 'Dataset must have at least 50 games');

  const modelDef = MODELS['massey_rating'];

  let auditedCount = 0;

  for (let i = 0; i < allGames.length; i++) {
    const targetGame = allGames[i];
    const targetTime = new Date(targetGame.date).getTime();

    // 1. Audit backtest.ts getBacktestHistory logic
    const modelHistory = getBacktestHistory(allGames, targetTime);

    for (const hGame of modelHistory) {
      const hTime = new Date(hGame.date).getTime();
      assert.ok(hTime < targetTime, `Leakage detected in backtest.ts: history game ${hGame.id} date (${hGame.date}) is >= target game ${targetGame.id} date (${targetGame.date})`);
      assert.notStrictEqual(hGame.id, targetGame.id, `Leakage detected in backtest.ts: target game ${targetGame.id} present in its own history`);
    }

    // 2. Audit backtest-engine.ts getEngineHistory logic
    const engineRawHistory = getEngineHistory(allGames, targetTime);
    const engineHistory: HistoricalGame[] = engineRawHistory.map(g => ({
      homeAbbr: g.homeAbbr,
      awayAbbr: g.awayAbbr,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      isNeutralSite: g.neutralSite,
      date: g.date,
      seasonType: g.seasonType,
      week: g.week
    }));

    for (const hGame of engineRawHistory) {
      const hTime = new Date(hGame.date).getTime();
      assert.ok(hTime < targetTime, `Leakage detected in backtest-engine.ts: history game date (${hGame.date}) is >= target game date (${targetGame.date})`);
      assert.notStrictEqual(hGame.id, targetGame.id, `Leakage detected in backtest-engine.ts: target game ${targetGame.id} present in its own history`);
    }

    // Verify model run with audited history succeeds
    const pred = modelDef.predict(targetGame, modelHistory);
    assert.ok(pred, `Prediction failed for target game ${targetGame.id}`);

    const engineInput: PredictionInput = {
      game: {
        id: targetGame.id,
        homeAbbr: targetGame.homeAbbr,
        awayAbbr: targetGame.awayAbbr,
        isNeutralSite: targetGame.neutralSite,
        seasonType: targetGame.seasonType,
        week: targetGame.week,
        market: targetGame.market
      },
      history: engineHistory
    };

    const enginePred = predictGame(engineInput);
    assert.ok(enginePred, `Engine prediction failed for target game ${targetGame.id}`);

    auditedCount++;
  }

  assert.ok(auditedCount >= 50, `Audited ${auditedCount} games, required >= 50`);
});
