import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Game, PredictionResult } from './models/types';
import { predictMassey } from './models/massey';
import { calculateMetrics, getBacktestHistory } from './backtest';
import { getCachedNflverseStream } from './data/nflverse-cache';
import { parseCsvObjects } from '../scripts/lib/nflverse';
import { mapNflverseTeam, normalizeFormation, parseDefensiveFront, parseOffensePersonnel } from '../src/data/teamStats';
import {
  SeasonCumulativeState,
  calculateM1Adjustment,
  calculateM2Adjustment,
  calculateM3Adjustment,
  createEmptyCumulativeState,
  getOrCreateTeamStats,
  marginToPrediction,
} from './matchup-models';

interface CompactPart {
  mz: 'M' | 'Z' | '';
  cov: '2' | '3' | '';
  pGroup: '11' | '12' | '21' | 'other';
  front: 'nickel+' | '4-3' | '3-4' | 'other';
}

/**
 * Builds weekly cumulative states directly from streaming participation and PBP.
 * Frees intermediate maps immediately for low memory footprint (< 50MB heap).
 */
export function buildWeeklyStates(
  pbpRows: any[],
  partMap: Map<string, any>
): Map<number, SeasonCumulativeState> {
  const weeklyStates = new Map<number, SeasonCumulativeState>();
  for (let w = 1; w <= 23; w++) {
    weeklyStates.set(w, createEmptyCumulativeState());
  }

  const driveTracker = new Map<string, { minYardline: number; result: string; posteam: string; defteam: string; week: number }>();

  for (const row of pbpRows) {
    if (row.season_type !== 'REG') continue;
    if (row.play_type !== 'pass' && row.play_type !== 'run') continue;
    if (row.qb_kneel === '1' || row.play_type === 'qb_kneel') continue;
    if (row.qb_spike === '1' || row.play_type === 'qb_spike') continue;
    if (row.two_point_attempt === '1') continue;
    if (!row.posteam || !row.defteam) continue;

    const playWeek = parseInt(row.week, 10);
    if (isNaN(playWeek)) continue;

    let offTeam: string;
    let defTeam: string;
    try {
      offTeam = mapNflverseTeam(row.posteam);
      defTeam = mapNflverseTeam(row.defteam);
    } catch {
      continue;
    }

    const epa = parseFloat(row.epa) || 0;
    const isPass = row.play_type === 'pass';
    const isRush = row.play_type === 'run';

    const part = partMap.get(`${row.game_id}_${row.play_id}`);

    for (let w = playWeek + 1; w <= 23; w++) {
      const state = weeklyStates.get(w)!;
      const off = getOrCreateTeamStats(state, offTeam);
      const def = getOrCreateTeamStats(state, defTeam);

      if (isPass) {
        off.passOffPlays++;
        off.passOffEpa += epa;
        def.passDefPlays++;
        def.passDefEpa += epa;
        state.league.passPlays++;
        state.league.passEpa += epa;

        if (part) {
          const mz = part.mz || (part.defense_man_zone_type?.trim().toUpperCase() === 'MAN_COVERAGE' ? 'M' : part.defense_man_zone_type?.trim().toUpperCase() === 'ZONE_COVERAGE' ? 'Z' : '');
          if (mz === 'M') {
            off.passManOffPlays++;
            off.passManOffEpa += epa;
            def.passManDefPlays++;
          } else if (mz === 'Z') {
            off.passZoneOffPlays++;
            off.passZoneOffEpa += epa;
            def.passZoneDefPlays++;
          }
          if (mz) def.passDefTotalCharted++;

          const cov = part.cov || (part.defense_coverage_type?.includes('COVER_2') ? '2' : part.defense_coverage_type === 'COVER_3' ? '3' : '');
          if (cov === '2') def.passCover2DefPlays++;
          else if (cov === '3') def.passCover3DefPlays++;
        }
      } else if (isRush) {
        off.rushOffPlays++;
        off.rushOffEpa += epa;
        def.rushDefPlays++;
        def.rushDefEpa += epa;
        state.league.rushPlays++;
        state.league.rushEpa += epa;
      }

      if (part) {
        const pGroup = part.pGroup || parseOffensePersonnel(part.offense_personnel);
        if (pGroup === '11') {
          off.p11OffPlays++;
          off.p11OffEpa += epa;
        } else if (pGroup === '12') {
          off.p12OffPlays++;
          off.p12OffEpa += epa;
        }
        if (pGroup) off.offTotalPersonnelCharted++;

        const front = part.front || parseDefensiveFront(part.defense_personnel);
        if (front === 'nickel+') def.nickelDefPlays++;
        else if (front === '4-3' || front === '3-4') def.baseDefPlays++;
        if (front) def.defTotalFrontCharted++;
      }
    }

    const y100 = parseFloat(row.yardline_100);
    if (!isNaN(y100) && row.fixed_drive) {
      const key = `${row.game_id}_${row.fixed_drive}`;
      if (!driveTracker.has(key)) {
        driveTracker.set(key, { minYardline: y100, result: row.fixed_drive_result || '', posteam: offTeam, defteam: defTeam, week: playWeek });
      } else {
        const d = driveTracker.get(key)!;
        if (y100 < d.minYardline) d.minYardline = y100;
        if (row.fixed_drive_result) d.result = row.fixed_drive_result;
      }
    }
  }

  for (const d of Array.from(driveTracker.values())) {
    if (d.minYardline <= 20) {
      const res = d.result.toLowerCase();
      const pts = res === 'touchdown' ? 7 : res === 'field goal' ? 3 : 0;
      for (let w = d.week + 1; w <= 23; w++) {
        const state = weeklyStates.get(w)!;
        const off = getOrCreateTeamStats(state, d.posteam);
        const def = getOrCreateTeamStats(state, d.defteam);
        off.rzOffTrips++;
        off.rzOffPoints += pts;
        def.rzDefTrips++;
        def.rzDefPoints += pts;
        state.league.rzTrips++;
        state.league.rzPoints += pts;
      }
    }
  }

  return weeklyStates;
}

