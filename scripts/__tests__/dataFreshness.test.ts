import test from 'node:test';
import assert from 'node:assert';
import {
  evaluateFreshness,
  extractRosterFetchedAtFromBundle,
  FreshnessInputs,
} from '../check-data-freshness';

test('extractRosterFetchedAtFromBundle accurately extracts roster fetchedAt and distinguishes from teamStats', () => {
  const fixtureWithBoth = `
    SomePrefixCode;
    teamStatsModule(e){e.exports=JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-06T20:00:00.000Z","season":2026,"teamsStats":{"ARI":{}}}')};
    rosterModule(e){e.exports=JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-12T01:00:00.000Z","teams":{"ARI":{"roster":[{"name":"Player1"}]}}}')};
  `;

  const extracted = extractRosterFetchedAtFromBundle(fixtureWithBoth);
  assert.strictEqual(extracted, '2026-10-12T01:00:00.000Z');

  // Reverse order in bundle: roster first, teamStats second
  const fixtureReversed = `
    rosterModule(e){e.exports=JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-12T02:00:00.000Z","teams":{"KC":{"roster":[]}}}')};
    teamStatsModule(e){e.exports=JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-05T10:00:00.000Z","season":2026}')};
  `;
  const extractedReversed = extractRosterFetchedAtFromBundle(fixtureReversed);
  assert.strictEqual(extractedReversed, '2026-10-12T02:00:00.000Z');

  // No roster timestamp
  assert.strictEqual(extractRosterFetchedAtFromBundle('no timestamps here'), null);
  assert.strictEqual(extractRosterFetchedAtFromBundle(null), null);
});

test('evaluateFreshness passes when all checks are within limits', () => {
  const fixedNow = new Date('2026-10-12T12:00:00.000Z');

  const inputs: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: '2026-10-12T00:00:00.000Z' }, // 12h <= 24h
    teamStats: { fetchedAt: '2026-10-10T12:00:00.000Z' },      // 48h <= 72h
    seasonResults: {
      season: 2026,
      fetchedAt: '2026-10-12T00:00:00.000Z',
      games: [
        { date: '2026-09-10T00:00:00Z', seasonType: 2 },
        { date: '2026-10-10T00:00:00Z', seasonType: 2 },        // 60h <= 192h (8 days)
      ],
    },
    docsBundleJsContent: `JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-11T12:00:00.000Z","teams":{}}')`, // 24h <= 48h
  };

  const res = evaluateFreshness(inputs, fixedNow);
  assert.strictEqual(res.stale, false);
  assert.strictEqual(res.checks.length, 4);
  assert.ok(res.checks.every((c) => c.ok));
});

test('evaluateFreshness flags stale rosterSnapshot when > 24h', () => {
  const fixedNow = new Date('2026-10-12T12:00:00.000Z');
  const inputs: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: '2026-10-11T10:00:00.000Z' }, // 26h > 24h
    teamStats: { fetchedAt: '2026-10-11T12:00:00.000Z' },
    docsBundleJsContent: `JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-12T00:00:00.000Z","teams":{}}')`,
  };

  const res = evaluateFreshness(inputs, fixedNow);
  assert.strictEqual(res.stale, true);
  const rosterCheck = res.checks.find((c) => c.name === 'rosterSnapshot');
  assert.ok(rosterCheck);
  assert.strictEqual(rosterCheck?.ok, false);
  assert.ok(rosterCheck?.detail.includes('stale'));
});

test('evaluateFreshness flags stale teamStats when > 72h', () => {
  const fixedNow = new Date('2026-10-12T12:00:00.000Z');
  const inputs: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: '2026-10-12T00:00:00.000Z' },
    teamStats: { fetchedAt: '2026-10-09T00:00:00.000Z' }, // 84h > 72h
    docsBundleJsContent: `JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-12T00:00:00.000Z","teams":{}}')`,
  };

  const res = evaluateFreshness(inputs, fixedNow);
  assert.strictEqual(res.stale, true);
  const teamCheck = res.checks.find((c) => c.name === 'teamStats');
  assert.ok(teamCheck);
  assert.strictEqual(teamCheck?.ok, false);
  assert.ok(teamCheck?.detail.includes('stale'));
});

