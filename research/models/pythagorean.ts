import { Game, ModelFn, PredictionResult, SpreadPick } from './types';

export const predictPythagorean: ModelFn = (game: Game, history: Game[]): PredictionResult => {
  const GAMMA = 2.37;
  const HFA = game.neutralSite ? 0 : 1.8;
  const SHRINK_GAMES = 5;

  const teamStats: Record<string, { pf: number; pa: number; count: number }> = {};

  for (const g of history) {
    if (!teamStats[g.homeAbbr]) teamStats[g.homeAbbr] = { pf: 0, pa: 0, count: 0 };
    if (!teamStats[g.awayAbbr]) teamStats[g.awayAbbr] = { pf: 0, pa: 0, count: 0 };

    teamStats[g.homeAbbr].pf += g.homeScore;
    teamStats[g.homeAbbr].pa += g.awayScore;
    teamStats[g.homeAbbr].count += 1;

    teamStats[g.awayAbbr].pf += g.awayScore;
    teamStats[g.awayAbbr].pa += g.homeScore;
    teamStats[g.awayAbbr].count += 1;
  }

  const getNetMargin = (team: string): number => {
    const s = teamStats[team];
    if (!s || s.count === 0) return 0;
    const rawMargin = (s.pf - s.pa) / s.count;
    // Shrinkage towards 0
    return (rawMargin * s.count) / (s.count + SHRINK_GAMES);
  };

  const getPythagWinPct = (team: string): number => {
    const s = teamStats[team];
    if (!s || s.pf <= 0 || s.pa <= 0) return 0.5;
    const pfPow = Math.pow(s.pf, GAMMA);
    const paPow = Math.pow(s.pa, GAMMA);
    return pfPow / (pfPow + paPow);
  };

  const homeMargin = getNetMargin(game.homeAbbr);
  const awayMargin = getNetMargin(game.awayAbbr);
  const predictedMargin = (homeMargin - awayMargin) + HFA;

  const homePythag = getPythagWinPct(game.homeAbbr);
  const awayPythag = getPythagWinPct(game.awayAbbr);

  // Logistic win prob from predicted margin
  const marginWinProb = 1 / (1 + Math.exp(-predictedMargin / 7.2));
  // Head-to-head Pythagorean expected probability ratio
  const pythagLogit = homePythag * (1 - awayPythag);
  const pythagDenom = homePythag * (1 - awayPythag) + (1 - homePythag) * awayPythag;
  const pythagProb = pythagDenom > 0 ? pythagLogit / pythagDenom : 0.5;

  // Blend logistic margin prob (70%) with Pythagorean ratio prob (30%)
  const homeWinProb = Math.max(0.01, Math.min(0.99, 0.70 * marginWinProb + 0.30 * pythagProb));

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
