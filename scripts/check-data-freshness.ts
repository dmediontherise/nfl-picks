import fs from 'fs';
import path from 'path';

export interface FreshnessCheckResult {
  name: string;
  fetchedAt: string | null;
  ageHours: number | null;
  limitHours: number;
  ok: boolean;
  detail: string;
}

export interface FreshnessEvaluation {
  stale: boolean;
  checks: FreshnessCheckResult[];
}

export interface FreshnessInputs {
  rosterSnapshot?: any;
  teamStats?: any;
  seasonResults?: any;
  docsBundleJsContent?: string | null;
}

/**
 * Extracts the roster snapshot's fetchedAt timestamp from bundled JS content.
 * Distinguishes it from other bundled JSONs (such as teamStats) by verifying
 * the roster context (e.g. "schemaVersion":1,"fetchedAt":"...","teams":{ without "dataAttribution" / "season").
 */
export function extractRosterFetchedAtFromBundle(bundleText: string | null | undefined): string | null {
  if (!bundleText) return null;

  // Pattern 1: schemaVersion: 1, fetchedAt: "...", teams: {
  const m1 = bundleText.match(/"schemaVersion":\s*1\s*,\s*"fetchedAt":\s*"([^"]+)"\s*,\s*"teams":\s*\{/);
  if (m1) return m1[1];

  // Pattern 2: fetchedAt: "...", schemaVersion: 1, teams: {
  const m2 = bundleText.match(/"fetchedAt":\s*"([^"]+)"\s*,\s*"schemaVersion":\s*1\s*,\s*"teams":\s*\{/);
  if (m2) return m2[1];

  // Pattern 3: teams: { ... fetchedAt: "..."
  const m3 = bundleText.match(/"teams":\s*\{[^{}]*?"fetchedAt":\s*"([^"]+)"/);
  if (m3) return m3[1];

  // Fallback: examine each fetchedAt match's local neighborhood (up to 120 chars)
  const regex = /"fetchedAt":"([^"]+)"/g;
  let match;
  while ((match = regex.exec(bundleText)) !== null) {
    const after = bundleText.slice(match.index, match.index + 120);
    const before = bundleText.slice(Math.max(0, match.index - 120), match.index);
    if (
      (after.includes('"teams":{') || before.includes('"teams":{')) &&
      !after.includes('"dataAttribution"') &&
      !before.includes('"dataAttribution"')
    ) {
      return match[1];
    }
  }

  return null;
}

/**
 * Evaluates freshness across:
 * a. src/data/rosterSnapshot.json (<= 24h)
 * b. src/data/teamStats.json (<= 72h)
 * c. src/data/seasonResults.json (<= 8 days during season, ok with "offseason" outside)
 * d. Published build docs bundle roster fetchedAt (<= 48h)
 */