test('evaluateFreshness seasonResults handles in-season stale games and offseason correctly', () => {
  const fixedInSeason = new Date('2026-10-15T12:00:00.000Z');
  const inputsInSeasonStale: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: '2026-10-15T00:00:00.000Z' },
    teamStats: { fetchedAt: '2026-10-14T00:00:00.000Z' },
    seasonResults: {
      season: 2026,
      games: [
        { date: '2026-09-10T00:00:00Z', seasonType: 2 },
        { date: '2026-10-01T00:00:00Z', seasonType: 2 }, // 14.5 days old (> 8 days)
      ],
    },
    docsBundleJsContent: `JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-15T00:00:00.000Z","teams":{}}')`,
  };

  const resInSeason = evaluateFreshness(inputsInSeasonStale, fixedInSeason);
  const srCheck = resInSeason.checks.find((c) => c.name === 'seasonResults');
  assert.strictEqual(srCheck?.ok, false);
  assert.ok(srCheck?.detail.includes('stale'));

  // Offseason: e.g. July 2026 (before season starts in September)
  const fixedOffseason = new Date('2026-07-01T12:00:00.000Z');
  const inputsOffseason: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: '2026-07-01T00:00:00.000Z' },
    teamStats: { fetchedAt: '2026-07-01T00:00:00.000Z' },
    seasonResults: {
      season: 2026,
      games: [{ date: '2026-09-10T00:00:00Z', seasonType: 2 }],
    },
    docsBundleJsContent: `JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-07-01T00:00:00.000Z","teams":{}}')`,
  };
  const resOffseason = evaluateFreshness(inputsOffseason, fixedOffseason);
  const srOffseasonCheck = resOffseason.checks.find((c) => c.name === 'seasonResults');
  assert.strictEqual(srOffseasonCheck?.ok, true);
  assert.strictEqual(srOffseasonCheck?.detail, 'offseason');
});

test('evaluateFreshness flags stale publishedBuild when bundle roster fetchedAt > 48h', () => {
  const fixedNow = new Date('2026-10-12T12:00:00.000Z');
  const inputs: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: '2026-10-12T00:00:00.000Z' },
    teamStats: { fetchedAt: '2026-10-12T00:00:00.000Z' },
    docsBundleJsContent: `JSON.parse('{"schemaVersion":1,"fetchedAt":"2026-10-09T00:00:00.000Z","teams":{}}')`, // 84h > 48h
  };

  const res = evaluateFreshness(inputs, fixedNow);
  assert.strictEqual(res.stale, true);
  const pubCheck = res.checks.find((c) => c.name === 'publishedBuild');
  assert.strictEqual(pubCheck?.ok, false);
  assert.ok(pubCheck?.detail.includes('stale'));
});

test('evaluateFreshness treats missing or unparsable timestamps as clear failures, never crashing', () => {
  const fixedNow = new Date('2026-10-12T12:00:00.000Z');
  const invalidInputs: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: 'not-a-date' },
    teamStats: {},
    seasonResults: { games: [{ date: 'bad-date' }] },
    docsBundleJsContent: 'broken bundle without timestamps',
  };

  const res = evaluateFreshness(invalidInputs, fixedNow);
  assert.strictEqual(res.stale, true);
  for (const c of res.checks) {
    assert.strictEqual(c.ok, false);
    assert.ok(c.detail.length > 0);
  }
});

test('freshness limit boundary: age exactly equal to limit is ok, limit plus delta is stale (M2)', () => {
  const fixedNow = new Date('2026-10-12T12:00:00.000Z');

  // Roster limit is 24h.
  // 1. Exact 24.0h ago: ageHours = 24.0 <= 24 -> ok: true
  // Kills M2 (ageHours < limitHours would make 24.0 < 24 false!)
  const exactLimitDate = new Date(fixedNow.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const inputsExact: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: exactLimitDate },
  };
  const resExact = evaluateFreshness(inputsExact, fixedNow);
  const rosterCheckExact = resExact.checks.find((c) => c.name === 'rosterSnapshot');
  assert.strictEqual(rosterCheckExact?.ageHours, 24.0);
  assert.strictEqual(rosterCheckExact?.ok, true, 'age exactly equal to limit must be ok');

  // 2. Limit plus delta (24h + 6 minutes): ageHours = 24.1 > 24 -> ok: false
  const limitPlusDate = new Date(fixedNow.getTime() - (24 * 60 + 6) * 60 * 1000).toISOString();
  const inputsPlus: FreshnessInputs = {
    rosterSnapshot: { fetchedAt: limitPlusDate },
  };
  const resPlus = evaluateFreshness(inputsPlus, fixedNow);
  const rosterCheckPlus = resPlus.checks.find((c) => c.name === 'rosterSnapshot');
  assert.strictEqual(rosterCheckPlus?.ageHours, 24.1);
  assert.strictEqual(rosterCheckPlus?.ok, false, 'limit plus delta must be stale');
});

