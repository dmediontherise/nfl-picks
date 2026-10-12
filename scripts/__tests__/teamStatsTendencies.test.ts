import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import zlib from 'zlib';
import { Readable } from 'stream';
import {
  assembleTeamUnits,
  check2026Participation,
  computeSchemeFromStreams,
  computeTendenciesFromStreams,
} from '../fetch-team-stats';
import { NFL_TEAM_ABBREVIATIONS, TeamStatsSnapshot } from '../../src/data/teamStats';

test('Task 050 Req 1: computeSchemeFromStreams 2025 output matches existing snapshot priorSeason for KC, BUF, SF, PHI, BAL', async () => {
  const partPath = 'research/data/nflverse/pbp_participation_2025.csv';
  const pbpPath = 'research/data/nflverse/play_by_play_2025.csv.gz';

  assert.ok(fs.existsSync(partPath), 'Cached 2025 participation file must exist');
  assert.ok(fs.existsSync(pbpPath), 'Cached 2025 pbp file must exist');

  const partStream = fs.createReadStream(partPath);
  const pbpStream = fs.createReadStream(pbpPath).pipe(zlib.createGunzip());

  const result = await computeSchemeFromStreams(partStream, pbpStream, 2025);

  const snapshot: TeamStatsSnapshot = JSON.parse(
    fs.readFileSync('src/data/teamStats.json', 'utf-8')
  );

  const testTeams = ['KC', 'BUF', 'SF', 'PHI', 'BAL'] as const;
  for (const team of testTeams) {
    const computed = result[team];
    const snapPrior = snapshot.teams[team].priorSeason;

    assert.ok(computed, `Computed scheme for ${team} should exist`);
    assert.ok(snapPrior, `Snapshot priorSeason for ${team} should exist`);

    assert.strictEqual(computed.season, 2025);
    assert.strictEqual(computed.gamesPlayed, snapPrior.gamesPlayed, `${team} gamesPlayed`);
    assert.strictEqual(computed.totalPlays, snapPrior.totalPlays, `${team} totalPlays`);
    assert.deepStrictEqual(computed.offensivePersonnel, snapPrior.offensivePersonnel, `${team} offensivePersonnel`);
    assert.deepStrictEqual(computed.formation, snapPrior.formation, `${team} formation`);
    assert.deepStrictEqual(computed.defensiveFront, snapPrior.defensiveFront, `${team} defensiveFront`);
    assert.deepStrictEqual(computed.coverage, snapPrior.coverage, `${team} coverage`);
    assert.deepStrictEqual(computed.offenseVsCoverage, snapPrior.offenseVsCoverage, `${team} offenseVsCoverage`);
  }
});

test('Task 050 Req 1: computeSchemeFromStreams is season-parameterised and tags 2026 rows', async () => {
  const pbpCsv = [
    'game_id,play_id,season_type,posteam,defteam,play_type,qb_kneel,qb_spike,two_point_attempt,down,third_down_converted,third_down_failed,goal_to_go,epa,success,passing_yards,rushing_yards,pass_attempt,rush_attempt,sack,qb_hit,qb_dropback,interception,fumble_lost,shotgun,no_huddle,yardline_100,fixed_drive,fixed_drive_result',
    'G,1,REG,KC,BUF,pass,0,0,0,1,1,0,0,0.5,1,5,0,1,0,0,0,1,0,0,1,0,50,1,None',
    'G,2,REG,KC,BUF,run,0,0,0,1,0,1,0,0.2,1,0,3,0,1,0,0,0,0,0,0,1,35,1,None',
  ].join('\n');
  const partCsv = [
    'nflverse_game_id,play_id,offense_formation,offense_personnel,defense_personnel,defense_man_zone_type,defense_coverage_type',
    'G,1,SHOTGUN,"1 RB, 1 TE, 3 WR","3 CB, 2 DT, 2 DE, 1 FS, 1 SS, 2 ILB",ZONE_COVERAGE,COVER_3',
    'G,2,UNDER CENTER,"1 RB, 1 TE, 3 WR","3 CB, 2 DT, 2 DE, 1 FS, 1 SS, 2 ILB",,',
  ].join('\n');

  const result = await computeSchemeFromStreams(
    Readable.from([partCsv]),
    Readable.from([pbpCsv]),
    2026
  );

  assert.strictEqual(result.KC.season, 2026, 'Season parameter must flow through to the result');
  assert.strictEqual(result.KC.gamesPlayed, 1);
  assert.strictEqual(result.KC.formation.shotgun.plays, 1);
  assert.strictEqual(result.KC.formation.underCenter.plays, 1);
  assert.strictEqual(result.BUF.defensiveFront.nickelPlus.plays, 2);
  assert.strictEqual(result.BUF.coverage.zone.plays, 1);
  assert.strictEqual(result.BUF.coverage.passPlaysCharted, 1);
});

