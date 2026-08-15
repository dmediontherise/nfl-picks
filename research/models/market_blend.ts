import { Game, ModelFn, PredictionResult, SpreadPick } from './types';
import { predictEloQB } from './elo';

export const predictMarketBlend: ModelFn = (game: Game, history: Game[]): PredictionResult => {
  // Base fundamental prediction from Elo QB model
  const basePred = predictEloQB(game, history);
  const fundamentalMargin = basePred.homeScore - basePred.awayScore;

  let blendedMargin = fundamentalMargin;
  if (game.market.spread !== null) {
    const marketMargin = -game.market.spread; // home favored => negative spread => positive margin
    // 35% fundamental rating, 65% market closing line consensus
    blendedMargin = 0.35 * fundamentalMargin + 0.65 * marketMargin;
  }

  const homeWinProb = 1 / (1 + Math.exp(-blendedMargin / 6.8));

  const homeScore = Math.max(0, Math.round(22.0 + blendedMargin / 2));
  const awayScore = Math.max(0, Math.round(22.0 - blendedMargin / 2));

  let spreadPick: SpreadPick = 'home';
  if (game.market.spread !== null) {
    const coverMargin = blendedMargin + game.market.spread;
    if (coverMargin > 0) spreadPick = 'home';
    else if (coverMargin < 0) spreadPick = 'away';
    else spreadPick = 'push';
  } else {
    spreadPick = blendedMargin >= 0 ? 'home' : 'away';
  }

  return {
    homeScore,
    awayScore,
    homeWinProb,
    spreadPick
  };
};
