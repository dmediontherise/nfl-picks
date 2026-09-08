import test from 'node:test';
import assert from 'node:assert';
import { calculateEngineMetrics, SeasonGame } from '../backtest-engine';
import { Prediction } from '../../src/engine/types';

// Hand-built fixture: six games with final scores, spreads, predicted winners,
// win probabilities, scores, ATS picks, and total picks. Every expected number
// below is hand-computed (see per-game rows); the function under test is only
// used to _produce_ the metrics being asserted, never to _compute_ an expected.
//
// Score conventions: negative spread = home favored; homeScore/awayScore are the
// model's projected scores (used only for the total-projection error).
//
// | g  | final (H-A) | spread | coverMargin | ATS actual | pick    | ATS   | SU actual | pred | SU   | total line/real/pick |
// |----|-------------|--------|-------------|------------|---------|-------|-----------|------|------|-----------------------|
// | g1 | 24-14 (+10) |  -7    | +3          | home       | home    | WIN   | home      | home | OK   | 30 / 38 / over        |
// | g2 | 24-20 (+4)  |  -7    | -3          | away       | home    | LOSS  | home      | home | OK   | 45 / 44 / under       |
// | g3 | 24-21 (+3)  |  -3    | 0           | push       | home    | PUSH  | home      | home | OK   | 45 / 45 / over (push) |
// | g4 | 17-14 (+3)  |  +4.5  | +7.5        | home       | home    | WIN   | home      | home | OK   | 33 / 31 / under       |
// | g5 | 10-20 (-10) |  -7    | -17         | away       | away    | WIN   | away      | away | OK   | 28 / 30 / over        |
// | g6 | 20-27 (-7)  |  -7    | -14         | away       | home    | LOSS  | away      | home | MISS | 44 / 47 / over        |
//
// Custom lines underlined above: g1 covers a favorite covering, g4 covers an
// underdog covering, g5 covers a straight-up away win, g6 covers a straight-up
// loss, g1 an over decision and g2 an under decision.

function game(id: string, homeAbbr: string, awayAbbr: string, homeScore: number, awayScore: number, spread: number): SeasonGame {
  return {
    id,
    week: 1,
    seasonType: 2,
    date: '2025-09-07',
    homeAbbr,
    awayAbbr,
    homeScore,
    awayScore,
    neutralSite: false,
    market: { spread, total: null }
  };
}

function entry(
  id: string,
  winner: string,
  homeWinProbability: number,
  homeScore: number,
  awayScore: number,
  pickTeam: string,
  totalSide: 'over' | 'under',
  totalLine: number,
  projectedTotal: number
): [string, Prediction] {
  return [
    id,
    {
      winner,
      homeScore,
      awayScore,
      margin: homeScore - awayScore,
      projectedMargin: homeScore - awayScore,
      homeWinProbability,
      confidence: 50,
      spreadPick: { team: pickTeam, line: -7, edge: 1 },
      totalPick: { side: totalSide, line: totalLine, projected: projectedTotal, edge: 1 },
      marketSpread: -7,
      drivers: [],
      modelVersion: 'test-fixture'
    }
  ];
}

test('engine metrics fixture: calculateEngineMetrics on hand-computed six-game set', () => {
  const games: SeasonGame[] = [
    game('g1', 'H1', 'A1', 24, 14, -7),
    game('g2', 'H2', 'A2', 24, 20, -7),
    game('g3', 'H3', 'A3', 24, 21, -3),
    game('g4', 'H4', 'A4', 17, 14, 4.5),
    game('g5', 'H5', 'A5', 10, 20, -7),
    game('g6', 'H6', 'A6', 20, 27, -7)
  ];

  const predictions = new Map<string, Prediction>([
    entry('g1', 'H1', 0.8, 24, 14, 'H1', 'over', 30, 33),   // spread win; favorite covers; SU win; total over
    entry('g2', 'H2', 0.7, 24, 20, 'H2', 'under', 45, 43),  // spread loss; SU win; total under
    entry('g3', 'H3', 0.6, 24, 21, 'H3', 'over', 45, 46),   // push; SU win; total pushes line (undecided)
    entry('g4', 'H4', 0.55, 17, 14, 'H4', 'under', 33, 32), // spread win; underdog covers; SU win; total under
    entry('g5', 'A5', 0.4, 10, 20, 'A5', 'over', 28, 29),   // spread win; SU away win; total over
    entry('g6', 'H6', 0.2, 20, 27, 'H6', 'over', 44, 46)    // spread loss; SU loss; total over
  ]);

  const metrics = calculateEngineMetrics(games, predictions);

  // Hand-computed expected values:
  //   ATS: 3 wins (g1, g4, g5), 2 losses (g2, g6), 1 push (g3)
  assert.strictEqual(metrics.games, 6);
  assert.strictEqual(metrics.atsExcluded, 0);
  assert.strictEqual(metrics.atsRecord, '3-2-1');
  assert.strictEqual(metrics.atsAccuracy, 0.6); // 3 / 5 decisions

  //   ROI at -110: netUnits = 3*(10/11) - 2 = 30/11 - 2 = 8/11 ~= 0.72727; / 6 bets = 0.121212...
  assert.strictEqual(metrics.roiAt110, 0.1212);

  //   Brier: sum((p-y)^2) = 0.04+0.09+0.16+0.2025+0.16+0.04 = 0.6925; / 6 = 0.115416...
  assert.strictEqual(metrics.brierScore, 0.1154);

  //   LogLoss: -(y*ln p + (1-y)*ln(1-p)) sums to 2.4224503; / 6 = 0.4037417...
  assert.strictEqual(metrics.logLoss, 0.4037);

  //   SU: 5 correct of 6 (g6 predicted home, away won)
  assert.strictEqual(metrics.suAccuracy, 0.8333);

  //   Totals: 5 decided, 5 correct (g3 realized equals line 45 -> undecided)
  assert.strictEqual(metrics.totalPickAccuracy, 1);

  //   Total error: |33-38|+|43-44|+|46-45|+|32-31|+|29-30|+|46-47| = 5+1+1+1+1+1 = 10; / 6 = 1.6667
  assert.strictEqual(metrics.meanAbsTotalError, 1.6667);
});