export async function buildSeasonWeeklyStatesStream(
  pbpKey: 'pbp_2024' | 'pbp_2025',
  partKey: 'part_2024' | 'part_2025'
): Promise<{
  weeklyStates: Map<number, SeasonCumulativeState>;
  endOfSeasonState: SeasonCumulativeState;
}> {
  console.log(`Streaming ${partKey}...`);
  const partStream = await getCachedNflverseStream(partKey);
  const partMap = new Map<string, CompactPart>();

  for await (const row of parseCsvObjects<any>(partStream)) {
    if (!row.nflverse_game_id || !row.play_id) continue;
    const key = `${row.nflverse_game_id}_${row.play_id}`;
    const rawMz = row.defense_man_zone_type?.trim().toUpperCase();
    const mz = rawMz === 'MAN_COVERAGE' ? 'M' : rawMz === 'ZONE_COVERAGE' ? 'Z' : '';
    const rawCov = row.defense_coverage_type?.trim().toUpperCase();
    const cov = rawCov === 'COVER_2' || rawCov === '2_MAN' ? '2' : rawCov === 'COVER_3' ? '3' : '';
    const pGroup = parseOffensePersonnel(row.offense_personnel);
    const front = parseDefensiveFront(row.defense_personnel);

    partMap.set(key, { mz, cov, pGroup, front });
  }
  console.log(`Loaded ${partMap.size} compact participation records.`);

  console.log(`Streaming ${pbpKey}...`);
  const pbpStream = await getCachedNflverseStream(pbpKey);

  const weeklyStates = new Map<number, SeasonCumulativeState>();
  for (let w = 1; w <= 23; w++) {
    weeklyStates.set(w, createEmptyCumulativeState());
  }

  const driveTracker = new Map<string, { minYardline: number; result: string; posteam: string; defteam: string; week: number }>();

  for await (const row of parseCsvObjects<any>(pbpStream)) {
    if (row.season_type !== 'REG') continue;
    if (row.play_type !== 'pass' && row.play_type !== 'run') continue;
    if (row.qb_kneel === '1' || row.play_type === 'qb_kneel') continue;
    if (row.qb_spike === '1' || row.play_type === 'qb_spike') continue;
    if (row.two_point_attempt === '1') continue;
    if (!row.posteam || !row.defteam) continue;

    const playWeek = parseInt(row.week, 10);
    if (isNaN(playWeek)) continue;

    let offTeam: string;
    let defTeam: string;
    try {
      offTeam = mapNflverseTeam(row.posteam);
      defTeam = mapNflverseTeam(row.defteam);
    } catch {
      continue;
    }

    const epa = parseFloat(row.epa) || 0;
    const isPass = row.play_type === 'pass';
    const isRush = row.play_type === 'run';

    const part = partMap.get(`${row.game_id}_${row.play_id}`);

    // Update cumulative state for future weeks > playWeek (strictly walk-forward)
    for (let w = playWeek + 1; w <= 23; w++) {
      const state = weeklyStates.get(w)!;
      const off = getOrCreateTeamStats(state, offTeam);
      const def = getOrCreateTeamStats(state, defTeam);

      if (isPass) {
        off.passOffPlays++;
        off.passOffEpa += epa;
        def.passDefPlays++;
        def.passDefEpa += epa;
        state.league.passPlays++;
        state.league.passEpa += epa;

        if (part) {
          if (part.mz === 'M') {
            off.passManOffPlays++;
            off.passManOffEpa += epa;
            def.passManDefPlays++;
          } else if (part.mz === 'Z') {
            off.passZoneOffPlays++;
            off.passZoneOffEpa += epa;
            def.passZoneDefPlays++;
          }
          if (part.mz) def.passDefTotalCharted++;

          if (part.cov === '2') def.passCover2DefPlays++;
          else if (part.cov === '3') def.passCover3DefPlays++;
        }
      } else if (isRush) {
        off.rushOffPlays++;
        off.rushOffEpa += epa;
        def.rushDefPlays++;
        def.rushDefEpa += epa;
        state.league.rushPlays++;
        state.league.rushEpa += epa;
      }

      if (part) {
        if (part.pGroup === '11') {
          off.p11OffPlays++;
          off.p11OffEpa += epa;
        } else if (part.pGroup === '12') {
          off.p12OffPlays++;
          off.p12OffEpa += epa;
        }
        if (part.pGroup) off.offTotalPersonnelCharted++;

        if (part.front === 'nickel+') def.nickelDefPlays++;
        else if (part.front === '4-3' || part.front === '3-4') def.baseDefPlays++;
        if (part.front) def.defTotalFrontCharted++;
      }
    }

    // RZ tracking
    const y100 = parseFloat(row.yardline_100);
    if (!isNaN(y100) && row.fixed_drive) {
      const key = `${row.game_id}_${row.fixed_drive}`;
      if (!driveTracker.has(key)) {
        driveTracker.set(key, { minYardline: y100, result: row.fixed_drive_result || '', posteam: offTeam, defteam: defTeam, week: playWeek });
      } else {
        const d = driveTracker.get(key)!;
        if (y100 < d.minYardline) d.minYardline = y100;
        if (row.fixed_drive_result) d.result = row.fixed_drive_result;
      }
    }
  }

  partMap.clear(); // Free memory immediately

  // Populate RZ stats across future weeks
  for (const d of Array.from(driveTracker.values())) {
    if (d.minYardline <= 20) {
      const res = d.result.toLowerCase();
      const pts = res === 'touchdown' ? 7 : res === 'field goal' ? 3 : 0;
      for (let w = d.week + 1; w <= 23; w++) {
        const state = weeklyStates.get(w)!;
        const off = getOrCreateTeamStats(state, d.posteam);
        const def = getOrCreateTeamStats(state, d.defteam);
        off.rzOffTrips++;
        off.rzOffPoints += pts;
        def.rzDefTrips++;
        def.rzDefPoints += pts;
        state.league.rzTrips++;
        state.league.rzPoints += pts;
      }
    }
  }

  driveTracker.clear();
  const endOfSeasonState = weeklyStates.get(23) || createEmptyCumulativeState();

  return { weeklyStates, endOfSeasonState };
}

