import { loadRosterSnapshotWithStatus } from '../geminiService';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('loadRosterSnapshotWithStatus stale / malformed degradation (Task 031)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('stale fetchedAt with an invalid body returns { snapshot: null, isStale: true } without throwing', () => {
    const staleInvalid = {
      fetchedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      // deliberately no `teams` -> the body would fail validation
    };

    let result: any;
    expect(() => {
      result = loadRosterSnapshotWithStatus(staleInvalid);
    }).not.toThrow();
    expect(result).toEqual({ snapshot: null, isStale: true });
  });

  test('the catch branch preserves isStale: true when a stale body throws during validation', () => {
    // Force the staleness check inside the catch to disagree with the pre-validation
    // check at geminiService.ts:30: one millisecond before the 7-day window on the
    // first Date.now() call, past it on the second (after loadRosterSnapshot throws).
    const now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(now).mockReturnValueOnce(now + 2);

    const fetchedAt = new Date(now - SEVEN_DAYS_MS + 1).toISOString();

    const result = loadRosterSnapshotWithStatus({ fetchedAt });

    expect(result).toEqual({ snapshot: null, isStale: true });
    expect(nowSpy).toHaveBeenCalledTimes(2);
  });

  test('fresh fetchedAt with malformed body returns isStale: false', () => {
    const freshInvalid = { fetchedAt: new Date().toISOString() };
    const result = loadRosterSnapshotWithStatus(freshInvalid);
    expect(result).toEqual({ snapshot: null, isStale: false });
  });
});

describe('loadRosterSnapshotWithStatus null contract (Task 035)', () => {
  test('null input returns { snapshot: null, isStale: false }', () => {
    expect(loadRosterSnapshotWithStatus(null)).toEqual({ snapshot: null, isStale: false });
  });
});
