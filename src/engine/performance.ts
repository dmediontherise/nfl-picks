export interface PerformanceInterval {
  lower: number;
  upper: number;
}

export interface PerformanceEntry {
  key: string;
  label: string;
  value: number;
  interval: PerformanceInterval | null;
  sample: number;
  caveat: string;
}

export const MODEL_PERFORMANCE: Record<string, PerformanceEntry> = {
  holdoutAtsAccuracy: {
    key: 'holdoutAtsAccuracy',
    label: '2025 Holdout ATS Accuracy',
    value: 0.5701,
    interval: { lower: 0.4755, upper: 0.6599 },
    sample: 107,
    caveat: 'Historical backtest result across 107 games. 95% Wilson CI straddles break-even; not a projection for future seasons.'
  },
  holdoutRoi: {
    key: 'holdoutRoi',
    label: '2025 Holdout Backtested ROI',
    value: 0.0884,
    interval: null,
    sample: 107,
    caveat: 'Historical sample ROI at -110 odds over 107 games; does not guarantee or project future returns.'
  },
  holdoutAtsRecord: {
    key: 'holdoutAtsRecord',
    label: '2025 Holdout ATS Record',
    value: 0.5701,
    interval: { lower: 0.4755, upper: 0.6599 },
    sample: 107,
    caveat: '61-46-0 ATS holdout record. Sample size is small (107 games) and subject to selection bias.'
  }
};

export function formatPerformance(entry: PerformanceEntry): string {
  const pctStr = (entry.value * 100).toFixed(2) + '%';
  if (entry.interval) {
    const lowerPct = (entry.interval.lower * 100).toFixed(2) + '%';
    const upperPct = (entry.interval.upper * 100).toFixed(2) + '%';
    return `${pctStr} (95% CI: [${lowerPct}, ${upperPct}], n=${entry.sample})`;
  }
  return `${pctStr} (n=${entry.sample})`;
}
