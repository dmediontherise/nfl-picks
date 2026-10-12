import {
  DATA_ATTRIBUTION,
  NFL_TEAM_ABBREVIATIONS,
  NFLTeamAbbreviation,
  TeamStatsSnapshot,
  TeamUnitSnapshot,
  assertValidTeamStats,
  isReliable,
  loadTeamStats,
  mapNflverseTeam,
  normalizeFormation,
  parseDefensiveFront,
  parseOffensePersonnel,
  validateTeamStats,
} from '../teamStats';
import {
  computeCoverageShares,
  createEmptyCoverageCounts,
  recordCoveragePlay,
  summarizeRedZoneDrives,
  updateRedZoneTracker,
} from '../../../scripts/lib/nflverse';

function createValidTeamUnit(abbr: NFLTeamAbbreviation, gamesPlayed = 4): TeamUnitSnapshot {
  return {
    team: abbr,
    current: {
      season: 2026,
      gamesPlayed,
      offense: {
        epaPerPlay: 0.05,
        successRate: 0.45,
        totalPlays: 250,
        pass: {
          epaPerPlay: 0.12,
          successRate: 0.48,
          yardsPerAttempt: 7.2,
          attempts: 140,
          plays: 150,
        },
        rush: {
          epaPerPlay: -0.04,
          successRate: 0.41,
          yardsPerCarry: 4.3,
          carries: 95,
          plays: 100,
        },
        sackRate: 0.06,
        sacks: 9,
        qbHitRate: 0.14,
        qbHits: 21,
        dropbacks: 150,
        thirdDownConversion: 0.4,
        thirdDownAttempts: 50,
        thirdDownConversions: 20,
        turnovers: 4,
        redZone: {
          trips: 12,
          touchdowns: 7,
          fieldGoals: 3,
          tdRate: 0.5833,
          pointsPerTrip: 4.8333,
          goalToGoEpaPerPlay: 0.18,
          goalToGoPlays: 15,
        },
        ftn: {
          blitzRate: 0.28,
          blitzPlays: 42,
          playActionRate: 0.22,
          playActionPlays: 33,
          motionRate: 0.55,
          motionPlays: 138,
          box8PlusRate: 0.16,
          box8PlusPlays: 40,
          ftnPlays: 250,
        },
      },
      defense: {
        epaPerPlay: -0.02,
        successRate: 0.42,
        totalPlays: 245,
        pass: {
          epaPerPlay: 0.01,
          successRate: 0.44,
          yardsPerAttempt: 6.8,
          attempts: 135,
          plays: 145,
        },
        rush: {
          epaPerPlay: -0.06,
          successRate: 0.39,
          yardsPerCarry: 4.0,
          carries: 90,
          plays: 100,
        },
        sackRate: 0.07,
        sacks: 10,
        qbHitRate: 0.16,
        qbHits: 24,
        dropbacks: 145,
        thirdDownConversion: 0.36,
        thirdDownAttempts: 50,
        thirdDownConversions: 18,
        turnovers: 5,
        redZone: {
          trips: 11,
          touchdowns: 5,
          fieldGoals: 4,
          tdRate: 0.4545,
          pointsPerTrip: 4.2727,
          goalToGoEpaPerPlay: 0.05,
          goalToGoPlays: 12,
        },
        ftn: {
          blitzRate: 0.31,
          blitzPlays: 45,
          playActionRate: 0.19,
          playActionPlays: 28,
          motionRate: 0.52,
          motionPlays: 127,
          box8PlusRate: 0.18,
          box8PlusPlays: 44,
          ftnPlays: 245,
        },
      },
    },
    priorSeason: {
      season: 2025,
      gamesPlayed: 17,
      totalPlays: 1050,
      offensivePersonnel: {
        p11: { share: 0.62, plays: 651 },
        p12: { share: 0.22, plays: 231 },
        p21: { share: 0.08, plays: 84 },
        other: { share: 0.08, plays: 84 },
        topPersonnelEpa: [
          { group: '11', share: 0.62, epaPerPlay: 0.08, plays: 651 },
          { group: '12', share: 0.22, epaPerPlay: 0.02, plays: 231 },
        ],
      },
      formation: {
        shotgun: { share: 0.68, plays: 714 },
        underCenter: { share: 0.28, plays: 294 },
        pistol: { share: 0.03, plays: 31 },
        other: { share: 0.01, plays: 11 },
      },
      defensiveFront: {
        f43: { share: 0.15, plays: 157 },
        f34: { share: 0.12, plays: 126 },
        nickelPlus: { share: 0.65, plays: 683 },
        other: { share: 0.08, plays: 84 },
      },
      coverage: {
        passPlaysCharted: 580,
        man: { share: 0.32, plays: 186 },
        zone: { share: 0.68, plays: 394 },
        cover1: { share: 0.24, plays: 139 },
        cover2: { share: 0.14, plays: 81 },
        cover3: { share: 0.36, plays: 209 },
        cover4: { share: 0.12, plays: 70 },
        cover6: { share: 0.08, plays: 46 },
        other: { share: 0.06, plays: 35 },
      },
      offenseVsCoverage: {
        vsMan: { epaPerPlay: 0.11, plays: 180 },
        vsZone: { epaPerPlay: 0.04, plays: 390 },
      },
    },
  };
}

