import fs from 'fs';
import path from 'path';
import {
  DATA_ATTRIBUTION,
  DefensiveFrontGroup,
  NFL_TEAM_ABBREVIATIONS,
  NFLTeamAbbreviation,
  OffensiveFormationGroup,
  PersonnelGroup,
  TeamPriorSeasonStats,
  TeamStatsSnapshot,
  TeamUnitSnapshot,
  TopPersonnelGroupEpa,
  UnitEfficiencyStats,
  assertValidTeamStats,
  mapNflverseTeam,
  normalizeFormation,
  parseDefensiveFront,
  parseOffensePersonnel,
} from '../src/data/teamStats';
import {
  CoverageCounts,
  FTN_MAX_MISSING_GAME_PCT,
  FTN_MIN_JOIN_INTEGRITY_PCT,
  RedZoneDriveTracker,
  ScrimmageGameJoin,
  assertFtnCoverage,
  computeCoverageShares,
  createEmptyCoverageCounts,
  downloadNflverseFile,
  evaluateFtnCoverage,
  parseCsvObjects,
  recordCoveragePlay,
  summarizeRedZoneDrives,
  updateRedZoneTracker,
} from './lib/nflverse';

const SNAPSHOT_PATH = path.resolve(__dirname, '../src/data/teamStats.json');
const MAX_SNAPSHOT_SIZE_BYTES = 250 * 1024; // 256,000 bytes ceiling

const PBP_2026_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv.gz';
const FTN_2026_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_2026.csv';
const PARTICIPATION_2026_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2026.csv';
const PBP_2025_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2025.csv.gz';
const PARTICIPATION_2025_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_2025.csv';

function round(n: number, d = 4): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** d) / 10 ** d;
}

export interface RawFtnRow {
  nflverse_game_id?: string;
  nflverse_play_id?: string;
  n_blitzers?: string;
  n_defense_box?: string;
  is_play_action?: string;
  is_motion?: string;
}

export interface RawPbpRow {
  game_id: string;
  play_id: string;
  season_type: string;
  posteam: string;
  defteam: string;
  yardline_100: string;
  down: string;
  play_type: string;
  yards_gained: string;
  passing_yards: string;
  rushing_yards: string;
  pass_attempt: string;
  rush_attempt: string;
  sack: string;
  qb_hit: string;
  qb_dropback: string;
  qb_kneel: string;
  qb_spike: string;
  two_point_attempt: string;
  third_down_converted: string;
  third_down_failed: string;
  interception: string;
  fumble_lost: string;
  fixed_drive: string;
  fixed_drive_result: string;
  goal_to_go: string;
  epa: string;
  success: string;
}

interface RawParticipationRow {
  nflverse_game_id: string;
  play_id: string;
  offense_formation: string;
  offense_personnel: string;
  defense_personnel: string;
  defense_man_zone_type: string;
  defense_coverage_type: string;
}

export class UnitStatsAccumulator {
  totalPlays = 0;
  totalEpa = 0;
  successes = 0;

  passPlays = 0;
  passEpa = 0;
  passSuccesses = 0;
  passYards = 0;
  passAttempts = 0;

  rushPlays = 0;
  rushEpa = 0;
  rushSuccesses = 0;
  rushYards = 0;
  rushAttempts = 0;

  sacks = 0;
  qbHits = 0;
  dropbacks = 0;

  thirdDownAttempts = 0;
  thirdDownConversions = 0;

  turnovers = 0;

  goalToGoPlays = 0;
  goalToGoEpa = 0;

  blitzPlays = 0;
  blitzOpportunities = 0;
  playActionPlays = 0;
  playActionOpportunities = 0;
  motionPlays = 0;
  box8PlusPlays = 0;
  ftnPlays = 0;

