import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateM1Adjustment,
  calculateM2Adjustment,
  calculateM3Adjustment,
  marginToPrediction,
  createEmptyCumulativeState,
  getOrCreateTeamStats,
  SeasonCumulativeState,
} from '../matchup-models';
import {
  mcnemarExact,
  mcnemarSU,
  holmBonferroni,
  evaluateCandidatesOnGames,
} from '../backtest-matchup';
import { calculateMetrics } from '../backtest';
import { Game } from '../models/types';

const EPS = 1e-9;

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g',
    week: 1,
    seasonType: 2,
    date: '2025-09-01T00:00:00Z',
    homeAbbr: 'H',
    awayAbbr: 'A',
    homeScore: 0,
    awayScore: 0,
    neutralSite: false,
    market: { spread: null, total: null, moneylineHome: null },
    ...overrides,
  };
}

test('value pin: calculateM1Adjustment matches the hand-computed 0.706875 and is not zeroed', () => {
  // Home pass offense vs away pass defense only; all rush and the away offense
  // and home defense are empty, so aAdv = 0 and netAdv = hAdv.
  const state = createEmptyCumulativeState();
  state.league.passPlays = 200;
  state.league.passEpa = 10; // lPassEpa = 10/200 = 0.05
  const h = getOrCreateTeamStats(state, 'H');
  h.passOffPlays = 100;
  h.passOffEpa = 20; // hPassOffEpa = 20/100 = 0.20
  const a = getOrCreateTeamStats(state, 'A');
  a.passDefPlays = 50;
  a.passDefEpa = 0; // aPassDefEpa = 0/50 = 0.00
  // sHPassOff = 100/(100+150) = 0.4 ; sAPassDef = 50/(50+150) = 0.25
  // hPassAdv = 0.4*(0.20-0.05) - 0.25*(0.00-0.05) = 0.06 + 0.0125 = 0.0725
  // hAdv = 0.65*0.0725 + 0.35*0 = 0.047125 ; aAdv = 0
  // M1 = M1_SCALE * netAdv = 15 * 0.047125 = 0.706875
  const got = calculateM1Adjustment('H', 'A', state);
  assert.ok(Math.abs(got - 0.706875) < EPS, `expected 0.706875, got ${got}`);
  assert.notStrictEqual(got, 0);
});

test('value pin: calculateM2Adjustment matches the hand-computed 1.4 and is not zeroed', () => {
  // priorState = null, so blend() returns each current rate verbatim.
  const state = createEmptyCumulativeState();
  const h = getOrCreateTeamStats(state, 'H');
  h.passOffPlays = 100;
  h.passOffEpa = 26; // hPassAllEpa = 0.26
  h.passManOffPlays = 40;
  h.passManOffEpa = 20; // hManEpa = 0.50
  h.passZoneOffPlays = 60;
  h.passZoneOffEpa = 6; // hZoneEpa = 0.10
  h.p11OffPlays = 50;
  h.p11OffEpa = 13; // 13/50 = 0.26 = hPassAllEpa -> personnel term 0
  h.p12OffPlays = 20;
  h.p12OffEpa = 5.2; // 5.2/20 = 0.26 = hPassAllEpa -> personnel term 0
  h.offTotalPersonnelCharted = 70;
  const a = getOrCreateTeamStats(state, 'A');
  a.passManDefPlays = 90;
  a.passZoneDefPlays = 10;
  a.passDefTotalCharted = 100; // aManRate = 0.9 ; aZoneRate = 0.1
  // Home: hCovAdv = 0.9*0.50 + 0.1*0.10 - 0.26 = 0.20 ; hPersAdv = 0
  // hScheme = 0.7*0.20 + 0.3*0 = 0.14
  // Away offense empty and home defense uncharted -> aScheme = 0
  // M2 = M2_SCALE * (hScheme - aScheme) = 10 * 0.14 = 1.4
  const got = calculateM2Adjustment('H', 'A', state, null);
  assert.ok(Math.abs(got - 1.4) < EPS, `expected 1.4, got ${got}`);
  assert.notStrictEqual(got, 0);
});

