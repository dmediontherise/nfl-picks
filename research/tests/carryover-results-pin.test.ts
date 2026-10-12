import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runCarryoverBacktest } from '../backtest-carryover';

test('carryover results pin: runCarryoverBacktest(false) deep equals committed JSON and pins winner and counts', () => {
  const committedJsonPath = path.resolve(__dirname, '../results/carryover-2025.json');
  assert.ok(fs.existsSync(committedJsonPath), 'research/results/carryover-2025.json must exist');

  const committedData = JSON.parse(fs.readFileSync(committedJsonPath, 'utf-8'));

  // Run backtest with writeResults: false
  const freshData = runCarryoverBacktest(false);

  // Assert fresh backtest result is deeply equal to committed JSON
  assert.deepStrictEqual(freshData, committedData);

  // Literal assertions
  assert.strictEqual(freshData.decision.winnerId, 'decay_4');
  assert.strictEqual(freshData.candidates.length, 10);
  assert.strictEqual(freshData.dataset.targetRegularGamesCount, 272);
  assert.strictEqual(freshData.dataset.priorGamesCount, 285);
});
