import type { SeasonGame, SeasonResultsSnapshot } from './seasonResultsSnapshotTypes';
import { CANONICAL_NFL_ABBREVIATIONS, validateSeasonResultsSnapshot } from './seasonResultsSnapshotTypes';

export type { SeasonGame, SeasonResultsSnapshot };
export { CANONICAL_NFL_ABBREVIATIONS, validateSeasonResultsSnapshot };

let rawSeasonResultsData: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  rawSeasonResultsData = require('./seasonResults.json');
} catch {
  // Available after npm run snapshot:results is run
}

export interface SeasonResultsLoadResult {
  snapshot: SeasonResultsSnapshot | null;
  games: SeasonGame[];
}

/**
 * Load and validate season results snapshot.
 * Degrades safely to { snapshot: null, games: [] } with a console warning on failure.
 */
export function loadSeasonResultsWithStatus(customData?: any): SeasonResultsLoadResult {
  try {
    if (customData === null) {
      return { snapshot: null, games: [] };
    }
    const data = customData !== undefined ? customData : rawSeasonResultsData;
    if (!data) {
      return { snapshot: null, games: [] };
    }

    const validated = validateSeasonResultsSnapshot(data);
    return {
      snapshot: validated,
      games: validated.games,
    };
  } catch (err) {
    console.warn('Season results snapshot load or validation failed. Degrading safely to empty history:', err);
    return { snapshot: null, games: [] };
  }
}

/**
 * Convenience function returning valid games list or empty array on degradation.
 */
export function loadSeasonResults(customData?: any): SeasonGame[] {
  return loadSeasonResultsWithStatus(customData).games;
}
