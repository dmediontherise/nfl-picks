import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('determinism & result accuracy invariance: committed json results carry exact metrics', () => {
  const resultsDir = path.join(__dirname, '..', 'results');

  const backtestPath = path.join(resultsDir, 'backtest-2025.json');
  assert.ok(fs.existsSync(backtestPath), 'backtest-2025.json must exist');
  const backtestData = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));

  const masseyHoldout = backtestData.models.massey_rating.holdout;
  assert.strictEqual(masseyHoldout.suAccuracy, 0.6168);
  assert.strictEqual(masseyHoldout.atsAccuracy, 0.5701);
  assert.strictEqual(masseyHoldout.atsRecord, '61-46-0');

  const enginePath = path.join(resultsDir, 'engine-2025.json');
  assert.ok(fs.existsSync(enginePath), 'engine-2025.json must exist');
  const engineData = JSON.parse(fs.readFileSync(enginePath, 'utf8'));

  assert.strictEqual(engineData.holdout.suAccuracy, 0.6168);
  assert.strictEqual(engineData.holdout.atsAccuracy, 0.5701);
  assert.strictEqual(engineData.holdout.atsRecord, '61-46-0');

  const sigPath = path.join(resultsDir, 'significance-2025.json');
  assert.ok(fs.existsSync(sigPath), 'significance-2025.json must exist');
  const sigData = JSON.parse(fs.readFileSync(sigPath, 'utf8'));

  assert.strictEqual(sigData.selectionAdjustedPValue, 0.6199);
});
