import { Game, ModelFn, PredictionResult, SpreadPick } from './types';

export const predictEloQB: ModelFn = (game: Game, history: Game[]): PredictionResult => {
  const K = 20;
  const HFA = game.neutralSite ? 0 : 48;
  const INITIAL_ELO = 1500;
  const eloMap: Record<string, number> = {};

  const getElo = (team: string): number => eloMap[team] ?? INITIAL_ELO;

  // Replay history to build current Elo ratings
  const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const g of sortedHistory) {
    const hElo = getElo(g.homeAbbr);
    const aElo = getElo(g.awayAbbr);
    const hfa = g.neutralSite ? 0 : 48;
    const eloDiff = (hElo + hfa) - aElo;

    const eHome = 1 / (1 + Math.pow(10, -eloDiff / 400));
    const scoreDiff = g.homeScore - g.awayScore;
    const sHome = scoreDiff > 0 ? 1 : (scoreDiff < 0 ? 0 : 0.5);

    const winnerEloDiff = sHome === 1 ? eloDiff : -eloDiff;
    const mov = Math.log(Math.abs(scoreDiff) + 1) * (2.2 / ((winnerEloDiff * 0.001) + 2.2));

    const change = K * mov * (sHome - eHome);
    eloMap[g.homeAbbr] = hElo + change;
    eloMap[g.awayAbbr] = aElo - change;
  }

  // Predict current game
  const homeElo = getElo(game.homeAbbr);
  const awayElo = getElo(game.awayAbbr);
  const netEloDiff = (homeElo + HFA) - awayElo;

  const homeWinProb = 1 / (1 + Math.pow(10, -netEloDiff / 400));
  const predictedMargin = netEloDiff / 25.0; // 25 Elo points approx 1 point of margin

  const homeScore = Math.max(0, Math.round(22.0 + predictedMargin / 2));
  const awayScore = Math.max(0, Math.round(22.0 - predictedMargin / 2));

  let spreadPick: SpreadPick = 'home';
  if (game.market.spread !== null) {
    const coverMargin = predictedMargin + game.market.spread;
    if (coverMargin > 0) spreadPick = 'home';
    else if (coverMargin < 0) spreadPick = 'away';
    else spreadPick = 'push';
  } else {
    spreadPick = predictedMargin >= 0 ? 'home' : 'away';
  }

  return {
    homeScore,
    awayScore,
    homeWinProb,
    spreadPick
  };
};
