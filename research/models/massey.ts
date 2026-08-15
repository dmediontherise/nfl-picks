import { Game, ModelFn, PredictionResult, SpreadPick } from './types';

export const predictMassey: ModelFn = (game: Game, history: Game[]): PredictionResult => {
  const HFA = game.neutralSite ? 0 : 2.0;

  // Extract all unique teams from history and current game
  const teamSet = new Set<string>();
  for (const g of history) {
    teamSet.add(g.homeAbbr);
    teamSet.add(g.awayAbbr);
  }
  teamSet.add(game.homeAbbr);
  teamSet.add(game.awayAbbr);

  const teams = Array.from(teamSet).sort();
  const teamIndex: Record<string, number> = {};
  teams.forEach((t, idx) => { teamIndex[t] = idx; });
  const n = teams.length;

  // Build Massey matrix M (n x n) and target vector p (n x 1)
  const M: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const p: number[] = Array(n).fill(0);

  for (const g of history) {
    const hIdx = teamIndex[g.homeAbbr];
    const aIdx = teamIndex[g.awayAbbr];
    const hfaG = g.neutralSite ? 0 : 2.0;
    const diff = (g.homeScore - g.awayScore) - hfaG;

    M[hIdx][hIdx] += 1;
    M[aIdx][aIdx] += 1;
    M[hIdx][aIdx] -= 1;
    M[aIdx][hIdx] -= 1;

    p[hIdx] += diff;
    p[aIdx] -= diff;
  }

  // Ridge regularization penalty (lambda = 2.0)
  const lambda = 2.0;
  for (let i = 0; i < n; i++) {
    M[i][i] += lambda;
  }

  // Solve M * r = p using Gauss-Jordan elimination
  const A = M.map((row, i) => [...row, p[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    const pivot = A[i][i];
    if (Math.abs(pivot) > 1e-12) {
      for (let j = i; j <= n; j++) A[i][j] /= pivot;
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = A[k][i];
          for (let j = i; j <= n; j++) {
            A[k][j] -= factor * A[i][j];
          }
        }
      }
    }
  }

  const ratings: Record<string, number> = {};
  teams.forEach((t, i) => {
    ratings[t] = A[i][n];
  });

  const homeRating = ratings[game.homeAbbr] ?? 0;
  const awayRating = ratings[game.awayAbbr] ?? 0;
  const predictedMargin = (homeRating - awayRating) + HFA;

  const homeScore = Math.max(0, Math.round(22.0 + predictedMargin / 2));
  const awayScore = Math.max(0, Math.round(22.0 - predictedMargin / 2));

  const homeWinProb = 1 / (1 + Math.exp(-predictedMargin / 7.0));

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
