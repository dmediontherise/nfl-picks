import test from 'node:test';
import assert from 'node:assert';
import {
  FTN_MAX_MISSING_GAME_PCT,
  FTN_MIN_JOIN_INTEGRITY_PCT,
  ScrimmageGameJoin,
  assertFtnCoverage,
  evaluateFtnCoverage,
} from '../lib/nflverse';
import { RawFtnRow, RawPbpRow, UnitStatsAccumulator } from '../fetch-team-stats';

function joinGame(
  gameId: string,
  scrimmagePlays: number,
  matchedPlays: number,
  hasFtnRows = true
): ScrimmageGameJoin {
  return { gameId, scrimmagePlays, matchedPlays, hasFtnRows };
}

function pbpRow(overrides: Partial<RawPbpRow> = {}): RawPbpRow {
  return {
    game_id: '2026_01_KC_BAL',
    play_id: '1',
    season_type: 'REG',
    posteam: 'KC',
    defteam: 'BAL',
    yardline_100: '40',
    down: '1',
    play_type: 'pass',
    yards_gained: '5',
    passing_yards: '5',
    rushing_yards: '0',
    pass_attempt: '1',
    rush_attempt: '0',
    sack: '0',
    qb_hit: '0',
    qb_dropback: '1',
    qb_kneel: '0',
    qb_spike: '0',
    two_point_attempt: '0',
    third_down_converted: '0',
    third_down_failed: '0',
    interception: '0',
    fumble_lost: '0',
    fixed_drive: '1',
    fixed_drive_result: 'Punt',
    goal_to_go: '0',
    epa: '0.1',
    success: '1',
    ...overrides,
  };
}

function ftnRow(overrides: Partial<RawFtnRow> = {}): RawFtnRow {
  return {
    nflverse_game_id: '2026_01_KC_BAL',
    nflverse_play_id: '1',
    n_blitzers: '0',
    n_defense_box: '7',
    is_play_action: 'FALSE',
    is_motion: 'FALSE',
    ...overrides,
  };
}

function emptyRedZone() {
  return { trips: 0, touchdowns: 0, fieldGoals: 0, tdRate: 0, pointsPerTrip: 0 };
}

test('R1a: join integrity passes and lists the game when FTN lacks one whole game', () => {
  const games: ScrimmageGameJoin[] = [];
  for (let i = 0; i < 10; i++) {
    const hasFtnRows = i !== 9;
    games.push(joinGame(`g${i}`, 100, hasFtnRows ? 100 : 0, hasFtnRows));
  }

  const result = evaluateFtnCoverage(games);

  assert.strictEqual(result.totalGames, 10);
  assert.strictEqual(result.coveredGames, 9);
  assert.strictEqual(result.missingGames.count, 1);
  assert.deepStrictEqual(result.missingGames.gameIds, ['g9']);
  assert.strictEqual(result.ftnJoinIntegrityPct, 100);
  assert.strictEqual(result.joinIntegrityFailed, false);
  assert.strictEqual(result.freshnessFailed, false);
  assert.strictEqual(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes('g9'), 'warning names the missing game');
});

test('R1a: join integrity fails when a covered game only matches 60% of its plays', () => {
  const result = evaluateFtnCoverage([joinGame('g1', 100, 60, true)]);

  assert.strictEqual(result.coveredGames, 1);
  assert.strictEqual(result.ftnJoinIntegrityPct, 60);
  assert.strictEqual(result.joinIntegrityFailed, true);
  assert.strictEqual(result.freshnessFailed, false);
});

test('R1a: a bad join key fails integrity even though FTN published the game', () => {
  // FTN has rows for both games, but none of g2's plays match (e.g. an id-format change).
  const result = evaluateFtnCoverage([
    joinGame('g1', 100, 100, true),
    joinGame('g2', 100, 0, true),
  ]);

  assert.strictEqual(result.missingGames.count, 0, 'both games are FTN-covered by rows');
  assert.strictEqual(result.ftnJoinIntegrityPct, 50);
  assert.strictEqual(result.joinIntegrityFailed, true);
  assert.strictEqual(result.freshnessFailed, false);
});

test('R1b: freshness fails when FTN lacks 40% of regular-season games', () => {
  const games: ScrimmageGameJoin[] = [];
  for (let i = 0; i < 10; i++) {
    const hasFtnRows = i < 6;
    games.push(joinGame(`g${i}`, 100, hasFtnRows ? 100 : 0, hasFtnRows));
  }

  const result = evaluateFtnCoverage(games);

  assert.strictEqual(result.missingGames.count, 4);
  assert.strictEqual(result.missingGamePct, 40);
  assert.strictEqual(result.freshnessFailed, true);
  assert.strictEqual(result.joinIntegrityFailed, false);
  assert.strictEqual(result.ftnJoinIntegrityPct, 100);
});

