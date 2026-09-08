import { buildNarrative, STRATEGIES, formatPossessive } from '../narrative';
import { predictGame } from '../predictor';
import { PredictionInput, HistoricalGame, Citation, Prediction, NarrativeContext } from '../types';
import seasonData from '../data/historical-season.json';

const history: HistoricalGame[] = (seasonData.games || []).map((g: any) => ({
  homeAbbr: g.homeAbbr,
  awayAbbr: g.awayAbbr,
  homeScore: g.homeScore,
  awayScore: g.awayScore,
  isNeutralSite: g.neutralSite,
  date: g.date,
  seasonType: g.seasonType,
  week: g.week
}));

const allSeasonGames = (seasonData.games || []).map((g: any) => {
  const input: PredictionInput = {
    game: {
      id: g.id,
      homeAbbr: g.homeAbbr,
      awayAbbr: g.awayAbbr,
      isNeutralSite: Boolean(g.neutralSite),
      seasonType: g.seasonType,
      week: g.week,
      market: g.market ? { spread: g.market.spread, total: g.market.total } : null
    },
    history,
    homeInjuries: [],
    awayInjuries: []
  };
  const prediction = predictGame(input);
  const context = {
    homeTeamName: g.homeAbbr,
    awayTeamName: g.awayAbbr,
    homeAbbr: g.homeAbbr,
    awayAbbr: g.awayAbbr,
    isNeutralSite: Boolean(g.neutralSite),
    week: g.week
  };
  const narrative = buildNarrative(prediction, context);
  return { game: g, input, prediction, context, narrative };
});