  addPlay(
    row: RawPbpRow,
    ftn: RawFtnRow | undefined,
    isOffense: boolean
  ) {
    const epa = parseFloat(row.epa) || 0;
    const isSuccess = row.success === '1';
    const isPass = row.play_type === 'pass';
    const isRush = row.play_type === 'run';
    const isSack = row.sack === '1';
    const isQbHit = row.qb_hit === '1';
    const isDropback = row.qb_dropback === '1' || isPass || isSack;

    this.totalPlays++;
    this.totalEpa += epa;
    if (isSuccess) this.successes++;

    if (isPass) {
      this.passPlays++;
      this.passEpa += epa;
      if (isSuccess) this.passSuccesses++;
      const py = parseFloat(row.passing_yards || row.yards_gained);
      if (!isNaN(py)) this.passYards += py;
      if (row.pass_attempt === '1') this.passAttempts++;
    } else if (isRush) {
      this.rushPlays++;
      this.rushEpa += epa;
      if (isSuccess) this.rushSuccesses++;
      const ry = parseFloat(row.rushing_yards || row.yards_gained);
      if (!isNaN(ry)) this.rushYards += ry;
      if (row.rush_attempt === '1') this.carries++;
    }

    if (isDropback) {
      this.dropbacks++;
      if (isSack) this.sacks++;
      if (isQbHit) this.qbHits++;
    }

    if (row.down === '3') {
      this.thirdDownAttempts++;
      if (row.third_down_converted === '1') {
        this.thirdDownConversions++;
      }
    }

    if (row.interception === '1' || row.fumble_lost === '1') {
      this.turnovers++;
    }

    if (row.goal_to_go === '1') {
      this.goalToGoPlays++;
      this.goalToGoEpa += epa;
    }

    // FTN metrics: only matched plays count. Unmatched plays (ftn === undefined) never
    // touch an FTN numerator or denominator.
    if (ftn) {
      this.ftnPlays++;
      const blitzers = parseInt(ftn.n_blitzers || '0', 10);
      if (isPass || isDropback) {
        this.blitzOpportunities++;
        if (blitzers > 0) this.blitzPlays++;

        this.playActionOpportunities++;
        if (ftn.is_play_action === 'TRUE') this.playActionPlays++;
      }

      if (ftn.is_motion === 'TRUE') this.motionPlays++;
      const box = parseInt(ftn.n_defense_box || '0', 10);
      if (box >= 8) this.box8PlusPlays++;
    }
  }

  carries = 0;

