import {
  NFL_TEAM_ABBREVIATIONS,
  NFLTeamAbbreviation,
} from './rosterSnapshot';

export { NFL_TEAM_ABBREVIATIONS };
export type { NFLTeamAbbreviation };

let rawTeamStatsData: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  rawTeamStatsData = require('./teamStats.json');
} catch {
  // Available after npm run snapshot:teamstats is run
}

export const DATA_ATTRIBUTION =
  'Play-by-play, team efficiency, and scheme prior data sourced from nflverse (https://github.com/nflverse/nflverse-data) and FTN Data via nflverse (licensed under CC-BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/).';

export const NFLVERSE_TO_APP_TEAM_MAP: Record<string, NFLTeamAbbreviation> = {
  ARI: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BUF: 'BUF',
  CAR: 'CAR',
  CHI: 'CHI',
  CIN: 'CIN',
  CLE: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GB: 'GB',
  HOU: 'HOU',
  IND: 'IND',
  JAC: 'JAX',
  JAX: 'JAX',
  KC: 'KC',
  LA: 'LAR',
  LAR: 'LAR',
  LAC: 'LAC',
  SD: 'LAC',
  LV: 'LV',
  OAK: 'LV',
  MIA: 'MIA',
  MIN: 'MIN',
  NE: 'NE',
  NO: 'NO',
  NYG: 'NYG',
  NYJ: 'NYJ',
  PHI: 'PHI',
  PIT: 'PIT',
  SEA: 'SEA',
  SF: 'SF',
  STL: 'LAR',
  TB: 'TB',
  TEN: 'TEN',
  WAS: 'WSH',
  WSH: 'WSH',
};

/**
 * Maps an nflverse team abbreviation to the app canonical abbreviation.
 * Fails loudly on unmapped/unknown team codes.
 */
export function mapNflverseTeam(rawAbbr: string): NFLTeamAbbreviation {
  const trimmed = rawAbbr?.trim();
  const mapped = NFLVERSE_TO_APP_TEAM_MAP[trimmed];
  if (!mapped) {
    throw new Error(`Unknown / unmapped NFL team abbreviation: "${rawAbbr}"`);
  }
  return mapped;
}

export type PersonnelGroup = '11' | '12' | '21' | 'other';

/**
 * Groups offensive personnel string (e.g. "1 RB, 1 TE, 3 WR") into standard codes:
 * - 11: 1 RB, 1 TE (3 WR)
 * - 12: 1 RB, 2 TE (2 WR)
 * - 21: 2 RB (includes RB+FB), 1 TE (2 WR)
 * - other: all other personnel combinations
 */
export function parseOffensePersonnel(personnelStr?: string | null): PersonnelGroup {
  if (!personnelStr) return 'other';
  let rbCount = 0;
  let teCount = 0;
  const parts = personnelStr.split(',').map(s => s.trim());
  for (const p of parts) {
    const m = p.match(/^(\d+)\s+([A-Za-z]+)$/);
    if (!m) continue;
    const count = parseInt(m[1], 10);
    const pos = m[2].toUpperCase();
    if (pos === 'RB' || pos === 'FB') {
      rbCount += count;
    } else if (pos === 'TE') {
      teCount += count;
    }
  }
  if (rbCount === 1 && teCount === 1) return '11';
  if (rbCount === 1 && teCount === 2) return '12';
  if (rbCount === 2 && teCount === 1) return '21';
  return 'other';
}

export type DefensiveFrontGroup = '4-3' | '3-4' | 'nickel+' | 'other';

/**
 * Defensive front classification proxy inferred from defensive player counts:
 * - 5+ DBs (CB, S, FS, SS, DB) -> 'nickel+' (nickel, dime, quarter packages)
 * - 4 DL (DE, DT, NT, DL) and 3 LB (LB, ILB, OLB, MLB) -> '4-3'
 * - 3 DL and 4 LB -> '3-4'
 * - Otherwise -> 'other' (goal line, heavy front, unclassified)
 *
 * NOTE: This is an analytical proxy inferred from player personnel counts,
 * not an officially charted defensive front alignment.
 */
