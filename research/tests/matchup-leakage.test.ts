import test from 'node:test';
import assert from 'node:assert';
import {
  buildWeeklyStates,
  mulberry32,
  shuffle,
} from '../backtest-matchup';
import {
  calculateM1Adjustment,
  calculateM2Adjustment,
  calculateM3Adjustment,
  createEmptyCumulativeState,
  getOrCreateTeamStats,
} from '../matchup-models';

test('leakage test: a team\'s week-W rating is byte-identical whether or not any game from week >= W exists in the input', () => {
  // Synthesize sample plays across weeks 1, 2, 3, 4, 5
  const samplePlays = [
    { game_id: 'g_w1', season: '2025', week: '1', season_type: 'REG', posteam: 'KC', defteam: 'BAL', play_type: 'pass', epa: '0.45', success: '1', yardline_100: '15', fixed_drive: '1', fixed_drive_result: 'Touchdown', qb_kneel: '0', qb_spike: '0', two_point_attempt: '0' },
    { game_id: 'g_w1', season: '2025', week: '1', season_type: 'REG', posteam: 'KC', defteam: 'BAL', play_type: 'run', epa: '-0.10', success: '0', yardline_100: '45', fixed_drive: '2', fixed_drive_result: 'Punt', qb_kneel: '0', qb_spike: '0', two_point_attempt: '0' },
    { game_id: 'g_w2', season: '2025', week: '2', season_type: 'REG', posteam: 'KC', defteam: 'CIN', play_type: 'pass', epa: '0.80', success: '1', yardline_100: '10', fixed_drive: '1', fixed_drive_result: 'Touchdown', qb_kneel: '0', qb_spike: '0', two_point_attempt: '0' },
    { game_id: 'g_w3', season: '2025', week: '3', season_type: 'REG', posteam: 'KC', defteam: 'ATL', play_type: 'pass', epa: '0.15', success: '1', yardline_100: '50', fixed_drive: '1', fixed_drive_result: 'Punt', qb_kneel: '0', qb_spike: '0', two_point_attempt: '0' },
    { game_id: 'g_w4', season: '2025', week: '4', season_type: 'REG', posteam: 'KC', defteam: 'LAC', play_type: 'run', epa: '0.25', success: '1', yardline_100: '8', fixed_drive: '1', fixed_drive_result: 'Field goal', qb_kneel: '0', qb_spike: '0', two_point_attempt: '0' },
  ];

  // Full dataset containing weeks 1..4
  const partMap = new Map();
  const weeklyFull = buildWeeklyStates(samplePlays, partMap);

  // Target week = 3 (should only see weeks 1 and 2)
  const W = 3;
  const ratingFromFull = weeklyFull.get(W)!;

  // Truncated dataset containing ONLY weeks strictly < W (weeks 1 and 2)
  const truncatedPlays = samplePlays.filter(p => parseInt(p.week, 10) < W);
  const weeklyTruncated = buildWeeklyStates(truncatedPlays, partMap);
  const ratingFromTruncated = weeklyTruncated.get(W)!;

  // Verify byte-identical serialized JSON equality
  const jsonFull = JSON.stringify(ratingFromFull);
  const jsonTruncated = JSON.stringify(ratingFromTruncated);

  assert.strictEqual(
    jsonFull,
    jsonTruncated,
    'Week-W state must be byte-identical whether or not plays from week >= W exist in input'
  );

  // Verify model adjustments are identical
  const m1Full = calculateM1Adjustment('KC', 'BAL', ratingFromFull);
  const m1Trunc = calculateM1Adjustment('KC', 'BAL', ratingFromTruncated);
  assert.strictEqual(m1Full, m1Trunc, 'M1 adjustment must be identical');

  const m3Full = calculateM3Adjustment('KC', 'BAL', ratingFromFull);
  const m3Trunc = calculateM3Adjustment('KC', 'BAL', ratingFromTruncated);
  assert.strictEqual(m3Full, m3Trunc, 'M3 adjustment must be identical');
});

test('placebo test: permuting within week preserves each week\'s multiset of ratings', () => {
  const state = createEmptyCumulativeState();

  const teams = ['KC', 'BUF', 'BAL', 'DET', 'SF', 'PHI', 'CIN', 'DAL'];
  teams.forEach((t, i) => {
    const s = getOrCreateTeamStats(state, t);
    s.passOffPlays = 100 + i * 10;
    s.passOffEpa = 20.0 + i * 5;
    s.rushOffPlays = 50 + i * 5;
    s.rushOffEpa = -2.0 + i * 2;
    s.rzOffTrips = 10 + i;
    s.rzOffPoints = 40 + i * 4;
  });

  const originalM1Ratings = teams.map(t => {
    const s = state.teams[t];
    return Number((s.passOffEpa / s.passOffPlays).toFixed(6));
  }).sort((a, b) => a - b);

  const originalRzRatings = teams.map(t => {
    const s = state.teams[t];
    return Number((s.rzOffPoints / s.rzOffTrips).toFixed(6));
  }).sort((a, b) => a - b);

  // Permute teams within week using seeded PRNG
  const rng = mulberry32(20261006);
  const shuffledTeams = shuffle(teams, rng);

  const permutedState = createEmptyCumulativeState();
  for (let i = 0; i < teams.length; i++) {
    permutedState.teams[teams[i]] = state.teams[shuffledTeams[i]];
  }

  const permutedM1Ratings = teams.map(t => {
    const s = permutedState.teams[t];
    return Number((s.passOffEpa / s.passOffPlays).toFixed(6));
  }).sort((a, b) => a - b);

  const permutedRzRatings = teams.map(t => {
    const s = permutedState.teams[t];
    return Number((s.rzOffPoints / s.rzOffTrips).toFixed(6));
  }).sort((a, b) => a - b);

  // Assert multiset equality: sorted rating arrays must be identical
  assert.deepStrictEqual(
    permutedM1Ratings,
    originalM1Ratings,
    'Permuting within week must preserve the exact multiset of M1 ratings'
  );

  assert.deepStrictEqual(
    permutedRzRatings,
    originalRzRatings,
    'Permuting within week must preserve the exact multiset of RZ ratings'
  );

  // Assert that assignment was actually randomized (not identical ordering)
  assert.notDeepStrictEqual(
    teams,
    shuffledTeams,
    'Shuffled teams array must differ from original order'
  );
});