  finalize(redZone: {
    trips: number;
    touchdowns: number;
    fieldGoals: number;
    tdRate: number;
    pointsPerTrip: number;
  }): UnitEfficiencyStats {
    const epaPerPlay = this.totalPlays > 0 ? round(this.totalEpa / this.totalPlays) : 0;
    const successRate = this.totalPlays > 0 ? round(this.successes / this.totalPlays) : 0;

    const passEpaPerPlay = this.passPlays > 0 ? round(this.passEpa / this.passPlays) : 0;
    const passSuccessRate = this.passPlays > 0 ? round(this.passSuccesses / this.passPlays) : 0;
    const yardsPerAttempt =
      this.passAttempts > 0
        ? round(this.passYards / this.passAttempts)
        : this.passPlays > 0
        ? round(this.passYards / this.passPlays)
        : 0;

    const rushEpaPerPlay = this.rushPlays > 0 ? round(this.rushEpa / this.rushPlays) : 0;
    const rushSuccessRate = this.rushPlays > 0 ? round(this.rushSuccesses / this.rushPlays) : 0;
    const yardsPerCarry =
      this.carries > 0
        ? round(this.rushYards / this.carries)
        : this.rushPlays > 0
        ? round(this.rushYards / this.rushPlays)
        : 0;

    const sackRate = this.dropbacks > 0 ? round(this.sacks / this.dropbacks) : 0;
    const qbHitRate = this.dropbacks > 0 ? round(this.qbHits / this.dropbacks) : 0;

    const thirdDownConversion =
      this.thirdDownAttempts > 0 ? round(this.thirdDownConversions / this.thirdDownAttempts) : 0;

    const goalToGoEpaPerPlay =
      this.goalToGoPlays > 0 ? round(this.goalToGoEpa / this.goalToGoPlays) : 0;

    const blitzRate =
      this.blitzOpportunities > 0 ? round(this.blitzPlays / this.blitzOpportunities) : 0;
    const playActionRate =
      this.playActionOpportunities > 0
        ? round(this.playActionPlays / this.playActionOpportunities)
        : 0;
    const motionRate = this.ftnPlays > 0 ? round(this.motionPlays / this.ftnPlays) : 0;
    const box8PlusRate = this.ftnPlays > 0 ? round(this.box8PlusPlays / this.ftnPlays) : 0;

    return {
      epaPerPlay,
      successRate,
      totalPlays: this.totalPlays,
      pass: {
        epaPerPlay: passEpaPerPlay,
        successRate: passSuccessRate,
        yardsPerAttempt,
        attempts: this.passAttempts,
        plays: this.passPlays,
      },
      rush: {
        epaPerPlay: rushEpaPerPlay,
        successRate: rushSuccessRate,
        yardsPerCarry,
        carries: this.carries,
        plays: this.rushPlays,
      },
      sackRate,
      sacks: this.sacks,
      qbHitRate,
      qbHits: this.qbHits,
      dropbacks: this.dropbacks,
      thirdDownConversion,
      thirdDownAttempts: this.thirdDownAttempts,
      thirdDownConversions: this.thirdDownConversions,
      turnovers: this.turnovers,
      redZone: {
        trips: redZone.trips,
        touchdowns: redZone.touchdowns,
        fieldGoals: redZone.fieldGoals,
        tdRate: redZone.tdRate,
        pointsPerTrip: redZone.pointsPerTrip,
        goalToGoEpaPerPlay,
        goalToGoPlays: this.goalToGoPlays,
      },
      ftn: {
        blitzRate,
        blitzPlays: this.blitzPlays,
        playActionRate,
        playActionPlays: this.playActionPlays,
        motionRate,
        motionPlays: this.motionPlays,
        box8PlusRate,
        box8PlusPlays: this.box8PlusPlays,
        ftnPlays: this.ftnPlays,
      },
    };
  }
}