export function parseDefensiveFront(personnelStr?: string | null): DefensiveFrontGroup {
  if (!personnelStr) return 'other';
  let dl = 0;
  let lb = 0;
  let db = 0;
  const parts = personnelStr.split(',').map(s => s.trim());
  for (const p of parts) {
    const m = p.match(/^(\d+)\s+([A-Za-z]+)$/);
    if (!m) continue;
    const count = parseInt(m[1], 10);
    const pos = m[2].toUpperCase();
    if (['DL', 'DE', 'DT', 'NT'].includes(pos)) {
      dl += count;
    } else if (['LB', 'ILB', 'OLB', 'MLB'].includes(pos)) {
      lb += count;
    } else if (['DB', 'CB', 'S', 'FS', 'SS'].includes(pos)) {
      db += count;
    }
  }
  if (db >= 5) return 'nickel+';
  if (dl === 4 && lb === 3) return '4-3';
  if (dl === 3 && lb === 4) return '3-4';
  return 'other';
}

export type OffensiveFormationGroup = 'shotgun' | 'under_center' | 'pistol' | 'other';

export function normalizeFormation(formationStr?: string | null): OffensiveFormationGroup {
  if (!formationStr) return 'other';
  const clean = formationStr.trim().toUpperCase();
  if (clean === 'SHOTGUN') return 'shotgun';
  if (clean === 'UNDER CENTER') return 'under_center';
  if (clean === 'PISTOL') return 'pistol';
  return 'other';
}

export interface RateWithSample {
  share: number;
  plays: number;
}

export interface UnitPassStats {
  epaPerPlay: number;
  successRate: number;
  yardsPerAttempt: number;
  attempts: number;
  plays: number;
}

export interface UnitRushStats {
  epaPerPlay: number;
  successRate: number;
  yardsPerCarry: number;
  carries: number;
  plays: number;
}

export interface RedZoneStats {
  trips: number;
  touchdowns: number;
  fieldGoals: number;
  tdRate: number;
  pointsPerTrip: number;
  goalToGoEpaPerPlay: number;
  goalToGoPlays: number;
}

export interface FtnUnitStats {
  blitzRate: number;
  blitzPlays: number;
  playActionRate: number;
  playActionPlays: number;
  motionRate: number;
  motionPlays: number;
  box8PlusRate: number;
  box8PlusPlays: number;
  /** Number of plays in this unit's sample that matched an FTN charting row. */
  ftnPlays: number;
}

export interface UnitEfficiencyStats {
  epaPerPlay: number;
  successRate: number;
  totalPlays: number;
  pass: UnitPassStats;
  rush: UnitRushStats;
  sackRate: number;
  sacks: number;
  qbHitRate: number;
  qbHits: number;
  dropbacks: number;
  thirdDownConversion: number;
  thirdDownAttempts: number;
  thirdDownConversions: number;
  turnovers: number;
  redZone: RedZoneStats;
  ftn: FtnUnitStats;
}

export interface TeamCurrentTendencies {
  formation: {
    shotgun: RateWithSample;
    underCenter: RateWithSample;
    pistol: RateWithSample;
  };
  playAction: RateWithSample;
  motion: RateWithSample;
  noHuddle: RateWithSample;
  screen: RateWithSample;
  rpo: RateWithSample;
  box8Plus: RateWithSample;
  blitz: RateWithSample;
  passRushersMean: {
    mean: number;
    plays: number;
  };
}

export interface TeamCurrentSeasonStats {
  season: number;
  gamesPlayed: number;
  offense: UnitEfficiencyStats;
  defense: UnitEfficiencyStats;
  tendencies?: TeamCurrentTendencies;
}

