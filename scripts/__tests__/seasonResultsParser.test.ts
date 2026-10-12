import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  parseEspnScoreboard,
  validateSeasonResultsSnapshot,
  normalizeTeamAbbr,
  CANONICAL_NFL_ABBREVIATIONS,
  SeasonResultsSnapshot,
} from '../fetch-season-results';

test('normalizeTeamAbbr maps WAS to WSH and handles standard abbreviations', () => {
  assert.strictEqual(normalizeTeamAbbr('WAS'), 'WSH');
  assert.strictEqual(normalizeTeamAbbr('was'), 'WSH');
  assert.strictEqual(normalizeTeamAbbr('JAC'), 'JAX');
  assert.strictEqual(normalizeTeamAbbr('PHI'), 'PHI');
  assert.strictEqual(normalizeTeamAbbr(''), '');
});

test('parseEspnScoreboard parses final games correctly from ESPN fixture', () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/espn-scoreboard-2026.json');
  const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  const games = parseEspnScoreboard(fixtureData);

  assert.strictEqual(games.length, 16);

  const firstGame = games[0];
  assert.strictEqual(typeof firstGame.id, 'string');
  assert.strictEqual(firstGame.week, 1);
  assert.strictEqual(firstGame.seasonType, 2);
  assert.ok(CANONICAL_NFL_ABBREVIATIONS.has(firstGame.homeAbbr));
  assert.ok(CANONICAL_NFL_ABBREVIATIONS.has(firstGame.awayAbbr));
  assert.ok(Number.isInteger(firstGame.homeScore));
  assert.ok(Number.isInteger(firstGame.awayScore));
  assert.strictEqual(typeof firstGame.neutralSite, 'boolean');
  assert.ok(firstGame.market !== undefined);
});

test('parseEspnScoreboard ignores in-progress or scheduled games', () => {
  const mockData = {
    events: [
      {
        id: '12345',
        week: { number: 1 },
        season: { type: 2 },
        date: '2026-09-10T00:00:00Z',
        status: { type: { completed: false, state: 'pre' } },
        competitions: [
          {
            competitors: [
              { homeAway: 'home', score: '0', team: { abbreviation: 'PHI' } },
              { homeAway: 'away', score: '0', team: { abbreviation: 'DAL' } },
            ],
          },
        ],
      },
      {
        id: '12346',
        week: { number: 1 },
        season: { type: 2 },
        date: '2026-09-10T03:00:00Z',
        status: { type: { completed: true, state: 'post', name: 'STATUS_FINAL' } },
        competitions: [
          {
            competitors: [
              { homeAway: 'home', score: '24', team: { abbreviation: 'KC' } },
              { homeAway: 'away', score: '20', team: { abbreviation: 'BAL' } },
            ],
          },
        ],
      },
    ],
  };

  const parsed = parseEspnScoreboard(mockData);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].id, '12346');
  assert.strictEqual(parsed[0].homeAbbr, 'KC');
  assert.strictEqual(parsed[0].awayAbbr, 'BAL');
  assert.strictEqual(parsed[0].homeScore, 24);
  assert.strictEqual(parsed[0].awayScore, 20);
});

test('validateSeasonResultsSnapshot validates valid snapshot and rejects bad shapes', () => {
  const validSnapshot: SeasonResultsSnapshot = {
    schemaVersion: 1,
    season: 2026,
    fetchedAt: '2026-10-11T20:00:00Z',
    games: [
      {
        id: '1',
        week: 1,
        seasonType: 2,
        date: '2026-09-10T00:00:00Z',
        homeAbbr: 'PHI',
        awayAbbr: 'DAL',
        homeScore: 24,
        awayScore: 20,
        neutralSite: false,
        market: { spread: -3, total: 45.5, moneylineHome: -160 },
      },
    ],
  };

  assert.doesNotThrow(() => validateSeasonResultsSnapshot(validSnapshot));

  // Invalid schemaVersion
  assert.throws(
    () => validateSeasonResultsSnapshot({ ...validSnapshot, schemaVersion: 2 }),
    /Invalid schemaVersion/
  );

  // Invalid season
  assert.throws(
    () => validateSeasonResultsSnapshot({ ...validSnapshot, season: 2025 }),
    /Invalid season/
  );

  // Duplicate ID
  assert.throws(
    () =>
      validateSeasonResultsSnapshot({
        ...validSnapshot,
        games: [validSnapshot.games[0], validSnapshot.games[0]],
      }),
    /Duplicate game id/
  );

  // Unknown team abbreviation
  assert.throws(
    () =>
      validateSeasonResultsSnapshot({
        ...validSnapshot,
        games: [{ ...validSnapshot.games[0], homeAbbr: 'XYZ' }],
      }),
    /unknown homeAbbr/
  );

  // Invalid score
  assert.throws(
    () =>
      validateSeasonResultsSnapshot({
        ...validSnapshot,
        games: [{ ...validSnapshot.games[0], homeScore: -1 }],
      }),
    /invalid homeScore/
  );
});

