import { buildPredictionHistory, getPriorSeasonWeight } from '../geminiService';
import seasonData from '../../engine/data/historical-season.json';
import { loadSeasonResults } from '../../data/seasonResults';

describe('Prediction History Filter and Weighting', () => {
  test('getPriorSeasonWeight follows decay_4 chosen schedule and pins week 1, week 6, postseason', () => {
    // Week 1: max(0, 1 - (1 - 1)/4) = 1.0
    expect(getPriorSeasonWeight(1, 2)).toBe(1.0);
    // Week 2: max(0, 1 - (2 - 1)/4) = 0.75
    expect(getPriorSeasonWeight(2, 2)).toBe(0.75);
    // Week 3: max(0, 1 - (3 - 1)/4) = 0.50
    expect(getPriorSeasonWeight(3, 2)).toBe(0.50);
    // Week 4: max(0, 1 - (4 - 1)/4) = 0.25
    expect(getPriorSeasonWeight(4, 2)).toBe(0.25);
    // Week 5: max(0, 1 - (5 - 1)/4) = 0.0
    expect(getPriorSeasonWeight(5, 2)).toBe(0.0);
    // Week 6: max(0, 1 - (6 - 1)/4) = 0.0
    expect(getPriorSeasonWeight(6, 2)).toBe(0.0);

    // Postseason (seasonType 3) counts as after week 18 -> weight 0.0
    expect(getPriorSeasonWeight(1, 3)).toBe(0.0);
    expect(getPriorSeasonWeight(19, 2)).toBe(0.0);
  });

  test('buildPredictionHistory pins weights for week 1 and week 6 targets', () => {
    const priorGames = [
      {
        homeAbbr: 'PHI',
        awayAbbr: 'DAL',
        homeScore: 24,
        awayScore: 20,
        neutralSite: false,
        date: '2025-09-04T20:20:00Z',
        seasonType: 2,
        week: 1,
      },
    ];
    const currentGames = [
      {
        homeAbbr: 'KC',
        awayAbbr: 'BAL',
        homeScore: 27,
        awayScore: 20,
        neutralSite: false,
        date: '2026-09-10T20:20:00Z',
        seasonType: 2,
        week: 1,
      },
    ];

    // For a week 1 target (target kickoff after currentGames[0])
    const hWeek1 = buildPredictionHistory(
      priorGames,
      currentGames,
      '2026-09-11T00:00:00Z',
      1,
      2
    );
    expect(hWeek1).toHaveLength(2);
    expect(hWeek1[0].weight).toBe(1.0); // 2025 prior game at weight 1.0 for week 1
    expect(hWeek1[1].weight).toBe(1.0); // 2026 current game at weight 1.0

    // For a week 6 target
    const hWeek6 = buildPredictionHistory(
      priorGames,
      currentGames,
      '2026-10-15T00:00:00Z',
      6,
      2
    );
    expect(hWeek6).toHaveLength(2);
    expect(hWeek6[0].weight).toBe(0.0); // 2025 prior game at weight 0.0 for week 6
    expect(hWeek6[1].weight).toBe(1.0); // 2026 current game at weight 1.0
  });

  test('Leakage test: no game at or after kickoff date enters history, across prior and current seasons', () => {
    const allPrior = seasonData.games || [];
    const allCurrent = loadSeasonResults();

    expect(allPrior.length).toBeGreaterThan(100);
    expect(allCurrent.length).toBeGreaterThan(50);

    // Pick a game in week 5 of 2026
    const targetGame = allCurrent[60];
    const targetKickoff = targetGame.date;
    const targetTime = new Date(targetKickoff).getTime();

    const history = buildPredictionHistory(
      allPrior,
      allCurrent,
      targetKickoff,
      targetGame.week,
      targetGame.seasonType
    );

    // Every single game in history must have date strictly < targetTime
    for (const g of history) {
      expect(g.date).toBeDefined();
      const gTime = new Date(g.date!).getTime();
      expect(gTime).toBeLessThan(targetTime);
    }

    // Target game itself is strictly excluded
    const containsTarget = history.some(
      g => g.homeAbbr === targetGame.homeAbbr && g.awayAbbr === targetGame.awayAbbr && g.date === targetGame.date
    );
    expect(containsTarget).toBe(false);

    // Filter oracle: exactly the count of allPrior strictly before + allCurrent strictly before
    const expectedPriorBefore = allPrior.filter(g => new Date(g.date).getTime() < targetTime).length;
    const expectedCurrentBefore = allCurrent.filter(g => new Date(g.date).getTime() < targetTime).length;
    expect(history.length).toBe(expectedPriorBefore + expectedCurrentBefore);

    // Verify current season games in history match exactly allCurrent games strictly before target
    const currentIdsInHistory = new Set(allCurrent.filter(g => new Date(g.date).getTime() < targetTime).map(g => g.id));
    expect(currentIdsInHistory.size).toBe(expectedCurrentBefore);
  });
});