export interface TopPersonnelGroupEpa {
  group: PersonnelGroup;
  share: number;
  epaPerPlay: number;
  plays: number;
}

export interface TeamPriorSeasonStats {
  season: number;
  gamesPlayed: number;
  totalPlays: number;
  offensivePersonnel: {
    p11: RateWithSample;
    p12: RateWithSample;
    p21: RateWithSample;
    other: RateWithSample;
    topPersonnelEpa: TopPersonnelGroupEpa[];
  };
  formation: {
    shotgun: RateWithSample;
    underCenter: RateWithSample;
    pistol: RateWithSample;
    other: RateWithSample;
  };
  defensiveFront: {
    f43: RateWithSample;
    f34: RateWithSample;
    nickelPlus: RateWithSample;
    other: RateWithSample;
  };
  coverage: {
    passPlaysCharted: number;
    man: RateWithSample;
    zone: RateWithSample;
    cover1: RateWithSample;
    cover2: RateWithSample;
    cover3: RateWithSample;
    cover4: RateWithSample;
    cover6: RateWithSample;
    other: RateWithSample;
  };
  offenseVsCoverage: {
    vsMan: { epaPerPlay: number; plays: number };
    vsZone: { epaPerPlay: number; plays: number };
  };
}

export interface TeamUnitSnapshot {
  team: NFLTeamAbbreviation;
  current: TeamCurrentSeasonStats;
  priorSeason: TeamPriorSeasonStats;
  /**
   * 2025 FTN+PBP scheme tendencies used as the visible baseline for the
   * FTN-derived tendency rows. Optional: snapshots predating this field still
   * validate and render (the UI falls back to priorSeason where it can).
   */
  priorSeasonTendencies?: TeamCurrentTendencies;
  currentScheme?: TeamPriorSeasonStats;
}

export interface FtnGamesMissing {
  count: number;
  gameIds: string[];
}

export interface TeamStatsSnapshot {
  schemaVersion: number;
  fetchedAt: string;
  season: number;
  dataAttribution: string;
  /**
   * Share of scrimmage plays matched across all games. Retained for continuity; the
   * integrity/freshness pair below is what the snapshot gate now keys on.
   */
  ftnJoinCoveragePct?: number;
  /** Regular-season games that have at least one FTN charting row. */
  ftnGamesCovered?: number;
  /** Regular-season games with no FTN rows at all, plus their game ids. */
  ftnGamesMissing?: FtnGamesMissing;
  /** Share of scrimmage plays matched among FTN-covered games only. */
  ftnJoinIntegrityPct?: number;
  leagueAverage: {
    offense: UnitEfficiencyStats;
    defense: UnitEfficiencyStats;
  };
  teams: Record<NFLTeamAbbreviation, TeamUnitSnapshot>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function findNonFiniteNumbers(obj: any, path = ''): string[] {
  const errors: string[] = [];
  if (obj === null || obj === undefined) return errors;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      errors.push(`Non-finite number at ${path}: ${obj}`);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      errors.push(...findNonFiniteNumbers(item, `${path}[${idx}]`));
    });
  } else if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      errors.push(...findNonFiniteNumbers(val, path ? `${path}.${key}` : key));
    }
  }
  return errors;
}

/**
 * Validates a TeamCurrentTendencies block (current.tendencies or the optional
 * priorSeasonTendencies 2025 baseline). Shared so both blocks are held to the
 * same shape.
 */
