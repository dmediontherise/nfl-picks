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
});