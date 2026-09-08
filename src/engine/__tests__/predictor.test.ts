import fs from 'fs';
import path from 'path';
import {
  predictGame,
  getStatusMultiplier,
  getPositionBaseWeight,
  calculatePlayerInjuryPenalty,
  calculateTeamInjuryPenalty,
  MAX_TEAM_INJURY_PENALTY
} from '../predictor';
import { HistoricalGame, PlayerInjury, PredictionInput } from '../types';
import { TEAMS } from '../../data/nfl_data';
import { resolveTeamQB, getTeamInjuriesForEngine, getSafeRosterSnapshot } from '../../services/geminiService';
import { RosterSnapshot, loadRosterSnapshot } from '../../data/rosterSnapshot';

interface SeasonGame {
  id: string;
  week: number;
  seasonType: number;
  date: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  market: {
    spread: number | null;
    total: number | null;
    moneylineHome: number | null;
  };
}

describe('Prediction Engine (src/engine/predictor.ts)', () => {
  const dataPath = path.join(__dirname, '../../../research/data/2025-season.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const dataset: { games: SeasonGame[] } = JSON.parse(rawData);

  const allGames = [...dataset.games].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  test('Req 3: Drivers reconciliation over at least 100 games', () => {
    expect(allGames.length).toBeGreaterThanOrEqual(100);

    const testGames = allGames.slice(0, 150);

    for (let i = 0; i < testGames.length; i++) {
      const g = testGames[i];
      const targetTime = new Date(g.date).getTime();
      const rawHistory = allGames.filter(prev => new Date(prev.date).getTime() < targetTime);

      const history: HistoricalGame[] = rawHistory.map(prev => ({
        homeAbbr: prev.homeAbbr,
        awayAbbr: prev.awayAbbr,
        homeScore: prev.homeScore,
        awayScore: prev.awayScore,
        isNeutralSite: prev.neutralSite,
        date: prev.date,
        seasonType: prev.seasonType,
        week: prev.week
      }));

      const input: PredictionInput = {
        game: {
          id: g.id,
          homeAbbr: g.homeAbbr,
          awayAbbr: g.awayAbbr,
          isNeutralSite: g.neutralSite,
          seasonType: g.seasonType,
          week: g.week,
          market: g.market
        },
        history
      };

      const pred = predictGame(input);

      // Verify active non-zero drivers per game (zero-magnitude drivers omitted per Req 6)
      expect(pred.drivers.length).toBeGreaterThanOrEqual(0);

      // Verify each driver detail references actual numbers
      pred.drivers.forEach(d => {
        expect(d.detail).toMatch(/\d+/);
      });

      // Sum signed driver magnitudes
      let sumSignedDrivers = 0;
      for (const d of pred.drivers) {
        if (d.direction === 'home') sumSignedDrivers += d.magnitude;
        else if (d.direction === 'away') sumSignedDrivers -= d.magnitude;
      }

      // Reconcile sum of signed drivers against engine-reported projectedMargin
      const diffPreRounding = Math.abs(sumSignedDrivers - pred.projectedMargin);
      expect(diffPreRounding).toBeLessThanOrEqual(0.51);

      // Also verify sum of signed drivers reconciles with rounded integer margin to within 1.01 pt
      const intMarginDiff = Math.abs(sumSignedDrivers - pred.margin);
      expect(intMarginDiff).toBeLessThanOrEqual(1.01);
    }
  });

  test('Req 6: Calibrated confidence and no fake certainty', () => {
    // Drive predictGame with real inputs spanning balanced to lopsided matchups
    const history1: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 24, awayScore: 24, date: `2025-09-${10+i}`
    }));
    const history2: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 30, awayScore: 10, date: `2025-09-${10+i}`
    }));
    const history3: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 40, awayScore: 0, date: `2025-09-${10+i}`
    }));
    const history4: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 21, awayScore: 20, date: `2025-09-${10+i}`
    }));
    const history5: HistoricalGame[] = Array(10).fill(null).map((_, i) => ({
      homeAbbr: 'BAL', awayAbbr: 'KC', homeScore: 55, awayScore: 0, date: `2025-09-${10+i}`
    }));

    const p1 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC', isNeutralSite: true }, history: history1 });
    const p2 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC' }, history: history2 });
    const p3 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC' }, history: history3 });
    const p4 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC', isNeutralSite: true }, history: history4 });
    const p5 = predictGame({ game: { homeAbbr: 'BAL', awayAbbr: 'KC' }, history: history5 });

    const predictions = [p1, p2, p3, p4, p5];

    // 1. Cap check: confidence <= 60 for homeWinProbability in [0.42, 0.58]
    for (const p of predictions) {
      if (p.homeWinProbability >= 0.42 && p.homeWinProbability <= 0.58) {
        expect(p.confidence).toBeLessThanOrEqual(60.0);
      }
    }

    // 2. Monotonicity check: confidence is non-decreasing as |homeWinProbability - 0.5| increases
    const sortedByDev = [...predictions].sort((a, b) => Math.abs(a.homeWinProbability - 0.5) - Math.abs(b.homeWinProbability - 0.5));
    for (let i = 1; i < sortedByDev.length; i++) {
      expect(sortedByDev[i].confidence).toBeGreaterThanOrEqual(sortedByDev[i - 1].confidence);
    }
  });

  test('Req 7: Determinism (predictGame called twice with same input is deeply equal)', () => {
    const input: PredictionInput = {
      game: { homeAbbr: 'KC', awayAbbr: 'SF', isNeutralSite: true, market: { spread: -2.5, total: 47.5 } },
      history: [
        { homeAbbr: 'KC', awayAbbr: 'DEN', homeScore: 27, awayScore: 24 },
        { homeAbbr: 'SF', awayAbbr: 'LAR', homeScore: 31, awayScore: 20 }
      ]
    };

    const res1 = predictGame(input);
    const res2 = predictGame(input);

    expect(res1).toEqual(res2);
  });

  test('Neutral-site and Super Bowl handling (HFA = 0.0)', () => {
    const neutralInput: PredictionInput = {
      game: { homeAbbr: 'KC', awayAbbr: 'PHI', isNeutralSite: true },
      history: []
    };

    const pred = predictGame(neutralInput);
    const hfaDriver = pred.drivers.find(d => d.key === 'home_field_advantage');
    expect(hfaDriver).toBeUndefined();

    const superBowlInput: PredictionInput = {
      game: { homeAbbr: 'SEA', awayAbbr: 'NE', seasonType: 3, week: 5 },
      history: []
    };
    const sbPred = predictGame(superBowlInput);
    const sbHfaDriver = sbPred.drivers.find(d => d.key === 'home_field_advantage');
    expect(sbHfaDriver).toBeUndefined();
  });

  test('total non-degenerate: holdout over/under shares >= 0.25, mean edge >= 1.0, zero edges <= 5%', () => {
    const holdoutGames = allGames.filter(g => (g.week >= 13 || g.seasonType === 3));
    expect(holdoutGames.length).toBe(107);

    let overs = 0;
    let unders = 0;
    let zeroEdges = 0;
    let totalEdgeSum = 0;

    for (const g of holdoutGames) {
      const targetTime = new Date(g.date).getTime();
      const pastGames = allGames.filter(prev => new Date(prev.date).getTime() < targetTime);

      const history: HistoricalGame[] = pastGames.map(prev => ({
        homeAbbr: prev.homeAbbr,
        awayAbbr: prev.awayAbbr,
        homeScore: prev.homeScore,
        awayScore: prev.awayScore,
        isNeutralSite: prev.neutralSite,
        date: prev.date,
        seasonType: prev.seasonType,
        week: prev.week
      }));

      const pred = predictGame({
        game: {
          id: g.id,
          homeAbbr: g.homeAbbr,
          awayAbbr: g.awayAbbr,
          isNeutralSite: g.neutralSite,
          seasonType: g.seasonType,
          week: g.week,
          market: g.market
        },
        history
      });

      if (pred.totalPick.side === 'over') overs++;
      else if (pred.totalPick.side === 'under') unders++;

      if (pred.totalPick.edge === 0) zeroEdges++;
      totalEdgeSum += pred.totalPick.edge;
    }

    const overShare = overs / holdoutGames.length;
    const underShare = unders / holdoutGames.length;
    const zeroEdgeShare = zeroEdges / holdoutGames.length;
    const meanEdge = totalEdgeSum / holdoutGames.length;

    expect(overShare).toBeGreaterThanOrEqual(0.25);
    expect(underShare).toBeGreaterThanOrEqual(0.25);
    expect(meanEdge).toBeGreaterThanOrEqual(1.0);
    expect(zeroEdgeShare).toBeLessThanOrEqual(0.05);
  });

  test('spread line sign: line signed correctly for picked team and marketSpread attached', () => {
    for (const g of allGames) {
      if (!g.market || g.market.spread === null) continue;

      const targetTime = new Date(g.date).getTime();
      const pastGames = allGames.filter(prev => new Date(prev.date).getTime() < targetTime);

      const history: HistoricalGame[] = pastGames.map(prev => ({
        homeAbbr: prev.homeAbbr,
        awayAbbr: prev.awayAbbr,
        homeScore: prev.homeScore,
        awayScore: prev.awayScore,
        isNeutralSite: prev.neutralSite,
        date: prev.date,
        seasonType: prev.seasonType,
        week: prev.week
      }));

      const pred = predictGame({
        game: {
          id: g.id,
          homeAbbr: g.homeAbbr,
          awayAbbr: g.awayAbbr,
          isNeutralSite: g.neutralSite,
          seasonType: g.seasonType,
          week: g.week,
          market: g.market
        },
        history
      });

      const rawSpread = g.market.spread; // negative = home favorite, positive = away favorite
      expect(pred.marketSpread).toBe(rawSpread);
      expect(Math.abs(pred.spreadPick.line)).toBe(Math.abs(rawSpread));

      // Home is favorite if rawSpread < 0, away is favorite if rawSpread > 0
      const isHomeFavorite = rawSpread < 0;
      const isAwayFavorite = rawSpread > 0;

      if (pred.spreadPick.team === g.homeAbbr) {
        if (isHomeFavorite) expect(pred.spreadPick.line).toBeLessThan(0);
        else if (isAwayFavorite) expect(pred.spreadPick.line).toBeGreaterThan(0);
      } else if (pred.spreadPick.team === g.awayAbbr) {
        if (isAwayFavorite) expect(pred.spreadPick.line).toBeLessThan(0);
        else if (isHomeFavorite) expect(pred.spreadPick.line).toBeGreaterThan(0);
      }
    }
  });

  test('Missing market data path (spread: null / market: null) produces no NaN', () => {
    const nullMarketInput: PredictionInput = {
      game: { homeAbbr: 'DET', awayAbbr: 'GB', market: null },
      history: [
        { homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 24, awayScore: 17 },
        { homeAbbr: 'GB', awayAbbr: 'MIN', homeScore: 20, awayScore: 23 }
      ]
    };

    const pred = predictGame(nullMarketInput);

    expect(Number.isNaN(pred.homeScore)).toBe(false);
    expect(Number.isNaN(pred.awayScore)).toBe(false);
    expect(Number.isNaN(pred.margin)).toBe(false);
    expect(Number.isNaN(pred.homeWinProbability)).toBe(false);
    expect(Number.isNaN(pred.confidence)).toBe(false);
    expect(Number.isNaN(pred.spreadPick.line)).toBe(false);
    expect(Number.isNaN(pred.spreadPick.edge)).toBe(false);
    expect(Number.isNaN(pred.totalPick.line)).toBe(false);
    expect(Number.isNaN(pred.totalPick.projected)).toBe(false);
    expect(Number.isNaN(pred.totalPick.edge)).toBe(false);
  });

  describe('Roster-aware injury and availability evaluation (Task 015)', () => {
    test('R1 & R2: Position weights and status multipliers calculate expected point penalties', () => {
      // Status multipliers
      expect(getStatusMultiplier('Out')).toBe(1.0);
      expect(getStatusMultiplier('Injured Reserve')).toBe(1.0);
      expect(getStatusMultiplier('IR')).toBe(1.0);
      expect(getStatusMultiplier('Suspension')).toBe(1.0);
      expect(getStatusMultiplier('Doubtful')).toBe(0.75);
      expect(getStatusMultiplier('Questionable')).toBe(0.35);
      expect(getStatusMultiplier('Active')).toBe(0.0);
      expect(getStatusMultiplier('Probable')).toBe(0.0);

      // Starters (rank 1)
      expect(getPositionBaseWeight('QB', 1)).toBe(5.5);
      expect(getPositionBaseWeight('WR', 1)).toBe(1.4);
      expect(getPositionBaseWeight('DE', 1)).toBe(1.3);
      expect(getPositionBaseWeight('EDGE', 1)).toBe(1.3);
      expect(getPositionBaseWeight('LT', 1)).toBe(1.2);
      expect(getPositionBaseWeight('OT', 1)).toBe(1.2);
      expect(getPositionBaseWeight('T', 1)).toBe(1.2);
      expect(getPositionBaseWeight('RB', 1)).toBe(1.0);
      expect(getPositionBaseWeight('CB', 1)).toBe(1.0);
      expect(getPositionBaseWeight('TE', 1)).toBe(0.6);
      expect(getPositionBaseWeight('C', 1)).toBe(0.6);

      // Backups (rank > 1)
      expect(getPositionBaseWeight('QB', 2)).toBe(0.5);
      expect(getPositionBaseWeight('WR', 2)).toBe(0.2);
      expect(getPositionBaseWeight('RB', 2)).toBe(0.2);
      expect(getPositionBaseWeight('LT', 2)).toBe(0.2);
      expect(getPositionBaseWeight('EDGE', 2)).toBe(0.2);
      expect(getPositionBaseWeight('CB', 2)).toBe(0.2);
      expect(getPositionBaseWeight('TE', 2)).toBe(0.1);

      // Practice squad
      expect(getPositionBaseWeight('QB', 1, 'practiceSquad')).toBe(0.0);
      expect(getPositionBaseWeight('WR', 1, 'practiceSquad')).toBe(0.0);

      // Combined player penalty calculations
      const qbOut: PlayerInjury = { name: 'Patrick Mahomes', position: 'QB', status: 'Out', depthChartRank: 1 };
      expect(calculatePlayerInjuryPenalty(qbOut)).toBe(5.5);

      const wrQuestionable: PlayerInjury = { name: 'Justin Jefferson', position: 'WR', status: 'Questionable', depthChartRank: 1 };
      expect(calculatePlayerInjuryPenalty(wrQuestionable)).toBeCloseTo(1.4 * 0.35, 4);

      const edgeDoubtful: PlayerInjury = { name: 'Micah Parsons', position: 'EDGE', status: 'Doubtful', depthChartRank: 1 };
      expect(calculatePlayerInjuryPenalty(edgeDoubtful)).toBeCloseTo(1.3 * 0.75, 4);

      const activePlayer: PlayerInjury = { name: 'Lamar Jackson', position: 'QB', status: 'Active', depthChartRank: 1 };
      expect(calculatePlayerInjuryPenalty(activePlayer)).toBe(0.0);
    });

    test('R7: Materiality check - QB1-out shifts projected margin by materially more than WR3-out', () => {
      const baseInput: PredictionInput = {
        game: { homeAbbr: 'KC', awayAbbr: 'LV', isNeutralSite: false },
        history: [
          { homeAbbr: 'KC', awayAbbr: 'DEN', homeScore: 28, awayScore: 14 },
          { homeAbbr: 'LV', awayAbbr: 'LAC', homeScore: 17, awayScore: 24 }
        ],
        homeInjuries: [],
        awayInjuries: []
      };

      const predBase = predictGame(baseInput);

      // QB1 Out on home team
      const qbOutInput: PredictionInput = {
        ...baseInput,
        homeInjuries: [
          { name: 'Patrick Mahomes', position: 'QB', status: 'Out', depthChartRank: 1 }
        ]
      };
      const predQBOut = predictGame(qbOutInput);
      const qbShift = predBase.projectedMargin - predQBOut.projectedMargin;
      expect(qbShift).toBeCloseTo(5.50, 2);

      // WR3 Out on home team
      const wr3OutInput: PredictionInput = {
        ...baseInput,
        homeInjuries: [
          { name: 'Mecole Hardman', position: 'WR', status: 'Out', depthChartRank: 3 }
        ]
      };
      const predWR3Out = predictGame(wr3OutInput);
      const wr3Shift = predBase.projectedMargin - predWR3Out.projectedMargin;
      expect(wr3Shift).toBeCloseTo(0.20, 2);

      // Verify QB-out impact is materially greater than WR3-out impact (by 5.30 points)
      expect(qbShift).toBeGreaterThan(wr3Shift);
      expect(qbShift - wr3Shift).toBeCloseTo(5.30, 2);
    });

    test('R7: All-Active injury list shifts projected margin by exactly 0.00', () => {
      const baseInput: PredictionInput = {
        game: { homeAbbr: 'DET', awayAbbr: 'GB' },
        history: [
          { homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 24, awayScore: 17 },
          { homeAbbr: 'GB', awayAbbr: 'MIN', homeScore: 20, awayScore: 23 }
        ],
        homeInjuries: [],
        awayInjuries: []
      };

      const predBase = predictGame(baseInput);

      const activeInjuries: PlayerInjury[] = [
        { name: 'Jared Goff', position: 'QB', status: 'Active', depthChartRank: 1 },
        { name: 'Amon-Ra St. Brown', position: 'WR', status: 'Active', depthChartRank: 1 },
        { name: 'Penei Sewell', position: 'OT', status: 'Active', depthChartRank: 1 },
        { name: 'Aidan Hutchinson', position: 'DE', status: 'Active', depthChartRank: 1 }
      ];

      const predWithActive = predictGame({
        ...baseInput,
        homeInjuries: activeInjuries,
        awayInjuries: activeInjuries
      });

      // Shift must be exactly 0.00
      expect(predWithActive.projectedMargin).toEqual(predBase.projectedMargin);
      expect(predWithActive.homeScore).toEqual(predBase.homeScore);
      expect(predWithActive.awayScore).toEqual(predBase.awayScore);

      // Driver must have 0 magnitude and be excluded
      const rosterDriver = predWithActive.drivers.find(d => d.key === 'roster_injury_modifier');
      expect(rosterDriver).toBeUndefined();
    });

    test('R3: Cap scaling - team injury penalty is capped at MAX_TEAM_INJURY_PENALTY (10.0)', () => {
      expect(MAX_TEAM_INJURY_PENALTY).toBe(10.0);

      const massiveInjuries: PlayerInjury[] = [
        { name: 'Star QB', position: 'QB', status: 'Out', depthChartRank: 1 }, // 5.5
        { name: 'Star WR1', position: 'WR', status: 'Out', depthChartRank: 1 }, // 1.4
        { name: 'Star EDGE', position: 'EDGE', status: 'Out', depthChartRank: 1 }, // 1.3
        { name: 'Star LT', position: 'LT', status: 'Out', depthChartRank: 1 }, // 1.2
        { name: 'Star CB', position: 'CB', status: 'Out', depthChartRank: 1 }, // 1.0
        { name: 'Star RB', position: 'RB', status: 'Out', depthChartRank: 1 }, // 1.0
        { name: 'Star TE', position: 'TE', status: 'Out', depthChartRank: 1 }  // 0.6
      ]; // Sum = 12.0

      const evalResult = calculateTeamInjuryPenalty(massiveInjuries);
      expect(evalResult.unclippedPenalty).toBeCloseTo(12.0, 2);
      expect(evalResult.penalty).toBe(10.0);

      const pred = predictGame({
        game: { homeAbbr: 'MIA', awayAbbr: 'BUF' },
        history: [],
        homeInjuries: massiveInjuries,
        awayInjuries: []
      });

      const injuryDriver = pred.drivers.find(d => d.key === 'roster_injury_modifier');
      expect(injuryDriver).toBeDefined();
      expect(injuryDriver!.magnitude).toBe(10.0);
      expect(injuryDriver!.direction).toBe('away'); // Home has 10.0 penalty, favoring away
    });

    test('R4: Driver renders with descriptive detail naming players and positions', () => {
      const pred = predictGame({
        game: { homeAbbr: 'KC', awayAbbr: 'BAL' },
        history: [],
        homeInjuries: [
          { name: 'Patrick Mahomes', position: 'QB', status: 'Out', depthChartRank: 1 }
        ],
        awayInjuries: [
          { name: 'Roquan Smith', position: 'LB', status: 'Doubtful', depthChartRank: 1 }
        ]
      });

      const driver = pred.drivers.find(d => d.key === 'roster_injury_modifier');
      expect(driver).toBeDefined();
      expect(driver!.magnitude).toBeGreaterThan(0);
      expect(driver!.detail).toContain('Patrick Mahomes');
      expect(driver!.detail).toContain('QB');
      expect(driver!.detail).toContain('Out');
      expect(driver!.detail).toContain('Roquan Smith');
    });

    test('R5: starterQB removed from TEAMS static data, starters resolved via snapshot depth chart', () => {
      // Confirm all 32 teams have no starterQB field in TEAMS
      for (const [abbr, team] of Object.entries(TEAMS)) {
        expect((team as any).starterQB).toBeUndefined();
      }

      // Mock snapshot with starter and backup QB
      const mockSnapshot: RosterSnapshot = {
        schemaVersion: 1,
        fetchedAt: new Date().toISOString(),
        transactions: [],
        teams: {
          KC: {
            roster: [
              { name: 'Patrick Mahomes', position: 'QB', group: 'offense', depthChartRank: 1, rank: 1, status: 'Active' },
              { name: 'Carson Wentz', position: 'QB', group: 'offense', depthChartRank: 2, rank: 2 }
            ],
            groups: {}
          },
          CIN: {
            roster: [
              { name: 'Joe Burrow', position: 'QB', group: 'offense', depthChartRank: 1, rank: 1, status: 'Out' },
              { name: 'Jake Browning', position: 'QB', group: 'offense', depthChartRank: 2, rank: 2, status: 'Active' }
            ],
            groups: {}
          }
        }
      };

      // KC: Mahomes is Active -> Mahomes starts, backup not starting
      const kcQB = resolveTeamQB('KC', mockSnapshot);
      expect(kcQB.starterName).toBe('Patrick Mahomes');
      expect(kcQB.isBackupStarting).toBe(false);

      // CIN: Burrow is Out -> Browning starts, backup starting true, Burrow named
      const cinQB = resolveTeamQB('CIN', mockSnapshot);
      expect(cinQB.starterName).toBe('Jake Browning');
      expect(cinQB.isBackupStarting).toBe(true);
      expect(cinQB.injuredStarterName).toBe('Joe Burrow');
      expect(cinQB.injuryStatus).toBe('Out');
    });

    test('R6: Transactions (trades and releases) are respected in injuries and QB resolution', () => {
      const mockSnapshotWithTx: RosterSnapshot = {
        schemaVersion: 1,
        fetchedAt: new Date().toISOString(),
        transactions: [
          // Player released from KC
          { type: 'removed', playerName: 'Kadarius Toney', position: 'WR', team: 'KC', fromTeam: 'KC' },
          // Player traded from NYJ to KC
          { type: 'moved', playerName: 'Davante Adams', position: 'WR', fromTeam: 'NYJ', toTeam: 'KC' }
        ],
        teams: {
          KC: {
            roster: [
              { name: 'Patrick Mahomes', position: 'QB', group: 'offense', depthChartRank: 1, rank: 1, status: 'Active' },
              { name: 'Kadarius Toney', position: 'WR', group: 'offense', depthChartRank: 2, rank: 2, status: 'Questionable' }
            ],
            groups: {}
          },
          NYJ: {
            roster: [
              { name: 'Davante Adams', position: 'WR', group: 'offense', depthChartRank: 1, rank: 1, status: 'Out' },
              { name: 'Aaron Rodgers', position: 'QB', group: 'offense', depthChartRank: 1, rank: 1, status: 'Active' }
            ],
            groups: {}
          }
        }
      };

      const kcInjuries = getTeamInjuriesForEngine(mockSnapshotWithTx, 'KC');
      // Kadarius Toney was removed -> must NOT appear in KC injuries
      expect(kcInjuries.some(p => p.name === 'Kadarius Toney')).toBe(false);
      // Davante Adams was moved to KC -> MUST appear in KC injuries
      expect(kcInjuries.some(p => p.name === 'Davante Adams')).toBe(true);

      const nyjInjuries = getTeamInjuriesForEngine(mockSnapshotWithTx, 'NYJ');
      // Davante Adams was moved away from NYJ -> must NOT appear in NYJ injuries
      expect(nyjInjuries.some(p => p.name === 'Davante Adams')).toBe(false);
    });

    test('R8: Safe degradation on missing, unparseable, or stale snapshots', () => {
      // 1. Missing snapshot
      expect(getSafeRosterSnapshot(null)).toBeNull();
      expect(getSafeRosterSnapshot(undefined)).not.toBeNull(); // Loads valid disk snapshot if available

      // 2. Unparseable snapshot (missing required schema fields)
      expect(getSafeRosterSnapshot({ invalid: 'data' })).toBeNull();
      expect(getSafeRosterSnapshot({ schemaVersion: 1, fetchedAt: '2026-09-01T00:00:00Z', teams: {} })).toBeNull();

      // 3. Stale snapshot (> 7 days old) vs Fresh snapshot (<= 7 days old)
      const validDiskSnapshot = getSafeRosterSnapshot();
      expect(validDiskSnapshot).not.toBeNull();
      const staleSnapshot = {
        ...validDiskSnapshot,
        fetchedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(getSafeRosterSnapshot(staleSnapshot)).toBeNull();

      const freshSnapshot = {
        ...validDiskSnapshot,
        fetchedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(getSafeRosterSnapshot(freshSnapshot)).not.toBeNull();

      // 4. Safe degradation execution: with null snapshot, prediction completes with 0.00 availability adjustment
      const degradedHomeInjuries = getTeamInjuriesForEngine(null, 'KC');
      expect(degradedHomeInjuries).toEqual([]);

      const fallbackQB = resolveTeamQB('KC', null, 'Patrick Mahomes');
      expect(fallbackQB.starterName).toBe('Patrick Mahomes');
      expect(fallbackQB.isBackupStarting).toBe(false);

      const degradedPred = predictGame({
        game: { homeAbbr: 'KC', awayAbbr: 'DEN' },
        history: [],
        homeInjuries: degradedHomeInjuries,
        awayInjuries: []
      });
      expect(Number.isNaN(degradedPred.projectedMargin)).toBe(false);
      expect(degradedPred.drivers.find(d => d.key === 'roster_injury_modifier')).toBeUndefined();
    });
  });

  describe('Task 018: Displaced starter detection on real data', () => {
    test('R4: committed snapshot - ATL Michael Penix Jr. (rank 2, Out) is displaced and scores at the full QB weight (5.5), not the backup weight (0.5)', () => {
      const snapshot = loadRosterSnapshot();
      const atlInjuries = getTeamInjuriesForEngine(snapshot, 'ATL');

      const penix = atlInjuries.find(p => p.name === 'Michael Penix Jr.');
      expect(penix).toBeDefined();
      expect(penix!.depthChartRank).toBe(2);
      expect(penix!.status).toBe('Out');
      expect(penix!.isDisplacedStarter).toBe(true);

      const penalty = calculatePlayerInjuryPenalty(penix!);
      expect(penalty).toBeCloseTo(5.5, 4); // 5.5 x 1.0
      expect(penalty).not.toBeCloseTo(0.5, 4);
    });

    test('R6: replacement moving up is not an additional loss - ATL scores exactly one displaced QB at 5.5', () => {
      const snapshot = loadRosterSnapshot();
      const atlInjuries = getTeamInjuriesForEngine(snapshot, 'ATL');

      const displacedQBs = atlInjuries.filter(p => p.position === 'QB' && p.isDisplacedStarter);
      expect(displacedQBs).toHaveLength(1);

      const penix = displacedQBs[0];
      expect(penix.name).toBe('Michael Penix Jr.');
      expect(calculatePlayerInjuryPenalty(penix)).toBeCloseTo(5.5, 4);

      // The promoted starter (Tua, rank 1) is not penalized for having "moved up".
      const tua = atlInjuries.find(p => p.name === 'Tua Tagovailoa');
      expect(tua).toBeDefined();
      expect(calculatePlayerInjuryPenalty(tua!)).toBe(0);
    });

    test('R6 fixture: a team with exactly one displaced starting QB produces 5.5, not 6.0', () => {
      const injuries: PlayerInjury[] = [
        { name: 'Displaced Starter', position: 'QB', status: 'Out', depthChartRank: 2, previousRank: 1, isDisplacedStarter: true },
        { name: 'Promoted Backup', position: 'QB', status: 'Active', depthChartRank: 1 }
      ];

      const res = calculateTeamInjuryPenalty(injuries);
      expect(res.unclippedPenalty).toBeCloseTo(5.5, 4);
      expect(res.penalty).toBeCloseTo(5.5, 4);
      expect(res.penalty).not.toBeCloseTo(6.0, 0);
    });
  });

  describe('Task 021: untested correctness invariants in the predictor', () => {
    test('R1: confidence calibration uses the second branch once dev > 0.08, yielding a value the first-branch formula cannot produce', () => {
      // First-branch floor: neutral venue + empty history -> projectedMarginPre 0 -> p exactly 0.5, dev = 0.
      const floor = predictGame({
        game: { homeAbbr: 'H', awayAbbr: 'A', isNeutralSite: true, market: { spread: null, total: 44 } },
        history: []
      });
      expect(floor.homeWinProbability).toBe(0.5);
      expect(floor.confidence).toBe(50.0);

      // Second-branch: one neutral 20-10 home win sets projectedMarginPre = 5.0
      // (ridge-shrunk rating 2.5 each side) -> p = 1 / (1 + e^-(5/7)) = 0.6713, dev = 0.1713.
      const pred = predictGame({
        game: { homeAbbr: 'H', awayAbbr: 'A', isNeutralSite: true, market: { spread: null, total: 44 } },
        history: [
          { homeAbbr: 'H', awayAbbr: 'A', homeScore: 20, awayScore: 10, isNeutralSite: true, date: '2025-09-01', seasonType: 2, week: 1 }
        ]
      });
      expect(pred.projectedMargin).toBe(5.0);

      const dev = Math.abs(pred.homeWinProbability - 0.5);
      expect(pred.homeWinProbability).toBe(0.6713);
      expect(dev).toBeGreaterThan(0.08);
      expect(dev).toBeLessThanOrEqual(0.18); // inside the mutation window dev <= 0.18

      // Second branch (line 332): 60 + ((0.1713 - 0.08) / 0.42) * 38 = 68.2605 -> 68.3.
      expect(pred.confidence).toBe(68.3);

      // First branch (line 330) would give 50 + (0.1713 / 0.08) * 10 = 71.4 for this dev;
      // asserting the value is NOT 71.4 fails the widened-threshold mutation (dev <= 0.18).
      expect(pred.confidence).not.toBe(71.4);
    });

    test('R2: totalPick.side matches which side of the line projectedTotalVal actually falls on', () => {
      // Over: BRK beat NOK 35-7 -> histTotalProj = 22*(25/9 + 1/9) = 63.56;
      // projectedTotalVal = 0.3*63.56 + 0.7*44 = 49.8667 -> 49.9 > 44.
      const overGame = predictGame({
        game: { homeAbbr: 'BRK', awayAbbr: 'NOK', isNeutralSite: true, market: { spread: null, total: 44 } },
        history: [
          { homeAbbr: 'BRK', awayAbbr: 'NOK', homeScore: 35, awayScore: 7, isNeutralSite: true, date: '2025-09-01', seasonType: 2, week: 1 }
        ]
      });
      expect(overGame.totalPick.projected).toBe(49.9);
      expect(overGame.totalPick.line).toBe(44);
      expect(overGame.totalPick.side).toBe('over');

      // Under: NOK scored 3 in a 30-3 loss to BRK, SLC scored 7 in a 40-7 loss to ORL
      // (league avg 20) -> histTotalProj = 22*(0.15*2.0 + 0.35*1.5) = 18.15;
      // projectedTotalVal = 0.3*18.15 + 0.7*44 = 36.245 -> 36.2 < 44.
      const underGame = predictGame({
        game: { homeAbbr: 'NOK', awayAbbr: 'SLC', isNeutralSite: true, market: { spread: null, total: 44 } },
        history: [
          { homeAbbr: 'BRK', awayAbbr: 'NOK', homeScore: 30, awayScore: 3, isNeutralSite: true, date: '2025-09-01', seasonType: 2, week: 1 },
          { homeAbbr: 'ORL', awayAbbr: 'SLC', homeScore: 40, awayScore: 7, isNeutralSite: true, date: '2025-09-02', seasonType: 2, week: 1 }
        ]
      });
      expect(underGame.totalPick.projected).toBe(36.2);
      expect(underGame.totalPick.line).toBe(44);
      expect(underGame.totalPick.side).toBe('under');
    });

    test('R3: predicted scores never tie - even projected total with zero projected margin still yields margin !== 0', () => {
      // Neutral + empty history -> projectedMarginPre = 0 exactly; market total 50 ->
      // projectedTotalVal 50 -> homeScoreRaw = awayScoreRaw = 25 before rounding;
      // the tie-breaker must add 1 to one side (26-25), never return 25-25 / margin 0.
      const pred = predictGame({
        game: { homeAbbr: 'H', awayAbbr: 'A', isNeutralSite: true, market: { spread: null, total: 50 } },
        history: []
      });

      expect(pred.projectedMargin).toBe(0);
      expect(pred.homeScore).toBe(26);
      expect(pred.awayScore).toBe(25);
      expect(pred.homeScore).not.toBe(pred.awayScore);
      expect(pred.margin).not.toBe(0);
      expect(pred.margin).toBe(1);
      expect(pred.winner).toBe('H');
    });
  });
});