function validateTendenciesShape(t: any, label: string, errors: string[]): void {
  if (!t || typeof t !== 'object') {
    errors.push(`Invalid tendencies object for ${label}`);
    return;
  }
  if (!t.formation || typeof t.formation !== 'object') {
    errors.push(`Invalid formation tendencies for ${label}`);
  }
  if (!t.playAction || typeof t.playAction !== 'object') {
    errors.push(`Invalid playAction tendency for ${label}`);
  }
  if (!t.motion || typeof t.motion !== 'object') {
    errors.push(`Invalid motion tendency for ${label}`);
  }
  if (!t.noHuddle || typeof t.noHuddle !== 'object') {
    errors.push(`Invalid noHuddle tendency for ${label}`);
  }
  if (!t.screen || typeof t.screen !== 'object') {
    errors.push(`Invalid screen tendency for ${label}`);
  }
  if (!t.rpo || typeof t.rpo !== 'object') {
    errors.push(`Invalid rpo tendency for ${label}`);
  }
  if (!t.box8Plus || typeof t.box8Plus !== 'object') {
    errors.push(`Invalid box8Plus tendency for ${label}`);
  }
  if (!t.blitz || typeof t.blitz !== 'object') {
    errors.push(`Invalid blitz tendency for ${label}`);
  }
  if (!t.passRushersMean || typeof t.passRushersMean !== 'object') {
    errors.push(`Invalid passRushersMean tendency for ${label}`);
  }
}

/**
 * Validates a TeamStatsSnapshot data payload:
 * - Top-level structure and schemaVersion === 1
 * - fetchedAt ISO timestamp
 * - All 32 NFL teams present
 * - No non-finite numbers (NaN, Infinity, -Infinity)
 * - priorSeason season === 2025
 */