test('R1a/R1b: thresholds are inclusive on the boundary', () => {
  const integrityAtBoundary = evaluateFtnCoverage([joinGame('g1', 100, 90, true)]);
  assert.strictEqual(integrityAtBoundary.ftnJoinIntegrityPct, FTN_MIN_JOIN_INTEGRITY_PCT);
  assert.strictEqual(integrityAtBoundary.joinIntegrityFailed, false);

  const freshnessAtBoundary = evaluateFtnCoverage([
    joinGame('g1', 100, 100, true),
    joinGame('g2', 100, 100, true),
    joinGame('g3', 100, 100, true),
    joinGame('g4', 100, 0, false),
  ]);
  assert.strictEqual(freshnessAtBoundary.missingGamePct, FTN_MAX_MISSING_GAME_PCT);
  assert.strictEqual(freshnessAtBoundary.freshnessFailed, false);
});

test('R1a: with no FTN-covered games, freshness carries the failure and integrity is vacuous', () => {
  const result = evaluateFtnCoverage([joinGame('g1', 100, 0, false)]);

  assert.strictEqual(result.coveredGames, 0);
  assert.strictEqual(result.ftnJoinIntegrityPct, 100);
  assert.strictEqual(result.joinIntegrityFailed, false);
  assert.strictEqual(result.freshnessFailed, true);
});

test('R2: unmatched plays add neither zeros nor counts to FTN blitz/PA/motion/box metrics', () => {
  const acc = new UnitStatsAccumulator();

  acc.addPlay(
    pbpRow({ play_type: 'pass', qb_dropback: '1' }),
    ftnRow({ n_blitzers: '1', is_play_action: 'TRUE', is_motion: 'TRUE', n_defense_box: '8' }),
    true
  );
  acc.addPlay(pbpRow({ play_type: 'pass', qb_dropback: '1' }), undefined, true);

  const stats = acc.finalize(emptyRedZone());

  assert.strictEqual(stats.totalPlays, 2, 'both plays are in the pbp sample');
  assert.strictEqual(stats.ftn.ftnPlays, 1, 'only the matched play is in the FTN sample');
  assert.strictEqual(stats.ftn.blitzPlays, 1);
  assert.strictEqual(stats.ftn.blitzRate, 1, 'unmatched play does not dilute the blitz denominator');
  assert.strictEqual(stats.ftn.playActionPlays, 1);
  assert.strictEqual(stats.ftn.playActionRate, 1);
  assert.strictEqual(stats.ftn.motionPlays, 1);
  assert.strictEqual(stats.ftn.motionRate, 1, 'motion rate is over the FTN sample, not all plays');
  assert.strictEqual(stats.ftn.box8PlusPlays, 1);
  assert.strictEqual(stats.ftn.box8PlusRate, 1, 'box rate is over the FTN sample, not all plays');
});

test('R2: FTN rates use the FTN-covered sample when it is smaller than the pbp sample', () => {
  const acc = new UnitStatsAccumulator();

  // 2 matched run plays with motion, 2 unmatched run plays without.
  acc.addPlay(pbpRow({ play_type: 'run', qb_dropback: '0' }), ftnRow({ is_motion: 'TRUE' }), true);
  acc.addPlay(pbpRow({ play_type: 'run', qb_dropback: '0' }), ftnRow({ is_motion: 'FALSE' }), true);
  acc.addPlay(pbpRow({ play_type: 'run', qb_dropback: '0' }), undefined, true);
  acc.addPlay(pbpRow({ play_type: 'run', qb_dropback: '0' }), undefined, true);

  const stats = acc.finalize(emptyRedZone());

  assert.strictEqual(stats.totalPlays, 4);
  assert.strictEqual(stats.ftn.ftnPlays, 2);
  assert.strictEqual(stats.ftn.motionPlays, 1);
  assert.strictEqual(stats.ftn.motionRate, 0.5, '1 motion / 2 FTN-covered plays, not / 4');
});