async function compute2026CurrentStats(): Promise<{
  teamsCurrent: Record<NFLTeamAbbreviation, { gamesPlayed: number; offense: UnitEfficiencyStats; defense: UnitEfficiencyStats }>;
  leagueAverage: { offense: UnitEfficiencyStats; defense: UnitEfficiencyStats };
  ftnJoinCoveragePct: number;
  ftnGamesCovered: number;
  ftnGamesMissing: { count: number; gameIds: string[] };
  ftnJoinIntegrityPct: number;
}> {
  console.log('Downloading FTN 2026 charting data...');
  const ftnStream = await downloadNflverseFile(FTN_2026_URL);
  const ftnMap = new Map<string, RawFtnRow>();
  const ftnGameIds = new Set<string>();

  for await (const row of parseCsvObjects<RawFtnRow>(ftnStream)) {
    if (row.nflverse_game_id && row.nflverse_play_id) {
      ftnMap.set(`${row.nflverse_game_id}_${row.nflverse_play_id}`, row);
      ftnGameIds.add(row.nflverse_game_id);
    }
  }
  console.log(`Loaded ${ftnMap.size} FTN records across ${ftnGameIds.size} games.`);

  console.log('Downloading PBP 2026 play-by-play data...');
  const pbpStream = await downloadNflverseFile(PBP_2026_URL);

  const teamGames = new Map<NFLTeamAbbreviation, Set<string>>();
  const offAcc = new Map<NFLTeamAbbreviation, UnitStatsAccumulator>();
  const defAcc = new Map<NFLTeamAbbreviation, UnitStatsAccumulator>();
  const offRzDrives = new Map<string, RedZoneDriveTracker>(); // key: `${team}_${gameId}_${drive}`
  const defRzDrives = new Map<string, RedZoneDriveTracker>();

  const leagueOffAcc = new UnitStatsAccumulator();
  const leagueDefAcc = new UnitStatsAccumulator();
  const leagueRzDrives = new Map<string, RedZoneDriveTracker>();

  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    teamGames.set(abbr, new Set());
    offAcc.set(abbr, new UnitStatsAccumulator());
    defAcc.set(abbr, new UnitStatsAccumulator());
  }

  const gameScrimmagePlays = new Map<string, number>();
  const gameMatchedPlays = new Map<string, number>();

  for await (const row of parseCsvObjects<RawPbpRow>(pbpStream)) {
    if (row.season_type !== 'REG') continue;

    // Filter valid scrimmage plays:
    // Exclude kneels, spikes, penalties-only (no_play), 2-pt tries, special teams
    if (row.play_type !== 'pass' && row.play_type !== 'run') continue;
    if (row.qb_kneel === '1' || row.play_type === 'qb_kneel') continue;
    if (row.qb_spike === '1' || row.play_type === 'qb_spike') continue;
    if (row.two_point_attempt === '1') continue;

    if (!row.posteam || !row.defteam) continue;

    let offTeam: NFLTeamAbbreviation;
    let defTeam: NFLTeamAbbreviation;
    try {
      offTeam = mapNflverseTeam(row.posteam);
      defTeam = mapNflverseTeam(row.defteam);
    } catch {
      continue;
    }

    teamGames.get(offTeam)!.add(row.game_id);
    teamGames.get(defTeam)!.add(row.game_id);

    gameScrimmagePlays.set(row.game_id, (gameScrimmagePlays.get(row.game_id) || 0) + 1);
    const ftnKey = `${row.game_id}_${row.play_id}`;
    const ftnRow = ftnMap.get(ftnKey);
    if (ftnRow) {
      gameMatchedPlays.set(row.game_id, (gameMatchedPlays.get(row.game_id) || 0) + 1);
    }

    offAcc.get(offTeam)!.addPlay(row, ftnRow, true);
    defAcc.get(defTeam)!.addPlay(row, ftnRow, false);
    leagueOffAcc.addPlay(row, ftnRow, true);
    leagueDefAcc.addPlay(row, ftnRow, false);

    // Red zone tracking: yardline_100 <= 20
    const y100 = parseFloat(row.yardline_100);
    if (!isNaN(y100) && row.fixed_drive) {
      const offKey = `${offTeam}_${row.game_id}_${row.fixed_drive}`;
      const defKey = `${defTeam}_${row.game_id}_${row.fixed_drive}`;
      const leagueKey = `${row.game_id}_${row.fixed_drive}`;

      updateRedZoneTracker(offRzDrives, offKey, y100, row.fixed_drive_result);
      updateRedZoneTracker(defRzDrives, defKey, y100, row.fixed_drive_result);
      updateRedZoneTracker(leagueRzDrives, leagueKey, y100, row.fixed_drive_result);
    }
  }

  const games: ScrimmageGameJoin[] = Array.from(gameScrimmagePlays.entries()).map(
    ([gameId, scrimmagePlays]) => ({
      gameId,
      scrimmagePlays,
      matchedPlays: gameMatchedPlays.get(gameId) || 0,
      hasFtnRows: ftnGameIds.has(gameId),
    })
  );

  const coverage = evaluateFtnCoverage(games);

  console.log(
    `FTN join integrity: ${coverage.ftnJoinIntegrityPct.toFixed(2)}% of scrimmage plays matched ` +
      `in ${coverage.coveredGames}/${coverage.totalGames} FTN-covered games ` +
      `(${FTN_MIN_JOIN_INTEGRITY_PCT}% required).`
  );
  console.log(
    `FTN freshness: ${coverage.missingGames.count}/${coverage.totalGames} regular-season games ` +
      `(${coverage.missingGamePct.toFixed(2)}%) have no FTN rows ` +
      `(<= ${FTN_MAX_MISSING_GAME_PCT}% allowed).`
  );

  for (const warning of coverage.warnings) {
    console.warn(warning);
  }

  assertFtnCoverage(coverage);

  const teamsCurrent: Record<
    NFLTeamAbbreviation,
    { gamesPlayed: number; offense: UnitEfficiencyStats; defense: UnitEfficiencyStats }
  > = {} as any;

  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    const offRz = summarizeRedZoneDrives(offRzDrives, `${abbr}_`);
    const defRz = summarizeRedZoneDrives(defRzDrives, `${abbr}_`);
    const offense = offAcc.get(abbr)!.finalize(offRz);
    const defense = defAcc.get(abbr)!.finalize(defRz);
    const gamesPlayed = teamGames.get(abbr)!.size;

    teamsCurrent[abbr] = {
      gamesPlayed,
      offense,
      defense,
    };
  }

  const leagueOffRz = summarizeRedZoneDrives(leagueRzDrives);
  const leagueDefRz = summarizeRedZoneDrives(leagueRzDrives);
  const leagueAverage = {
    offense: leagueOffAcc.finalize(leagueOffRz),
    defense: leagueDefAcc.finalize(leagueDefRz),
  };

  return {
    teamsCurrent,
    leagueAverage,
    ftnJoinCoveragePct: round(coverage.ftnJoinCoveragePct, 2),
    ftnGamesCovered: coverage.coveredGames,
    ftnGamesMissing: coverage.missingGames,
    ftnJoinIntegrityPct: round(coverage.ftnJoinIntegrityPct, 2),
  };
}

