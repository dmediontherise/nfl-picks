import { Readable } from 'stream';
import zlib from 'zlib';
import {
  NFLVERSE_TO_APP_TEAM_MAP,
  NFL_TEAM_ABBREVIATIONS,
  NFLTeamAbbreviation,
  mapNflverseTeam,
  normalizeFormation,
  parseDefensiveFront,
  parseOffensePersonnel,
} from '../../src/data/teamStats';

export {
  NFLVERSE_TO_APP_TEAM_MAP,
  NFL_TEAM_ABBREVIATIONS,
  mapNflverseTeam,
  normalizeFormation,
  parseDefensiveFront,
  parseOffensePersonnel,
};
export type { NFLTeamAbbreviation };

export interface DownloadOptions {
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Downloads a file from nflverse releases with retries, timeout, and redirect following.
 * If the URL points to a .gz file or the response indicates gzip, it streams through gunzip.
 */
export async function downloadNflverseFile(
  url: string,
  options?: DownloadOptions
): Promise<NodeJS.ReadableStream> {
  const retries = options?.retries ?? 3;
  const timeoutMs = options?.timeoutMs ?? 30000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'nfl-picks-team-stats-engine/1.0',
          Accept: '*/*',
          ...(options?.headers || {}),
        },
      });

      clearTimeout(timer);

      if (res.status === 404) {
        throw new Error(`HTTP 404 Not Found: ${url}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
      }

      if (!res.body) {
        throw new Error(`Empty response body from ${url}`);
      }

      const nodeStream = Readable.fromWeb(res.body as any);

      const isGzip =
        url.endsWith('.gz') ||
        res.headers.get('content-encoding') === 'gzip' ||
        res.headers.get('content-type') === 'application/gzip' ||
        res.headers.get('content-type') === 'application/x-gzip';

      if (isGzip) {
        return nodeStream.pipe(zlib.createGunzip());
      }

      return nodeStream;
    } catch (err: any) {
      if (err.message && err.message.includes('HTTP 404')) {
        // Do not retry 404s
        throw err;
      }
      if (attempt === retries) {
        throw new Error(`Failed to download ${url} after ${retries + 1} attempts: ${err.message || err}`);
      }
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Exhausted retries downloading ${url}`);
}

/**
 * Streaming RFC-4180 compliant CSV parser.
 * Reads arbitrary stream chunks without buffering the full file in memory.
 * Correctly handles:
 * - Commas inside quoted fields
 * - Newlines inside quoted fields
 * - Escaped double quotes ("")
 * - CRLF and LF record delimiters
 */
export async function* parseCsvStream(
  stream: NodeJS.ReadableStream
): AsyncGenerator<string[]> {
  let inQuotes = false;
  let field = '';
  let row: string[] = [];
  let pendingQuote = false;

  for await (const chunk of stream) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const len = text.length;
    let i = 0;

    if (pendingQuote) {
      pendingQuote = false;
      if (text[0] === '"') {
        field += '"';
        i = 1;
      } else {
        inQuotes = false;
      }
    }

    for (; i < len; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < len) {
            if (text[i + 1] === '"') {
              field += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            pendingQuote = true;
          }
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          row.push(field);
          field = '';
        } else if (char === '\n') {
          if (field.endsWith('\r')) field = field.slice(0, -1);
          row.push(field);
          field = '';
          yield row;
          row = [];
        } else if (char === '\r') {
          if (i + 1 < len && text[i + 1] === '\n') {
            // let subsequent \n handle delimiter
          } else {
            row.push(field);
            field = '';
            yield row;
            row = [];
          }
        } else {
          field += char;
        }
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    if (field.endsWith('\r')) field = field.slice(0, -1);
    row.push(field);
    yield row;
  }
}

/**
 * Reads a CSV stream and yields typed row objects using the first row as headers.
 */
export async function* parseCsvObjects<T = Record<string, string>>(
  stream: NodeJS.ReadableStream
): AsyncGenerator<T> {
  let headers: string[] | null = null;

  for await (const row of parseCsvStream(stream)) {
    if (!headers) {
      headers = row.map(h => h.trim());
      continue;
    }
    const obj: Record<string, string> = {};
    const rowLen = row.length;
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < rowLen ? row[i] : '';
    }
    yield obj as unknown as T;
  }
}

function roundHelper(n: number, d = 4): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** d) / 10 ** d;
}

export interface RedZoneDriveTracker {
  minYardline: number;
  result: string;
}

export interface RedZoneSummaryResult {
  trips: number;
  touchdowns: number;
  fieldGoals: number;
  tdRate: number;
  pointsPerTrip: number;
}

/**
 * Updates a red-zone drive tracking map for a given drive key.
 * Keeps the minimum yardline reached on the drive and updates result if provided.
 */
