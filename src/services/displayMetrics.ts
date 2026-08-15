export function calculateExplosiveRating(avgOffense: number, total?: number | null): number {
  let explosiveCalc = avgOffense;
  if (typeof total === 'number' && !isNaN(total)) {
    if (total > 50) explosiveCalc += 10;
    else if (total > 46) explosiveCalc += 5;
    else if (total < 40) explosiveCalc -= 10;
  }
  return Math.min(99, Math.round(explosiveCalc));
}

export function calculateExecutionRating(predictionConfidence: number, avgTier: number): number {
  const qualityFactor = (6 - avgTier) * 5;
  return Math.min(99, Math.round((predictionConfidence * 0.6) + qualityFactor + 20));
}

export function calculateQBLeverage(homeTier: number, awayTier: number, homeQbStats?: any, awayQbStats?: any): number {
  if (!homeQbStats || !awayQbStats) return Math.min(95, Math.max(5, 50 + ((awayTier - homeTier) * 15)));
  const getQBScore = (stats: any) => (stats.passingTds * 5) + (stats.passingYds / 50) - (stats.interceptions * 3);
  const hScore = getQBScore(homeQbStats);
  const aScore = getQBScore(awayQbStats);
  return Math.min(95, Math.max(5, 50 + (hScore - aScore) * 0.8));
}

export interface UnitLeverage {
  offense: number;
  defense: number;
  qb: number;
}

export function calculateUnitLeverage(homeOffRating: number, awayOffRating: number, homeDefRating: number, awayDefRating: number, qbLev: number): UnitLeverage {
  const offLev = 50 + (homeOffRating - awayOffRating) * 1.5;
  const defLev = 50 + (homeDefRating - awayDefRating) * 1.5;
  return {
    offense: Math.min(95, Math.max(5, Math.round(offLev))),
    defense: Math.min(95, Math.max(5, Math.round(defLev))),
    qb: Math.round(qbLev)
  };
}