import { gamesAreEqual, sortSeasonGames, fetchAndSaveSeasonResults } from '../fetch-season-results';

test('gamesAreEqual: identical games → unchanged', () => {
  const g = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  assert.strictEqual(gamesAreEqual([g], [g]), true);
});

test('gamesAreEqual: one score changed → changed', () => {
  const g1 = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const g2 = { ...g1, homeScore: 27 };
  assert.strictEqual(gamesAreEqual([g1], [g2]), false);

  // awayScore changed alone → false (M2)
  const gAwayChanged = { ...g1, awayScore: 23 };
  assert.strictEqual(gamesAreEqual([g1], [gAwayChanged]), false);
});

test('gamesAreEqual: market fields and neutralSite changed alone → false (M3)', () => {
  const gBase = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };

  // market.spread changed alone
  const gSpread = { ...gBase, market: { ...gBase.market, spread: -3.5 } };
  assert.strictEqual(gamesAreEqual([gBase], [gSpread]), false);

  // market.total changed alone
  const gTotal = { ...gBase, market: { ...gBase.market, total: 48.0 } };
  assert.strictEqual(gamesAreEqual([gBase], [gTotal]), false);

  // market.moneylineHome changed alone
  const gMl = { ...gBase, market: { ...gBase.market, moneylineHome: -175 } };
  assert.strictEqual(gamesAreEqual([gBase], [gMl]), false);

  // neutralSite changed alone
  const gNeutral = { ...gBase, neutralSite: true };
  assert.strictEqual(gamesAreEqual([gBase], [gNeutral]), false);
});

