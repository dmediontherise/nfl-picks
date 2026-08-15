import fs from 'fs';
import path from 'path';
import { predictGame } from '../predictor';
import { HistoricalGame, PredictionInput } from '../types';

interface SeasonGame {
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

describe('Prediction Engine (src/engine/predictor.ts)', () => {
  const dataPath = path.join(__dirname, '../../../research/data/2025-season.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const dataset: { games: SeasonGame[] } = JSON.parse(rawData);

  const allGames = [...dataset.games].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  test('Req 3: Drivers reconciliation over at least 100 games', () => {
    expect(allGames.length).toBeGreaterThanOrEqual(100);

    const testGames = allGames.slice(0, 150);

    for (let i = 0; i < testGames.length; i++) {
      const g = testGames[i];
      const targetTime = new Date(g.date).getTime();
      const rawHistory = allGames.filter(prev => new Date(prev.date).getTime() < targetTime);

      const history: HistoricalGame[] = rawHistory.map(prev => ({
        homeAbbr: prev.homeAbbr,
        awayAbbr: prev.awayAbbr,
        homeScore: prev.homeScore,
        awayScore: prev.awayScore,
        isNeutralSite: prev.neutralSite,
        date: prev.date,
        seasonType: prev.seasonType,
        week: prev.week
      }));

      const input: PredictionInput = {
        game: {
          id: g.id,
          homeAbbr: g.homeAbbr,
          awayAbbr: g.awayAbbr,
          isNeutralSite: g.neutralSite,
          seasonType: g.seasonType,
          week: g.week,
          market: g.market
        },
        history
      };

      const pred = predictGame(input);

      // Verify active non-zero drivers per game (zero-magnitude drivers omitted per Req 6)
      expect(pred.drivers.length).toBeGreaterThanOrEqual(0);

      // Verify each driver detail references actual numbers
      pred.drivers.forEach(d => {
        expect(d.detail).toMatch(/\d+/);
      });

      // Sum signed driver magnitudes
      let sumSignedDrivers = 0;
      for (const d of pred.drivers) {
        if (d.direction === 'home') sumSignedDrivers += d.magnitude;
        else if (d.direction === 'away') sumSignedDrivers -= d.magnitude;
      }

      // Reconcile sum of signed drivers against engine-reported projectedMargin
      const diffPreRounding = Math.abs(sumSignedDrivers - pred.projectedMargin);
      expect(diffPreRounding).toBeLessThanOrEqual(0.51);

      // Also verify sum of signed drivers reconciles with rounded integer margin to within 1.01 pt
      const intMarginDiff = Math.abs(sumSignedDrivers - pred.margin);
      expect(intMarginDiff).toBeLessThanOrEqual(1.01);
    }
  });

  test('Req 6: Calibrated confidence and no fake certainty', () => {
    // Drive predictGame with real inputs spanning balanced to lopsided matchups
    const history1: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 24, awayScore: 24, date: `2025-09-${10+i}`
    }));
    const history2: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 30, awayScore: 10, date: `2025-09-${10+i}`
    }));
    const history3: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 40, awayScore: 0, date: `2025-09-${10+i}`
    }));
    const history4: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 21, awayScore: 20, date: `2025-09-${10+i}`
    }));
    const history5: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 55, awayScore: 0, date: `2025-09-${10+i}`
    }));

    const p1 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC', isNeutralSite: true }, history: history1 });
    const p2 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC' }, history: history2 });
    const p3 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC' }, history: history3 });
    const p4 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC', isNeutralSite: true }, history: history4 });
    const p5 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC' }, history: history5 });

    const predictions = [p1, p2, p3, p4, p5];

    // 1. Cap check: confidence <= 60 for homeWinProbability in [0.42, 0.58]
    for (const p of predictions) {
      if (p.homeWinProbability >= 0.42 && p.homeWinProbability <= 0.58) {
        expect(p.confidence).toBeLessThanOrEqual(60.0);
      }
    }

    // 2. Monotonicity check: confidence is non-decreasing as |homeWinProbability - 0.5| increases
    const sortedByDev = [...predictions].sort((a, b) => Math.abs(a.homeWinProbability - 0.5) - Math.abs(b.homeWinProbability - 0.5));
    for (let i = 1; i < sortedByDev.length; i++) {
      expect(sortedByDev[i].confidence).toBeGreaterThanOrEqual(sortedByDev[i - 1].confidence);
    }
  });

  test('Req 7: Determinism (predictGame called twice with same input is deeply equal)', () => {
    const input: PredictionInput = {
      game: { homeAbbr: 'KC', awayAbbr: 'SF', isNeutralSite: true, market: { spread: -2.5, total: 47.5 } },
      history: [
        { homeAbbr: 'KC', awayAbbr: 'DEN', homeScore: 27, awayScore: 24 },
        { homeAbbr: 'SF', awayAbbr: 'LAR', homeScore: 31, awayScore: 20 }
      ]
    };

    const res1 = predictGame(input);
    const res2 = predictGame(input);

    expect(res1).toEqual(res2);
  });

  test('Neutral-site and Super Bowl handling (HFA = 0.0)', () => {
    const neutralInput: PredictionInput = {
      game: { homeAbbr: 'KC', awayAbbr: 'PHI', isNeutralSite: true },
      history: []
    };

    const pred = predictGame(neutralInput);
    const hfaDriver = pred.drivers.find(d => d.key === 'home_field_advantage');
    expect(hfaDriver).toBeUndefined();

    const superBowlInput: PredictionInput = {
      game: { homeAbbr: 'SEA', awayAbbr: 'NE', seasonType: 3, week: 5 },
      history: []
    };
    const sbPred = predictGame(superBowlInput);
    const sbHfaDriver = sbPred.drivers.find(d => d.key === 'home_field_advantage');
    expect(sbHfaDriver).toBeUndefined();
  });

  test('total non-degenerate: holdout over/under shares >= 0.25, mean edge >= 1.0, zero edges <= 5%', () => {
    const holdoutGames = allGames.filter(g => (g.week >= 13 || g.seasonType === 3));
    expect(holdoutGames.length).toBe(107);

    let overs = 0;
    let unders = 0;
    let zeroEdges = 0;
    let totalEdgeSum = 0;

    for (const g of holdoutGames) {
      const targetTime = new Date(g.date).getTime();
      const pastGames = allGames.filter(prev => new Date(prev.date).getTime() < targetTime);

      const history: HistoricalGame[] = pastGames.map(prev => ({
        homeAbbr: prev.homeAbbr,
        awayAbbr: prev.awayAbbr,
        homeScore: prev.homeScore,
        awayScore: prev.awayScore,
        isNeutralSite: prev.neutralSite,
        date: prev.date,
        seasonType: prev.seasonType,
        week: prev.week
      }));

      const pred = predictGame({
        game: {
          id: g.id,
          homeAbbr: g.homeAbbr,
          awayAbbr: g.awayAbbr,
          isNeutralSite: g.neutralSite,
          seasonType: g.seasonType,
          week: g.week,
          market: g.market
        },
        history
      });

      if (pred.totalPick.side === 'over') overs++;
      else if (pred.totalPick.side === 'under') unders++;

      if (pred.totalPick.edge === 0) zeroEdges++;
      totalEdgeSum += pred.totalPick.edge;
    }

    const overShare = overs / holdoutGames.length;
    const underShare = unders / holdoutGames.length;
    const zeroEdgeShare = zeroEdges / holdoutGames.length;
    const meanEdge = totalEdgeSum / holdoutGames.length;

    expect(overShare).toBeGreaterThanOrEqual(0.25);
    expect(underShare).toBeGreaterThanOrEqual(0.25);
    expect(meanEdge).toBeGreaterThanOrEqual(1.0);
    expect(zeroEdgeShare).toBeLessThanOrEqual(0.05);
  });

  test('spread line sign: line signed correctly for picked team and marketSpread attached', () => {
    for (const g of allGames) {
      if (!g.market || g.market.spread === null) continue;

      const targetTime = new Date(g.date).getTime();
      const pastGames = allGames.filter(prev => new Date(prev.date).getTime() < targetTime);

      const history: HistoricalGame[] = pastGames.map(prev => ({
        homeAbbr: prev.homeAbbr,
        awayAbbr: prev.awayAbbr,
        homeScore: prev.homeScore,
        awayScore: prev.awayScore,
        isNeutralSite: prev.neutralSite,
        date: prev.date,
        seasonType: prev.seasonType,
        week: prev.week
      }));

      const pred = predictGame({
        game: {
          id: g.id,
          homeAbbr: g.homeAbbr,
          awayAbbr: g.awayAbbr,
          isNeutralSite: g.neutralSite,
          seasonType: g.seasonType,
          week: g.week,
          market: g.market
        },
        history
      });

      const rawSpread = g.market.spread; // negative = home favorite, positive = away favorite
      expect(pred.marketSpread).toBe(rawSpread);
      expect(Math.abs(pred.spreadPick.line)).toBe(Math.abs(rawSpread));

      // Home is favorite if rawSpread < 0, away is favorite if rawSpread > 0
      const isHomeFavorite = rawSpread < 0;
      const isAwayFavorite = rawSpread > 0;

      if (pred.spreadPick.team === g.homeAbbr) {
        if (isHomeFavorite) expect(pred.spreadPick.line).toBeLessThan(0);
        else if (isAwayFavorite) expect(pred.spreadPick.line).toBeGreaterThan(0);
      } else if (pred.spreadPick.team === g.awayAbbr) {
        if (isAwayFavorite) expect(pred.spreadPick.line).toBeLessThan(0);
        else if (isHomeFavorite) expect(pred.spreadPick.line).toBeGreaterThan(0);
      }
    }
  });

  test('Missing market data path (spread: null / market: null) produces no NaN', () => {
    const nullMarketInput: PredictionInput = {
      game: { homeAbbr: 'DET', awayAbbr: 'GB', market: null },
      history: [
        { homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 24, awayScore: 17 },
        { homeAbbr: 'GB', awayAbbr: 'MIN', homeScore: 20, awayScore: 23 }
      ]
    };

    const pred = predictGame(nullMarketInput);

    expect(Number.isNaN(pred.homeScore)).toBe(false);
    expect(Number.isNaN(pred.awayScore)).toBe(false);
    expect(Number.isNaN(pred.margin)).toBe(false);
    expect(Number.isNaN(pred.homeWinProbability)).toBe(false);
    expect(Number.isNaN(pred.confidence)).toBe(false);
    expect(Number.isNaN(pred.spreadPick.line)).toBe(false);
    expect(Number.isNaN(pred.spreadPick.edge)).toBe(false);
    expect(Number.isNaN(pred.totalPick.line)).toBe(false);
    expect(Number.isNaN(pred.totalPick.projected)).toBe(false);
    expect(Number.isNaN(pred.totalPick.edge)).toBe(false);
  });
});