async function compute2025PriorScheme(): Promise<Record<NFLTeamAbbreviation, TeamPriorSeasonStats>> {
  console.log('Downloading 2025 participation data...');
  const partStream = await downloadNflverseFile(PARTICIPATION_2025_URL);
  const partMap = new Map<string, RawParticipationRow>();

  for await (const row of parseCsvObjects<RawParticipationRow>(partStream)) {
    if (row.nflverse_game_id && row.play_id) {
      partMap.set(`${row.nflverse_game_id}_${row.play_id}`, row);
    }
  }
  console.log(`Loaded ${partMap.size} 2025 participation records.`);

  console.log('Downloading 2025 play-by-play data...');
  const pbpStream = await downloadNflverseFile(PBP_2025_URL);

  const teamGames = new Map<NFLTeamAbbreviation, Set<string>>();
  const teamPlays = new Map<NFLTeamAbbreviation, number>();

  // Offense personnel
  const offPersonnelCounts = new Map<NFLTeamAbbreviation, Record<PersonnelGroup, { count: number; epa: number }>>();
  // Offense formations
  const offFormationCounts = new Map<NFLTeamAbbreviation, Record<OffensiveFormationGroup, number>>();
  // Defensive fronts
  const defFrontCounts = new Map<NFLTeamAbbreviation, Record<DefensiveFrontGroup, number>>();
  // Coverage types on pass plays
  const coverageCounts = new Map<
    NFLTeamAbbreviation,
    {
      passPlaysCharted: number;
      man: number;
      zone: number;
      cover1: number;
      cover2: number;
      cover3: number;
      cover4: number;
      cover6: number;
      other: number;
    }
  >();
  // Offense vs Man and vs Zone
  const offVsCoverage = new Map<
    NFLTeamAbbreviation,
    { manPlays: number; manEpa: number; zonePlays: number; zoneEpa: number }
  >();

  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    teamGames.set(abbr, new Set());
    teamPlays.set(abbr, 0);
    offPersonnelCounts.set(abbr, {
      '11': { count: 0, epa: 0 },
      '12': { count: 0, epa: 0 },
      '21': { count: 0, epa: 0 },
      other: { count: 0, epa: 0 },
    });
    offFormationCounts.set(abbr, {
      shotgun: 0,
      under_center: 0,
      pistol: 0,
      other: 0,
    });
    defFrontCounts.set(abbr, {
      '4-3': 0,
      '3-4': 0,
      'nickel+': 0,
      other: 0,
    });
    coverageCounts.set(abbr, createEmptyCoverageCounts());
    offVsCoverage.set(abbr, { manPlays: 0, manEpa: 0, zonePlays: 0, zoneEpa: 0 });
  }

  for await (const row of parseCsvObjects<RawPbpRow>(pbpStream)) {
    if (row.season_type !== 'REG') continue;
    if (row.play_type !== 'pass' && row.play_type !== 'run') continue;
    if (row.qb_kneel === '1' || row.play_type === 'qb_kneel') continue;
    if (row.qb_spike === '1' || row.play_type === 'qb_spike') continue;
    if (row.two_point_attempt === '1') continue;

    if (!row.posteam || !row.defteam) continue;

    let offTeam: NFLTeamAbbreviation;
    let defTeam: NFLTeamAbbreviation;
    try {
      offTeam = mapNflverseTeam(row.posteam);
      defTeam = mapNflverseTeam(row.defteam);
    } catch {
      continue;
    }

    teamGames.get(offTeam)!.add(row.game_id);
    teamGames.get(defTeam)!.add(row.game_id);
    teamPlays.set(offTeam, (teamPlays.get(offTeam) || 0) + 1);

    const epa = parseFloat(row.epa) || 0;
    const isPass = row.play_type === 'pass';

    const part = partMap.get(`${row.game_id}_${row.play_id}`);
    if (part) {
      // Offensive personnel
      const pGroup = parseOffensePersonnel(part.offense_personnel);
      const offP = offPersonnelCounts.get(offTeam)![pGroup];
      offP.count++;
      offP.epa += epa;

      // Formation
      const form = normalizeFormation(part.offense_formation);
      offFormationCounts.get(offTeam)![form]++;

      // Defensive front (tracked on defTeam)
      const front = parseDefensiveFront(part.defense_personnel);
      defFrontCounts.get(defTeam)![front]++;

      // Coverage (pass plays only)
      if (isPass) {
        const mz = part.defense_man_zone_type?.trim().toUpperCase();
        const cov = part.defense_coverage_type?.trim().toUpperCase();

        if (mz || cov) {
          const covTrack = coverageCounts.get(defTeam)!;
          recordCoveragePlay(covTrack, { isPass, mz, cov });

          if (mz === 'MAN_COVERAGE') {
            const ovc = offVsCoverage.get(offTeam)!;
            ovc.manPlays++;
            ovc.manEpa += epa;
          } else if (mz === 'ZONE_COVERAGE') {
            const ovc = offVsCoverage.get(offTeam)!;
            ovc.zonePlays++;
            ovc.zoneEpa += epa;
          }
        }
      }
    }
  }

  const result: Record<NFLTeamAbbreviation, TeamPriorSeasonStats> = {} as any;

  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    const totalOffPlays = teamPlays.get(abbr) || 1;
    const offP = offPersonnelCounts.get(abbr)!;
    const p11Count = offP['11'].count;
    const p12Count = offP['12'].count;
    const p21Count = offP['21'].count;
    const otherPCount = offP.other.count;
    const totalPCharted = p11Count + p12Count + p21Count + otherPCount || 1;

    // Top two personnel groups by play count
    const pGroups: Array<{ group: PersonnelGroup; count: number; epa: number }> = [
      { group: '11', count: p11Count, epa: offP['11'].epa },
      { group: '12', count: p12Count, epa: offP['12'].epa },
      { group: '21', count: p21Count, epa: offP['21'].epa },
      { group: 'other', count: otherPCount, epa: offP.other.epa },
    ].sort((a, b) => b.count - a.count);

    const topPersonnelEpa: TopPersonnelGroupEpa[] = pGroups.slice(0, 2).map(g => ({
      group: g.group,
      share: round(g.count / totalPCharted),
      epaPerPlay: g.count > 0 ? round(g.epa / g.count) : 0,
      plays: g.count,
    }));

    // Formations
    const formCounts = offFormationCounts.get(abbr)!;
    const totalFormCharted =
      formCounts.shotgun + formCounts.under_center + formCounts.pistol + formCounts.other || 1;

    // Defensive front
    const frontCounts = defFrontCounts.get(abbr)!;
    const totalFrontCharted =
      frontCounts['4-3'] + frontCounts['3-4'] + frontCounts['nickel+'] + frontCounts.other || 1;

    // Coverage
    const cov = coverageCounts.get(abbr)!;
    const covShares = computeCoverageShares(cov);

    const ovc = offVsCoverage.get(abbr)!;

    result[abbr] = {
      season: 2025,
      gamesPlayed: teamGames.get(abbr)!.size,
      totalPlays: totalOffPlays,
      offensivePersonnel: {
        p11: { share: round(p11Count / totalPCharted), plays: p11Count },
        p12: { share: round(p12Count / totalPCharted), plays: p12Count },
        p21: { share: round(p21Count / totalPCharted), plays: p21Count },
        other: { share: round(otherPCount / totalPCharted), plays: otherPCount },
        topPersonnelEpa,
      },
      formation: {
        shotgun: { share: round(formCounts.shotgun / totalFormCharted), plays: formCounts.shotgun },
        underCenter: {
          share: round(formCounts.under_center / totalFormCharted),
          plays: formCounts.under_center,
        },
        pistol: { share: round(formCounts.pistol / totalFormCharted), plays: formCounts.pistol },
        other: { share: round(formCounts.other / totalFormCharted), plays: formCounts.other },
      },
      defensiveFront: {
        f43: { share: round(frontCounts['4-3'] / totalFrontCharted), plays: frontCounts['4-3'] },
        f34: { share: round(frontCounts['3-4'] / totalFrontCharted), plays: frontCounts['3-4'] },
        nickelPlus: {
          share: round(frontCounts['nickel+'] / totalFrontCharted),
          plays: frontCounts['nickel+'],
        },
        other: { share: round(frontCounts.other / totalFrontCharted), plays: frontCounts.other },
      },
      coverage: {
        passPlaysCharted: covShares.passPlaysCharted,
        man: covShares.man,
        zone: covShares.zone,
        cover1: covShares.cover1,
        cover2: covShares.cover2,
        cover3: covShares.cover3,
        cover4: covShares.cover4,
        cover6: covShares.cover6,
        other: covShares.other,
      },
      offenseVsCoverage: {
        vsMan: {
          epaPerPlay: ovc.manPlays > 0 ? round(ovc.manEpa / ovc.manPlays) : 0,
          plays: ovc.manPlays,
        },
        vsZone: {
          epaPerPlay: ovc.zonePlays > 0 ? round(ovc.zoneEpa / ovc.zonePlays) : 0,
          plays: ovc.zonePlays,
        },
      },
    };
  }

  return result;
}

