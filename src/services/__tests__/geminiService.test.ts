import { analyzeMatchup } from '../geminiService';
import { espnApi } from '../espnAdapter';
import { Game } from '../../types';

describe('Task 022 R4: analyzeMatchup keyFactors', () => {
  beforeEach(() => {
    jest.spyOn(espnApi, 'getRealNews').mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keyFactors[0] names the spread pick team when it differs from the straight-up winner', async () => {
    const game: Game = {
      id: 'T022-spread-pick-away',
      week: 1,
      date: '2025-08-01T00:00:00Z',
      venue: 'Task 022 Test Venue',
      seasonType: 2,
      isNeutralSite: false,
      status: 'pre',
      homeTeam: { id: 'kc', name: 'Kansas City Chiefs', abbreviation: 'KC', logoUrl: 'x', color: 'x' },
      awayTeam: { id: 'buf', name: 'Buffalo Bills', abbreviation: 'BUF', logoUrl: 'x', color: 'x' },
      bettingData: { spread: 'KC -7', total: 44, publicBettingPct: 50 }
    };

    const result = await analyzeMatchup(game, true, null);

    expect(result.keyFactors[0]).toBe('ATS Pick: BUF +7');
    expect(result.keyFactors[0]).toContain('BUF');
    expect(result.winnerPrediction).toBe('Kansas City Chiefs');
    expect(result.winnerPrediction).not.toContain('BUF');
  });

  test('stale snapshot (>7d) causes isRosterStale flag to be true on AnalysisResult', async () => {
    const game: Game = {
      id: 'T027-stale-snapshot',
      week: 1,
      date: '2025-08-01T00:00:00Z',
      venue: 'Stale Test Venue',
      seasonType: 2,
      isNeutralSite: false,
      status: 'pre',
      homeTeam: { id: 'kc', name: 'Kansas City Chiefs', abbreviation: 'KC', logoUrl: 'x', color: 'x' },
      awayTeam: { id: 'den', name: 'Denver Broncos', abbreviation: 'DEN', logoUrl: 'x', color: 'x' },
      bettingData: { spread: 'KC -3', total: 44, publicBettingPct: 50 }
    };

    // Stale snapshot 10 days old
    const staleSnapshot = {
      schemaVersion: 1,
      fetchedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      transactions: [],
      teams: {
        KC: { roster: [{ name: 'Patrick Mahomes', position: 'QB', rank: 1, status: 'Active' }] },
        DEN: { roster: [{ name: 'Bo Nix', position: 'QB', rank: 1, status: 'Active' }] }
      }
    };

    const result = await analyzeMatchup(game, true, staleSnapshot);
    expect(result.isRosterStale).toBe(true);
  });

  test('analyzeMatchup on a 2026 game passes earlier completed 2026 games into the prediction engine (M1)', async () => {
    // 2026 game scheduled for Week 3 (after completed 2026 Week 1 and Week 2 games)
    const game2026: Game = {
      id: 'T055-2026-w3-game',
      week: 3,
      date: '2026-09-25T00:00:00Z',
      venue: 'Arrowhead Stadium',
      seasonType: 2,
      isNeutralSite: false,
      status: 'pre',
      homeTeam: { id: 'kc', name: 'Kansas City Chiefs', abbreviation: 'KC', logoUrl: 'x', color: 'x' },
      awayTeam: { id: 'buf', name: 'Buffalo Bills', abbreviation: 'BUF', logoUrl: 'x', color: 'x' },
      bettingData: { spread: 'KC -3', total: 48, publicBettingPct: 50 }
    };

    const seasonResultsModule = require('../../data/seasonResults');
    const spyLoad = jest.spyOn(seasonResultsModule, 'loadSeasonResults');

    // Run 1: with normal loadSeasonResults returning 2026 games
    const resultNormal = await analyzeMatchup(game2026, true, null);
    expect(resultNormal).toBeDefined();
    expect(spyLoad).toHaveBeenCalled();

    // Home Massey driver includes total games played (2025 + 2026)
    const homeDriverNormal = resultNormal.prediction?.drivers?.find(d => d.key === 'home_massey_rating');
    expect(homeDriverNormal).toBeDefined();
    const matchNormal = homeDriverNormal?.detail.match(/over (\d+) games/);
    expect(matchNormal).not.toBeNull();
    const gameCountWith2026 = parseInt(matchNormal![1], 10);

    // Run 2: Mutant simulation where loadSeasonResults() returns an empty list
    spyLoad.mockReturnValue([]);
    const game2026Mutant: Game = { ...game2026, id: 'T055-2026-w3-game-mutant' };
    const resultEmpty = await analyzeMatchup(game2026Mutant, true, null);
    const homeDriverEmpty = resultEmpty.prediction?.drivers?.find(d => d.key === 'home_massey_rating');
    expect(homeDriverEmpty).toBeDefined();
    const matchEmpty = homeDriverEmpty?.detail.match(/over (\d+) games/);
    expect(matchEmpty).not.toBeNull();
    const gameCountWithout2026 = parseInt(matchEmpty![1], 10);

    // Completed 2026 games from loadSeasonResults must have increased the game count passed to the engine
    expect(gameCountWith2026).toBeGreaterThan(gameCountWithout2026);
    // In seasonData (2025), KC played 17 games; with 2026 Week 1/2 games prior to 2026-09-25, game count is strictly greater
    expect(gameCountWithout2026).toBe(17);
  });
});