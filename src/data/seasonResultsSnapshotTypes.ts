export interface SeasonGameMarket {
  spread: number | null;
  total: number | null;
  moneylineHome: number | null;
}

export interface SeasonGame {
  id: string;
  week: number;
  seasonType: number;
  date: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  market: SeasonGameMarket;
}

export interface SeasonResultsSnapshot {
  schemaVersion: 1;
  season: 2026;
  fetchedAt: string;
  games: SeasonGame[];
}

export const CANONICAL_NFL_ABBREVIATIONS: ReadonlySet<string> = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH',
]);

export function normalizeTeamAbbr(abbr: string): string {
  if (!abbr) return '';
  const upper = abbr.toUpperCase().trim();
  if (upper === 'WAS') return 'WSH';
  if (upper === 'JAC') return 'JAX';
  return upper;
}

export function validateSeasonResultsSnapshot(snapshot: any): SeasonResultsSnapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Snapshot must be an object');
  }
  if (snapshot.schemaVersion !== 1) {
    throw new Error(`Invalid schemaVersion: expected 1, got ${snapshot.schemaVersion}`);
  }
  if (snapshot.season !== 2026) {
    throw new Error(`Invalid season: expected 2026, got ${snapshot.season}`);
  }
  if (typeof snapshot.fetchedAt !== 'string' || !snapshot.fetchedAt) {
    throw new Error('fetchedAt must be a non-empty string');
  }
  if (!Array.isArray(snapshot.games)) {
    throw new Error('games must be an array');
  }

  const seenIds = new Set<string>();
  for (const g of snapshot.games) {
    if (!g.id || typeof g.id !== 'string') {
      throw new Error(`Game has invalid id: ${g.id}`);
    }
    if (seenIds.has(g.id)) {
      throw new Error(`Duplicate game id found: ${g.id}`);
    }
    seenIds.add(g.id);

    if (typeof g.week !== 'number' || !Number.isInteger(g.week) || g.week < 1) {
      throw new Error(`Game ${g.id} has invalid week: ${g.week}`);
    }
    if (typeof g.seasonType !== 'number' || !Number.isInteger(g.seasonType)) {
      throw new Error(`Game ${g.id} has invalid seasonType: ${g.seasonType}`);
    }
    if (typeof g.date !== 'string' || !g.date) {
      throw new Error(`Game ${g.id} has invalid date: ${g.date}`);
    }
    if (!CANONICAL_NFL_ABBREVIATIONS.has(g.homeAbbr)) {
      throw new Error(`Game ${g.id} has unknown homeAbbr: ${g.homeAbbr}`);
    }
    if (!CANONICAL_NFL_ABBREVIATIONS.has(g.awayAbbr)) {
      throw new Error(`Game ${g.id} has unknown awayAbbr: ${g.awayAbbr}`);
    }
    if (!Number.isInteger(g.homeScore) || g.homeScore < 0) {
      throw new Error(`Game ${g.id} has invalid homeScore: ${g.homeScore}`);
    }
    if (!Number.isInteger(g.awayScore) || g.awayScore < 0) {
      throw new Error(`Game ${g.id} has invalid awayScore: ${g.awayScore}`);
    }
    if (typeof g.neutralSite !== 'boolean') {
      throw new Error(`Game ${g.id} has invalid neutralSite: ${g.neutralSite}`);
    }
  }

  return snapshot as SeasonResultsSnapshot;
}
