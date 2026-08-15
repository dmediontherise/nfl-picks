import { buildPredictionHistory } from '../geminiService';
import seasonData from '../../engine/data/historical-season.json';

describe('Prediction History Filter', () => {
  test('buildPredictionHistory returns only games dated strictly before kickoffISO and excludes the target game', () => {
    const allGames = seasonData.games || [];
    expect(allGames.length).toBeGreaterThan(100);

    // Pick a mid-season game (e.g., game index 100)
    const targetGame = allGames[100];
    expect(targetGame.date).toBeDefined();

    const kickoffISO = targetGame.date;
    const history = buildPredictionHistory(allGames, kickoffISO);

    // Assert every game in returned history has date strictly before kickoffISO
    const targetTime = new Date(kickoffISO).getTime();
    for (const game of history) {
      expect(game.date).toBeDefined();
      const gameTime = new Date(game.date!).getTime();
      expect(gameTime).toBeLessThan(targetTime);
    }

    // Assert target game itself is excluded
    const containsTarget = history.some(
      g => g.homeAbbr === targetGame.homeAbbr && g.awayAbbr === targetGame.awayAbbr && g.date === targetGame.date
    );
    expect(containsTarget).toBe(false);

    // Assert total filtered history count is strictly less than total games
    expect(history.length).toBeLessThan(allGames.length);
    expect(history.length).toBeGreaterThan(0);
  });
});
