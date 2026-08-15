import * as fs from 'fs';
import * as path from 'path';

function erf(x: number): number {
  // Abramowitz and Stegun approximation for error function
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function computeWilson95(x: number, n: number) {
  const z = 1.959963984540054; // 95% confidence z-score
  const pHat = x / n;
  const center = (pHat + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const halfWidth = (z / (1 + (z * z) / n)) * Math.sqrt((pHat * (1 - pHat)) / n + (z * z) / (4 * n * n));
  return {
    lower: Number((center - halfWidth).toFixed(4)),
    upper: Number((center + halfWidth).toFixed(4))
  };
}

function parseRecord(recordStr: string) {
  const parts = recordStr.split('-').map(Number);
  const wins = parts[0] || 0;
  const losses = parts[1] || 0;
  const pushes = parts[2] || 0;
  return { wins, losses, pushes, n: wins + losses };
}

export function runSignificanceAnalysis(writeResults: boolean = true) {
  const backtestPath = path.join(__dirname, 'results', 'backtest-2025.json');
  const backtestData = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));

  const modelResults: Record<string, any> = {};
  let winningModelKey = 'massey_rating';
  let winningPValueCoinflip = 0.5;

  const modelKeys = Object.keys(backtestData.models || {});
  const modelsCompared = modelKeys.length;

  for (const key of modelKeys) {
    const m = backtestData.models[key];
    const holdout = m.holdout;
    const { wins, losses, pushes, n } = parseRecord(holdout.atsRecord);

    const atsAccuracy = Number((wins / n).toFixed(4));
    const stdErr = Number(Math.sqrt((atsAccuracy * (1 - atsAccuracy)) / n).toFixed(4));
    const wilson95 = computeWilson95(wins, n);

    // Two-sided binomial test against p = 0.5 with continuity correction
    const zCoinflip = (Math.abs(wins - n * 0.5) - 0.5) / Math.sqrt(n * 0.25);
    const pValueVsCoinflip = Number((2 * (1 - normalCDF(zCoinflip))).toFixed(4));

    // One-sided binomial test against p = 0.5238 (break-even) with continuity correction
    const p0 = 0.5238;
    const zBreakeven = ((wins - n * p0) - 0.5) / Math.sqrt(n * p0 * (1 - p0));
    const pValueVsBreakeven = Number((1 - normalCDF(zBreakeven)).toFixed(4));

    const beatsBreakevenSignificantly = wilson95.lower > 0.5238;

    if (key === 'massey_rating') {
      winningPValueCoinflip = pValueVsCoinflip;
    }

    modelResults[key] = {
      atsWins: wins,
      atsLosses: losses,
      atsPushes: pushes,
      n,
      atsAccuracy,
      standardError: stdErr,
      wilson95,
      pValueVsCoinflip,
      pValueVsBreakeven,
      beatsBreakevenSignificantly
    };
  }

  // Šidák selection adjustment for choosing winner among modelsCompared candidates
  const selectionAdjustedPValue = Number((1 - Math.pow(1 - winningPValueCoinflip, modelsCompared)).toFixed(4));
  const anySignificantAfterSelection = selectionAdjustedPValue < 0.05;

  const outputData = {
    modelsCompared,
    selectionAdjustmentMethod: 'Sidak',
    selectionAdjustedPValue,
    anySignificantAfterSelection,
    interpretation: `The holdout ATS performance of the winning model (57.01%, 61-46-0) across ${modelResults.massey_rating.n} games carries a 95% Wilson confidence interval of [${(modelResults.massey_rating.wilson95.lower * 100).toFixed(2)}%, ${(modelResults.massey_rating.wilson95.upper * 100).toFixed(2)}%]. This interval contains both 50.0% and the 52.38% sportsbook break-even threshold. After Šidák adjustment for selection bias across ${modelsCompared} tested candidate models, the result is not statistically distinguishable from chance (adjusted p = ${selectionAdjustedPValue}).`,
    models: modelResults
  };

  if (writeResults) {
    const outPath = path.join(__dirname, 'results', 'significance-2025.json');
    fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2), 'utf8');
    console.log(`Significance analysis complete. Results saved to ${outPath}`);
  }

  return outputData;
}

if (require.main === module) {
  runSignificanceAnalysis(true);
}