test('seasonResults off-season window: Dec 31 through Mar 1 treated as in-season, after Mar 1 treated as off-season (M3)', () => {
  // Season 2026: regular season starts Sept 2026.
  const seasonData = {
    season: 2026,
    games: [
      { date: '2026-09-10T00:00:00Z', seasonType: 2 },
      { date: '2026-12-25T00:00:00Z', seasonType: 2 },
    ],
  };

  // 1. Date on 2027-01-15 (between Dec 31 and Mar 1): in-season
  const janDate = new Date('2027-01-15T12:00:00.000Z');
  const resJan = evaluateFreshness({ seasonResults: seasonData }, janDate);
  const checkJan = resJan.checks.find((c) => c.name === 'seasonResults');
  assert.notStrictEqual(checkJan?.detail, 'offseason', 'January date must be treated as in-season');

  // 2. Date on 2027-02-28 (right before Mar 1): in-season
  const febDate = new Date('2027-02-28T12:00:00.000Z');
  const resFeb = evaluateFreshness({ seasonResults: seasonData }, febDate);
  const checkFeb = resFeb.checks.find((c) => c.name === 'seasonResults');
  assert.notStrictEqual(checkFeb?.detail, 'offseason', 'Late February date must be treated as in-season');

  // 3. Date after Mar 1 (e.g. 2027-03-02): off-season
  const marDate = new Date('2027-03-02T12:00:00.000Z');
  const resMar = evaluateFreshness({ seasonResults: seasonData }, marDate);
  const checkMar = resMar.checks.find((c) => c.name === 'seasonResults');
  assert.strictEqual(checkMar?.detail, 'offseason', 'Date after March 1 must be treated as offseason');
  assert.strictEqual(checkMar?.ok, true);
});

import fs from 'node:fs';
import path from 'node:path';
import { checkRepositoryFreshness } from '../check-data-freshness';

test('checkRepositoryFreshness evaluates seasonResults from disk and detects stale (M4)', () => {
  const tmpDir = '/tmp/test-freshness-repo';
  const dataDir = path.join(tmpDir, 'src/data');
  fs.mkdirSync(dataDir, { recursive: true });

  const fixedNow = new Date('2026-10-15T12:00:00.000Z');

  // Fresh rosterSnapshot (1h old)
  fs.writeFileSync(
    path.join(dataDir, 'rosterSnapshot.json'),
    JSON.stringify({ schemaVersion: 1, fetchedAt: '2026-10-15T11:00:00.000Z', teams: {} })
  );

  // Fresh teamStats (2h old)
  fs.writeFileSync(
    path.join(dataDir, 'teamStats.json'),
    JSON.stringify({ schemaVersion: 1, fetchedAt: '2026-10-15T10:00:00.000Z', teams: {} })
  );

  // Stale seasonResults (newest game is 14 days old in-season)
  fs.writeFileSync(
    path.join(dataDir, 'seasonResults.json'),
    JSON.stringify({
      schemaVersion: 1,
      season: 2026,
      fetchedAt: '2026-10-15T11:00:00.000Z',
      games: [
        { date: '2026-09-10T00:00:00Z', seasonType: 2 },
        { date: '2026-10-01T00:00:00Z', seasonType: 2 },
      ],
    })
  );

  const res = checkRepositoryFreshness(tmpDir, fixedNow);
  const srCheck = res.checks.find((c) => c.name === 'seasonResults');
  assert.ok(srCheck, 'seasonResults check must be present');
  assert.strictEqual(srCheck?.ok, false, 'seasonResults must be reported stale');
  assert.ok(srCheck?.detail.includes('stale'));

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