export function updateRedZoneTracker(
  map: Map<string, RedZoneDriveTracker>,
  key: string,
  yardline100: number,
  result?: string
): void {
  if (!map.has(key)) {
    map.set(key, { minYardline: yardline100, result: result || '' });
  } else {
    const t = map.get(key)!;
    if (yardline100 < t.minYardline) t.minYardline = yardline100;
    if (result) t.result = result;
  }
}

/**
 * Pure function to summarize red-zone drives.
 * Counts drives that penetrated the 20 (minYardline <= 20) as trips,
 * and calculates touchdown rate and points per trip.
 */
export function summarizeRedZoneDrives(
  driveMap: Map<string, RedZoneDriveTracker>,
  filterPrefix?: string
): RedZoneSummaryResult {
  let trips = 0;
  let touchdowns = 0;
  let fieldGoals = 0;
  driveMap.forEach((drive, key) => {
    if (filterPrefix && !key.startsWith(filterPrefix)) return;
    if (drive.minYardline <= 20) {
      trips++;
      const res = (drive.result || '').toLowerCase();
      if (res === 'touchdown') touchdowns++;
      else if (res === 'field goal') fieldGoals++;
    }
  });
  const tdRate = trips > 0 ? roundHelper(touchdowns / trips) : 0;
  const pointsPerTrip = trips > 0 ? roundHelper((touchdowns * 7 + fieldGoals * 3) / trips) : 0;
  return { trips, touchdowns, fieldGoals, tdRate, pointsPerTrip };
}

