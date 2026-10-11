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

test('two-sided value pin: calculateM1Adjustment is 0.52 with every term non-zero, and antisymmetric under home/away swap', () => {
  // Task 037 R1: both teams carry non-zero pass AND rush offence and defence
  // counts, so aAdv, hRushAdv and aRushAdv are all non-zero (the Task 030
  // fixture zeroed every away and rush term).
  const state = createEmptyCumulativeState();
  state.league.passPlays = 100;
  state.league.passEpa = 5; // lPassEpa = 5/100 = 0.05
  state.league.rushPlays = 100;
  state.league.rushEpa = -5; // lRushEpa = -5/100 = -0.05
  const h = getOrCreateTeamStats(state, 'H');
  h.passOffPlays = 100;
  h.passOffEpa = 20; // 0.20
  h.rushOffPlays = 50;
  h.rushOffEpa = 5; // 0.10
  h.passDefPlays = 50;
  h.passDefEpa = 5; // 0.10
  h.rushDefPlays = 50;
  h.rushDefEpa = -5; // -0.10
  const a = getOrCreateTeamStats(state, 'A');
  a.passOffPlays = 50;
  a.passOffEpa = 10; // 0.20
  a.rushOffPlays = 100;
  a.rushOffEpa = -10; // -0.10
  a.passDefPlays = 100;
  a.passDefEpa = 15; // 0.15
  a.rushDefPlays = 100;
  a.rushDefEpa = -15; // -0.15
  // shrinkage: sHPassOff = 100/250 = 0.4 ; sHRushOff = 50/150 = 1/3
  //            sAPassDef = 100/250 = 0.4 ; sARushDef = 100/200 = 0.5
  //            sAPassOff = 50/200 = 0.25 ; sARushOff = 100/200 = 0.5
  //            sHPassDef = 50/200 = 0.25 ; sHRushDef = 50/150 = 1/3
  // hPassAdv = 0.4*(0.20-0.05) - 0.4*(0.15-0.05) = 0.06 - 0.04 = 0.02
  // hRushAdv = (1/3)*(0.10+0.05) - 0.5*(-0.15+0.05) = 0.05 + 0.05 = 0.10   [non-zero]
  // hAdv     = 0.65*0.02 + 0.35*0.10 = 0.013 + 0.035 = 0.048
  // aPassAdv = 0.25*(0.20-0.05) - 0.25*(0.10-0.05) = 0.0375 - 0.0125 = 0.025
  // aRushAdv = 0.5*(-0.10+0.05) - (1/3)*(-0.10+0.05) = -0.025 + 1/120 = -1/120 [non-zero]
  // aAdv     = 0.65*0.025 + 0.35*(-1/120) = 13/800 - 7/2400 = 32/2400 = 1/75 [non-zero]
  // M1       = 15 * (hAdv - aAdv) = 15 * (6/125 - 1/75) = 15 * 13/375 = 13/25 = 0.52
  const got = calculateM1Adjustment('H', 'A', state);
  assert.ok(Math.abs(got - 0.52) < EPS, `expected 0.52, got ${got}`);
  // antisymmetry: swapping home and away must negate the adjustment exactly
  const swapped = calculateM1Adjustment('A', 'H', state);
  assert.ok(Math.abs(swapped + got) < EPS, `antisymmetry broken: H/A=${got}, A/H=${swapped}`);
  assert.ok(Math.abs(swapped - -0.52) < EPS, `expected -0.52 after swap, got ${swapped}`);
});