export function validateTeamStats(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Snapshot data must be a non-null object'] };
  }

  if (typeof data.schemaVersion !== 'number' || data.schemaVersion !== 1) {
    errors.push('Missing or invalid schemaVersion (expected 1)');
  }

  if (typeof data.fetchedAt !== 'string' || !data.fetchedAt.trim()) {
    errors.push('Missing or invalid fetchedAt timestamp');
  }

  if (typeof data.season !== 'number') {
    errors.push('Missing or invalid season');
  }

  if (!data.leagueAverage || typeof data.leagueAverage !== 'object') {
    errors.push('Missing or invalid leagueAverage object');
  }

  if (!data.teams || typeof data.teams !== 'object') {
    errors.push('Missing or invalid teams object');
    return { valid: false, errors };
  }

  const teamKeys = Object.keys(data.teams);
  for (const expectedTeam of NFL_TEAM_ABBREVIATIONS) {
    if (!teamKeys.includes(expectedTeam)) {
      errors.push(`Missing team: ${expectedTeam}`);
    }
  }

  for (const [teamAbbr, teamData] of Object.entries(data.teams as Record<string, any>)) {
    if (!teamData || typeof teamData !== 'object') {
      errors.push(`Invalid data for team ${teamAbbr}`);
      continue;
    }
    if (!teamData.current || typeof teamData.current !== 'object') {
      errors.push(`Missing current season stats for team ${teamAbbr}`);
    }
    if (!teamData.priorSeason || typeof teamData.priorSeason !== 'object') {
      errors.push(`Missing prior season stats for team ${teamAbbr}`);
    } else if (teamData.priorSeason.season !== 2025) {
      errors.push(
        `Invalid priorSeason season for team ${teamAbbr} (expected 2025, got ${teamData.priorSeason.season})`
      );
    }

    if (teamData.currentScheme !== undefined && typeof teamData.currentScheme !== 'object') {
      errors.push(`Invalid currentScheme for team ${teamAbbr} (expected object)`);
    }

    if (teamData.current?.tendencies !== undefined) {
      validateTendenciesShape(teamData.current.tendencies, `${teamAbbr} current.tendencies`, errors);
    }

    // Optional 2025 FTN+PBP baseline block. Older snapshots without it stay valid.
    if (teamData.priorSeasonTendencies !== undefined) {
      validateTendenciesShape(
        teamData.priorSeasonTendencies,
        `${teamAbbr} priorSeasonTendencies`,
        errors
      );
    }
  }

  // Optional FTN coverage metadata (added after the original schema). Older snapshots
  // that predate these fields must keep validating; when present they are shape-checked.
  if (data.ftnGamesCovered !== undefined) {
    if (
      typeof data.ftnGamesCovered !== 'number' ||
      !Number.isFinite(data.ftnGamesCovered) ||
      data.ftnGamesCovered < 0
    ) {
      errors.push('Invalid ftnGamesCovered (expected a non-negative number)');
    }
  }

  if (data.ftnJoinIntegrityPct !== undefined) {
    if (typeof data.ftnJoinIntegrityPct !== 'number' || !Number.isFinite(data.ftnJoinIntegrityPct)) {
      errors.push('Invalid ftnJoinIntegrityPct (expected a finite number)');
    }
  }

  if (data.ftnGamesMissing !== undefined) {
    const missing = data.ftnGamesMissing;
    if (
      !missing ||
      typeof missing !== 'object' ||
      typeof missing.count !== 'number' ||
      !Number.isFinite(missing.count) ||
      missing.count < 0 ||
      !Array.isArray(missing.gameIds) ||
      missing.gameIds.some((id: unknown) => typeof id !== 'string')
    ) {
      errors.push('Invalid ftnGamesMissing (expected { count: number, gameIds: string[] })');
    }
  }

  // Check for NaN or Infinite numbers across the entire payload
  const nonFiniteErrors = findNonFiniteNumbers(data);
  if (nonFiniteErrors.length > 0) {
    errors.push(...nonFiniteErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertValidTeamStats(data: any): void {
  const result = validateTeamStats(data);
  if (!result.valid) {
    throw new Error(`Team stats validation failed:\n- ${result.errors.join('\n- ')}`);
  }
}

export interface LoadedTeamStats {
  snapshot: TeamStatsSnapshot | null;
  isStale: boolean;
  errors: string[];
}

/**
 * Loads team stats snapshot.
 * Safe loader: never throws into the render path; returns { snapshot: null, ... } on error.
 * Staleness window (default 7 days) returns isStale: true rather than failing.
 */
export function loadTeamStats(
  customData?: any,
  options?: { stalenessThresholdDays?: number; now?: number }
): LoadedTeamStats {
  try {
    const data = customData !== undefined ? customData : rawTeamStatsData;
    if (!data) {
      return {
        snapshot: null,
        isStale: false,
        errors: ['No team stats snapshot data found'],
      };
    }

    const validation = validateTeamStats(data);
    if (!validation.valid) {
      return {
        snapshot: null,
        isStale: false,
        errors: validation.errors,
      };
    }

    const fetchedTime = new Date(data.fetchedAt).getTime();
    if (isNaN(fetchedTime)) {
      return {
        snapshot: null,
        isStale: false,
        errors: ['Invalid fetchedAt timestamp in snapshot'],
      };
    }

    const now = options?.now ?? Date.now();
    const ageMs = now - fetchedTime;
    const thresholdDays = options?.stalenessThresholdDays ?? 7;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const isStale = ageMs > thresholdMs;

    return {
      snapshot: data as TeamStatsSnapshot,
      isStale,
      errors: [],
    };
  } catch (err: any) {
    return {
      snapshot: null,
      isStale: false,
      errors: [err.message || String(err)],
    };
  }
}

/**
 * Checks whether sample size is sufficient to rely on team tendencies.
 * Returns false if current games played < minCurrentGames (default 3)
 * or if prior plays < minPriorPlays (default 100).
 */
export function isReliable(
  teamStats: TeamUnitSnapshot,
  options?: { minCurrentGames?: number; minPriorPlays?: number }
): boolean {
  if (!teamStats) return false;
  const minCurrentGames = options?.minCurrentGames ?? 3;
  const minPriorPlays = options?.minPriorPlays ?? 100;

  if (!teamStats.current || teamStats.current.gamesPlayed < minCurrentGames) {
    return false;
  }
  if (!teamStats.priorSeason || (teamStats.priorSeason.totalPlays ?? 0) < minPriorPlays) {
    return false;
  }
  return true;
}
