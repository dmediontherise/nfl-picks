let rawSnapshotData: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  rawSnapshotData = require('./rosterSnapshot.json');
} catch {
  // Available after npm run snapshot:roster is run
}

export type InjuryStatus =
  | 'Active'
  | 'Injured Reserve'
  | 'Questionable'
  | 'Out'
  | 'Suspension'
  | 'Doubtful';

export const OBSERVED_INJURY_STATUSES: ReadonlySet<string> = new Set([
  'Active',
  'Injured Reserve',
  'Questionable',
  'Out',
  'Suspension',
  'Doubtful',
]);

export type RosterGroup =
  | 'offense'
  | 'defense'
  | 'specialTeam'
  | 'injuredReserveOrOut'
  | 'suspended'
  | 'practiceSquad';

export const NFL_TEAM_ABBREVIATIONS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH',
] as const;

export type NFLTeamAbbreviation = (typeof NFL_TEAM_ABBREVIATIONS)[number];

export interface RosterPlayer {
  name: string;
  position: string;
  group: RosterGroup;
  depthChartRank?: number;
  rank?: number;
  previousRank?: number;
  status?: InjuryStatus;
  shortComment?: string;
}

export interface RawPlayerEntry {
  name: string;
  position?: string;
  pos?: string;
  group?: string;
  rank?: number;
  depthChartRank?: number;
  previousRank?: number;
  status?: InjuryStatus;
  shortComment?: string;
  comment?: string;
}

export interface TeamSnapshot {
  roster: RosterPlayer[];
  groups: Partial<Record<RosterGroup, RosterPlayer[]>>;
}

export type TransactionType = 'added' | 'removed' | 'moved';

export interface RosterTransaction {
  type: TransactionType;
  playerName: string;
  position?: string;
  team?: string;
  fromTeam?: string;
  toTeam?: string;
  fromGroup?: string;
  toGroup?: string;
  date?: string;
}

export interface RosterSnapshot {
  schemaVersion: number;
  fetchedAt: string;
  teams: Record<string, TeamSnapshot>;
  transactions: RosterTransaction[];
}

