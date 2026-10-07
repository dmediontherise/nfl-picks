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
});