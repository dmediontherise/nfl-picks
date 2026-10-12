import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { SeasonGame, buildCarryoverHistory } from '../backtest-carryover';

test('leakage guard (carryover backtest): exercises buildCarryoverHistory directly across all 272 games', () => {
  const data2024Path = path.resolve(__dirname, '../data/2024-season.json');
  const data2025Path = path.resolve(__dirname, '../data/2025-season.json');

  const d2024: { games: SeasonGame[] } = JSON.parse(fs.readFileSync(data2024Path, 'utf-8'));
  const d2025: { games: SeasonGame[] } = JSON.parse(fs.readFileSync(data2025Path, 'utf-8'));

  const priorGames = d2024.games.filter(g => g.seasonType === 2 || g.seasonType === 3);

  const all2025 = [...d2025.games].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const targetGames = all2025.filter(g => g.seasonType === 2 && g.week >= 1 && g.week <= 18);
  assert.strictEqual(targetGames.length, 272, '2025 regular season must have 272 games');

  let auditedCount = 0;

  for (const target of targetGames) {
    const targetTime = new Date(target.date).getTime();
    const testWeight = 0.5;

    // Call the real exported buildCarryoverHistory function
    const history = buildCarryoverHistory(priorGames, all2025, target, testWeight);

    // Split history into prior-season (first priorGames.length items) and 2025 history
    const priorHistory = history.slice(0, priorGames.length);
    const targetHistory = history.slice(priorGames.length);

    // Check prior season games are present at testWeight
    assert.strictEqual(priorHistory.length, priorGames.length);
    for (let j = 0; j < priorHistory.length; j++) {
      assert.strictEqual(priorHistory[j].weight, testWeight);
      assert.strictEqual(priorHistory[j].homeAbbr, priorGames[j].homeAbbr);
      assert.strictEqual(priorHistory[j].awayAbbr, priorGames[j].awayAbbr);
    }

    // Check 2025 games: every game has kickoff strictly before target kickoff and is not target id
    for (const hGame of targetHistory) {
      assert.strictEqual(hGame.weight, 1.0);
      assert.ok(hGame.date, 'history game must have date');
      const hTime = new Date(hGame.date!).getTime();
      assert.ok(
        hTime < targetTime,
        `Leakage detected in buildCarryoverHistory: history game date (${hGame.date}) >= target date (${target.date})`
      );
    }

    // Verify target itself is not in targetHistory
    const all2025Before = all2025.filter(g => new Date(g.date).getTime() < targetTime);
    assert.strictEqual(targetHistory.length, all2025Before.length);
    assert.ok(
      all2025Before.every(g => g.id !== target.id),
      `Target ${target.id} cannot be in pre-kickoff history`
    );

    auditedCount++;
  }

  assert.strictEqual(auditedCount, 272, 'All 272 target games audited for leakage using buildCarryoverHistory');
});