export function evaluateFreshness(inputs: FreshnessInputs, now: Date = new Date()): FreshnessEvaluation {
  const checks: FreshnessCheckResult[] = [];
  const nowMs = now.getTime();

  // Helper for timestamp validation and age calculation
  const parseTimestamp = (rawTs: any): { dateMs: number; iso: string } | null => {
    if (typeof rawTs !== 'string' || !rawTs) return null;
    const dateMs = new Date(rawTs).getTime();
    if (Number.isNaN(dateMs)) return null;
    return { dateMs, iso: rawTs };
  };

  // 1. Roster snapshot check (limit: 24h)
  {
    const limitHours = 24;
    const name = 'rosterSnapshot';
    const rawFetchedAt = inputs.rosterSnapshot?.fetchedAt;
    const parsed = parseTimestamp(rawFetchedAt);

    if (!inputs.rosterSnapshot) {
      checks.push({
        name,
        fetchedAt: null,
        ageHours: null,
        limitHours,
        ok: false,
        detail: 'missing roster snapshot data or file',
      });
    } else if (!parsed) {
      checks.push({
        name,
        fetchedAt: typeof rawFetchedAt === 'string' ? rawFetchedAt : null,
        ageHours: null,
        limitHours,
        ok: false,
        detail: 'missing or unparsable fetchedAt timestamp',
      });
    } else {
      const ageHours = Number(((nowMs - parsed.dateMs) / (1000 * 60 * 60)).toFixed(1));
      const ok = ageHours <= limitHours;
      checks.push({
        name,
        fetchedAt: parsed.iso,
        ageHours,
        limitHours,
        ok,
        detail: ok ? `fresh (${ageHours}h <= ${limitHours}h)` : `stale (${ageHours}h > ${limitHours}h)`,
      });
    }
  }

  // 2. Team stats check (limit: 72h)
  {
    const limitHours = 72;
    const name = 'teamStats';
    const rawFetchedAt = inputs.teamStats?.fetchedAt;
    const parsed = parseTimestamp(rawFetchedAt);

    if (!inputs.teamStats) {
      checks.push({
        name,
        fetchedAt: null,
        ageHours: null,
        limitHours,
        ok: false,
        detail: 'missing team stats data or file',
      });
    } else if (!parsed) {
      checks.push({
        name,
        fetchedAt: typeof rawFetchedAt === 'string' ? rawFetchedAt : null,
        ageHours: null,
        limitHours,
        ok: false,
        detail: 'missing or unparsable fetchedAt timestamp',
      });
    } else {
      const ageHours = Number(((nowMs - parsed.dateMs) / (1000 * 60 * 60)).toFixed(1));
      const ok = ageHours <= limitHours;
      checks.push({
        name,
        fetchedAt: parsed.iso,
        ageHours,
        limitHours,
        ok,
        detail: ok ? `fresh (${ageHours}h <= ${limitHours}h)` : `stale (${ageHours}h > ${limitHours}h)`,
      });
    }
  }

  // 3. Season results check (when present: <= 8 days during season, ok with detail "offseason" outside)
  if (inputs.seasonResults !== undefined) {
    const limitHours = 192; // 8 days = 192 hours
    const name = 'seasonResults';

    if (!inputs.seasonResults || !Array.isArray(inputs.seasonResults.games)) {
      checks.push({
        name,
        fetchedAt: null,
        ageHours: null,
        limitHours,
        ok: false,
        detail: 'missing or invalid season results data',
      });
    } else {
      const games = inputs.seasonResults.games;
      const seasonYear = typeof inputs.seasonResults.season === 'number' ? inputs.seasonResults.season : 2026;

      // Find earliest regular-season game (seasonType 2) or earliest game
      const regularGames = games.filter((g: any) => g.seasonType === 2);
      const firstGameDateStr = regularGames.length > 0 ? regularGames[0].date : games[0]?.date;
      const parsedFirstGame = parseTimestamp(firstGameDateStr);
      const firstGameMs = parsedFirstGame
        ? parsedFirstGame.dateMs
        : new Date(`${seasonYear}-09-01T00:00:00Z`).getTime();

      // Super Bowl date approximation: end of February following seasonYear (e.g. 2027-02-28 for 2026 season)
      const superBowlMs = new Date(`${seasonYear + 1}-03-01T00:00:00Z`).getTime();

      const inSeason = nowMs >= firstGameMs && nowMs <= superBowlMs;

      if (!inSeason) {
        checks.push({
          name,
          fetchedAt: inputs.seasonResults.fetchedAt || null,
          ageHours: null,
          limitHours,
          ok: true,
          detail: 'offseason',
        });
      } else if (games.length === 0) {
        checks.push({
          name,
          fetchedAt: inputs.seasonResults.fetchedAt || null,
          ageHours: null,
          limitHours,
          ok: false,
          detail: 'in-season but no completed games found',
        });
      } else {
        // Find the newest final game date
        const sortedGames = [...games].sort((a: any, b: any) => {
          const tA = new Date(a.date).getTime();
          const tB = new Date(b.date).getTime();
          return tA - tB;
        });
        const latestGame = sortedGames[sortedGames.length - 1];
        const parsedLatest = parseTimestamp(latestGame?.date);

        if (!parsedLatest) {
          checks.push({
            name,
            fetchedAt: null,
            ageHours: null,
            limitHours,
            ok: false,
            detail: 'newest game has missing or unparsable date',
          });
        } else {
          const ageHours = Number(((nowMs - parsedLatest.dateMs) / (1000 * 60 * 60)).toFixed(1));
          const ok = ageHours <= limitHours;
          checks.push({
            name,
            fetchedAt: parsedLatest.iso,
            ageHours,
            limitHours,
            ok,
            detail: ok ? `fresh (${ageHours}h <= ${limitHours}h [8d])` : `stale (${ageHours}h > ${limitHours}h [8d])`,
          });
        }
      }
    }
  }

  // 4. Published build check (limit: 48h)
  {
    const limitHours = 48;
    const name = 'publishedBuild';
    const bundleText = inputs.docsBundleJsContent;

    if (bundleText === null || bundleText === undefined) {
      checks.push({
        name,
        fetchedAt: null,
        ageHours: null,
        limitHours,
        ok: false,
        detail: 'missing docs bundle file',
      });
    } else {
      const extractedFetchedAt = extractRosterFetchedAtFromBundle(bundleText);
      const parsed = parseTimestamp(extractedFetchedAt);

      if (!extractedFetchedAt || !parsed) {
        checks.push({
          name,
          fetchedAt: extractedFetchedAt,
          ageHours: null,
          limitHours,
          ok: false,
          detail: 'could not extract roster fetchedAt from published bundle',
        });
      } else {
        const ageHours = Number(((nowMs - parsed.dateMs) / (1000 * 60 * 60)).toFixed(1));
        const ok = ageHours <= limitHours;
        checks.push({
          name,
          fetchedAt: parsed.iso,
          ageHours,
          limitHours,
          ok,
          detail: ok ? `fresh (${ageHours}h <= ${limitHours}h)` : `stale (${ageHours}h > ${limitHours}h)`,
        });
      }
    }
  }

  const stale = checks.some((c) => !c.ok);
  return { stale, checks };
}