test('R039-3: retained ftnJoinCoveragePct is the overall matched/total share', () => {
  // 3 games x 100 scrimmage plays, matched 100 + 80 + 0 -> (100+80+0)/(100+100+100)
  // = 180/300 = 0.60 -> 60%.
  const result = evaluateFtnCoverage([
    joinGame('g1', 100, 100, true),
    joinGame('g2', 100, 80, true),
    joinGame('g3', 100, 0, true),
  ]);

  assert.strictEqual(result.ftnJoinCoveragePct, 60);
});

test('R040-2: assertFtnCoverage throws on integrity-only failure naming integrity, not freshness', () => {
  const coverage = evaluateFtnCoverage([joinGame('g1', 100, 60, true)]);

  assert.throws(
    () => assertFtnCoverage(coverage),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /integrity/);
      assert.doesNotMatch(err.message, /freshness/);
      return true;
    }
  );
});

test('R040-2: assertFtnCoverage throws on freshness-only failure and lists missing game ids', () => {
  const games: ScrimmageGameJoin[] = [];
  for (let i = 0; i < 10; i++) {
    const hasFtnRows = i < 6;
    games.push(joinGame(`g${i}`, 100, hasFtnRows ? 100 : 0, hasFtnRows));
  }
  const coverage = evaluateFtnCoverage(games);
  assert.strictEqual(coverage.freshnessFailed, true);
  assert.strictEqual(coverage.joinIntegrityFailed, false);

  assert.throws(
    () => assertFtnCoverage(coverage),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /freshness/);
      assert.doesNotMatch(err.message, /integrity/);
      assert.ok(
        err.message.includes('g6') && err.message.includes('g9'),
        'message lists the missing game ids'
      );
      return true;
    }
  );
});

test('R040-2: assertFtnCoverage names both checks when both fail', () => {
  const coverage = evaluateFtnCoverage([
    joinGame('g1', 100, 60, true),
    joinGame('g2', 100, 0, false),
    joinGame('g3', 100, 0, false),
    joinGame('g4', 100, 0, false),
  ]);
  assert.strictEqual(coverage.joinIntegrityFailed, true);
  assert.strictEqual(coverage.freshnessFailed, true);

  assert.throws(
    () => assertFtnCoverage(coverage),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /integrity/);
      assert.match(err.message, /freshness/);
      return true;
    }
  );
});

test('R040-2: assertFtnCoverage does not throw when missing games are below the freshness limit', () => {
  const games: ScrimmageGameJoin[] = [];
  for (let i = 0; i < 10; i++) {
    const hasFtnRows = i < 9;
    games.push(joinGame(`g${i}`, 100, hasFtnRows ? 100 : 0, hasFtnRows));
  }
  const coverage = evaluateFtnCoverage(games);
  assert.strictEqual(coverage.joinIntegrityFailed, false);
  assert.strictEqual(coverage.freshnessFailed, false);

  assert.doesNotThrow(() => assertFtnCoverage(coverage));
});

test('R042-4a: default call sets thresholds to { minJoinIntegrityPct: 90, maxMissingGamePct: 25 }', () => {
  const result = evaluateFtnCoverage([joinGame('g1', 100, 100, true)]);
  assert.deepStrictEqual(result.thresholds, {
    minJoinIntegrityPct: 90,
    maxMissingGamePct: 25,
  });
});

test('R042-4b: custom integrity threshold (95%) quotes 95% and does not quote 90%', () => {
  // 92% integrity: passes default 90%, but fails custom 95%
  const coverage = evaluateFtnCoverage([joinGame('g1', 100, 92, true)], {
    minJoinIntegrityPct: 95,
  });
  assert.strictEqual(coverage.joinIntegrityFailed, true);

  assert.throws(
    () => assertFtnCoverage(coverage),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('95%'), 'message cites custom 95% threshold');
      assert.ok(!err.message.includes('90%'), 'message does not cite default 90% threshold');
      return true;
    }
  );
});

test('R042-4c: custom freshness threshold (10%) quotes 10% and does not quote 25%', () => {
  // 2 of 10 missing (20% missing): passes default 25%, but fails custom 10%
  const games: ScrimmageGameJoin[] = [];
  for (let i = 0; i < 10; i++) {
    const hasFtnRows = i < 8;
    games.push(joinGame(`g${i}`, 100, hasFtnRows ? 100 : 0, hasFtnRows));
  }
  const coverage = evaluateFtnCoverage(games, { maxMissingGamePct: 10 });
  assert.strictEqual(coverage.freshnessFailed, true);

  assert.throws(
    () => assertFtnCoverage(coverage),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('10%'), 'message cites custom 10% threshold');
      assert.ok(!err.message.includes('25%'), 'message does not cite default 25% threshold');
      return true;
    }
  );
});