test('Task 050 Req 4: computeTendenciesFromStreams 2025 FTN baselines match the snapshot priorSeasonTendencies', async () => {
  const ftnPath = 'research/data/nflverse/ftn_charting_2025.csv';
  const pbpPath = 'research/data/nflverse/play_by_play_2025.csv.gz';

  assert.ok(fs.existsSync(ftnPath), 'Cached 2025 FTN file must exist');
  assert.ok(fs.existsSync(pbpPath), 'Cached 2025 pbp file must exist');

  const ftnStream = fs.createReadStream(ftnPath);
  const pbpStream = fs.createReadStream(pbpPath).pipe(zlib.createGunzip());

  const result = await computeTendenciesFromStreams(ftnStream, pbpStream);

  const snapshot: TeamStatsSnapshot = JSON.parse(
    fs.readFileSync('src/data/teamStats.json', 'utf-8')
  );

  for (const team of ['KC', 'BUF', 'SF'] as const) {
    assert.ok(result[team], `2025 tendencies for ${team} should exist`);
    assert.deepStrictEqual(
      result[team],
      snapshot.teams[team].priorSeasonTendencies,
      `${team} 2025 FTN tendencies must match the snapshot baseline`
    );
    // The 2025 baseline rows must carry real samples (not empty blocks).
    assert.ok(result[team].playAction.plays > 0, `${team} 2025 play-action sample`);
    assert.ok(result[team].blitz.plays > 0, `${team} 2025 blitz sample`);
    assert.ok(result[team].box8Plus.plays > 0, `${team} 2025 8+ box sample`);
  }
});

test('Task 050 Req 2: check2026Participation returns true on 200, false on 404', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // Stub 200 OK
    globalThis.fetch = (async () => ({ status: 200 })) as any;
    const okResult = await check2026Participation();
    assert.strictEqual(okResult, true, 'Should return true when status is 200');

    // Stub 404 Not Found
    globalThis.fetch = (async () => ({ status: 404 })) as any;
    const notFoundResult = await check2026Participation();
    assert.strictEqual(notFoundResult, false, 'Should return false when status is 404');

    // Stub Network Error
    globalThis.fetch = (async () => {
      throw new Error('Network error');
    }) as any;
    const errorResult = await check2026Participation();
    assert.strictEqual(errorResult, false, 'Should return false when fetch throws');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Task 050 Req 2: assembleTeamUnits writes currentScheme on 200 and omits it on 404', () => {
  const teamsCurrent: any = {};
  const prior: any = {};
  const scheme: any = {};
  const tend: any = {};
  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    teamsCurrent[abbr] = { gamesPlayed: 1, offense: {}, defense: {}, tendencies: {} };
    prior[abbr] = { season: 2025, totalPlays: 1 };
    scheme[abbr] = { season: 2026, totalPlays: 1 };
    tend[abbr] = { playAction: { share: 0.1, plays: 1 } };
  }

  const withScheme = assembleTeamUnits(teamsCurrent, prior, scheme, tend);
  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    assert.ok('currentScheme' in withScheme[abbr], `${abbr} should carry currentScheme when 2026 participation is available`);
    assert.strictEqual(withScheme[abbr].currentScheme?.season, 2026);
    assert.strictEqual(withScheme[abbr].priorSeason.season, 2025);
    assert.strictEqual(withScheme[abbr].priorSeasonTendencies, tend[abbr]);
  }

  const withoutScheme = assembleTeamUnits(teamsCurrent, prior, null);
  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    assert.strictEqual('currentScheme' in withoutScheme[abbr], false, `${abbr} must not carry currentScheme when 2026 participation is 404`);
    assert.strictEqual('priorSeasonTendencies' in withoutScheme[abbr], false, `${abbr} must omit priorSeasonTendencies when none supplied`);
    assert.strictEqual(withoutScheme[abbr].current.tendencies, teamsCurrent[abbr].tendencies);
  }
});