// PRNG for deterministic permutation tests
export function mulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function pairedBootstrapBrier(
  yActual: number[],
  probsModel: number[],
  probsBase: number[],
  resamples = 10000,
  seed = 42
): { diffMean: number; ciLower: number; ciUpper: number; pValue: number } {
  const rng = mulberry32(seed);
  const n = yActual.length;
  const brierDiffs: number[] = new Array(resamples);

  for (let r = 0; r < resamples; r++) {
    let sumDiff = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      const y = yActual[idx];
      const bm = Math.pow(probsModel[idx] - y, 2);
      const bb = Math.pow(probsBase[idx] - y, 2);
      sumDiff += (bb - bm); // positive means Model has lower (better) Brier than Base
    }
    brierDiffs[r] = sumDiff / n;
  }

  brierDiffs.sort((a, b) => a - b);
  const diffMean = brierDiffs.reduce((a, b) => a + b, 0) / resamples;
  const ciLower = brierDiffs[Math.floor(0.025 * resamples)];
  const ciUpper = brierDiffs[Math.floor(0.975 * resamples)];
  const pValue = brierDiffs.filter(d => d <= 0).length / resamples;

  return {
    diffMean: Number(diffMean.toFixed(6)),
    ciLower: Number(ciLower.toFixed(6)),
    ciUpper: Number(ciUpper.toFixed(6)),
    pValue: Number(pValue.toFixed(4)),
  };
}