/**
 * Loads real files from the repository directory and executes freshness evaluation.
 */
export function checkRepositoryFreshness(rootDir: string = path.resolve(__dirname, '..'), now?: Date): FreshnessEvaluation {
  const readJsonSafe = (filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch {
      return null;
    }
    return null;
  };

  const rosterPath = path.join(rootDir, 'src/data/rosterSnapshot.json');
  const teamStatsPath = path.join(rootDir, 'src/data/teamStats.json');
  const seasonResultsPath = path.join(rootDir, 'src/data/seasonResults.json');

  const rosterSnapshot = readJsonSafe(rosterPath);
  const teamStats = readJsonSafe(teamStatsPath);
  const seasonResults = fs.existsSync(seasonResultsPath) ? readJsonSafe(seasonResultsPath) : undefined;

  let docsBundleJsContent: string | null = null;
  const docsJsDir = path.join(rootDir, 'docs/static/js');
  try {
    if (fs.existsSync(docsJsDir)) {
      const files = fs.readdirSync(docsJsDir);
      const mainBundle = files.find((f) => f.startsWith('main.') && f.endsWith('.js') && !f.endsWith('.map') && !f.endsWith('.LICENSE.txt'));
      if (mainBundle) {
        docsBundleJsContent = fs.readFileSync(path.join(docsJsDir, mainBundle), 'utf-8');
      }
    }
  } catch {
    docsBundleJsContent = null;
  }

  return evaluateFreshness(
    {
      rosterSnapshot,
      teamStats,
      seasonResults,
      docsBundleJsContent,
    },
    now
  );
}

// CLI entry point
if (require.main === module) {
  const result = checkRepositoryFreshness();
  console.log('--- Data Freshness Check ---');
  for (const c of result.checks) {
    const status = c.ok ? 'OK  ' : 'FAIL';
    const ageStr = c.ageHours !== null ? `${c.ageHours}h` : 'n/a';
    console.log(`[${status}] ${c.name.padEnd(16)} (age: ${ageStr.padEnd(7)}, limit: ${c.limitHours}h) - ${c.detail}`);
  }
  console.log('----------------------------');
  if (result.stale) {
    const failedNames = result.checks.filter((c) => !c.ok).map((c) => c.name).join(', ');
    console.error(`Freshness check FAILED. Stale components: ${failedNames}`);
    process.exit(1);
  } else {
    console.log('Freshness check PASSED. All data is fresh.');
    process.exit(0);
  }
}
