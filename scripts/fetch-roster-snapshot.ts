import fs from 'fs';
import path from 'path';
import {
  NFL_TEAM_ABBREVIATIONS,
  RawPlayerEntry,
  RawRosterSnapshot,
  RosterTransaction,
  diffRosters,
  validateSnapshot,
} from '../src/data/rosterSnapshot';

const SNAPSHOT_PATH = path.resolve(__dirname, '../src/data/rosterSnapshot.json');
const MAX_SNAPSHOT_SIZE_BYTES = 250 * 1024; // 250 KB ceiling (256,000 bytes)
const MAX_HEADROOM_SIZE_BYTES = Math.floor(MAX_SNAPSHOT_SIZE_BYTES * 0.8); // 80% of ceiling (204,800 bytes)

export const COMMENT_ELIGIBLE_STATUSES: ReadonlySet<string> = new Set([
  'Out',
  'Doubtful',
  'Questionable',
  'Injured Reserve',
  'Suspension',
]);

interface EspnTeam {
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
  };
}

/**
 * Concurrency-bounded map helper
 */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchWithRetry(url: string, retries = 2, timeoutMs = 8000): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return await res.json();
    } catch (err: any) {
      if (attempt === retries) {
        throw err;
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

export async function fetchRosterSnapshot(): Promise<RawRosterSnapshot> {
  console.log('Fetching NFL teams list...');
  const teamsData = await fetchWithRetry(
    'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/teams'
  );
  const espnTeams: EspnTeam[] =
    teamsData.sports?.[0]?.leagues?.[0]?.teams || [];

  const teamIdToAbbr = new Map<string, string>();
  for (const t of espnTeams) {
    teamIdToAbbr.set(t.team.id, t.team.abbreviation);
  }

  console.log('Fetching NFL injuries feed...');
  const injuriesData = await fetchWithRetry(
    'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries'
  );

  // Map injuries by team abbreviation and player displayName
  const injuriesMap = new Map<string, { status: any; shortComment?: string }>();
  for (const teamSection of injuriesData.injuries || []) {
    for (const inj of teamSection.injuries || []) {
      const ath = inj.athlete;
      const teamAbbr = ath?.team?.abbreviation;
      const playerName = ath?.displayName;
      if (teamAbbr && playerName) {
        const comment = inj.shortComment?.trim();
        injuriesMap.set(`${teamAbbr}::${playerName}`, {
          status: inj.status,
          shortComment: comment || undefined,
        });
      }
    }
  }

  // Fetch rosters for all 32 teams (using bounded concurrency)
  console.log(`Fetching rosters for ${espnTeams.length} teams...`);
  const rostersByTeam = new Map<string, any>();

  await mapConcurrent(espnTeams, 6, async t => {
    const tid = t.team.id;
    const abbr = t.team.abbreviation;
    try {
      // disable=contracts parameter avoids 404s on unrecorded contract records
      const roster = await fetchWithRetry(
        `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/teams/${tid}/roster?disable=contracts`
      );
      rostersByTeam.set(abbr, roster);
    } catch (err: any) {
      console.error(`Failed to fetch roster for ${abbr} (id ${tid}):`, err.message);
    }
  });

  // Fetch depth charts for all 32 teams (using bounded concurrency)
  console.log(`Fetching depth charts for ${espnTeams.length} teams...`);
  const depthChartsByTeam = new Map<string, any>();

  await mapConcurrent(espnTeams, 6, async t => {
    const tid = t.team.id;
    const abbr = t.team.abbreviation;
    try {
      const dc = await fetchWithRetry(
        `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/teams/${tid}/depthcharts`
      );
      depthChartsByTeam.set(abbr, dc);
    } catch (err: any) {
      console.error(`Failed to fetch depth chart for ${abbr} (id ${tid}):`, err.message);
    }
  });

  // Load previous snapshot if it exists for diffing and rank history (Requirement 2)
  let prevSnapshot: RawRosterSnapshot | null = null;
  const prevRankMap = new Map<string, number>();

  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      const prevRaw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
      prevSnapshot = JSON.parse(prevRaw);
      if (prevSnapshot && prevSnapshot.teams) {
        for (const [teamAbbr, teamData] of Object.entries(prevSnapshot.teams as Record<string, any>)) {
          if (!teamData || typeof teamData !== 'object') continue;
          for (const players of Object.values(teamData)) {
            if (Array.isArray(players)) {
              for (const p of players) {
                if (p?.name && typeof p.rank === 'number') {
                  prevRankMap.set(`${teamAbbr}::${p.name}`, p.rank);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not read existing snapshot for diffing:', e);
    }
  }

  // Build the snapshot payload
  const teamsOutput: Record<string, Record<string, RawPlayerEntry[]>> = {};

  for (const t of espnTeams) {
    const abbr = t.team.abbreviation;
    const rosterData = rostersByTeam.get(abbr);
    const dcData = depthChartsByTeam.get(abbr);

    // Build athlete rank map for this team: aid -> rank
    const athleteRankMap = new Map<string, number>();
    if (dcData && Array.isArray(dcData.items)) {
      for (const item of dcData.items) {
        for (const posVal of Object.values(item.positions || {}) as any[]) {
          for (const ath of posVal.athletes || []) {
            const ref = ath.athlete?.$ref;
            const rank = ath.rank;
            if (ref && typeof rank === 'number') {
              const idMatch = ref.match(/\/athletes\/(\d+)/);
              if (idMatch) {
                const aid = idMatch[1];
                const existing = athleteRankMap.get(aid);
                if (existing === undefined || rank < existing) {
                  athleteRankMap.set(aid, rank);
                }
              }
            }
          }
        }
      }
    }

    const teamGroups: Record<string, RawPlayerEntry[]> = {};
    if (rosterData && Array.isArray(rosterData.athletes)) {
      for (const grp of rosterData.athletes) {
        const groupName = grp.position || 'offense';
        const players: RawPlayerEntry[] = [];

        for (const item of grp.items || []) {
          const aid = String(item.id);
          const name = item.displayName;
          const pos = item.position?.abbreviation || '';

          const entry: RawPlayerEntry = {
            name,
            position: pos,
          };

          const rank = athleteRankMap.get(aid);
          if (rank !== undefined) {
            entry.rank = rank;
          }

          const prevRank = prevRankMap.get(`${abbr}::${name}`);
          if (prevRank !== undefined && (entry.status !== undefined || prevRank !== entry.rank)) {
            entry.previousRank = prevRank;
          }

          const inj = injuriesMap.get(`${abbr}::${name}`);
          if (inj) {
            entry.status = inj.status;
            if (
              inj.shortComment &&
              inj.status &&
              COMMENT_ELIGIBLE_STATUSES.has(inj.status)
            ) {
              entry.shortComment = inj.shortComment;
            }
          }

          players.push(entry);
        }

        teamGroups[groupName] = players;
      }
    }

    teamsOutput[abbr] = teamGroups;
  }

  const transactions: RosterTransaction[] = diffRosters(prevSnapshot, teamsOutput);

  const newSnapshot: RawRosterSnapshot = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    teams: teamsOutput,
    transactions,
  };

  return newSnapshot;
}

export async function run(): Promise<void> {
  try {
    const newSnapshot = await fetchRosterSnapshot();

    // Validate before touching disk
    console.log('Validating snapshot payload...');
    const validation = validateSnapshot(newSnapshot);
    if (!validation.valid) {
      console.error('Validation failed:');
      for (const err of validation.errors) {
        console.error(` - ${err}`);
      }
      process.exit(1);
    }
    console.log('Snapshot validation passed.');

    // Check if data actually changed compared to existing snapshot
    if (fs.existsSync(SNAPSHOT_PATH)) {
      try {
        const existingRaw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
        const existingSnapshot = JSON.parse(existingRaw);

        // Compare teams and transactions (excluding fetchedAt)
        const existingCompare = {
          schemaVersion: existingSnapshot.schemaVersion,
          teams: existingSnapshot.teams,
          transactions: existingSnapshot.transactions,
        };
        const newCompare = {
          schemaVersion: newSnapshot.schemaVersion,
          teams: newSnapshot.teams,
          transactions: newSnapshot.transactions,
        };

        if (JSON.stringify(existingCompare) === JSON.stringify(newCompare)) {
          console.log('No data change detected compared to existing snapshot. Leaving file untouched.');
          return;
        }
      } catch (err) {
        // If existing file is invalid, proceed to overwrite with fresh snapshot
      }
    }

    // Serialize compact JSON
    const jsonString = JSON.stringify(newSnapshot);
    const sizeBytes = Buffer.byteLength(jsonString, 'utf-8');
    const marginBytes = MAX_HEADROOM_SIZE_BYTES - sizeBytes;
    const headroomPct = ((1 - sizeBytes / MAX_SNAPSHOT_SIZE_BYTES) * 100).toFixed(1);
    console.log(
      `Snapshot size: ${sizeBytes} bytes (${(sizeBytes / 1024).toFixed(2)} KB). Headroom to 80% cap: ${marginBytes} bytes. Total ceiling headroom: ${headroomPct}%.`
    );

    if (sizeBytes > MAX_HEADROOM_SIZE_BYTES) {
      console.error(
        `Snapshot size ${sizeBytes} bytes exceeds 80% ceiling limit of ${MAX_HEADROOM_SIZE_BYTES} bytes. Margin: ${marginBytes} bytes (${headroomPct}% total ceiling headroom).`
      );
      process.exit(1);
    }

    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, jsonString, 'utf-8');
    console.log(`Successfully wrote roster snapshot to ${SNAPSHOT_PATH}`);
  } catch (err: any) {
    console.error('Snapshot script failed:', err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}