describe('Narrative Composition Engine', () => {
  test('sentence cap: 5-8 sentences inclusive and <= 45 words per sentence over >= 200 games', () => {
    expect(allSeasonGames.length).toBeGreaterThanOrEqual(200);

    for (const { narrative } of allSeasonGames) {
      expect(narrative.sentences.length).toBeGreaterThanOrEqual(5);
      expect(narrative.sentences.length).toBeLessThanOrEqual(8);
      expect(narrative.text).toBe(narrative.sentences.join(' '));

      for (const sentence of narrative.sentences) {
        const wordCount = sentence.trim().split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(45);
      }
    }
  });

  test('strategy variety: exercises at least 6 distinct strategies, max strategy share <= 40%, structural variety', () => {
    expect(Object.keys(STRATEGIES).length).toBeGreaterThanOrEqual(8);

    const strategyCounts: Record<string, number> = {};

    for (const { prediction, context } of allSeasonGames) {
      for (const strategy of Object.values(STRATEGIES)) {
        if (strategy.matches(prediction, context)) {
          strategyCounts[strategy.key] = (strategyCounts[strategy.key] || 0) + 1;
        }
      }

      const text = buildNarrative(prediction, context).text;
      const vsMatches = text.match(/\b\w+\s+vs\s+\w+\b/gi) || [];
      expect(vsMatches.length).toBeLessThanOrEqual(2);
    }

    const exercisedCount = Object.keys(strategyCounts).length;
    expect(exercisedCount).toBeGreaterThanOrEqual(6);

    const totalStrategyEmissions = Object.values(strategyCounts).reduce((a, b) => a + b, 0);
    for (const count of Object.values(strategyCounts)) {
      const share = count / totalStrategyEmissions;
      expect(share).toBeLessThanOrEqual(0.40);
    }

    const week1Games = allSeasonGames.filter(x => x.game.week === 1);
    const sentence2Openings = new Set<string>();
    for (const { narrative } of week1Games) {
      if (narrative.sentences[2]) {
        const first5Words = narrative.sentences[2].split(/\s+/).slice(0, 5).join(' ');
        sentence2Openings.add(first5Words);
      }
    }
    expect(sentence2Openings.size).toBeGreaterThanOrEqual(4);
  });

  test('score attribution: parses Name (score) pairs, runs twice (abbrs supplied/omitted), asserts exact score match and identical text', () => {
    for (const { prediction, game } of allSeasonGames) {
      const contextWithAbbr = {
        homeTeamName: game.homeAbbr,
        awayTeamName: game.awayAbbr,
        homeAbbr: game.homeAbbr,
        awayAbbr: game.awayAbbr,
        isNeutralSite: Boolean(game.neutralSite),
        week: game.week
      };

      const contextWithoutAbbr = {
        homeTeamName: game.homeAbbr,
        awayTeamName: game.awayAbbr,
        isNeutralSite: Boolean(game.neutralSite),
        week: game.week
      };

      const nWith = buildNarrative(prediction, contextWithAbbr);
      const nWithout = buildNarrative(prediction, contextWithoutAbbr);

      expect(nWithout.text).toBe(nWith.text);

      const regex = /([A-Za-z0-9\s]+?)\s*\(([0-9]+)\)/g;
      let match: RegExpExecArray | null;

      const expectedHomeScore = prediction.homeScore;
      const expectedAwayScore = prediction.awayScore;

      while ((match = regex.exec(nWith.text)) !== null) {
        const teamNameToken = match[1].trim();
        const scoreVal = parseInt(match[2], 10);

        if (teamNameToken.includes(game.homeAbbr) || teamNameToken === game.homeAbbr) {
          expect(scoreVal).toBe(expectedHomeScore);
        }
        if (teamNameToken.includes(game.awayAbbr) || teamNameToken === game.awayAbbr) {
          expect(scoreVal).toBe(expectedAwayScore);
        }
      }

      const homeWon = prediction.margin > 0 || prediction.homeScore > prediction.awayScore;
      const expectedWinner = homeWon ? game.homeAbbr : game.awayAbbr;
      const expectedWinnerScore = homeWon ? prediction.homeScore : prediction.awayScore;
      const expectedLoserScore = homeWon ? prediction.awayScore : prediction.homeScore;

      expect(expectedWinnerScore).toBeGreaterThan(expectedLoserScore);
      expect(nWith.sentences[0]).toContain(expectedWinner);
    }
  });

  test('possessive: formatPossessive handles names ending in s with bare apostrophe across all 32 team names', () => {
    const all32Teams = [
      'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
      'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
      'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
      'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
      'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
      'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants',
      'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
      'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders'
    ];

    for (const teamName of all32Teams) {
      const pos = formatPossessive(teamName);
      expect(pos).toBe(`${teamName}'`);
    }

    expect(formatPossessive('KC')).toBe("KC's");
    expect(formatPossessive('GB')).toBe("GB's");
    expect(formatPossessive('DET')).toBe("DET's");
    expect(formatPossessive('MIA')).toBe("MIA's");
  });

  test('uniqueness: no duplicate sentence within any week across full season', () => {
    const gamesByWeek: Record<number, typeof allSeasonGames> = {};

    for (const item of allSeasonGames) {
      const w = item.game.week || 1;
      if (!gamesByWeek[w]) gamesByWeek[w] = [];
      gamesByWeek[w].push(item);
    }

    for (const weekNum of Object.keys(gamesByWeek)) {
      const weekItems = gamesByWeek[Number(weekNum)];
      const seenSentences = new Set<string>();

      for (const item of weekItems) {
        for (const sentence of item.narrative.sentences) {
          expect(seenSentences.has(sentence)).toBe(false);
          seenSentences.add(sentence);
        }
      }
    }
  });

  test('traceable: every sentence containing numerals has citations and numeric values match prediction', () => {
    for (const { prediction, narrative } of allSeasonGames) {
      narrative.sentences.forEach((sentence, sIdx) => {
        const containsDigits = /\d/.test(sentence);
        if (containsDigits) {
          const sentenceCitations = narrative.citations.filter((c: Citation) => c.sentenceIndex === sIdx);
          expect(sentenceCitations.length).toBeGreaterThan(0);
        }
      });

      const numMatches = narrative.text.match(/\d+(\.\d+)?/g) || [];
      const validValues = new Set<number>();

      validValues.add(prediction.homeScore);
      validValues.add(prediction.awayScore);
      validValues.add(Math.abs(prediction.margin));
      validValues.add(parseFloat(Math.abs(prediction.margin).toFixed(1)));
      validValues.add(prediction.confidence);
      validValues.add(parseFloat(prediction.confidence.toFixed(1)));
      validValues.add(prediction.homeWinProbability);
      validValues.add(parseFloat((prediction.homeWinProbability * 100).toFixed(1)));
      validValues.add(prediction.spreadPick.line);
      validValues.add(Math.abs(prediction.spreadPick.line));
      validValues.add(parseFloat(Math.abs(prediction.spreadPick.line).toFixed(1)));
      validValues.add(prediction.spreadPick.edge);
      validValues.add(parseFloat(prediction.spreadPick.edge.toFixed(1)));
      validValues.add(prediction.totalPick.line);
      validValues.add(parseFloat(prediction.totalPick.line.toFixed(1)));
      validValues.add(prediction.totalPick.projected);
      validValues.add(parseFloat(prediction.totalPick.projected.toFixed(1)));

      for (const d of prediction.drivers) {
        validValues.add(d.magnitude);
        validValues.add(parseFloat(d.magnitude.toFixed(1)));
        validValues.add(parseFloat(d.magnitude.toFixed(2)));
      }

      for (const token of numMatches) {
        const val = parseFloat(token);
        expect(validValues.has(val)).toBe(true);
      }
    }
  });

  test('driver coherence: vocabulary matches cited driver key and no lowercased raw labels leak', () => {
    const abbrs = Array.from(new Set(allSeasonGames.flatMap(g => [g.game.homeAbbr, g.game.awayAbbr]))).map(a => a.toLowerCase());

    for (const { narrative } of allSeasonGames) {
      narrative.sentences.forEach((sentence, sIdx) => {
        const sentenceCitations = narrative.citations.filter(c => c.sentenceIndex === sIdx);
        const lowerSentence = sentence.toLowerCase();

        for (const abbr of abbrs) {
          expect(lowerSentence).not.toContain(`${abbr} power rating`);
          expect(lowerSentence).not.toContain(`${abbr} opponent rating`);
        }

        for (const citation of sentenceCitations) {
          const key = citation.driverKey;
          if (key === 'home_field_advantage') {
            expect(lowerSentence).not.toMatch(/roster|availability|injury|health|power index/);
          } else if (key === 'home_massey_rating' || key === 'away_massey_rating') {
            expect(lowerSentence).not.toMatch(/roster|availability|injury|venue|home field/);
          } else if (key === 'roster_injury_modifier') {
            expect(lowerSentence).not.toMatch(/venue|home field|power rating/);
          }
        }
      });
    }
  });

  test('shape signature: at least 6 distinct signatures occur, no signature > 45% share', () => {
    const signatureCounts: Record<string, number> = {};

    for (const { narrative } of allSeasonGames) {
      const beats = narrative.beats || [];
      const sigKey = beats.join(' -> ');
      signatureCounts[sigKey] = (signatureCounts[sigKey] || 0) + 1;
    }

    const distinctSignatures = Object.keys(signatureCounts).length;
    expect(distinctSignatures).toBeGreaterThanOrEqual(6);

    const totalGames = allSeasonGames.length;
    for (const count of Object.values(signatureCounts)) {
      const share = count / totalGames;
      expect(share).toBeLessThanOrEqual(0.45);
    }
  });

  test('conditional beats: all 4 conditionals fire and omit correctly on dataset games', () => {
    for (const { prediction, context, narrative } of allSeasonGames) {
      const beats = narrative.beats || [];
      const sortedDrivers = [...prediction.drivers].sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
      const sumAbsDrivers = sortedDrivers.reduce((sum, d) => sum + Math.abs(d.magnitude), 0);
      const isDominant = sortedDrivers[0] && sumAbsDrivers > 0 && (Math.abs(sortedDrivers[0].magnitude) / sumAbsDrivers) >= 0.60;

      if (isDominant) {
        expect(beats).toContain('dominant_driver_lead');
      } else {
        expect(beats).not.toContain('dominant_driver_lead');
      }

      if (prediction.spreadPick.edge >= 3.0) {
        expect(beats).toContain('market_disagreement');
      }
      if (prediction.spreadPick.edge < 1.0) {
        expect(beats).not.toContain('market_disagreement');
      }

      if (prediction.confidence < 55.0) {
        expect(beats).toContain('uncertainty');
      }
      if (prediction.confidence >= 80.0) {
        expect(beats).not.toContain('uncertainty');
      }

      if (prediction.totalPick.edge < 1.0) {
        expect(beats).not.toContain('total_pick');
      } else {
        expect(beats).toContain('total_pick');
      }
    }
  });

  test('purity: buildNarrative is pure and produces identical output for identical input', () => {
    const sample = allSeasonGames[0];
    const n1 = buildNarrative(sample.prediction, sample.context);
    const n2 = buildNarrative(sample.prediction, sample.context);

    expect(n1).toEqual(n2);
  });

  test('Req 5: backup QB announcement beat renders and names the backup when QB1 is unavailable', () => {
    const sample = allSeasonGames[0];
    const narrativeWithBackup = buildNarrative(sample.prediction, {
      ...sample.context,
      homeQB: {
        starterName: 'Carson Wentz',
        backupName: 'Carson Wentz',
        isBackupStarting: true,
        injuredStarterName: 'Patrick Mahomes',
        injuryStatus: 'Out'
      }
    });

    expect(narrativeWithBackup.beats).toContain('qb_backup_home');
    expect(narrativeWithBackup.text).toContain('Patrick Mahomes');
    expect(narrativeWithBackup.text).toContain('Carson Wentz');
    expect(narrativeWithBackup.text).toMatch(/backup quarterback Carson Wentz is projected under center/);
    expect(narrativeWithBackup.sentences.length).toBeLessThanOrEqual(8);

    const narrativeWithAwayBackup = buildNarrative(sample.prediction, {
      ...sample.context,
      awayQB: {
        starterName: 'Jake Browning',
        backupName: 'Jake Browning',
        isBackupStarting: true,
        injuredStarterName: 'Joe Burrow',
        injuryStatus: 'Injured Reserve'
      }
    });

    expect(narrativeWithAwayBackup.beats).toContain('qb_backup_away');
    expect(narrativeWithAwayBackup.text).toContain('Joe Burrow');
    expect(narrativeWithAwayBackup.text).toContain('Jake Browning');
    expect(narrativeWithAwayBackup.text).toMatch(/backup quarterback Jake Browning is projected under center/);
    expect(narrativeWithAwayBackup.sentences.length).toBeLessThanOrEqual(8);
  });
});