test('two-sided value pin: calculateM2Adjustment is 519/350 with non-zero away scheme and personnel terms, and antisymmetric under swap', () => {
  // Task 037 R2: priorState = null, so blend() returns each current rate
  // verbatim. Both sides carry coverage AND personnel terms; home's h11Epa /
  // h12Epa differ from hPassAllEpa.
  const state = createEmptyCumulativeState();
  const h = getOrCreateTeamStats(state, 'H');
  h.passManOffPlays = 40;
  h.passManOffEpa = 20; // hManEpa = 0.50
  h.passZoneOffPlays = 60;
  h.passZoneOffEpa = 6; // hZoneEpa = 0.10
  h.passOffPlays = 100;
  h.passOffEpa = 26; // hPassAllEpa = 0.26
  h.p11OffPlays = 50;
  h.p11OffEpa = 20; // h11Epa = 0.40  (!= 0.26)
  h.p12OffPlays = 20;
  h.p12OffEpa = 2; // h12Epa = 0.10   (!= 0.26)
  h.offTotalPersonnelCharted = 70; // h11Rate = 5/7 ; h12Rate = 2/7
  h.passManDefPlays = 40;
  h.passZoneDefPlays = 60;
  h.passDefTotalCharted = 100; // hManRate = 0.4 ; hZoneRate = 0.6
  const a = getOrCreateTeamStats(state, 'A');
  a.passManOffPlays = 50;
  a.passManOffEpa = 15; // aManEpa = 0.30
  a.passZoneOffPlays = 50;
  a.passZoneOffEpa = 5; // aZoneEpa = 0.10
  a.passOffPlays = 100;
  a.passOffEpa = 16; // aPassAllEpa = 0.16
  a.p11OffPlays = 60;
  a.p11OffEpa = 12; // a11Epa = 0.20
  a.p12OffPlays = 40;
  a.p12OffEpa = 2; // a12Epa = 0.05
  a.offTotalPersonnelCharted = 100; // a11Rate = 0.6 ; a12Rate = 0.4
  a.passManDefPlays = 90;
  a.passZoneDefPlays = 10;
  a.passDefTotalCharted = 100; // aManRate = 0.9 ; aZoneRate = 0.1
  // hCovAdv  = 0.9*0.50 + 0.1*0.10 - 0.26 = 0.45 + 0.01 - 0.26 = 0.20
  // hPersAdv = (5/7)*(0.40-0.26) + (2/7)*(0.10-0.26) = 0.7/7 - 0.32/7
  //          = 0.38/7 = 19/350                                       [non-zero]
  // hScheme  = 0.7*0.20 + 0.3*(19/350) = 0.14 + 57/3500 = 547/3500
  // aCovAdv  = 0.4*0.30 + 0.6*0.10 - 0.16 = 0.12 + 0.06 - 0.16 = 0.02 [non-zero away term]
  // aPersAdv = 0.6*(0.20-0.16) + 0.4*(0.05-0.16) = 0.024 - 0.044 = -0.02 [non-zero]
  // aScheme  = 0.7*0.02 + 0.3*(-0.02) = 0.014 - 0.006 = 0.008         [non-zero]
  // M2       = 10 * (547/3500 - 28/3500) = 10 * 519/3500 = 519/350
  //          = 1.4828571428571429...
  const got = calculateM2Adjustment('H', 'A', state, null);
  assert.ok(Math.abs(got - 519 / 350) < EPS, `expected ${519 / 350}, got ${got}`);
  // antisymmetry: swapping home and away must negate the adjustment
  const swapped = calculateM2Adjustment('A', 'H', state, null);
  assert.ok(Math.abs(swapped + got) < EPS, `antisymmetry broken: H/A=${got}, A/H=${swapped}`);
  assert.ok(Math.abs(swapped - -519 / 350) < EPS, `expected ${-519 / 350} after swap, got ${swapped}`);
});

test('value pin: marginToPrediction logit scale at +/-7, the 22.0-baseline scores, and the no-spread pick boundaries', () => {
  const g = makeGame();
  // homeWinProb = 1/(1+e^(-margin/7)); at +7 that is 1/(1+e^-1) = 0.7311 (4 d.p.)
  const p7 = marginToPrediction(7, g).homeWinProb;
  assert.ok(Math.abs(p7 - 1 / (1 + Math.exp(-1))) < 1e-15, `expected 1/(1+e^-1), got ${p7}`);
  assert.strictEqual(Number(p7.toFixed(4)), 0.7311);
  // at -7 that is 1/(1+e^1) = 0.2689 (4 d.p.)
  const pNeg7 = marginToPrediction(-7, g).homeWinProb;
  assert.ok(Math.abs(pNeg7 - 1 / (1 + Math.exp(1))) < 1e-15, `expected 1/(1+e^1), got ${pNeg7}`);
  assert.strictEqual(Number(pNeg7.toFixed(4)), 0.2689);
  // scores: round(22.0 +/- margin/2)
  const at6 = marginToPrediction(6, g);
  assert.strictEqual(at6.homeScore, 25); // round(22.0 + 3)
  assert.strictEqual(at6.awayScore, 19); // round(22.0 - 3)
  // no market spread -> home at margin >= 0, away below 0 (0 is a home pick)
  assert.strictEqual(marginToPrediction(0.5, g).spreadPick, 'home');
  assert.strictEqual(marginToPrediction(0, g).spreadPick, 'home');
  assert.strictEqual(marginToPrediction(-0.5, g).spreadPick, 'away');
});

test('value pin: mcnemarExact clamps the two-sided p-value at 1 (b=c=5 overflows)', () => {
  // n=10, k=5: cdf = sum_{i=0..5} C(10,i)/2^10 = 638/1024 = 0.623046875
  // 2*cdf = 1.24609375 -> Math.min(1, ...) = 1
  assert.strictEqual(mcnemarExact(5, 5), 1);
});

test('value pin: holmBonferroni returns 4-d.p. rounded adjusted p-values in input order', () => {
  // m=3; sorted ascending: 0.012345678 (input idx 0), 0.3 (idx 2), 0.5 (idx 1)
  //   rank0: 3 * 0.012345678 = 0.037037034 -> runningMax 0.037037034
  //          -> toFixed(4) "0.0370" -> 0.037
  //   rank1: 2 * 0.3 = 0.6    -> runningMax 0.6 -> 0.6
  //   rank2: 1 * 0.5 = 0.5    -> runningMax stays 0.6 -> 0.6
  // returned in input order [0.012345678, 0.5, 0.3] -> [0.037, 0.6, 0.6]
  assert.deepStrictEqual(holmBonferroni([0.012345678, 0.5, 0.3]), [0.037, 0.6, 0.6]);
});

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
