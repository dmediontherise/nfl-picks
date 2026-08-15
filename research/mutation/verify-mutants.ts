import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface Mutation {
  id: string;
  name: string;
  targetFile: string;
  target: string;
  replacement: string;
}

const MUTATIONS: Mutation[] = [
  {
    id: 'ats-cover-inverted',
    name: 'ATS cover comparison inverted (> <) in backtest.ts',
    targetFile: 'research/backtest.ts',
    target: "if (coverMargin > 0) actualCover = 'home';",
    replacement: "if (coverMargin < 0) actualCover = 'home';"
  },
  {
    id: 'roi-sign-flipped',
    name: 'ROI loss term sign flipped in backtest.ts',
    targetFile: 'research/backtest.ts',
    target: 'const netUnits = wins * (10 / 11) - losses;',
    replacement: 'const netUnits = wins * (10 / 11) + losses;'
  },
  {
    id: 'leakage-guard-relaxed-backtest',
    name: 'Leakage guard relaxed (< <=) on history filter in backtest.ts',
    targetFile: 'research/backtest.ts',
    target: 'return allGames.filter(g => new Date(g.date).getTime() < targetTime);',
    replacement: 'return allGames.filter(g => new Date(g.date).getTime() <= targetTime);'
  },
  {
    id: 'leakage-guard-relaxed-backtest-engine',
    name: 'Leakage guard relaxed (< <=) on history filter in backtest-engine.ts',
    targetFile: 'research/backtest-engine.ts',
    target: 'return allGames.filter(g => new Date(g.date).getTime() < targetTime);',
    replacement: 'return allGames.filter(g => new Date(g.date).getTime() <= targetTime);'
  },
  {
    id: 'elo-k-zero',
    name: 'Elo K factor set to 0 in models/elo.ts',
    targetFile: 'research/models/elo.ts',
    target: 'const K = 20;',
    replacement: 'const K = 0;'
  },
  {
    id: 'elo-hfa-zero',
    name: 'Elo home field advantage set to 0 in models/elo.ts',
    targetFile: 'research/models/elo.ts',
    target: 'const HFA = game.neutralSite ? 0 : 48;',
    replacement: 'const HFA = 0;'
  },
  {
    id: 'train-holdout-boundary-moved',
    name: 'Train/holdout week boundary moved (12 to 13) in backtest.ts',
    targetFile: 'research/backtest.ts',
    target: 'const trainGames = allGames.filter(g => g.seasonType === 2 && g.week <= 12);',
    replacement: 'const trainGames = allGames.filter(g => g.seasonType === 2 && g.week <= 13);'
  },
  {
    id: 'wilson-z-constant-altered',
    name: 'Wilson interval z constant altered in significance.ts',
    targetFile: 'research/significance.ts',
    target: 'const z = 1.959963984540054;',
    replacement: 'const z = 1.6448536269514722;'
  },
  {
    id: 'sidak-exponent-changed',
    name: 'Sidak exponent changed from modelsCompared to 1 in significance.ts',
    targetFile: 'research/significance.ts',
    target: 'const selectionAdjustedPValue = Number((1 - Math.pow(1 - winningPValueCoinflip, modelsCompared)).toFixed(4));',
    replacement: 'const selectionAdjustedPValue = Number((1 - Math.pow(1 - winningPValueCoinflip, 1)).toFixed(4));'
  },
  {
    id: 'massey-scores-swapped',
    name: 'Massey model score formula inverted in models/massey.ts',
    targetFile: 'research/models/massey.ts',
    target: 'const homeScore = Math.max(0, Math.round(22.0 + predictedMargin / 2));',
    replacement: 'const homeScore = Math.max(0, Math.round(22.0 - predictedMargin / 2));'
  }
];

function runMutationVerifier() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const baseScratchDir = path.join(repoRoot, 'scratch', 'mutations');

  if (fs.existsSync(baseScratchDir)) {
    fs.rmSync(baseScratchDir, { recursive: true, force: true });
  }
  fs.mkdirSync(baseScratchDir, { recursive: true });

  const results: { mutation: Mutation; killed: boolean; errorMsg?: string }[] = [];

  console.log(`Verifying ${MUTATIONS.length} mutations against research test suite...\n`);

  for (let i = 0; i < MUTATIONS.length; i++) {
    const mutation = MUTATIONS[i];
    const runScratchDir = path.join(baseScratchDir, `run-${i + 1}-${mutation.id}`);

    fs.mkdirSync(runScratchDir, { recursive: true });
    fs.cpSync(path.join(repoRoot, 'research'), path.join(runScratchDir, 'research'), { recursive: true });
    fs.cpSync(path.join(repoRoot, 'src'), path.join(runScratchDir, 'src'), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, 'tsconfig.json'), path.join(runScratchDir, 'tsconfig.json'));
    fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(runScratchDir, 'package.json'));

    const filePathInScratch = path.join(runScratchDir, mutation.targetFile);
    if (!fs.existsSync(filePathInScratch)) {
      throw new Error(`[HARD ERROR] Target file ${mutation.targetFile} does not exist in scratch tree for mutation ${mutation.id}`);
    }

    const fileContent = fs.readFileSync(filePathInScratch, 'utf-8');
    if (!fileContent.includes(mutation.target)) {
      throw new Error(`[HARD ERROR] Target string "${mutation.target}" not found in ${mutation.targetFile} for mutation ${mutation.id}`);
    }

    const mutatedContent = fileContent.replace(mutation.target, mutation.replacement);
    fs.writeFileSync(filePathInScratch, mutatedContent, 'utf-8');

    let killed = false;
    let failureOutput = '';

    try {
      execSync('npx tsx research/tests/index.ts', {
        cwd: runScratchDir,
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      killed = false;
    } catch (err: any) {
      killed = true;
      failureOutput = (err.stderr || err.stdout || err.message || '').toString().trim();
    }

    try {
      fs.rmSync(runScratchDir, { recursive: true, force: true });
    } catch {}

    if (!killed) {
      throw new Error(`[MUTANT SURVIVED] Mutation "${mutation.name}" was NOT killed by research test suite!`);
    }

    results.push({ mutation, killed, errorMsg: failureOutput.split('\n')[0] });
    console.log(`KILLED: ${mutation.name}`);
  }

  try {
    fs.rmSync(baseScratchDir, { recursive: true, force: true });
  } catch {}

  console.log(`\nAll ${results.length} mutations KILLED successfully.`);
}

runMutationVerifier();