test('value pin: calculateM3Adjustment matches the hand-computed 0.375 and is not zeroed', () => {
  const state = createEmptyCumulativeState();
  state.league.rzTrips = 100;
  state.league.rzPoints = 500; // lPpt = 5.0
  const h = getOrCreateTeamStats(state, 'H');
  h.rzOffTrips = 30;
  h.rzOffPoints = 180; // hPptOff = 6.0 ; sHOff = 30/60 = 0.5
  const a = getOrCreateTeamStats(state, 'A');
  a.rzDefTrips = 10;
  a.rzDefPoints = 40; // aPptDef = 4.0 ; sADef = 10/40 = 0.25
  // Away offense and home defense empty -> adjAOff = adjHDef = lPpt = 5.0
  // adjHOff = 5 + 0.5*(6-5) = 5.5 ; adjADef = 5 + 0.25*(4-5) = 4.75
  // netDiff = (5.5-5.0) + (4.75-5.0) = 0.25
  // M3 = M3_SCALE * netDiff = 1.5 * 0.25 = 0.375
  const got = calculateM3Adjustment('H', 'A', state);
  assert.ok(Math.abs(got - 0.375) < EPS, `expected 0.375, got ${got}`);
  assert.notStrictEqual(got, 0);
});

test('value pin: marginToPrediction sign and the exact probability at margin 0', () => {
  const g = makeGame();
  // homeWinProb = 1 / (1 + exp(-margin/7)); at margin 0 that is exactly 0.5
  assert.strictEqual(marginToPrediction(0, g).homeWinProb, 0.5);
  assert.ok(marginToPrediction(7, g).homeWinProb > 0.5, 'positive margin must favor home');
  assert.ok(marginToPrediction(-7, g).homeWinProb < 0.5, 'negative margin must favor away');
});

test('value pin: mcnemarExact exact two-sided binomial values and symmetry', () => {
  // (b=12,c=10): n=22, two-sided exact = 2*sum_{i=0}^{10} C(22,i)/2^22 = 0.8318 (4 d.p.)
  assert.strictEqual(Number(mcnemarExact(12, 10).toFixed(4)), 0.8318);
  assert.strictEqual(mcnemarExact(0, 0), 1);
  // (b=0,c=8): n=8, two-sided = 2 * C(8,0)/2^8 = 2/256 = 0.0078125
  assert.ok(Math.abs(mcnemarExact(0, 8) - 0.0078125) < EPS, `expected 0.0078125, got ${mcnemarExact(0, 8)}`);
  assert.ok(Math.abs(mcnemarExact(8, 0) - 0.0078125) < EPS);
  assert.strictEqual(mcnemarExact(3, 7), mcnemarExact(7, 3));
  assert.strictEqual(mcnemarExact(12, 10), mcnemarExact(10, 12));
});

test('value pin: mcnemarSU discordant-pair counts and the 0.5 tie boundary', () => {
  // SU correctness: pick = home if prob > 0.5, away if < 0.5, tie at exactly 0.5;
  // winner = home if homeScore > awayScore, away if <, tie otherwise.
  const pred = (p: number) => ({ homeWinProb: p, homeScore: 0, awayScore: 0, spreadPick: 'home' as const });
  const games: Game[] = [
    makeGame({ id: 'g1', homeScore: 24, awayScore: 17 }), // home wins
    makeGame({ id: 'g2', homeScore: 17, awayScore: 24 }), // away wins
    makeGame({ id: 'g3', homeScore: 20, awayScore: 20 }), // tie
    makeGame({ id: 'g4', homeScore: 20, awayScore: 20 }), // tie
  ];
  // cand: g1 home-correct, g2 away-correct, g3 home-wrong, g4 0.5 tie-correct
  // base: g1 away-wrong, g2 home-wrong, g3 0.5 tie-correct, g4 away-wrong
  // -> b = g1 + g2 + g4 = 3 ; c = g3 = 1 ; n = 4
  // pExact = mcnemarExact(3, 1) = 2 * (C(4,0)+C(4,1))/2^4 = 2*5/16 = 0.625
  const cand = new Map<string, any>([
    ['g1', pred(0.6)],
    ['g2', pred(0.4)],
    ['g3', pred(0.7)],
    ['g4', pred(0.5)],
  ]);
  const base = new Map<string, any>([
    ['g1', pred(0.4)],
    ['g2', pred(0.6)],
    ['g3', pred(0.5)],
    ['g4', pred(0.3)],
  ]);
  const got = mcnemarSU(games, cand, base);
  assert.deepStrictEqual(got, { b: 3, c: 1, n: 4, pExact: 0.625 });
});

