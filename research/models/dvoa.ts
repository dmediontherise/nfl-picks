import { Game, ModelFn, PredictionResult, SpreadPick } from './types';

export const predictDVOA: ModelFn = (game: Game, history: Game[]): PredictionResult => {
  const DEFAULT_SCORE = 22.0;
  const HFA = game.neutralSite ? 0 : 1.8;

  // Track team scoring offense and defense averages with shrinkage
  const stats: Record<string, { pf: number; pa: number; count: number }> = {};

  for (const g of history) {
    if (!stats[g.homeAbbr]) stats[g.homeAbbr] = { pf: 0, pa: 0, count: 0 };
    if (!stats[g.awayAbbr]) stats[g.awayAbbr] = { pf: 0, pa: 0, count: 0 };

    stats[g.homeAbbr].pf += g.homeScore;
    stats[g.homeAbbr].pa += g.awayScore;
    stats[g.homeAbbr].count += 1;

    stats[g.awayAbbr].pf += g.awayScore;
    stats[g.awayAbbr].pa += g.homeScore;
    stats[g.awayAbbr].count += 1;
  }

  const getOffense = (team: string): number => {
    const s = stats[team];
    if (!s || s.count === 0) return DEFAULT_SCORE;
    // Shrinkage towards league average DEFAULT_SCORE (weight = 3 games)
    const rawOff = s.pf / s.count;
    return (rawOff * s.count + DEFAULT_SCORE * 3) / (s.count + 3);
  };

  const getDefense = (team: string): number => {
    const s = stats[team];
    if (!s || s.count === 0) return DEFAULT_SCORE;
    // Shrinkage towards DEFAULT_SCORE (weight = 3 games)
    const rawDef = s.pa / s.count;
    return (rawDef * s.count + DEFAULT_SCORE * 3) / (s.count + 3);
  };

  const homeOff = getOffense(game.homeAbbr);
  const homeDef = getDefense(game.homeAbbr);
  const awayOff = getOffense(game.awayAbbr);
  const awayDef = getDefense(game.awayAbbr);

  const rawHomePred = homeOff * (awayDef / DEFAULT_SCORE) + HFA;
  const rawAwayPred = awayOff * (homeDef / DEFAULT_SCORE);

  const homeScore = Math.max(0, Math.round(rawHomePred));
  const awayScore = Math.max(0, Math.round(rawAwayPred));

  const predictedMargin = rawHomePred - rawAwayPred;
  const homeWinProb = 1 / (1 + Math.exp(-predictedMargin / 7.5));

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