describe('Task 022: narrative text names the structured pick', () => {
  const context022: NarrativeContext = {
    homeTeamName: 'Seattle',
    awayTeamName: 'Denver',
    homeAbbr: 'SEA',
    awayAbbr: 'DEN',
    isNeutralSite: false,
    week: 1
  };

  test('R1: driver sentences reference drivers in descending |magnitude| order regardless of input order', () => {
    const prediction: Prediction = {
      winner: 'SEA',
      homeScore: 27,
      awayScore: 20,
      margin: 7,
      projectedMargin: 7,
      homeWinProbability: 0.68,
      confidence: 60,
      spreadPick: { team: 'BAD', line: -3, edge: 0.5 },
      totalPick: { side: 'over', line: 44.5, projected: 45.5, edge: 0.5 },
      marketSpread: -3,
      modelVersion: 'task-022',
      drivers: [
        { key: 'custom_gamma', label: 'Gamma factor', magnitude: 2.0, direction: 'home', detail: '' },
        { key: 'custom_beta', label: 'Beta factor', magnitude: 3.0, direction: 'home', detail: '' },
        { key: 'custom_alpha', label: 'Alpha factor', magnitude: 4.0, direction: 'home', detail: '' }
      ]
    };

    const narrative = buildNarrative(prediction, context022);

    const driverOrder = narrative.sentences
      .filter(s => /(Alpha|Beta|Gamma) factor/.test(s))
      .map(s => (s.includes('Alpha factor') ? 'alpha' : s.includes('Beta factor') ? 'beta' : 'gamma'));

    expect(driverOrder).toEqual(['alpha', 'beta', 'gamma']);
    expect(narrative.sentences[2]).toContain('Alpha factor');
  });

  test('R2: ATS sentence names the spreadPick.team (away team), not the home team / projected winner', () => {
    const prediction: Prediction = {
      winner: 'SEA',
      homeScore: 24,
      awayScore: 21,
      margin: 3,
      projectedMargin: 3,
      homeWinProbability: 0.6,
      confidence: 60,
      spreadPick: { team: 'DEN', line: 3, edge: 2.0 },
      totalPick: { side: 'over', line: 44.5, projected: 45.5, edge: 0.5 },
      marketSpread: 3,
      modelVersion: 'task-022',
      drivers: []
    };

    const narrative = buildNarrative(prediction, context022);
    const atsSentence = narrative.sentences.find(s => s.startsWith('Against the spread'));

    expect(atsSentence).toBeDefined();
    expect(atsSentence as string).toBe('Against the spread in Seattle vs Denver, the model favors DEN at +3.0 with an edge of 2.0 points.');
    expect(atsSentence as string).not.toContain('favors Seattle');
  });

  test('R3: total sentence matches totalPick.side for both under and over', () => {
    const base: Prediction = {
      winner: 'SEA',
      homeScore: 24,
      awayScore: 20,
      margin: 4,
      projectedMargin: 4,
      homeWinProbability: 0.6,
      confidence: 60,
      spreadPick: { team: 'DEN', line: 3, edge: 0.5 },
      totalPick: { side: 'under', line: 44.5, projected: 42.0, edge: 0 },
      marketSpread: 3,
      modelVersion: 'task-022',
      drivers: []
    };

    const under = buildNarrative(
      { ...base, totalPick: { side: 'under', line: 44.5, projected: 42.0, edge: 2.0 } },
      context022
    );
    const underSentence = under.sentences.find(s => s.startsWith('For the game total'));
    expect(underSentence as string).toBe('For the game total, the model recommends UNDER 44.5 based on a projected total of 42.0 points in Seattle vs Denver.');
    expect(underSentence as string).not.toContain(' OVER ');

    const over = buildNarrative(
      { ...base, totalPick: { side: 'over', line: 48.0, projected: 50.0, edge: 2.0 } },
      context022
    );
    const overSentence = over.sentences.find(s => s.startsWith('For the game total'));
    expect(overSentence as string).toBe('For the game total, the model recommends OVER 48.0 based on a projected total of 50.0 points in Seattle vs Denver.');
    expect(overSentence as string).not.toContain(' UNDER ');
  });
});