/**
 * Two-sided exact McNemar test on discordant pairs (binomial, p = 0.5).
 */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let cdf = 0;
  let logChoose = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logChoose += Math.log(n - i + 1) - Math.log(i);
    cdf += Math.exp(logChoose - n * Math.LN2);
  }
  return Math.min(1, 2 * cdf);
}

/**
 * Paired SU contingency of a candidate against the baseline: SU correctness uses
 * the same rule as calculateMetrics (homeWinProb vs 0.5, ties count as 'tie').
 */
export function mcnemarSU(
  games: Game[],
  candPreds: Map<string, PredictionResult>,
  basePreds: Map<string, PredictionResult>
): { b: number; c: number; n: number; pExact: number } {
  const winner = (g: Game) => (g.homeScore > g.awayScore ? 'home' : g.awayScore > g.homeScore ? 'away' : 'tie');
  const pick = (p: PredictionResult) => (p.homeWinProb > 0.5 ? 'home' : p.homeWinProb < 0.5 ? 'away' : 'tie');
  let b = 0;
  let c = 0;
  let n = 0;
  for (const g of games) {
    const cand = candPreds.get(g.id);
    const base = basePreds.get(g.id);
    if (!cand || !base) continue;
    n++;
    const aw = winner(g);
    const candOk = pick(cand) === aw;
    const baseOk = pick(base) === aw;
    if (candOk && !baseOk) b++;
    else if (!candOk && baseOk) c++;
  }
  return { b, c, n, pExact: Number(mcnemarExact(b, c).toFixed(4)) };
}

/**
 * Holm-Bonferroni adjusted p-values, returned in the original input order.
 */
export function holmBonferroni(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adjusted: number[] = new Array(m);
  let runningMax = 0;
  for (let rank = 0; rank < m; rank++) {
    const { p, i } = order[rank];
    const adj = Math.min(1, (m - rank) * p);
    runningMax = Math.max(runningMax, adj);
    adjusted[i] = Number(runningMax.toFixed(4));
  }
  return adjusted;
}

