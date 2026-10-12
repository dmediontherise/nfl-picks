import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

test('carryover pre-registration hash matches research/CARRYOVER.md and carryover-2025.json', () => {
  const docPath = path.resolve(__dirname, '../CARRYOVER.md');
  const resultsPath = path.resolve(__dirname, '../results/carryover-2025.json');

  assert.ok(fs.existsSync(docPath), 'research/CARRYOVER.md must exist');
  assert.ok(fs.existsSync(resultsPath), 'research/results/carryover-2025.json must exist');

  const content = fs.readFileSync(docPath, 'utf-8');
  const match = content.match(/<!-- PRE-REGISTRATION START -->([\s\S]*?)<!-- PRE-REGISTRATION END -->/);
  assert.ok(match, 'research/CARRYOVER.md must contain pre-registration delimiters');

  const computed = crypto.createHash('sha256').update(match[1].trim()).digest('hex');

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  assert.ok(
    typeof results.preRegistrationSha256 === 'string' && results.preRegistrationSha256.length === 64,
    'carryover-2025.json must carry preRegistrationSha256'
  );
  assert.strictEqual(
    results.preRegistrationSha256,
    computed,
    `carryover-2025.json preRegistrationSha256 (${results.preRegistrationSha256}) != computed (${computed})`
  );

  const docHashMatch = content.match(/\*\*Pre-registration SHA-256:\*\*\s+`([a-f0-9]{64})`/);
  assert.ok(docHashMatch, 'research/CARRYOVER.md must print the pre-registration SHA-256');
  assert.strictEqual(
    docHashMatch[1],
    computed,
    `research/CARRYOVER.md hash (${docHashMatch[1]}) != computed (${computed})`
  );
});