export interface RawRosterSnapshot {
  schemaVersion: number;
  fetchedAt: string;
  teams: Record<string, Record<string, RawPlayerEntry[]> | { roster?: RawPlayerEntry[]; groups?: Record<string, RawPlayerEntry[]> }>;
  transactions: RosterTransaction[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that a snapshot payload meets pipeline safety requirements:
 * 1. Top-level structure and schemaVersion.
 * 2. All 32 NFL teams are present.
 * 3. Every team has a non-empty roster.
 * 4. Every injury record has a status from the observed set.
 */
export function validateSnapshot(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Snapshot data must be a non-null object'] };
  }

  if (typeof data.schemaVersion !== 'number' || data.schemaVersion < 1) {
    errors.push('Missing or invalid schemaVersion');
  }

  if (typeof data.fetchedAt !== 'string' || !data.fetchedAt) {
    errors.push('Missing or invalid fetchedAt timestamp');
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

    let players: RawPlayerEntry[] = [];
    if (Array.isArray(teamData.roster)) {
      players = teamData.roster;
    } else if (teamData.groups && typeof teamData.groups === 'object') {
      for (const grpList of Object.values(teamData.groups as Record<string, any[]>)) {
        if (Array.isArray(grpList)) {
          players.push(...grpList);
        }
      }
    } else {
      // Direct group-keyed object: { offense: [...], defense: [...] }
      for (const [key, val] of Object.entries(teamData)) {
        if (key !== 'id' && key !== 'name' && key !== 'abbreviation' && Array.isArray(val)) {
          players.push(...val);
        }
      }
    }

    if (players.length === 0) {
      errors.push(`Team ${teamAbbr} has an empty roster`);
    }

    for (const player of players) {
      if (player.status && !OBSERVED_INJURY_STATUSES.has(player.status)) {
        errors.push(
          `Player ${player.name || 'unknown'} on team ${teamAbbr} has invalid injury status: "${player.status}"`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertValidSnapshot(data: any): void {
  const result = validateSnapshot(data);
  if (!result.valid) {
    throw new Error(`Snapshot validation failed:\n- ${result.errors.join('\n- ')}`);
  }
}

interface FlattenedPlayer {
  playerName: string;
  team: string;
  group: string;
  position: string;
}

function extractPlayerList(teamsObj: Record<string, any>): FlattenedPlayer[] {
  const list: FlattenedPlayer[] = [];
  for (const [teamAbbr, teamData] of Object.entries(teamsObj || {})) {
    if (!teamData || typeof teamData !== 'object') continue;

    if (Array.isArray(teamData.roster)) {
      for (const p of teamData.roster) {
        if (p?.name) {
          list.push({
            playerName: p.name,
            team: teamAbbr,
            group: p.group || 'offense',
            position: p.position || p.pos || '',
          });
        }
      }
    } else if (teamData.groups && typeof teamData.groups === 'object') {
      for (const [groupName, grpList] of Object.entries(teamData.groups as Record<string, any[]>)) {
        if (Array.isArray(grpList)) {
          for (const p of grpList) {
            if (p?.name) {
              list.push({
                playerName: p.name,
                team: teamAbbr,
                group: groupName,
                position: p.position || p.pos || '',
              });
            }
          }
        }
      }
    } else {
      for (const [groupName, val] of Object.entries(teamData)) {
        if (Array.isArray(val)) {
          for (const p of val) {
            if (p?.name) {
              list.push({
                playerName: p.name,
                team: teamAbbr,
                group: groupName,
                position: p.position || p.pos || '',
              });
            }
          }
        }
      }
    }
  }
  return list;
}

/**
 * Compare an incoming roster against a previous snapshot to detect transactions.
 * Returns added, removed, and moved (trade or group change) transactions.
 */
export function diffRosters(
  prevSnapshot: RawRosterSnapshot | null | undefined,
  newTeams: Record<string, any>
): RosterTransaction[] {
  if (!prevSnapshot || !prevSnapshot.teams) {
    return [];
  }

  const prevPlayers = extractPlayerList(prevSnapshot.teams);
  const newPlayers = extractPlayerList(newTeams);

  // Group by playerName
  const prevByName = new Map<string, FlattenedPlayer[]>();
  for (const p of prevPlayers) {
    const arr = prevByName.get(p.playerName) || [];
    arr.push(p);
    prevByName.set(p.playerName, arr);
  }

  const newByName = new Map<string, FlattenedPlayer[]>();
  for (const p of newPlayers) {
    const arr = newByName.get(p.playerName) || [];
    arr.push(p);
    newByName.set(p.playerName, arr);
  }

  const transactions: RosterTransaction[] = [];
  const processedNewKeys = new Set<string>();

  prevByName.forEach((pList, name) => {
    const nList = newByName.get(name);

    if (!nList || nList.length === 0) {
      // Removed from all teams (Release)
      for (const p of pList) {
        transactions.push({
          type: 'removed',
          playerName: p.playerName,
          position: p.position,
          team: p.team,
          fromTeam: p.team,
          fromGroup: p.group,
        });
      }
      return;
    }

    // Match candidate by position or team
    for (const p of pList) {
      // Find matching new player
      let matchIdx = nList.findIndex(n => !processedNewKeys.has(`${n.playerName}::${n.team}::${n.group}`) && n.team === p.team);
      if (matchIdx === -1) {
        // Look for same position on another team (trade)
        matchIdx = nList.findIndex(n => !processedNewKeys.has(`${n.playerName}::${n.team}::${n.group}`) && n.position === p.position);
      }
      if (matchIdx === -1) {
        // Any remaining match with same name
        matchIdx = nList.findIndex(n => !processedNewKeys.has(`${n.playerName}::${n.team}::${n.group}`));
      }

      if (matchIdx !== -1) {
        const match = nList[matchIdx];
        processedNewKeys.add(`${match.playerName}::${match.team}::${match.group}`);

        if (match.team !== p.team) {
          // Traded to another team
          transactions.push({
            type: 'moved',
            playerName: p.playerName,
            position: match.position || p.position,
            fromTeam: p.team,
            toTeam: match.team,
            fromGroup: p.group,
            toGroup: match.group,
          });
        } else if (match.group !== p.group) {
          // Changed group on same team (e.g. offense -> injuredReserveOrOut)
          transactions.push({
            type: 'moved',
            playerName: p.playerName,
            position: match.position || p.position,
            team: p.team,
            fromGroup: p.group,
            toGroup: match.group,
          });
        }
      } else {
        // Released
        transactions.push({
          type: 'removed',
          playerName: p.playerName,
          position: p.position,
          team: p.team,
          fromTeam: p.team,
          fromGroup: p.group,
        });
      }
    }
  });

  // Detect newly added players
  newByName.forEach((nList, name) => {
    for (const n of nList) {
      if (!processedNewKeys.has(`${n.playerName}::${n.team}::${n.group}`)) {
        const wasInPrev = prevByName.has(name);
        if (!wasInPrev) {
          transactions.push({
            type: 'added',
            playerName: n.playerName,
            position: n.position,
            team: n.team,
            toTeam: n.team,
            toGroup: n.group,
          });
        }
      }
    }
  });

  return transactions;
}

/**
 * Load and normalize the roster snapshot from JSON.
 * Can be provided with custom raw snapshot data (useful for testing).
 */
export function loadRosterSnapshot(raw?: any): RosterSnapshot {
  const data = raw || rawSnapshotData;
  assertValidSnapshot(data);

  const teams: Record<string, TeamSnapshot> = {};

  for (const [teamAbbr, teamVal] of Object.entries(data.teams as Record<string, any>)) {
    const roster: RosterPlayer[] = [];
    const groups: Partial<Record<RosterGroup, RosterPlayer[]>> = {};

    if (Array.isArray(teamVal.roster)) {
      for (const p of teamVal.roster) {
        const groupName = (p.group || 'offense') as RosterGroup;
        const player: RosterPlayer = {
          name: p.name,
          position: p.position || p.pos || '',
          group: groupName,
          depthChartRank: p.depthChartRank ?? p.rank,
          rank: p.depthChartRank ?? p.rank,
          previousRank: p.previousRank,
          status: p.status,
          shortComment: p.shortComment ?? p.comment,
        };
        roster.push(player);
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName]!.push(player);
      }
    } else {
      const sourceGroups = teamVal.groups || teamVal;
      for (const [groupKey, players] of Object.entries(sourceGroups)) {
        if (groupKey === 'id' || groupKey === 'name' || groupKey === 'abbreviation' || !Array.isArray(players)) {
          continue;
        }
        const groupName = groupKey as RosterGroup;
        const groupPlayers: RosterPlayer[] = [];

        for (const p of players) {
          const player: RosterPlayer = {
            name: p.name,
            position: p.position || p.pos || '',
            group: groupName,
            depthChartRank: p.depthChartRank ?? p.rank,
            rank: p.depthChartRank ?? p.rank,
            previousRank: p.previousRank,
            status: p.status,
            shortComment: p.shortComment ?? p.comment,
          };
          roster.push(player);
          groupPlayers.push(player);
        }
        groups[groupName] = groupPlayers;
      }
    }

    teams[teamAbbr] = {
      roster,
      groups,
    };
  }

  return {
    schemaVersion: data.schemaVersion,
    fetchedAt: data.fetchedAt,
    teams,
    transactions: data.transactions || [],
  };
}

/**
 * Helper to get all players with an injury status on a team.
 */
export function getTeamInjuries(team: TeamSnapshot): RosterPlayer[] {
  return team.roster.filter(p => !!p.status);
}

/**
 * Helper to get the depth chart starter (rank 1) for a given position on a team.
 */
export function getStarterAtPosition(team: TeamSnapshot, position: string): RosterPlayer | undefined {
  return team.roster.find(
    p => p.position.toUpperCase() === position.toUpperCase() && (p.depthChartRank === 1 || p.rank === 1)
  );
}

// The statuses that make a player unavailable for displaced-starter detection
// (Task 018 D1: Out / Injured Reserve / Doubtful / Suspension). Questionable is
// deliberately excluded: it is not an absence.
const DISPLACED_STARTER_STATUSES: ReadonlySet<string> = new Set([
  'out',
  'injured reserve',
  'ir',
  'suspension',
  'doubtful',
]);

function isDisplacementUnavailable(status?: InjuryStatus): boolean {
  if (!status) return false;
  return DISPLACED_STARTER_STATUSES.has(status.toLowerCase().trim());
}

/**
 * Identify displaced starters on a team: unavailable players who occupy a backup
 * depth-chart slot only because ESPN auto-promoted their replacement.
 *
 * Two mechanisms, priority is R2 over R3:
 * - R2 (authoritative): a player whose previous snapshot rank was 1
 *   (`previousRank === 1`) and who is now unavailable is the displaced starter.
 * - R3 (fallback when history proves nothing): within a position group, the
 *   best-ranked unavailable player who is ranked at or above (best-ranked
 *   available player's rank + 1) is treated as displaced. Concretely, ATL QB:
 *   Penix (rank 2, Out) sits directly behind Tua (rank 1, Active) -> displaced,
 *   while a rank-4 QB on IR behind three healthy QBs is not.
 *
 * The heuristic names at most one player per position group; R2 may prove
 * several. Players in `practiceSquad` carry no depth rank and are ignored.
 */
export function detectDisplacedStarters(team: TeamSnapshot): Set<string> {
  const groupsByPosition = new Map<string, RosterPlayer[]>();
  for (const p of team.roster) {
    const pos = p.position.toUpperCase().trim();
    if (!pos) continue;
    const list = groupsByPosition.get(pos);
    if (list) {
      list.push(p);
    } else {
      groupsByPosition.set(pos, [p]);
    }
  }

  const byRank = (a: RosterPlayer, b: RosterPlayer) =>
    (a.depthChartRank ?? 99) - (b.depthChartRank ?? 99) || a.name.localeCompare(b.name);

  const displaced = new Set<string>();

  groupsByPosition.forEach(group => {
    // R2: rank history is a fact, not a guess.
    for (const p of group) {
      if (isDisplacementUnavailable(p.status) && p.previousRank === 1) {
        displaced.add(p.name);
      }
    }

    // R3: fallback for the best-ranked unavailable player when history has not
    // already established displacement (covers the cold-start snapshot).
    const unavailable = group
      .filter(p => isDisplacementUnavailable(p.status) && p.depthChartRank !== undefined)
      .sort(byRank);
    const bestUnavailable = unavailable[0];
    if (bestUnavailable && !displaced.has(bestUnavailable.name)) {
      const bestAvailable = group
        .filter(p => !isDisplacementUnavailable(p.status) && p.depthChartRank !== undefined)
        .sort(byRank)[0];
      if (
        bestAvailable &&
        (bestUnavailable.depthChartRank ?? 99) <= (bestAvailable.depthChartRank ?? 99) + 1
      ) {
        displaced.add(bestUnavailable.name);
      }
    }
  });

  return displaced;
}