test('gamesAreEqual: one game added → changed', () => {
  const g1 = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const g2 = {
    id: '2',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'KC',
    awayAbbr: 'BAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  assert.strictEqual(gamesAreEqual([g1], [g1, g2]), false);
});

test('gamesAreEqual: same games in different input order → unchanged after sorting', () => {
  const g1 = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const g2 = {
    id: '2',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T03:00:00Z',
    homeAbbr: 'KC',
    awayAbbr: 'BAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  assert.strictEqual(gamesAreEqual([g1, g2], [g2, g1]), true);
});

test('sortSeasonGames: two games with identical kickoff timestamps sort by id ascending independent of input order (M1)', () => {
  const gA = {
    id: '100',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const gB = {
    id: '200',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'KC',
    awayAbbr: 'BAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };

  const sorted1 = sortSeasonGames([gA, gB]);
  assert.strictEqual(sorted1[0].id, '100');
  assert.strictEqual(sorted1[1].id, '200');

  const sorted2 = sortSeasonGames([gB, gA]);
  assert.strictEqual(sorted2[0].id, '100');
  assert.strictEqual(sorted2[1].id, '200');
});

test('fetchAndSaveSeasonResults: two runs with same games leave file bytes and mtime unchanged', async () => {
  const g = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const tmp = '/tmp/test-sr-unchanged.json';
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const res1 = await fetchAndSaveSeasonResults(tmp, [g]);
  assert.strictEqual(res1.changed, true);
  const beforeBytes = fs.readFileSync(tmp);
  const beforeMtime = fs.statSync(tmp).mtimeMs;
  const res2 = await fetchAndSaveSeasonResults(tmp, [g]);
  assert.strictEqual(res2.changed, false);
  // Verify return metadata on unchanged no-op path (M5)
  assert.strictEqual(res2.count, 1);
  assert.strictEqual(res2.latestDate, '2026-09-10T00:00:00Z');
  const afterBytes = fs.readFileSync(tmp);
  const afterMtime = fs.statSync(tmp).mtimeMs;
  assert.strictEqual(beforeBytes.equals(afterBytes), true);
  assert.strictEqual(beforeMtime, afterMtime);
});

test('fetchAndSaveSeasonResults: out-of-order gamesInput writes games in sorted order (M4)', async () => {
  const gEarly = {
    id: '100',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const gLate = {
    id: '200',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T03:00:00Z',
    homeAbbr: 'KC',
    awayAbbr: 'BAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const tmp = '/tmp/test-sr-order.json';
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  // Pass games in reverse chronological order
  const res = await fetchAndSaveSeasonResults(tmp, [gLate, gEarly]);
  assert.strictEqual(res.changed, true);
  assert.strictEqual(res.count, 2);
  assert.strictEqual(res.latestDate, '2026-09-10T03:00:00Z');

  const written = JSON.parse(fs.readFileSync(tmp, 'utf-8'));
  assert.strictEqual(written.games.length, 2);
  assert.strictEqual(written.games[0].id, '100');
  assert.strictEqual(written.games[1].id, '200');
});

test('fetchAndSaveSeasonResults: run with new game rewrites file', async () => {
  const g1 = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const g2 = {
    id: '2',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T03:00:00Z',
    homeAbbr: 'KC',
    awayAbbr: 'BAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const tmp = '/tmp/test-sr-changed.json';
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const res1 = await fetchAndSaveSeasonResults(tmp, [g1]);
  assert.strictEqual(res1.changed, true);
  const beforeBytes = fs.readFileSync(tmp);
  const res2 = await fetchAndSaveSeasonResults(tmp, [g1, g2]);
  assert.strictEqual(res2.changed, true);
  const afterBytes = fs.readFileSync(tmp);
  assert.strictEqual(beforeBytes.equals(afterBytes), false);
});

test('fetchAndSaveSeasonResults: unparseable existing file is treated as changed and overwritten', async () => {
  const g = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const tmp = '/tmp/test-sr-unparseable.json';
  fs.writeFileSync(tmp, 'not valid json {{{', 'utf-8');
  const res = await fetchAndSaveSeasonResults(tmp, [g]);
  assert.strictEqual(res.changed, true);
  const content = JSON.parse(fs.readFileSync(tmp, 'utf-8'));
  assert.strictEqual(content.games.length, 1);
});

test('fetchAndSaveSeasonResults: incoming dataset smaller than existing snapshot refuses write and leaves file unchanged (M2)', async () => {
  const g1 = {
    id: '1',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T00:00:00Z',
    homeAbbr: 'PHI',
    awayAbbr: 'DAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const g2 = {
    id: '2',
    week: 1,
    seasonType: 2,
    date: '2026-09-10T03:00:00Z',
    homeAbbr: 'KC',
    awayAbbr: 'BAL',
    homeScore: 24,
    awayScore: 20,
    neutralSite: false,
    market: { spread: -3, total: 45.5, moneylineHome: -160 },
  };
  const tmp = '/tmp/test-sr-monotonic.json';
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  // Write snapshot with 2 games
  const res1 = await fetchAndSaveSeasonResults(tmp, [g1, g2]);
  assert.strictEqual(res1.changed, true);
  const beforeBytes = fs.readFileSync(tmp);
  const beforeMtime = fs.statSync(tmp).mtimeMs;

  // Attempt to write snapshot with only 1 game (existingCount: 2 > games.length: 1)
  await assert.rejects(
    async () => {
      await fetchAndSaveSeasonResults(tmp, [g1]);
    },
    (err: Error) => {
      assert.match(err.message, /Monotonicity violation/);
      return true;
    }
  );

  // Verify file bytes and mtime were completely unchanged
  const afterBytes = fs.readFileSync(tmp);
  const afterMtime = fs.statSync(tmp).mtimeMs;
  assert.strictEqual(beforeBytes.equals(afterBytes), true);
  assert.strictEqual(beforeMtime, afterMtime);
});
