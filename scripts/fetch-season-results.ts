import fs from 'fs';
import path from 'path';
import {
  SeasonGame,
  SeasonResultsSnapshot,
  CANONICAL_NFL_ABBREVIATIONS,
  normalizeTeamAbbr,
  validateSeasonResultsSnapshot,
} from '../src/data/seasonResultsSnapshotTypes';

export {
  SeasonGame,
  SeasonResultsSnapshot,
  CANONICAL_NFL_ABBREVIATIONS,
  normalizeTeamAbbr,
  validateSeasonResultsSnapshot,
};

export function parseEspnScoreboard(data: any): SeasonGame[] {
  if (!data || !Array.isArray(data.events)) {
    return [];
  }

  const completedGames: SeasonGame[] = [];

  for (const event of data.events) {
    // Keep only games whose status is final
    const isCompleted = Boolean(
      event.status?.type?.completed === true ||
      event.status?.type?.name === 'STATUS_FINAL' ||
      event.status?.type?.state === 'post'
    );
    if (!isCompleted) continue;

    const comp = event.competitions?.[0];
    if (!comp || !Array.isArray(comp.competitors)) continue;

    const homeComp = comp.competitors.find((c: any) => c.homeAway === 'home');
    const awayComp = comp.competitors.find((c: any) => c.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const homeScore = parseInt(homeComp.score, 10);
    const awayScore = parseInt(awayComp.score, 10);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

    const rawHomeAbbr = homeComp.team?.abbreviation || '';
    const rawAwayAbbr = awayComp.team?.abbreviation || '';
    const homeAbbr = normalizeTeamAbbr(rawHomeAbbr);
    const awayAbbr = normalizeTeamAbbr(rawAwayAbbr);

    const weekNumber = typeof event.week?.number === 'number' ? event.week.number : (data.week?.number ?? 1);
    const seasonType = typeof event.season?.type === 'number' ? event.season.type : (data.season?.type ?? 2);

    let spread: number | null = null;
    let total: number | null = null;
    let moneylineHome: number | null = null;

    const odds = comp.odds?.[0];
    if (odds) {
      if (typeof odds.spread === 'number' && Number.isFinite(odds.spread)) {
        spread = odds.spread;
      }
      if (typeof odds.overUnder === 'number' && Number.isFinite(odds.overUnder)) {
        total = odds.overUnder;
      }
      const mlHomeRaw = odds.moneyline?.home?.close?.odds ?? odds.moneyline?.home?.open?.odds;
      if (mlHomeRaw !== undefined && mlHomeRaw !== null) {
        const parsedMl = parseInt(String(mlHomeRaw).replace('+', ''), 10);
        if (Number.isFinite(parsedMl)) {
          moneylineHome = parsedMl;
        }
      }
    }

    completedGames.push({
      id: String(event.id),
      week: weekNumber,
      seasonType,
      date: event.date,
      homeAbbr,
      awayAbbr,
      homeScore,
      awayScore,
      neutralSite: Boolean(comp.neutralSite),
      market: {
        spread,
        total,
        moneylineHome,
      },
    });
  }

  return completedGames;
}

export async function fetchScoreboardWeek(week: number, seasonType: number): Promise<any> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&week=${week}&seasontype=${seasonType}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN request failed for week ${week} seasonType ${seasonType}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAll2026CompletedGames(): Promise<SeasonGame[]> {
  const allGames: SeasonGame[] = [];
  const seenIds = new Set<string>();

  // Regular season: weeks 1-18 (seasonType 2)
  for (let w = 1; w <= 18; w++) {
    const data = await fetchScoreboardWeek(w, 2);
    const games = parseEspnScoreboard(data);
    for (const g of games) {
      if (!seenIds.has(g.id)) {
        seenIds.add(g.id);
        allGames.push(g);
      }
    }
  }

  // Postseason: weeks 1-5 (seasonType 3)
  for (let w = 1; w <= 5; w++) {
    const data = await fetchScoreboardWeek(w, 3);
    const games = parseEspnScoreboard(data);
    for (const g of games) {
      if (!seenIds.has(g.id)) {
        seenIds.add(g.id);
        allGames.push(g);
      }
    }
  }

  // Sort deterministically by date, then id
  allGames.sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });

  return allGames;
}