function createValidSnapshot(): TeamStatsSnapshot {
  const teams: Record<NFLTeamAbbreviation, TeamUnitSnapshot> = {} as any;
  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    teams[abbr] = createValidTeamUnit(abbr);
  }
  const sampleUnit = teams.KC.current.offense;
  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    season: 2026,
    dataAttribution: DATA_ATTRIBUTION,
    ftnJoinCoveragePct: 98.4,
    leagueAverage: {
      offense: sampleUnit,
      defense: sampleUnit,
    },
    teams,
  };
}

describe('Team Stats Snapshot Data Layer', () => {
  describe('Requirement 1 & 10: Abbreviation Mapping', () => {
    it('covers all 32 NFL canonical team abbreviations', () => {
      expect(NFL_TEAM_ABBREVIATIONS).toHaveLength(32);
      for (const abbr of NFL_TEAM_ABBREVIATIONS) {
        expect(mapNflverseTeam(abbr)).toBe(abbr);
      }
    });

    it('correctly maps nflverse aliases to app canonical abbreviations', () => {
      expect(mapNflverseTeam('LA')).toBe('LAR');
      expect(mapNflverseTeam('LAR')).toBe('LAR');
      expect(mapNflverseTeam('WAS')).toBe('WSH');
      expect(mapNflverseTeam('WSH')).toBe('WSH');
      expect(mapNflverseTeam('JAC')).toBe('JAX');
      expect(mapNflverseTeam('JAX')).toBe('JAX');
      expect(mapNflverseTeam('OAK')).toBe('LV');
      expect(mapNflverseTeam('SD')).toBe('LAC');
      expect(mapNflverseTeam('STL')).toBe('LAR');
    });

    it('fails loudly with an Error for unknown abbreviations', () => {
      expect(() => mapNflverseTeam('XYZ')).toThrow(/Unknown \/ unmapped NFL team abbreviation/);
      expect(() => mapNflverseTeam('')).toThrow(/Unknown \/ unmapped NFL team abbreviation/);
      expect(() => mapNflverseTeam('NFC')).toThrow(/Unknown \/ unmapped NFL team abbreviation/);
    });
  });

  describe('Requirement 2 & 10: Red-Zone Trip Counting', () => {
    it('counts two plays inside the 20 on the same drive as exactly ONE trip', () => {
      // Hand-built drive fixture:
      // Drive 1: play 1 at yardline 18, play 2 at yardline 5 -> ends with Touchdown
      // Drive 2: play 1 at yardline 45, play 2 at yardline 30 -> outside 20 -> 0 trips
      // Drive 3: play 1 at yardline 12 -> ends with Field goal
      const rawDrives = [
        { gameId: 'g1', fixedDrive: '1', yardline100: 18, result: 'Touchdown' },
        { gameId: 'g1', fixedDrive: '1', yardline100: 5, result: 'Touchdown' },
        { gameId: 'g1', fixedDrive: '2', yardline100: 45, result: 'Punt' },
        { gameId: 'g1', fixedDrive: '2', yardline100: 30, result: 'Punt' },
        { gameId: 'g1', fixedDrive: '3', yardline100: 12, result: 'Field goal' },
      ];

      const drivesMap = new Map();
      rawDrives.forEach(p =>
        updateRedZoneTracker(drivesMap, `${p.gameId}_${p.fixedDrive}`, p.yardline100, p.result)
      );

      const rz = summarizeRedZoneDrives(drivesMap);

      expect(rz.trips).toBe(2); // Drive 1 and Drive 3 (Drive 1 had 2 plays, counted once)
      expect(rz.touchdowns).toBe(1);
      expect(rz.fieldGoals).toBe(1);
      expect(rz.tdRate).toBe(0.5);
      expect(rz.pointsPerTrip).toBe(5.0);
    });
  });

  describe('Requirement 3 & 10: Personnel Grouping', () => {
    it('correctly maps standard personnel strings', () => {
      expect(parseOffensePersonnel('1 RB, 1 TE, 3 WR')).toBe('11');
      expect(parseOffensePersonnel('1 RB, 2 TE, 2 WR')).toBe('12');
      expect(parseOffensePersonnel('2 RB, 1 TE, 2 WR')).toBe('21');
    });

    it('treats Fullback as a running back for 21 personnel', () => {
      expect(parseOffensePersonnel('1 FB, 1 RB, 1 TE, 2 WR')).toBe('21');
      expect(parseOffensePersonnel('1 FB, 0 RB, 2 TE, 2 WR')).toBe('12');
      expect(parseOffensePersonnel('1 FB, 0 RB, 1 TE, 3 WR')).toBe('11');
    });

    it('classifies other personnel combinations as other', () => {
      expect(parseOffensePersonnel('0 RB, 1 TE, 4 WR')).toBe('other');
      expect(parseOffensePersonnel('1 RB, 3 TE, 1 WR')).toBe('other');
      expect(parseOffensePersonnel('2 RB, 2 TE, 1 WR')).toBe('other');
      expect(parseOffensePersonnel('')).toBe('other');
      expect(parseOffensePersonnel(null)).toBe('other');
    });
  });

  describe('Requirement 3 & 10: Defensive Front Classification Proxy', () => {
    it('classifies 5 or more defensive backs as nickel+', () => {
      // 5 DBs (3 CB, 1 FS, 1 SS) + 4 DL + 2 LB
      expect(
        parseDefensiveFront('3 CB, 2 DT, 2 DE, 1 FS, 1 SS, 2 ILB')
      ).toBe('nickel+');

      // 6 DBs (dime package)
      expect(
        parseDefensiveFront('4 CB, 1 FS, 1 SS, 3 DL, 2 LB')
      ).toBe('nickel+');
    });

    it('classifies 4 DL and 3 LB as 4-3 front', () => {
      // 4 DL (2 DE, 2 DT) + 3 LB (2 OLB, 1 MLB) + 4 DB (2 CB, 2 S)
      expect(
        parseDefensiveFront('2 DE, 2 DT, 2 OLB, 1 MLB, 2 CB, 1 FS, 1 SS')
      ).toBe('4-3');
    });

    it('classifies 3 DL and 4 LB as 3-4 front', () => {
      // 3 DL (2 DE, 1 NT) + 4 LB (2 OLB, 2 ILB) + 4 DB (2 CB, 2 S)
      expect(
        parseDefensiveFront('2 DE, 1 NT, 2 OLB, 2 ILB, 2 CB, 1 FS, 1 SS')
      ).toBe('3-4');
    });

    it('classifies unusual fronts (goal line, heavy) as other', () => {
      // Goal line heavy: 5 DL, 3 LB, 3 DB
      expect(parseDefensiveFront('3 DT, 2 DE, 3 MLB, 2 CB, 1 FS')).toBe('other');
      expect(parseDefensiveFront('')).toBe('other');
      expect(parseDefensiveFront(null)).toBe('other');
    });
  });

  describe('Requirement 3 & 10: Coverage Shares Over Pass Plays Only', () => {
    it('computes coverage and man/zone shares over pass plays only', () => {
      // Fixture of plays with charted coverage:
      // Play 1: pass, ZONE_COVERAGE, COVER_3
      // Play 2: pass, MAN_COVERAGE, COVER_1
      // Play 3: run (must be ignored, even if charted with coverage)
      // Play 4: pass, ZONE_COVERAGE, COVER_2
      const plays = [
        { isPass: true, mz: 'ZONE_COVERAGE', cov: 'COVER_3' },
        { isPass: true, mz: 'MAN_COVERAGE', cov: 'COVER_1' },
        { isPass: false, mz: 'ZONE_COVERAGE', cov: 'COVER_3' },
        { isPass: true, mz: 'ZONE_COVERAGE', cov: 'COVER_2' },
      ];

      const counts = createEmptyCoverageCounts();
      plays.forEach(p => recordCoveragePlay(counts, p));

      const shares = computeCoverageShares(counts);

      expect(shares.passPlaysCharted).toBe(3);
      expect(shares.man.share).toBeCloseTo(1 / 3, 4);
      expect(shares.zone.share).toBeCloseTo(2 / 3, 4);
      expect(shares.cover1.share).toBeCloseTo(1 / 3, 4);
      expect(shares.cover2.share).toBeCloseTo(1 / 3, 4);
      expect(shares.cover3.share).toBeCloseTo(1 / 3, 4);
    });
  });

  describe('Requirement 4 & 10: Validation Rejects Malformed Cases', () => {
    it('accepts a valid snapshot payload', () => {
      const snap = createValidSnapshot();
      const res = validateTeamStats(snap);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(() => assertValidTeamStats(snap)).not.toThrow();
    });

    it('rejects null or non-object payloads', () => {
      expect(validateTeamStats(null).valid).toBe(false);
      expect(validateTeamStats(undefined).valid).toBe(false);
      expect(validateTeamStats('snapshot').valid).toBe(false);
    });

    it('rejects wrong schemaVersion', () => {
      const snap: any = createValidSnapshot();
      snap.schemaVersion = 2;
      expect(validateTeamStats(snap).valid).toBe(false);
      snap.schemaVersion = 0;
      expect(validateTeamStats(snap).valid).toBe(false);
    });

    it('rejects missing or empty fetchedAt', () => {
      const snap: any = createValidSnapshot();
      snap.fetchedAt = '';
      expect(validateTeamStats(snap).valid).toBe(false);
      delete snap.fetchedAt;
      expect(validateTeamStats(snap).valid).toBe(false);
    });

    it('rejects missing teams object or missing team key', () => {
      const snap: any = createValidSnapshot();
      delete snap.teams.KC;
      const res = validateTeamStats(snap);
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('Missing team: KC'))).toBe(true);
    });

    it('rejects non-finite numbers (NaN, Infinity, -Infinity)', () => {
      const snap: any = createValidSnapshot();
      snap.teams.BUF.current.offense.epaPerPlay = NaN;
      expect(validateTeamStats(snap).valid).toBe(false);

      const snap2: any = createValidSnapshot();
      snap2.teams.BAL.priorSeason.offensivePersonnel.p11.share = Infinity;
      expect(validateTeamStats(snap2).valid).toBe(false);
    });

    it('rejects invalid priorSeason season (not 2025)', () => {
      const snap: any = createValidSnapshot();
      snap.teams.SF.priorSeason.season = 2024;
      const res = validateTeamStats(snap);
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('expected 2025'))).toBe(true);
    });
  });

  describe('Requirement 039-3: FTN coverage metadata validation', () => {
    it('accepts a snapshot that carries the new FTN coverage metadata', () => {
      const snap: any = createValidSnapshot();
      snap.ftnGamesCovered = 8;
      snap.ftnGamesMissing = { count: 1, gameIds: ['2026_05_KC_BAL'] };
      snap.ftnJoinIntegrityPct = 100;

      const res = validateTeamStats(snap);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('still accepts an older snapshot without the new FTN metadata', () => {
      const snap: any = createValidSnapshot();
      expect('ftnGamesCovered' in snap).toBe(false);
      expect('ftnGamesMissing' in snap).toBe(false);
      expect('ftnJoinIntegrityPct' in snap).toBe(false);

      const res = validateTeamStats(snap);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects malformed FTN coverage metadata when present', () => {
      const badCovered: any = createValidSnapshot();
      badCovered.ftnGamesCovered = 'eight';
      expect(validateTeamStats(badCovered).valid).toBe(false);

      const badMissing: any = createValidSnapshot();
      badMissing.ftnGamesMissing = { count: 1 };
      expect(validateTeamStats(badMissing).valid).toBe(false);

      const badIntegrity: any = createValidSnapshot();
      badIntegrity.ftnJoinIntegrityPct = NaN;
      expect(validateTeamStats(badIntegrity).valid).toBe(false);
    });

    it('rejects a non-numeric integrity pct, a negative missing count, and non-string game ids', () => {
      const badIntegrityType: any = createValidSnapshot();
      badIntegrityType.ftnJoinIntegrityPct = 'high';
      expect(validateTeamStats(badIntegrityType).valid).toBe(false);

      const negativeCount: any = createValidSnapshot();
      negativeCount.ftnGamesMissing = { count: -1, gameIds: [] };
      expect(validateTeamStats(negativeCount).valid).toBe(false);

      const nonStringIds: any = createValidSnapshot();
      nonStringIds.ftnGamesMissing = { count: 1, gameIds: [5] };
      expect(validateTeamStats(nonStringIds).valid).toBe(false);
    });

    it('rejects a negative ftnGamesCovered', () => {
      const negativeCovered: any = createValidSnapshot();
      negativeCovered.ftnGamesCovered = -5;
      const res = validateTeamStats(negativeCovered);
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('ftnGamesCovered'))).toBe(true);
    });
  });

  describe('Requirement 4 & 10: isReliable Boundary at 2/3 Games', () => {
    it('returns false when current gamesPlayed is below 3 (e.g. 2)', () => {
      const team = createValidTeamUnit('GB', 2);
      expect(isReliable(team)).toBe(false);
    });

    it('returns true when current gamesPlayed is 3 or more with adequate prior plays', () => {
      const team3 = createValidTeamUnit('GB', 3);
      expect(isReliable(team3)).toBe(true);

      const team4 = createValidTeamUnit('GB', 4);
      expect(isReliable(team4)).toBe(true);
    });

    it('returns false when prior totalPlays is below minimum threshold', () => {
      const team = createValidTeamUnit('GB', 4);
      team.priorSeason.totalPlays = 50; // Below 100 default
      expect(isReliable(team)).toBe(false);
    });
  });

  describe('Requirement 4 & 10: Loader Staleness and Safety', () => {
    it('returns isStale: false for fresh data within staleness window', () => {
      const now = Date.now();
      const snap = createValidSnapshot();
      snap.fetchedAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days old

      const result = loadTeamStats(snap, { now, stalenessThresholdDays: 7 });
      expect(result.snapshot).not.toBeNull();
      expect(result.isStale).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('returns isStale: true without throwing for data older than staleness window', () => {
      const now = Date.now();
      const snap = createValidSnapshot();
      snap.fetchedAt = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days old

      const result = loadTeamStats(snap, { now, stalenessThresholdDays: 7 });
      expect(result.snapshot).not.toBeNull();
      expect(result.isStale).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('never throws into caller on invalid data, safely returning null snapshot and errors', () => {
      const corruptData = { schemaVersion: 99 };
      const result = loadTeamStats(corruptData);
      expect(result.snapshot).toBeNull();
      expect(result.isStale).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Requirement 9: Data Attribution Constant', () => {
    it('exports DATA_ATTRIBUTION referencing nflverse and FTN Data CC-BY-SA 4.0', () => {
      expect(DATA_ATTRIBUTION).toContain('nflverse');
      expect(DATA_ATTRIBUTION).toContain('FTN Data');
      expect(DATA_ATTRIBUTION).toContain('CC-BY-SA 4.0');
    });
  });
});