export function evaluateCandidatesOnGames(
  games: Game[],
  weeklyStates: Map<number, SeasonCumulativeState>,
  priorState: SeasonCumulativeState | null,
  placeboSeed: number | null = null,
  options?: {
    ablateM2?: { manZone?: boolean; coverageType?: boolean; personnel?: boolean; front?: boolean };
  }
) {
  const allSorted = [...games].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id.localeCompare(b.id)
  );

  const predsMassey = new Map<string, PredictionResult>();
  const predsM1 = new Map<string, PredictionResult>();
  const predsM2 = new Map<string, PredictionResult>();
  const predsM3 = new Map<string, PredictionResult>();

  let permutedWeeklyStates = weeklyStates;
  if (placeboSeed !== null) {
    const rng = mulberry32(placeboSeed);
    permutedWeeklyStates = new Map<number, SeasonCumulativeState>();
    for (const [w, st] of Array.from(weeklyStates.entries())) {
      const teamsList = Object.keys(st.teams);
      const shuffledTeams = shuffle(teamsList, rng);
      const permutedState = createEmptyCumulativeState();
      permutedState.league = { ...st.league };
      for (let i = 0; i < teamsList.length; i++) {
        permutedState.teams[teamsList[i]] = st.teams[shuffledTeams[i]];
      }
      permutedWeeklyStates.set(w, permutedState);
    }
  }

  for (const g of allSorted) {
    const targetTime = new Date(g.date).getTime();
    const history = getBacktestHistory(allSorted, targetTime);
    const basePred = predictMassey(g, history);
    predsMassey.set(g.id, basePred);

    const masseyMargin = basePred.homeScore - basePred.awayScore;
    const weekState = permutedWeeklyStates.get(g.week) || createEmptyCumulativeState();

    // M1
    const adj1 = calculateM1Adjustment(g.homeAbbr, g.awayAbbr, weekState);
    predsM1.set(g.id, marginToPrediction(masseyMargin + adj1, g));

    // M2
    const adj2 = calculateM2Adjustment(g.homeAbbr, g.awayAbbr, weekState, priorState, {
      ablateManZone: options?.ablateM2?.manZone,
      ablateCoverageType: options?.ablateM2?.coverageType,
      ablatePersonnel: options?.ablateM2?.personnel,
      ablateFront: options?.ablateM2?.front,
    });
    predsM2.set(g.id, marginToPrediction(masseyMargin + adj2, g));

    // M3
    const adj3 = calculateM3Adjustment(g.homeAbbr, g.awayAbbr, weekState);
    predsM3.set(g.id, marginToPrediction(masseyMargin + adj3, g));
  }

  return { predsMassey, predsM1, predsM2, predsM3 };
}

