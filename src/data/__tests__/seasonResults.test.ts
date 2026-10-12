import { loadSeasonResultsWithStatus, loadSeasonResults, SeasonResultsSnapshot } from '../seasonResults';

describe('src/data/seasonResults loader and validator', () => {
  const originalWarn = console.warn;
  beforeEach(() => {
    console.warn = jest.fn();
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  const validSnapshot: SeasonResultsSnapshot = {
    schemaVersion: 1,
    season: 2026,
    fetchedAt: '2026-10-11T20:00:00Z',
    games: [
      {
        id: '401872994',
        week: 5,
        seasonType: 2,
        date: '2026-10-04T20:00:00Z',
        homeAbbr: 'LAR',
        awayAbbr: 'BUF',
        homeScore: 24,
        awayScore: 20,
        neutralSite: false,
        market: {
          spread: -3.5,
          total: 54.5,
          moneylineHome: -180,
        },
      },
    ],
  };

  test('loadSeasonResultsWithStatus successfully returns snapshot and games on valid input', () => {
    const res = loadSeasonResultsWithStatus(validSnapshot);
    expect(res.snapshot).not.toBeNull();
    expect(res.snapshot?.season).toBe(2026);
    expect(res.games.length).toBe(1);
    expect(res.games[0].id).toBe('401872994');
    expect(res.games[0].homeAbbr).toBe('LAR');
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('loadSeasonResults returns valid games array on valid input', () => {
    const games = loadSeasonResults(validSnapshot);
    expect(games.length).toBe(1);
    expect(games[0].id).toBe('401872994');
  });

  test('loadSeasonResultsWithStatus loads actual repo snapshot when called with undefined', () => {
    const res = loadSeasonResultsWithStatus();
    expect(res.snapshot).not.toBeNull();
    expect(res.games.length).toBeGreaterThanOrEqual(77);
  });

  test('loadSeasonResultsWithStatus returns empty list and null snapshot when given null (graceful degradation)', () => {
    const res = loadSeasonResultsWithStatus(null);
    expect(res.snapshot).toBeNull();
    expect(res.games).toEqual([]);
  });

  test('loadSeasonResultsWithStatus degrades safely with console.warn on invalid schemaVersion', () => {
    const invalid = { ...validSnapshot, schemaVersion: 2 };
    const res = loadSeasonResultsWithStatus(invalid);
    expect(res.snapshot).toBeNull();
    expect(res.games).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Season results snapshot load or validation failed'),
      expect.any(Error)
    );
  });

  test('loadSeasonResultsWithStatus degrades safely on duplicate game IDs', () => {
    const invalid = {
      ...validSnapshot,
      games: [validSnapshot.games[0], validSnapshot.games[0]],
    };
    const res = loadSeasonResultsWithStatus(invalid);
    expect(res.snapshot).toBeNull();
    expect(res.games).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  test('loadSeasonResultsWithStatus degrades safely on unknown team abbreviation', () => {
    const invalid = {
      ...validSnapshot,
      games: [{ ...validSnapshot.games[0], homeAbbr: 'UNKNOWN' }],
    };
    const res = loadSeasonResultsWithStatus(invalid);
    expect(res.snapshot).toBeNull();
    expect(res.games).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  test('loadSeasonResultsWithStatus degrades safely on negative scores', () => {
    const invalid = {
      ...validSnapshot,
      games: [{ ...validSnapshot.games[0], homeScore: -5 }],
    };
    const res = loadSeasonResultsWithStatus(invalid);
    expect(res.snapshot).toBeNull();
    expect(res.games).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });
});