export function sortSeasonGames(games: SeasonGame[]): SeasonGame[] {
  return [...games].sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });
}

function gamesAreDeepEqual(a: SeasonGame, b: SeasonGame): boolean {
  if (a.id !== b.id) return false;
  if (a.week !== b.week) return false;
  if (a.seasonType !== b.seasonType) return false;
  if (a.date !== b.date) return false;
  if (a.homeAbbr !== b.homeAbbr) return false;
  if (a.awayAbbr !== b.awayAbbr) return false;
  if (a.homeScore !== b.homeScore) return false;
  if (a.awayScore !== b.awayScore) return false;
  if (a.neutralSite !== b.neutralSite) return false;

  // Compare market
  const ma = a.market;
  const mb = b.market;
  if (ma.spread !== mb.spread) return false;
  if (ma.total !== mb.total) return false;
  if (ma.moneylineHome !== mb.moneylineHome) return false;
  return true;
}

export function gamesAreEqual(a: SeasonGame[], b: SeasonGame[]): boolean {
  const sa = sortSeasonGames(a);
  const sb = sortSeasonGames(b);
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    if (!gamesAreDeepEqual(sa[i], sb[i])) return false;
  }
  return true;
}

export async function fetchAndSaveSeasonResults(
  targetPath: string = path.resolve(__dirname, '../src/data/seasonResults.json'),
  gamesInput?: SeasonGame[]
): Promise<{ count: number; latestDate: string; path: string; changed: boolean }> {
  // Read existing file if it exists to enforce monotonicity
  let existingCount = 0;
  let existingGames: SeasonGame[] | null = null;
  let existingFileContent: string | null = null;
  if (fs.existsSync(targetPath)) {
    try {
      existingFileContent = fs.readFileSync(targetPath, 'utf-8');
      const existing = JSON.parse(existingFileContent);
      if (Array.isArray(existing.games)) {
        existingCount = existing.games.length;
        existingGames = existing.games as SeasonGame[];
      }
    } catch {
      // If unparseable or empty, treat as no existing data
      existingGames = null;
      existingCount = 0;
      existingFileContent = null;
    }
  }

  const games = gamesInput !== undefined ? sortSeasonGames(gamesInput) : await fetchAll2026CompletedGames();

  // Enforce monotonicity
  if (existingCount > games.length) {
    throw new Error(
      `Monotonicity violation: existing snapshot has ${existingCount} games, but ESPN returned only ${games.length} games. Refusing to overwrite.`
    );
  }

  // Compare games - if equal (and we have existing file that was parseable), don't write
  if (existingGames !== null && fs.existsSync(targetPath) && existingFileContent !== null) {
    if (gamesAreEqual(games, existingGames)) {
      const latestDate = games.length > 0 ? games[games.length - 1].date : 'none';
      return { count: games.length, latestDate, path: targetPath, changed: false };
    }
  }

  const snapshot: SeasonResultsSnapshot = {
    schemaVersion: 1,
    season: 2026,
    fetchedAt: new Date().toISOString(),
    games,
  };

  // Validate before writing; will throw and exit non-zero without touching file if invalid
  validateSeasonResultsSnapshot(snapshot);

  fs.writeFileSync(targetPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');

  const latestDate = games.length > 0 ? games[games.length - 1].date : 'none';
  return { count: games.length, latestDate, path: targetPath, changed: true };
}

// CLI entry point
if (require.main === module) {
  fetchAndSaveSeasonResults()
    .then((res) => {
      if (res.changed) {
        console.log(`Successfully saved ${res.count} games to ${res.path}. Latest game date: ${res.latestDate}`);
      } else {
        console.log(`No changes detected in games (${res.count} games up to ${res.latestDate}). File unchanged.`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error fetching season results:', err);
      process.exit(1);
    });
}