export async function runFullMatchupBacktest() {
  console.log('=== Step 1: Processing 2024 Season Data ===');
  const { weeklyStates: weeklyStates2024, endOfSeasonState: state2024EOS } =
    await buildSeasonWeeklyStatesStream('pbp_2024', 'part_2024');

  console.log('=== Step 2: Processing 2025 Season Data ===');
  const { weeklyStates: weeklyStates2025 } =
    await buildSeasonWeeklyStatesStream('pbp_2025', 'part_2025');

  // Load games datasets
  const games2024Path = path.resolve(__dirname, 'data/2024-season.json');
  const games2025Path = path.resolve(__dirname, 'data/2025-season.json');

  const games2024: Game[] = JSON.parse(fs.readFileSync(games2024Path, 'utf-8')).games;
  const games2025: Game[] = JSON.parse(fs.readFileSync(games2025Path, 'utf-8')).games;

  // Assert game coverage >= 98%
  if (games2024.length < 280) throw new Error(`Game coverage regression for 2024: ${games2024.length}/285`);
  if (games2025.length < 280) throw new Error(`Game coverage regression for 2025: ${games2025.length}/285`);

  // Holdout definitions
  const holdout2025 = games2025.filter(g => (g.seasonType === 2 && g.week >= 13) || g.seasonType === 3);
  const holdout2024 = games2024.filter(g => (g.seasonType === 2 && g.week >= 5) || g.seasonType === 3);
  const pooledHoldout = [...holdout2024, ...holdout2025];

  console.log(`Holdout game counts: 2024 = ${holdout2024.length}, 2025 = ${holdout2025.length}, Pooled = ${pooledHoldout.length}`);

  console.log('=== Step 3: Evaluating Models Walk-Forward ===');
  // 2024 uses null prior; 2025 uses 2024 end of season prior
  const res2024 = evaluateCandidatesOnGames(games2024, weeklyStates2024, null);
  const res2025 = evaluateCandidatesOnGames(games2025, weeklyStates2025, state2024EOS);

  // Compute metrics
  const metMassey2024 = calculateMetrics(holdout2024, res2024.predsMassey);
  const metMassey2025 = calculateMetrics(holdout2025, res2025.predsMassey);
  const metM1_2024 = calculateMetrics(holdout2024, res2024.predsM1);
  const metM1_2025 = calculateMetrics(holdout2025, res2025.predsM1);
  const metM2_2024 = calculateMetrics(holdout2024, res2024.predsM2);
  const metM2_2025 = calculateMetrics(holdout2025, res2025.predsM2);
  const metM3_2024 = calculateMetrics(holdout2024, res2024.predsM3);
  const metM3_2025 = calculateMetrics(holdout2025, res2025.predsM3);

  const pooledPredsMassey = new Map([...res2024.predsMassey, ...res2025.predsMassey]);
  const pooledPredsM1 = new Map([...res2024.predsM1, ...res2025.predsM1]);
  const pooledPredsM2 = new Map([...res2024.predsM2, ...res2025.predsM2]);
  const pooledPredsM3 = new Map([...res2024.predsM3, ...res2025.predsM3]);

  const metMasseyPooled = calculateMetrics(pooledHoldout, pooledPredsMassey);
  const metM1_Pooled = calculateMetrics(pooledHoldout, pooledPredsM1);
  const metM2_Pooled = calculateMetrics(pooledHoldout, pooledPredsM2);
  const metM3_Pooled = calculateMetrics(pooledHoldout, pooledPredsM3);

  console.log('\n--- POOLED HOLDOUT (324 games) ---');
  console.log('Massey Baseline:', metMasseyPooled);
  console.log('M1 Unit Efficiency:', metM1_Pooled);
  console.log('M2 Scheme Matchup:', metM2_Pooled);
  console.log('M3 Red Zone:', metM3_Pooled);

  // Paired bootstrap Brier differences
  const yActual = pooledHoldout.map(g => (g.homeScore > g.awayScore ? 1.0 : g.awayScore > g.homeScore ? 0.0 : 0.5));
  const baseProbs = pooledHoldout.map(g => pooledPredsMassey.get(g.id)!.homeWinProb);

  const m1Probs = pooledHoldout.map(g => pooledPredsM1.get(g.id)!.homeWinProb);
  const m2Probs = pooledHoldout.map(g => pooledPredsM2.get(g.id)!.homeWinProb);
  const m3Probs = pooledHoldout.map(g => pooledPredsM3.get(g.id)!.homeWinProb);

  const bootM1 = pairedBootstrapBrier(yActual, m1Probs, baseProbs, 10000, 20261001);
  const bootM2 = pairedBootstrapBrier(yActual, m2Probs, baseProbs, 10000, 20261002);
  const bootM3 = pairedBootstrapBrier(yActual, m3Probs, baseProbs, 10000, 20261003);

  console.log('\n--- PAIRED BOOTSTRAP BRIER IMPROVEMENT (Positive = Model is better than Massey) ---');
  console.log('M1:', bootM1);
  console.log('M2:', bootM2);
  console.log('M3:', bootM3);

  // Holm-Bonferroni over the three candidates' paired-Brier p-values (criterion (a))
  const holmP = holmBonferroni([bootM1.pValue, bootM2.pValue, bootM3.pValue]);
  console.log('Holm-Bonferroni adjusted paired-Brier p-values (M1, M2, M3):', holmP);

  // McNemar's test for SU correctness paired against massey_rating
  const mcnemarFor = (games: Game[], cand: Map<string, PredictionResult>, base: Map<string, PredictionResult>) =>
    mcnemarSU(games, cand, base);
  const mcnemarSUResults = {
    pooled: {
      M1_unit_efficiency: mcnemarFor(pooledHoldout, pooledPredsM1, pooledPredsMassey),
      M2_scheme_matchup: mcnemarFor(pooledHoldout, pooledPredsM2, pooledPredsMassey),
      M3_red_zone: mcnemarFor(pooledHoldout, pooledPredsM3, pooledPredsMassey),
    },
    y2024: {
      M1_unit_efficiency: mcnemarFor(holdout2024, res2024.predsM1, res2024.predsMassey),
      M2_scheme_matchup: mcnemarFor(holdout2024, res2024.predsM2, res2024.predsMassey),
      M3_red_zone: mcnemarFor(holdout2024, res2024.predsM3, res2024.predsMassey),
    },
    y2025: {
      M1_unit_efficiency: mcnemarFor(holdout2025, res2025.predsM1, res2025.predsMassey),
      M2_scheme_matchup: mcnemarFor(holdout2025, res2025.predsM2, res2025.predsMassey),
      M3_red_zone: mcnemarFor(holdout2025, res2025.predsM3, res2025.predsMassey),
    },
  };
  console.log('McNemar SU (paired vs massey):', JSON.stringify(mcnemarSUResults));

  // Placebo permutation tests
  console.log('\n=== Step 4: Running 200 Placebo Permutations per Candidate ===');
  const NUM_PERMS = 200;
  let m1BeatPlacebo = 0;
  let m2BeatPlacebo = 0;
  let m3BeatPlacebo = 0;

  const baseBrier = metMasseyPooled.brierScore;
  const realImpM1 = baseBrier - metM1_Pooled.brierScore;
  const realImpM2 = baseBrier - metM2_Pooled.brierScore;
  const realImpM3 = baseBrier - metM3_Pooled.brierScore;

  for (let p = 0; p < NUM_PERMS; p++) {
    const seed = 20261006 + p;
    const pRes2024 = evaluateCandidatesOnGames(games2024, weeklyStates2024, null, seed);
    const pRes2025 = evaluateCandidatesOnGames(games2025, weeklyStates2025, state2024EOS, seed);

    const pPooledM1 = new Map([...pRes2024.predsM1, ...pRes2025.predsM1]);
    const pPooledM2 = new Map([...pRes2024.predsM2, ...pRes2025.predsM2]);
    const pPooledM3 = new Map([...pRes2024.predsM3, ...pRes2025.predsM3]);

    const pBrierM1 = calculateMetrics(pooledHoldout, pPooledM1).brierScore;
    const pBrierM2 = calculateMetrics(pooledHoldout, pPooledM2).brierScore;
    const pBrierM3 = calculateMetrics(pooledHoldout, pPooledM3).brierScore;

    if (realImpM1 > baseBrier - pBrierM1) m1BeatPlacebo++;
    if (realImpM2 > baseBrier - pBrierM2) m2BeatPlacebo++;
    if (realImpM3 > baseBrier - pBrierM3) m3BeatPlacebo++;
  }

  const pPctM1 = Number(((m1BeatPlacebo / NUM_PERMS) * 100).toFixed(1));
  const pPctM2 = Number(((m2BeatPlacebo / NUM_PERMS) * 100).toFixed(1));
  const pPctM3 = Number(((m3BeatPlacebo / NUM_PERMS) * 100).toFixed(1));

  console.log(`Placebo beat percentage: M1 = ${pPctM1}%, M2 = ${pPctM2}%, M3 = ${pPctM3}%`);

  // Ablations for M2
  console.log('\n=== Step 5: Ablation Analysis for M2 Scheme Subcomponents ===');
  const ablNoManZone2024 = evaluateCandidatesOnGames(games2024, weeklyStates2024, null, null, { ablateM2: { manZone: true } });
  const ablNoManZone2025 = evaluateCandidatesOnGames(games2025, weeklyStates2025, state2024EOS, null, { ablateM2: { manZone: true } });
  const metAblNoManZone = calculateMetrics(pooledHoldout, new Map([...ablNoManZone2024.predsM2, ...ablNoManZone2025.predsM2]));

  const ablNoPersonnel2024 = evaluateCandidatesOnGames(games2024, weeklyStates2024, null, null, { ablateM2: { personnel: true } });
  const ablNoPersonnel2025 = evaluateCandidatesOnGames(games2025, weeklyStates2025, state2024EOS, null, { ablateM2: { personnel: true } });
  const metAblNoPersonnel = calculateMetrics(pooledHoldout, new Map([...ablNoPersonnel2024.predsM2, ...ablNoPersonnel2025.predsM2]));

  const ablNoFront2024 = evaluateCandidatesOnGames(games2024, weeklyStates2024, null, null, { ablateM2: { front: true } });
  const ablNoFront2025 = evaluateCandidatesOnGames(games2025, weeklyStates2025, state2024EOS, null, { ablateM2: { front: true } });
  const metAblNoFront = calculateMetrics(pooledHoldout, new Map([...ablNoFront2024.predsM2, ...ablNoFront2025.predsM2]));

  const ablNoCoverageType2024 = evaluateCandidatesOnGames(games2024, weeklyStates2024, null, null, { ablateM2: { coverageType: true } });
  const ablNoCoverageType2025 = evaluateCandidatesOnGames(games2025, weeklyStates2025, state2024EOS, null, { ablateM2: { coverageType: true } });
  const metAblNoCoverageType = calculateMetrics(pooledHoldout, new Map([...ablNoCoverageType2024.predsM2, ...ablNoCoverageType2025.predsM2]));

  console.log('M2 full:', metM2_Pooled.brierScore);
  console.log('M2 without man/zone:', metAblNoManZone.brierScore);
  console.log('M2 without coverage type (Cover 2/3):', metAblNoCoverageType.brierScore);
  console.log('M2 without personnel:', metAblNoPersonnel.brierScore);
  console.log('M2 without front:', metAblNoFront.brierScore);

  // Compute pre-registration hash at runtime
  const preregPath = path.resolve(__dirname, '../docs-internal/matchup-backtest-prereg.md');
  if (!fs.existsSync(preregPath)) {
    throw new Error(`Pre-registration file missing: ${preregPath}`);
  }
  const preregHash = crypto.createHash('sha256').update(fs.readFileSync(preregPath)).digest('hex');

  const resultsOut = {
    generatedAt: new Date().toISOString(),
    preRegistrationSha256: preregHash,
    datasets: {
      games2024Count: games2024.length,
      games2025Count: games2025.length,
      holdout2024Count: holdout2024.length,
      holdout2025Count: holdout2025.length,
      pooledHoldoutCount: pooledHoldout.length,
    },
    metrics: {
      massey: { y2024: metMassey2024, y2025: metMassey2025, pooled: metMasseyPooled },
      M1_unit_efficiency: {
        y2024: metM1_2024,
        y2025: metM1_2025,
        pooled: metM1_Pooled,
        bootstrapBrierDiff: bootM1,
        holmAdjustedP: holmP[0],
        placeboBeatPct: pPctM1,
      },
      M2_scheme_matchup: {
        y2024: metM2_2024,
        y2025: metM2_2025,
        pooled: metM2_Pooled,
        bootstrapBrierDiff: bootM2,
        holmAdjustedP: holmP[1],
        placeboBeatPct: pPctM2,
        ablations: {
          noManZoneBrier: metAblNoManZone.brierScore,
          noCoverageTypeBrier: metAblNoCoverageType.brierScore,
          noPersonnelBrier: metAblNoPersonnel.brierScore,
          noFrontBrier: metAblNoFront.brierScore,
        },
      },
      M3_red_zone: {
        y2024: metM3_2024,
        y2025: metM3_2025,
        pooled: metM3_Pooled,
        bootstrapBrierDiff: bootM3,
        holmAdjustedP: holmP[2],
        placeboBeatPct: pPctM3,
      },
      mcnemarSU: mcnemarSUResults,
    },
  };

  const resultsDir = path.resolve(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'matchup-backtest.json'), JSON.stringify(resultsOut, null, 2), 'utf-8');
  console.log('Results written to research/results/matchup-backtest.json');
}

if (require.main === module) {
  runFullMatchupBacktest();
}
