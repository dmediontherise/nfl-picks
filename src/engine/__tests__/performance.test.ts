import { MODEL_PERFORMANCE, formatPerformance } from '../performance';

describe('Model Performance Single Source of Truth', () => {
  test('formatPerformance outputs 95% CI interval string whenever interval is non-null', () => {
    for (const entry of Object.values(MODEL_PERFORMANCE)) {
      const formatted = formatPerformance(entry);
      if (entry.interval !== null) {
        expect(formatted).toContain('95% CI:');
        expect(formatted).toContain(`[${(entry.interval.lower * 100).toFixed(2)}%`);
        expect(formatted).toContain(`${(entry.interval.upper * 100).toFixed(2)}%]`);
      }
      expect(formatted).toContain(`n=${entry.sample}`);
    }
  });

  test('every MODEL_PERFORMANCE entry with non-null interval satisfies lower <= value <= upper and sample > 0', () => {
    for (const entry of Object.values(MODEL_PERFORMANCE)) {
      expect(entry.sample).toBeGreaterThan(0);
      if (entry.interval !== null) {
        expect(entry.interval.lower).toBeLessThanOrEqual(entry.value);
        expect(entry.value).toBeLessThanOrEqual(entry.interval.upper);
      }
    }
  });

  test('every MODEL_PERFORMANCE entry carries a non-empty caveat', () => {
    for (const entry of Object.values(MODEL_PERFORMANCE)) {
      expect(typeof entry.caveat).toBe('string');
      expect(entry.caveat.trim().length).toBeGreaterThan(0);
    }
  });
});
