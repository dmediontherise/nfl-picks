import test from 'node:test';
import assert from 'node:assert';
import { calculateMetrics, runBacktest } from '../backtest';
import { computeWilson95, runSignificanceAnalysis } from '../significance';
import { predictEloQB } from '../models/elo';
import { predictMassey } from '../models/massey';
import { Game } from '../models/types';
import fs from 'fs';
import path from 'path';

test('hand-computed fixture: ATS win/loss/push classification & roiAt110', () => {
  const games: Game[] = [
    { id: 'g1', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 24, awayScore: 20, neutralSite: false, market: { spread: -3.5, total: 45 } },
    { id: 'g2', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H2', awayAbbr: 'A2', homeScore: 20, awayScore: 24, neutralSite: false, market: { spread: -3.5, total: 45 } },
    { id: 'g3', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H3', awayAbbr: 'A3', homeScore: 24, awayScore: 21, neutralSite: false, market: { spread: -3.0, total: 45 } },
    { id: 'g4', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H4', awayAbbr: 'A4', homeScore: 17, awayScore: 14, neutralSite: false, market: { spread: 4.5, total: 45 } },
    { id: 'g5', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H5', awayAbbr: 'A5', homeScore: 10, awayScore: 20, neutralSite: false, market: { spread: -7.0, total: 45 } }
  ];

  const predictions = new Map<string, any>([
    ['g1', { homeWinProb: 0.7, homeScore: 24, awayScore: 20, spreadPick: 'home' }], // Win
    ['g2', { homeWinProb: 0.7, homeScore: 24, awayScore: 20, spreadPick: 'home' }], // Loss
    ['g3', { homeWinProb: 0.7, homeScore: 24, awayScore: 20, spreadPick: 'home' }], // Push
    ['g4', { homeWinProb: 0.7, homeScore: 24, awayScore: 20, spreadPick: 'home' }], // Win
    ['g5', { homeWinProb: 0.2, homeScore: 10, awayScore: 20, spreadPick: 'away' }]  // Win
  ]);

  const metrics = calculateMetrics(games, predictions);

  assert.strictEqual(metrics.atsRecord, '3-1-1');
  assert.strictEqual(metrics.atsAccuracy, 0.75);
  assert.strictEqual(metrics.roiAt110, 0.3455);
});

test('hand-computed fixture: Brier score & log loss', () => {
  const games: Game[] = [
    { id: 'g1', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 20, awayScore: 10, neutralSite: false, market: { spread: -3.5, total: 45 } },
    { id: 'g2', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H2', awayAbbr: 'A2', homeScore: 10, awayScore: 20, neutralSite: false, market: { spread: -3.5, total: 45 } }
  ];

  const predictions = new Map<string, any>([
    ['g1', { homeWinProb: 0.8, homeScore: 20, awayScore: 10, spreadPick: 'home' }],
    ['g2', { homeWinProb: 0.3, homeScore: 10, awayScore: 20, spreadPick: 'away' }]
  ]);

  const metrics = calculateMetrics(games, predictions);

  assert.strictEqual(metrics.brierScore, 0.065);
  assert.strictEqual(metrics.logLoss, 0.2899);
});

test('hand-computed fixture: Wilson 95% interval and Sidak adjustment', () => {
  const w = computeWilson95(61, 107);
  assert.strictEqual(w.lower, 0.4755);
  assert.strictEqual(w.upper, 0.6599);

  const sigPath = path.join(__dirname, '..', 'results', 'significance-2025.json');
  const sigData = JSON.parse(fs.readFileSync(sigPath, 'utf8'));
  assert.strictEqual(sigData.selectionAdjustedPValue, 0.6199);
});

test('model fixture: Elo HFA grants home team > 0.55 win probability on neutral=false with empty history', () => {
  const game: Game = { id: 'g1', date: '2025-09-07', seasonType: 2, week: 1, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 20, awayScore: 10, neutralSite: false, market: { spread: -3.5, total: 45 } };
  const pred = predictEloQB(game, []);
  assert.ok(pred.homeWinProb > 0.55, `Expected homeWinProb > 0.55, got ${pred.homeWinProb}`);
});

test('model fixture: Elo K factor updates ratings after history games', () => {
  const history: Game[] = [
    { id: 'h1', date: '2025-09-01', seasonType: 2, week: 1, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 40, awayScore: 0, neutralSite: true, market: { spread: 0, total: 40 } },
    { id: 'h2', date: '2025-09-02', seasonType: 2, week: 1, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 40, awayScore: 0, neutralSite: true, market: { spread: 0, total: 40 } }
  ];
  const game: Game = { id: 'g1', date: '2025-09-07', seasonType: 2, week: 2, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 20, awayScore: 10, neutralSite: true, market: { spread: 0, total: 40 } };
  const pred = predictEloQB(game, history);
  assert.ok(pred.homeWinProb > 0.65, `Expected homeWinProb > 0.65 after 2 blowouts, got ${pred.homeWinProb}`);
});

test('model fixture: Massey model projects higher score for stronger team', () => {
  const history: Game[] = [
    { id: 'h1', date: '2025-09-01', seasonType: 2, week: 1, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 35, awayScore: 7, neutralSite: true, market: { spread: 0, total: 42 } }
  ];
  const game: Game = { id: 'g1', date: '2025-09-07', seasonType: 2, week: 2, homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 20, awayScore: 10, neutralSite: true, market: { spread: 0, total: 42 } };
  const pred = predictMassey(game, history);
  assert.ok(pred.homeScore > pred.awayScore, `Expected homeScore > awayScore for stronger team, got home=${pred.homeScore}, away=${pred.awayScore}`);
});

test('backtest fixture: runBacktest produces expected train and holdout game counts', () => {
  const data = runBacktest(false);
  assert.strictEqual(data.trainGamesCount, 178);
  assert.strictEqual(data.holdoutGamesCount, 107);
});

test('significance fixture: runSignificanceAnalysis produces expected selectionAdjustedPValue', () => {
  const sigData = runSignificanceAnalysis(false);
  assert.strictEqual(sigData.selectionAdjustedPValue, 0.6199);
});