async function check2026Participation(): Promise<boolean> {
  try {
    const res = await fetch(PARTICIPATION_2026_URL, { method: 'HEAD' });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function run(): Promise<void> {
  try {
    console.log('--- Starting NFLverse Team Stats Snapshot Pipeline ---');
    const refreshPrior = process.argv.includes('--refresh-prior');

    // 1. Current season 2026 stats
    const {
      teamsCurrent,
      leagueAverage,
      ftnJoinCoveragePct,
      ftnGamesCovered,
      ftnGamesMissing,
      ftnJoinIntegrityPct,
    } = await compute2026CurrentStats();

    // 2. Prior season 2025 scheme tendencies
    let priorSeasonByTeam: Record<NFLTeamAbbreviation, TeamPriorSeasonStats> | null = null;

    if (!refreshPrior && fs.existsSync(SNAPSHOT_PATH)) {
      try {
        const existingData: TeamStatsSnapshot = JSON.parse(
          fs.readFileSync(SNAPSHOT_PATH, 'utf-8')
        );
        const hasAllTeams = NFL_TEAM_ABBREVIATIONS.every(
          t => existingData.teams[t]?.priorSeason?.season === 2025
        );
        if (hasAllTeams) {
          console.log('Reusing cached 2025 prior scheme tendencies from existing snapshot.');
          priorSeasonByTeam = {} as Record<NFLTeamAbbreviation, TeamPriorSeasonStats>;
          for (const abbr of NFL_TEAM_ABBREVIATIONS) {
            priorSeasonByTeam[abbr] = existingData.teams[abbr].priorSeason;
          }
        }
      } catch (err) {
        console.warn('Failed to parse existing snapshot prior season, will compute from scratch.');
      }
    }

    if (!priorSeasonByTeam) {
      console.log('Computing 2025 prior scheme tendencies from 2025 pbp + participation...');
      priorSeasonByTeam = await compute2025PriorScheme();
    }

    // 3. Check for 2026 participation file
    const has2026Participation = await check2026Participation();
    if (has2026Participation) {
      console.log('pbp_participation_2026 is available! (Emitting current-season scheme splits)');
    } else {
      console.log('pbp_participation_2026 returned 404 (expected in-season). Scheme relies on 2025 prior.');
    }

    // 4. Assemble final snapshot
    const teamsObj: Record<NFLTeamAbbreviation, TeamUnitSnapshot> = {} as any;
    for (const abbr of NFL_TEAM_ABBREVIATIONS) {
      const cur = teamsCurrent[abbr];
      const prior = priorSeasonByTeam[abbr];
      teamsObj[abbr] = {
        team: abbr,
        current: {
          season: 2026,
          gamesPlayed: cur.gamesPlayed,
          offense: cur.offense,
          defense: cur.defense,
        },
        priorSeason: prior,
      };
    }

    const snapshot: TeamStatsSnapshot = {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      season: 2026,
      dataAttribution: DATA_ATTRIBUTION,
      ftnJoinCoveragePct,
      ftnGamesCovered,
      ftnGamesMissing,
      ftnJoinIntegrityPct,
      leagueAverage,
      teams: teamsObj,
    };

    // 5. Validate snapshot
    console.log('Validating compiled snapshot...');
    assertValidTeamStats(snapshot);
    console.log('Snapshot validation passed successfully.');

    // 6. Compare data with existing snapshot (ignoring fetchedAt)
    if (fs.existsSync(SNAPSHOT_PATH)) {
      try {
        const existingRaw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
        const existingSnapshot = JSON.parse(existingRaw);

        const compareA = { ...existingSnapshot, fetchedAt: '' };
        const compareB = { ...snapshot, fetchedAt: '' };

        if (JSON.stringify(compareA) === JSON.stringify(compareB)) {
          console.log('No data change detected compared to existing snapshot. Leaving file untouched.');
          return;
        }
      } catch {
        // Overwrite if existing file invalid
      }
    }

    // 7. Enforce size limit
    const jsonString = JSON.stringify(snapshot);
    const sizeBytes = Buffer.byteLength(jsonString, 'utf-8');
    console.log(`Snapshot size: ${sizeBytes} bytes (${(sizeBytes / 1024).toFixed(2)} KB).`);

    if (sizeBytes > MAX_SNAPSHOT_SIZE_BYTES || sizeBytes >= 250000) {
      console.error(
        `Snapshot size ${sizeBytes} bytes exceeds strict 250 KB ceiling (${MAX_SNAPSHOT_SIZE_BYTES} bytes).`
      );
      process.exit(1);
    }

    // 8. Write to disk
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, jsonString, 'utf-8');
    console.log(`Successfully wrote team stats snapshot to ${SNAPSHOT_PATH}`);
  } catch (err: any) {
    console.error('fetch-team-stats pipeline failed:', err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}