export interface CoverageCounts {
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

export function createEmptyCoverageCounts(): CoverageCounts {
  return {
    passPlaysCharted: 0,
    man: 0,
    zone: 0,
    cover1: 0,
    cover2: 0,
    cover3: 0,
    cover4: 0,
    cover6: 0,
    other: 0,
  };
}

export interface CoveragePlayInput {
  isPass: boolean;
  mz?: string | null;
  cov?: string | null;
}

/**
 * Records a single play's coverage charting, enforcing that only pass plays are charted.
 */
export function recordCoveragePlay(
  counts: CoverageCounts,
  play: CoveragePlayInput
): boolean {
  if (!play.isPass) return false;

  const mz = play.mz?.trim().toUpperCase();
  const cov = play.cov?.trim().toUpperCase();

  if (!mz && !cov) return false;

  counts.passPlaysCharted++;

  if (mz === 'MAN_COVERAGE') {
    counts.man++;
  } else if (mz === 'ZONE_COVERAGE') {
    counts.zone++;
  }

  if (cov === 'COVER_1') counts.cover1++;
  else if (cov === 'COVER_2' || cov === '2_MAN') counts.cover2++;
  else if (cov === 'COVER_3') counts.cover3++;
  else if (cov === 'COVER_4') counts.cover4++;
  else if (cov === 'COVER_6') counts.cover6++;
  else counts.other++;

  return true;
}

export interface CoverageSharesResult {
  passPlaysCharted: number;
  man: { share: number; plays: number };
  zone: { share: number; plays: number };
  cover1: { share: number; plays: number };
  cover2: { share: number; plays: number };
  cover3: { share: number; plays: number };
  cover4: { share: number; plays: number };
  cover6: { share: number; plays: number };
  other: { share: number; plays: number };
}

/**
 * Pure function to compute man/zone and Cover 1/2/3/4/6 shares over charted pass plays only.
 */
export function computeCoverageShares(counts: CoverageCounts): CoverageSharesResult {
  const chartedPass = counts.passPlaysCharted || 1;
  return {
    passPlaysCharted: counts.passPlaysCharted,
    man: { share: roundHelper(counts.man / chartedPass), plays: counts.man },
    zone: { share: roundHelper(counts.zone / chartedPass), plays: counts.zone },
    cover1: { share: roundHelper(counts.cover1 / chartedPass), plays: counts.cover1 },
    cover2: { share: roundHelper(counts.cover2 / chartedPass), plays: counts.cover2 },
    cover3: { share: roundHelper(counts.cover3 / chartedPass), plays: counts.cover3 },
    cover4: { share: roundHelper(counts.cover4 / chartedPass), plays: counts.cover4 },
    cover6: { share: roundHelper(counts.cover6 / chartedPass), plays: counts.cover6 },
    other: { share: roundHelper(counts.other / chartedPass), plays: counts.other },
  };
}

export interface ScrimmageGameJoin {
  gameId: string;
  scrimmagePlays: number;
  matchedPlays: number;
  /** FTN published at least one charting row for this game (regardless of whether it matched). */
  hasFtnRows: boolean;
}

export interface FtnCoverageThresholds {
  minJoinIntegrityPct?: number;
  maxMissingGamePct?: number;
}

export interface FtnCoverageEvaluation {
  totalGames: number;
  coveredGames: number;
  missingGames: { count: number; gameIds: string[] };
  missingGamePct: number;
  ftnJoinIntegrityPct: number;
  ftnJoinCoveragePct: number;
  joinIntegrityFailed: boolean;
  freshnessFailed: boolean;
  warnings: string[];
}

export const FTN_MIN_JOIN_INTEGRITY_PCT = 90;
export const FTN_MAX_MISSING_GAME_PCT = 25;

/**
 * Pure gate over FTN join coverage. Takes per-game scrimmage/matched play counts and
 * separates the two things that used to be one gate:
 *
 * - Join integrity: among games that have at least one FTN charting row, the share of
 *   scrimmage plays matched must be >= minJoinIntegrityPct (default 90). This catches a
 *   real join break (changed id format, bad key): a game whose FTN rows exist but match
 *   nothing still lands in the denominator with zero in the numerator.
 * - FTN freshness: the share of regular-season games with no FTN rows at all must be
 *   <= maxMissingGamePct (default 25). This catches FTN publishing lag without treating
 *   it as a broken join. Missing game ids are always returned.
 *
 * When FTN has no covered games, integrity is treated as vacuously satisfied and freshness
 * carries the failure. A game is "missing" when FTN has no rows for it.
 */
export function evaluateFtnCoverage(
  games: ScrimmageGameJoin[],
  thresholds?: FtnCoverageThresholds
): FtnCoverageEvaluation {
  const minJoinIntegrityPct = thresholds?.minJoinIntegrityPct ?? FTN_MIN_JOIN_INTEGRITY_PCT;
  const maxMissingGamePct = thresholds?.maxMissingGamePct ?? FTN_MAX_MISSING_GAME_PCT;

  let totalScrimmage = 0;
  let totalMatched = 0;
  let coveredScrimmage = 0;
  let coveredMatched = 0;
  const missingGameIds: string[] = [];

  for (const game of games) {
    const scrimmage = game.scrimmagePlays || 0;
    const matched = game.matchedPlays || 0;
    totalScrimmage += scrimmage;
    totalMatched += matched;
    if (game.hasFtnRows) {
      coveredScrimmage += scrimmage;
      coveredMatched += matched;
    } else {
      missingGameIds.push(game.gameId);
    }
  }

  const totalGames = games.length;
  const coveredGames = totalGames - missingGameIds.length;

  const ftnJoinIntegrityPct =
    coveredScrimmage > 0 ? (coveredMatched / coveredScrimmage) * 100 : 100;
  const ftnJoinCoveragePct = totalScrimmage > 0 ? (totalMatched / totalScrimmage) * 100 : 100;
  const missingGamePct = totalGames > 0 ? (missingGameIds.length / totalGames) * 100 : 0;

  const joinIntegrityFailed = coveredScrimmage > 0 && ftnJoinIntegrityPct < minJoinIntegrityPct;
  const freshnessFailed = missingGamePct > maxMissingGamePct;

  const warnings: string[] = [];
  if (missingGameIds.length > 0 && !freshnessFailed) {
    warnings.push(
      `FTN freshness warning: ${missingGameIds.length}/${totalGames} regular-season games (${missingGamePct.toFixed(
        2
      )}%) have no FTN rows (<= ${maxMissingGamePct}% allowed). Missing: ${missingGameIds.join(
        ', '
      )}`
    );
  }

  return {
    totalGames,
    coveredGames,
    missingGames: { count: missingGameIds.length, gameIds: missingGameIds },
    missingGamePct,
    ftnJoinIntegrityPct,
    ftnJoinCoveragePct,
    joinIntegrityFailed,
    freshnessFailed,
    warnings,
  };
}

/**
 * Turns an `evaluateFtnCoverage` result into the gate decision: throws an Error naming
 * every failed check with its numbers, or returns quietly when the run may proceed.
 * Kept as its own exported function so the throw path is directly testable.
 */
export function assertFtnCoverage(coverage: FtnCoverageEvaluation): void {
  const failures: string[] = [];

  if (coverage.joinIntegrityFailed) {
    failures.push(
      `FTN join integrity regression: ${coverage.ftnJoinIntegrityPct.toFixed(2)}% is below ` +
        `${FTN_MIN_JOIN_INTEGRITY_PCT}% threshold among FTN-covered games.`
    );
  }

  if (coverage.freshnessFailed) {
    failures.push(
      `FTN freshness regression: ${coverage.missingGames.count}/${coverage.totalGames} regular-season ` +
        `games (${coverage.missingGamePct.toFixed(2)}%) have no FTN rows, above ` +
        `${FTN_MAX_MISSING_GAME_PCT}% threshold. Missing: ${coverage.missingGames.gameIds.join(', ')}`
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join(' '));
  }
}
