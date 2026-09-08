import fs from 'fs';
import path from 'path';
import {
  InjuryStatus,
  NFL_TEAM_ABBREVIATIONS,
  OBSERVED_INJURY_STATUSES,
  RawRosterSnapshot,
  RosterPlayer,
  TeamSnapshot,
  assertValidSnapshot,
  detectDisplacedStarters,
  diffRosters,
  getStarterAtPosition,
  getTeamInjuries,
  loadRosterSnapshot,
  validateSnapshot,
} from '../rosterSnapshot';

const SNAPSHOT_PATH = path.resolve(__dirname, '../rosterSnapshot.json');

describe('Roster Snapshot Pipeline', () => {
  describe('Requirement 2: Committed snapshot file size and headroom', () => {
    it('exists and is strictly within 80% headroom of the 250KB ceiling', () => {
      expect(fs.existsSync(SNAPSHOT_PATH)).toBe(true);
      const stat = fs.statSync(SNAPSHOT_PATH);
      const sizeBytes = stat.size;
      const ceilingBytes = 250 * 1024; // 256,000 bytes
      const maxHeadroomBytes = Math.floor(ceilingBytes * 0.8); // 204,800 bytes (80% of ceiling)
      const marginBytes = maxHeadroomBytes - sizeBytes;
      const marginPct = ((1 - sizeBytes / ceilingBytes) * 100).toFixed(2);

      if (sizeBytes > maxHeadroomBytes) {
        throw new Error(
          `Snapshot size ${sizeBytes} bytes exceeds 80% ceiling limit of ${maxHeadroomBytes} bytes. Current margin: ${marginBytes} bytes (${marginPct}% total ceiling headroom)`
        );
      }

      expect(sizeBytes).toBeLessThanOrEqual(maxHeadroomBytes);
      expect(sizeBytes).toBeGreaterThan(50 * 1024); // Reasonable lower bound
    });
  });

  describe('Requirement 1: Commentary omitted for active or uninjured players', () => {
    it('omits shortComment key entirely for Active or uninjured players, but retains it for injury statuses', () => {
      expect(fs.existsSync(SNAPSHOT_PATH)).toBe(true);
      const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
      const commentEligibleStatuses = new Set([
        'Out',
        'Doubtful',
        'Questionable',
        'Injured Reserve',
        'Suspension',
      ]);

      let injuryCommentCount = 0;
      let activeOrNoStatusPlayerCount = 0;

      for (const [, teamData] of Object.entries(raw.teams as Record<string, any>)) {
        for (const [, players] of Object.entries(teamData as Record<string, any[]>)) {
          if (!Array.isArray(players)) continue;
          for (const p of players) {
            if (!p.status || p.status === 'Active') {
              activeOrNoStatusPlayerCount++;
              expect('shortComment' in p).toBe(false);
            } else if (commentEligibleStatuses.has(p.status)) {
              if ('shortComment' in p) {
                expect(typeof p.shortComment).toBe('string');
                expect(p.shortComment.trim().length).toBeGreaterThan(0);
                injuryCommentCount++;
              }
            }
          }
        }
      }

      expect(activeOrNoStatusPlayerCount).toBeGreaterThan(1500);
      expect(injuryCommentCount).toBeGreaterThan(100);
    });
  });

  describe('Requirement 3: Typed schema and loader', () => {
    it('loads snapshot with valid schemaVersion, fetchedAt, and all 32 teams', () => {
      const snapshot = loadRosterSnapshot();

      expect(snapshot.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(typeof snapshot.fetchedAt).toBe('string');
      expect(new Date(snapshot.fetchedAt).toString()).not.toBe('Invalid Date');

      const loadedTeams = Object.keys(snapshot.teams);
      expect(loadedTeams).toHaveLength(32);

      for (const abbr of NFL_TEAM_ABBREVIATIONS) {
        expect(snapshot.teams[abbr]).toBeDefined();
        expect(snapshot.teams[abbr].roster.length).toBeGreaterThan(0);
        expect(snapshot.teams[abbr].groups.offense).toBeDefined();
        expect(snapshot.teams[abbr].groups.defense).toBeDefined();
      }
    });

    it('populates normalized player fields and depth chart ranks correctly', () => {
      const snapshot = loadRosterSnapshot();
      const kc = snapshot.teams.KC;
      expect(kc).toBeDefined();

      const qb = getStarterAtPosition(kc, 'QB');
      expect(qb).toBeDefined();
      expect(qb?.name).toBe('Patrick Mahomes');
      expect(qb?.depthChartRank).toBe(1);
      expect(qb?.rank).toBe(1);
      expect(qb?.group).toBe('offense');
    });

    it('filters team injuries correctly', () => {
      const snapshot = loadRosterSnapshot();
      const kc = snapshot.teams.KC;
      const injuries = getTeamInjuries(kc);

      expect(injuries.length).toBeGreaterThan(0);
      for (const inj of injuries) {
        expect(inj.status).toBeDefined();
        expect(OBSERVED_INJURY_STATUSES.has(inj.status!)).toBe(true);
      }
    });
  });

  describe('Requirement 7: Validation and bad fetch rejection', () => {
    const createValidDummySnapshot = (): any => {
      const teams: Record<string, any> = {};
      for (const abbr of NFL_TEAM_ABBREVIATIONS) {
        teams[abbr] = {
          offense: [
            { name: `${abbr} Player 1`, position: 'QB', rank: 1, status: 'Active' },
          ],
          defense: [
            { name: `${abbr} Player 2`, position: 'DE', rank: 1 },
          ],
        };
      }
      return {
        schemaVersion: 1,
        fetchedAt: new Date().toISOString(),
        teams,
        transactions: [],
      };
    };

    it('passes validation on a complete and valid snapshot', () => {
      const valid = createValidDummySnapshot();
      const result = validateSnapshot(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(() => assertValidSnapshot(valid)).not.toThrow();
    });

    it('rejects a truncated payload missing teams', () => {
      const truncated = createValidDummySnapshot();
      delete truncated.teams.KC;
      delete truncated.teams.SF;

      const result = validateSnapshot(truncated);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing team: KC');
      expect(result.errors).toContain('Missing team: SF');
      expect(() => assertValidSnapshot(truncated)).toThrow(/Missing team: KC/);
    });

    it('rejects a snapshot where a team has an empty roster', () => {
      const invalid = createValidDummySnapshot();
      invalid.teams.BUF = { offense: [], defense: [] };

      const result = validateSnapshot(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Team BUF has an empty roster');
      expect(() => assertValidSnapshot(invalid)).toThrow(/Team BUF has an empty roster/);
    });

    it('rejects an injury record with an unobserved status', () => {
      const invalid = createValidDummySnapshot();
      invalid.teams.MIA.offense[0].status = 'Probable'; // Not in observed set

      const result = validateSnapshot(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid injury status: "Probable"'))).toBe(true);
      expect(() => assertValidSnapshot(invalid)).toThrow(/invalid injury status/);
    });

    it('rejects invalid or missing top-level fields', () => {
      expect(validateSnapshot(null).valid).toBe(false);
      expect(validateSnapshot({}).valid).toBe(false);
      expect(validateSnapshot({ schemaVersion: 0, fetchedAt: 'abc', teams: {} }).valid).toBe(false);
    });
  });

  describe('Requirement 4: Roster diffing and transaction detection', () => {
    const baseSnapshot: RawRosterSnapshot = {
      schemaVersion: 1,
      fetchedAt: '2026-09-07T00:00:00.000Z',
      teams: {
        KC: {
          offense: [
            { name: 'Patrick Mahomes', position: 'QB' },
            { name: 'Travis Kelce', position: 'TE' },
            { name: 'Isiah Pacheco', position: 'RB' },
          ],
        },
        BUF: {
          offense: [
            { name: 'Josh Allen', position: 'QB' },
            { name: 'Stefon Diggs', position: 'WR' },
          ],
        },
      },
      transactions: [],
    };

    it('emits empty array on first run when prior snapshot is null or undefined', () => {
      expect(diffRosters(null, baseSnapshot.teams)).toEqual([]);
      expect(diffRosters(undefined, baseSnapshot.teams)).toEqual([]);
    });

    it('emits empty array when rosters are unchanged', () => {
      const txs = diffRosters(baseSnapshot, baseSnapshot.teams);
      expect(txs).toEqual([]);
    });

    it('detects a moved player when group changes on same team (e.g. offense to IR)', () => {
      const updatedTeams = {
        KC: {
          offense: [
            { name: 'Patrick Mahomes', position: 'QB' },
            { name: 'Travis Kelce', position: 'TE' },
          ],
          injuredReserveOrOut: [
            { name: 'Isiah Pacheco', position: 'RB' },
          ],
        },
        BUF: baseSnapshot.teams.BUF,
      };

      const txs = diffRosters(baseSnapshot, updatedTeams);
      expect(txs).toHaveLength(1);
      expect(txs[0]).toEqual({
        type: 'moved',
        playerName: 'Isiah Pacheco',
        position: 'RB',
        team: 'KC',
        fromGroup: 'offense',
        toGroup: 'injuredReserveOrOut',
      });
    });

    it('detects a trade when a player moves to another team', () => {
      const updatedTeams = {
        KC: {
          offense: [
            { name: 'Patrick Mahomes', position: 'QB' },
            { name: 'Travis Kelce', position: 'TE' },
            { name: 'Isiah Pacheco', position: 'RB' },
            { name: 'Stefon Diggs', position: 'WR' }, // Moved from BUF to KC
          ],
        },
        BUF: {
          offense: [
            { name: 'Josh Allen', position: 'QB' },
          ],
        },
      };

      const txs = diffRosters(baseSnapshot, updatedTeams);
      expect(txs).toHaveLength(1);
      expect(txs[0]).toEqual({
        type: 'moved',
        playerName: 'Stefon Diggs',
        position: 'WR',
        fromTeam: 'BUF',
        toTeam: 'KC',
        fromGroup: 'offense',
        toGroup: 'offense',
      });
    });

    it('detects a release when a player is absent entirely from all teams', () => {
      const updatedTeams = {
        KC: {
          offense: [
            { name: 'Patrick Mahomes', position: 'QB' },
            { name: 'Travis Kelce', position: 'TE' },
            // Isiah Pacheco released
          ],
        },
        BUF: baseSnapshot.teams.BUF,
      };

      const txs = diffRosters(baseSnapshot, updatedTeams);
      expect(txs).toHaveLength(1);
      expect(txs[0]).toEqual({
        type: 'removed',
        playerName: 'Isiah Pacheco',
        position: 'RB',
        team: 'KC',
        fromTeam: 'KC',
        fromGroup: 'offense',
      });
    });

    it('detects an addition when a player is newly added to a team', () => {
      const updatedTeams = {
        KC: {
          offense: [
            { name: 'Patrick Mahomes', position: 'QB' },
            { name: 'Travis Kelce', position: 'TE' },
            { name: 'Isiah Pacheco', position: 'RB' },
            { name: 'Xavier Worthy', position: 'WR' }, // New rookie/signing
          ],
        },
        BUF: baseSnapshot.teams.BUF,
      };

      const txs = diffRosters(baseSnapshot, updatedTeams);
      expect(txs).toHaveLength(1);
      expect(txs[0]).toEqual({
        type: 'added',
        playerName: 'Xavier Worthy',
        position: 'WR',
        team: 'KC',
        toTeam: 'KC',
        toGroup: 'offense',
      });
    });
  });

  describe('Task 018: Displaced starter detection', () => {
    const p = (name: string, position: string, depthChartRank?: number, status?: InjuryStatus, previousRank?: number): RosterPlayer => ({
      name,
      position,
      group: 'offense',
      depthChartRank,
      rank: depthChartRank,
      status,
      previousRank,
    });

    const teamOf = (roster: RosterPlayer[]): TeamSnapshot => ({ roster, groups: {} });

    it('R3: flags the unavailable player directly behind the healthy starter (ATL shape)', () => {
      const team = teamOf([
        p('Tua Tagovailoa', 'QB', 1, 'Active'),
        p('Michael Penix Jr.', 'QB', 2, 'Out'),
        p('Cooper Rush', 'QB', 3),
      ]);

      const displaced = detectDisplacedStarters(team);
      expect(displaced.has('Michael Penix Jr.')).toBe(true);
      expect(displaced.has('Tua Tagovailoa')).toBe(false);
    });

    it('R3: a rank-4 QB on IR behind three healthy QBs is not displaced', () => {
      const team = teamOf([
        p('QB1', 'QB', 1, 'Active'),
        p('QB2', 'QB', 2),
        p('QB3', 'QB', 3),
        p('QB4', 'QB', 4, 'Injured Reserve'),
      ]);

      expect(detectDisplacedStarters(team).size).toBe(0);
    });

    it('R3: Questionable is not an absence, so a rank-2 Questionable QB is not displaced', () => {
      const team = teamOf([
        p('QB1', 'QB', 1, 'Active'),
        p('QB2', 'QB', 2, 'Questionable'),
      ]);

      expect(detectDisplacedStarters(team).size).toBe(0);
    });

    it('R3: names only the single best-ranked unavailable player per position group', () => {
      const team = teamOf([
        p('QB1', 'QB', 1, 'Active'),
        p('QB2', 'QB', 2, 'Out'),
        p('QB3', 'QB', 3, 'Out'),
      ]);

      const displaced = detectDisplacedStarters(team);
      expect(displaced.size).toBe(1);
      expect(displaced.has('QB2')).toBe(true);
    });

    it('R3: with no available player carrying a rank, nothing is displaced', () => {
      const team = teamOf([
        p('QB1', 'QB', 1, 'Out'),
        p('QB2', 'QB', 2, 'Out'),
      ]);

      expect(detectDisplacedStarters(team).size).toBe(0);
    });

    it('R2: previousRank 1 is history, not a guess, even where the rank heuristic would not fire', () => {
      const team = teamOf([
        p('QB1', 'QB', 1, 'Active'),
        p('QB2', 'QB', 2, 'Active'),
        p('QB3', 'QB', 3, 'Out', 1),
      ]);

      const displaced = detectDisplacedStarters(team);
      expect(displaced.has('QB3')).toBe(true);
    });

    it('R2: a backup-history player (previousRank 2) out below the starter is still caught by the R3 fallback on a cold snapshot', () => {
      // This is the documented false-positive class of R3: without a
      // displacement-proving previousRank of 1, a rank-2 unavailable player
      // directly behind the rank-1 starter is treated as displaced.
      const team = teamOf([
        p('QB1', 'QB', 1, 'Active'),
        p('QB2', 'QB', 2, 'Out', 2),
      ]);

      const displaced = detectDisplacedStarters(team);
      expect(displaced.has('QB2')).toBe(true);
    });
  });

  describe('Task 023: Roster snapshot loader robustness', () => {
    const buildFixture = (): RawRosterSnapshot => {
      const teams: Record<string, any> = {};
      for (const abbr of NFL_TEAM_ABBREVIATIONS) {
        teams[abbr] = {
          offense: [{ name: `${abbr} Starter QB`, position: 'QB', rank: 1, status: 'Active' }],
          defense: [{ name: `${abbr} Edge Defender`, position: 'DE', rank: 1, status: 'Active' }],
        };
      }

      // Group-keyed team shape (exercises the groups loader branch at rosterSnapshot.ts:406-431)
      teams.KC = {
        offense: [{ name: 'Patrick Mahomes', position: 'QB', rank: 1, status: 'Active' }],
        injuredReserveOrOut: [
          {
            name: 'Isiah Pacheco',
            position: 'RB',
            rank: 2,
            status: 'Out',
            shortComment: 'Ankle sprain sustained in Week 1; expected to miss 4-6 weeks.',
          },
          {
            name: 'Hollywood Brown',
            position: 'WR',
            rank: 3,
            status: 'Out',
            comment: 'Shoulder recovery timeline; out indefinitely.',
          },
        ],
      };

      // roster-array team shape (exercises the roster loader branch at rosterSnapshot.ts:387-405)
      teams.BUF = {
        roster: [
          { name: 'Josh Allen', position: 'QB', rank: 1, status: 'Active' },
          {
            name: 'Kaiir Elam',
            position: 'CB',
            rank: 4,
            status: 'Suspension',
            shortComment: 'Suspended two games for a violation of personal conduct policy.',
          },
          {
            name: 'Tre White',
            position: 'CB',
            rank: 2,
            status: 'Out',
            comment: 'Knee rehab; designated to return from IR after Week 6.',
          },
        ],
      };

      return {
        schemaVersion: 1,
        fetchedAt: '2026-09-07T00:00:00.000Z',
        teams,
        transactions: [],
      };
    };

    it('R1: diffRosters returns [] for a prior snapshot that is well-formed JSON but missing the teams key', () => {
      const malformed = { schemaVersion: 1, fetchedAt: '2026-09-07T00:00:00.000Z' } as unknown as RawRosterSnapshot;
      const newTeams = { KC: { offense: [{ name: 'Patrick Mahomes', position: 'QB' }] } };

      expect(() => diffRosters(malformed, newTeams)).not.toThrow();
      expect(diffRosters(malformed, newTeams)).toEqual([]);
    });

    it('R2: loadRosterSnapshot preserves exact shortComment values (and the comment fallback) on the loaded RosterPlayer', () => {
      const loaded = loadRosterSnapshot(buildFixture());
      const findPlayer = (abbr: string, name: string) => loaded.teams[abbr].roster.find(p => p.name === name);

      // Groups loader branch (rosterSnapshot.ts:424): shortComment passthrough and comment fallback
      expect(findPlayer('KC', 'Isiah Pacheco')?.shortComment).toBe(
        'Ankle sprain sustained in Week 1; expected to miss 4-6 weeks.'
      );
      expect(findPlayer('KC', 'Hollywood Brown')?.shortComment).toBe(
        'Shoulder recovery timeline; out indefinitely.'
      );

      // roster-array loader branch (rosterSnapshot.ts:398): shortComment passthrough and comment fallback
      expect(findPlayer('BUF', 'Kaiir Elam')?.shortComment).toBe(
        'Suspended two games for a violation of personal conduct policy.'
      );
      expect(findPlayer('BUF', 'Tre White')?.shortComment).toBe(
        'Knee rehab; designated to return from IR after Week 6.'
      );
    });
  });
});
