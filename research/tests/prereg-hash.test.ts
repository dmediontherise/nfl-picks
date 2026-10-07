import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const preregPath = path.resolve(__dirname, '../../docs-internal/matchup-backtest-prereg.md');
const resultsPath = path.resolve(__dirname, '../results/matchup-backtest.json');

assert.ok(fs.existsSync(preregPath), 'docs-internal/matchup-backtest-prereg.md must exist');
assert.ok(fs.existsSync(resultsPath), 'research/results/matchup-backtest.json must exist');

const computed = crypto.createHash('sha256').update(fs.readFileSync(preregPath)).digest('hex');
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

assert.ok(
  typeof results.preRegistrationSha256 === 'string' && results.preRegistrationSha256.length === 64,
  'matchup-backtest.json must carry preRegistrationSha256'
);
assert.strictEqual(
  results.preRegistrationSha256,
  computed,
  `matchup-backtest.json preRegistrationSha256 (${results.preRegistrationSha256}) != sha256 of matchup-backtest-prereg.md (${computed})`
);

const docPath = path.resolve(__dirname, '../../docs-internal/matchup-backtest.md');
const doc = fs.readFileSync(docPath, 'utf-8');
const docHash = doc.match(/\*\*Pre-registration SHA-256:\*\*\s+`([a-f0-9]{64})`/);
assert.ok(docHash, 'matchup-backtest.md must print the pre-registration SHA-256');
assert.strictEqual(
  docHash[1],
  computed,
  `matchup-backtest.md hash (${docHash[1]}) != sha256 of matchup-backtest-prereg.md (${computed})`
);

console.log(`PASS: pre-registration sha256 ${computed} matches results json and matchup-backtest.md`);
