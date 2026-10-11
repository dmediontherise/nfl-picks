import test from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import {
  computeCoverageShares,
  createEmptyCoverageCounts,
  mapNflverseTeam,
  normalizeFormation,
  parseCsvObjects,
  parseCsvStream,
  parseDefensiveFront,
  parseOffensePersonnel,
  recordCoveragePlay,
  summarizeRedZoneDrives,
  updateRedZoneTracker,
} from '../lib/nflverse';

test('RFC-4180 Streaming CSV Parser: parses standard unquoted CSV rows', async () => {
  const csv = 'col1,col2,col3\nval1,val2,val3\nval4,val5,val6\n';
  const stream = Readable.from([csv]);
  const rows: string[][] = [];
  for await (const row of parseCsvStream(stream)) {
    rows.push(row);
  }
  assert.deepStrictEqual(rows, [
    ['col1', 'col2', 'col3'],
    ['val1', 'val2', 'val3'],
    ['val4', 'val5', 'val6'],
  ]);
});

test('RFC-4180 Streaming CSV Parser: correctly handles commas inside quoted fields', async () => {
  const csv = 'id,desc,yards\n1,"Shotgun, pass right, to Smith",8\n2,"Up the middle, rush",4\n';
  const stream = Readable.from([csv]);
  const rows: string[][] = [];
  for await (const row of parseCsvStream(stream)) {
    rows.push(row);
  }
  assert.deepStrictEqual(rows, [
    ['id', 'desc', 'yards'],
    ['1', 'Shotgun, pass right, to Smith', '8'],
    ['2', 'Up the middle, rush', '4'],
  ]);
});

test('RFC-4180 Streaming CSV Parser: correctly handles newlines inside quoted fields', async () => {
  const csv = 'id,desc\n1,"Line 1\nLine 2"\n2,"Simple"\n';
  const stream = Readable.from([csv]);
  const rows: string[][] = [];
  for await (const row of parseCsvStream(stream)) {
    rows.push(row);
  }
  assert.deepStrictEqual(rows, [
    ['id', 'desc'],
    ['1', 'Line 1\nLine 2'],
    ['2', 'Simple'],
  ]);
});

test('RFC-4180 Streaming CSV Parser: correctly handles escaped double quotes ("")', async () => {
  const csv = 'id,desc\n1,"He said ""touchdown"" now"\n';
  const stream = Readable.from([csv]);
  const rows: string[][] = [];
  for await (const row of parseCsvStream(stream)) {
    rows.push(row);
  }
  assert.deepStrictEqual(rows, [
    ['id', 'desc'],
    ['1', 'He said "touchdown" now'],
  ]);
});

test('RFC-4180 Streaming CSV Parser: correctly parses across small chunk boundaries', async () => {
  const chunks = [
    'id,de',
    'sc,va',
    'l\n1,"',
    'A, B',
    ', ""C',
    '"" D"',
    ',10\n',
  ];
  const stream = Readable.from(chunks);
  const rows: string[][] = [];
  for await (const row of parseCsvStream(stream)) {
    rows.push(row);
  }
  assert.deepStrictEqual(rows, [
    ['id', 'desc', 'val'],
    ['1', 'A, B, "C" D', '10'],
  ]);
});

test('parseCsvObjects: parses CSV rows into typed objects', async () => {
  const csv = 'game_id,play_id,epa\n2026_01_KC_BAL,42,0.85\n2026_01_KC_BAL,85,-0.32\n';
  const stream = Readable.from([csv]);
  const records: Array<{ game_id: string; play_id: string; epa: string }> = [];
  for await (const obj of parseCsvObjects<{ game_id: string; play_id: string; epa: string }>(
    stream
  )) {
    records.push(obj);
  }
  assert.deepStrictEqual(records, [
    { game_id: '2026_01_KC_BAL', play_id: '42', epa: '0.85' },
    { game_id: '2026_01_KC_BAL', play_id: '85', epa: '-0.32' },
  ]);
});

test('Re-exported domain helpers: maps abbreviations and throws on unknown', () => {
  assert.strictEqual(mapNflverseTeam('LA'), 'LAR');
  assert.throws(() => mapNflverseTeam('BAD'), /Unknown \/ unmapped NFL team abbreviation/);
});

test('Re-exported domain helpers: parses personnel and fronts', () => {
  assert.strictEqual(parseOffensePersonnel('1 RB, 1 TE, 3 WR'), '11');
  assert.strictEqual(parseDefensiveFront('3 CB, 2 DT, 2 DE, 1 FS, 1 SS, 2 ILB'), 'nickel+');
  assert.strictEqual(normalizeFormation('SHOTGUN'), 'shotgun');
});

test('summarizeRedZoneDrives & updateRedZoneTracker: aggregates drives and computes TD rate / points per trip', () => {
  const map = new Map();
  updateRedZoneTracker(map, 'g1_d1', 18, 'Touchdown');
  updateRedZoneTracker(map, 'g1_d1', 5, 'Touchdown'); // 2 plays inside 20 on same drive = 1 trip
  updateRedZoneTracker(map, 'g1_d2', 45, 'Punt');
  updateRedZoneTracker(map, 'g1_d2', 30, 'Punt'); // outside 20 = 0 trips
  updateRedZoneTracker(map, 'g1_d3', 12, 'Field goal'); // 1 trip, FG

  const rz = summarizeRedZoneDrives(map);
  assert.strictEqual(rz.trips, 2);
  assert.strictEqual(rz.touchdowns, 1);
  assert.strictEqual(rz.fieldGoals, 1);
  assert.strictEqual(rz.tdRate, 0.5);
  assert.strictEqual(rz.pointsPerTrip, 5.0);
});

test('recordCoveragePlay & computeCoverageShares: ignores non-pass plays and computes shares over pass plays only', () => {
  const counts = createEmptyCoverageCounts();
  assert.strictEqual(recordCoveragePlay(counts, { isPass: false, mz: 'ZONE_COVERAGE', cov: 'COVER_3' }), false);
  assert.strictEqual(recordCoveragePlay(counts, { isPass: true, mz: 'ZONE_COVERAGE', cov: 'COVER_3' }), true);
  assert.strictEqual(recordCoveragePlay(counts, { isPass: true, mz: 'MAN_COVERAGE', cov: 'COVER_1' }), true);
  assert.strictEqual(recordCoveragePlay(counts, { isPass: true, mz: 'ZONE_COVERAGE', cov: 'COVER_2' }), true);

  const shares = computeCoverageShares(counts);
  assert.strictEqual(shares.passPlaysCharted, 3);
  assert.strictEqual(Math.round(shares.man.share * 10000) / 10000, 0.3333);
  assert.strictEqual(Math.round(shares.zone.share * 10000) / 10000, 0.6667);
  assert.strictEqual(Math.round(shares.cover1.share * 10000) / 10000, 0.3333);
  assert.strictEqual(Math.round(shares.cover2.share * 10000) / 10000, 0.3333);
  assert.strictEqual(Math.round(shares.cover3.share * 10000) / 10000, 0.3333);
});