test('value pin: holmBonferroni step-down values in input order and monotonicity', () => {
  // m=3; sorted ascending 0.01,0.03,0.04
  //   rank0: 3*0.01 = 0.03 (runningMax 0.03)
  //   rank1: 2*0.03 = 0.06 (runningMax 0.06)
  //   rank2: 1*0.04 = 0.04 -> clamped up to runningMax 0.06
  // returned in the original input order [0.01, 0.04, 0.03] -> [0.03, 0.06, 0.06]
  assert.deepStrictEqual(holmBonferroni([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06]);
  const sorted = holmBonferroni([0.01, 0.03, 0.04]);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i] >= sorted[i - 1], `adjusted p-values must be monotone, got ${JSON.stringify(sorted)}`);
  }
});

function buildAblationFixture() {
  const games: Game[] = [
    makeGame({ id: 'g1', week: 5, date: '2025-10-01T00:00:00Z', homeAbbr: 'H1', awayAbbr: 'A1', homeScore: 24, awayScore: 17 }),
    makeGame({ id: 'g2', week: 5, date: '2025-10-02T00:00:00Z', homeAbbr: 'H2', awayAbbr: 'A2', homeScore: 17, awayScore: 24 }),
    makeGame({ id: 'g3', week: 5, date: '2025-10-03T00:00:00Z', homeAbbr: 'H3', awayAbbr: 'A3', homeScore: 27, awayScore: 20 }),
  ];
  const state = createEmptyCumulativeState();
  for (const [home, away] of [['H1', 'A1'], ['H2', 'A2'], ['H3', 'A3']]) {
    const h = getOrCreateTeamStats(state, home);
    h.passManOffPlays = 40;
    h.passManOffEpa = 20; // man rate 0.50
    h.passZoneOffPlays = 60;
    h.passZoneOffEpa = 6; // zone rate 0.10
    h.passOffPlays = 100;
    h.passOffEpa = 26; // overall 0.26
    h.p11OffPlays = 50;
    h.p11OffEpa = 13; // == overall, personnel term 0
    h.p12OffPlays = 20;
    h.p12OffEpa = 5.2; // == overall, personnel term 0
    h.offTotalPersonnelCharted = 70;
    const d = getOrCreateTeamStats(state, away);
    d.passManDefPlays = 90;
    d.passZoneDefPlays = 10;
    d.passDefTotalCharted = 100; // man-heavy defense -> man/zone coverage matters
  }
  const weeklyStates = new Map<number, SeasonCumulativeState>([[5, state]]);
  return { games, weeklyStates };
}

test('ablation path: ablating the live man/zone coverage dimension changes the M2 Brier', () => {
  const { games, weeklyStates } = buildAblationFixture();
  const full = evaluateCandidatesOnGames(games, weeklyStates, null);
  const ablated = evaluateCandidatesOnGames(games, weeklyStates, null, null, { ablateM2: { manZone: true } });
  const fullBrier = calculateMetrics(games, full.predsM2).brierScore;
  const ablatedBrier = calculateMetrics(games, ablated.predsM2).brierScore;
  assert.notStrictEqual(ablatedBrier, fullBrier, `man/zone ablation must change M2 Brier (full=${fullBrier}, ablated=${ablatedBrier})`);
});

test('ablation path: the Cover-2/3 coverageType ablation is inert (noCoverageTypeBrier === full M2 Brier)', () => {
  // Task 030 R5 asks for `noCoverageTypeBrier` to DIFFER from the full-M2 Brier, but that is
  // false against this code: research/matchup-models.ts declares `ablateCoverageType` (line 179)
  // and never reads it; the passCover2DefPlays/passCover3DefPlays counters are written in
  // backtest-matchup.ts (lines 95-96, 246-247) and never consumed. The option is forwarded at
  // backtest-matchup.ts:485 but has no effect, so toggling it is unobservable (mutation 029 #9
  // is behaviourally equivalent, not a live survivor). Pinned so that wiring coverage type into
  // M2 is an explicit, test-visible behaviour change; the live coverage dimension (man/zone) is
  // pinned by the preceding test.
  const { games, weeklyStates } = buildAblationFixture();
  const full = evaluateCandidatesOnGames(games, weeklyStates, null);
  const noCoverageType = evaluateCandidatesOnGames(games, weeklyStates, null, null, { ablateM2: { coverageType: true } });
  const fullBrier = calculateMetrics(games, full.predsM2).brierScore;
  const noCoverageTypeBrier = calculateMetrics(games, noCoverageType.predsM2).brierScore;
  assert.strictEqual(noCoverageTypeBrier, fullBrier);
});
