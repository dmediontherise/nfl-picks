import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { calculateStandings, GameResult, StandingsModal } from '../StandingsModal';
import { inferAgreementState, migratePredictions } from '../services/userService';
import { determineGameVerdict, generateCSVContent } from '../utils/csvExporter';
import { backfillUnresolvedResults } from '../App';
import { Game, UserPrediction } from '../types';

describe('User vs AI Competition Engine (Task 016)', () => {
  describe('R1 & R2: Agreement state inference and legacy data migration', () => {
    test('inferAgreementState correctly infers agreed, deviated, and unset states', () => {
      // Missing user scores -> unset
      expect(inferAgreementState({})).toBe('unset');
      expect(inferAgreementState({ homeScore: '24', awayScore: '17' })).toBe('unset');
      expect(inferAgreementState({ homeScore: '24', awayScore: '17', userHomeScore: '' })).toBe('unset');

      // Identical scores -> agreed
      expect(inferAgreementState({
        homeScore: '27',
        awayScore: '20',
        userHomeScore: '27',
        userAwayScore: '20'
      })).toBe('agreed');

      // Different scores -> deviated
      expect(inferAgreementState({
        homeScore: '27',
        awayScore: '20',
        userHomeScore: '30',
        userAwayScore: '20'
      })).toBe('deviated');

      // Existing explicit agreementState preserved
      expect(inferAgreementState({
        homeScore: '27',
        awayScore: '20',
        userHomeScore: '27',
        userAwayScore: '20',
        agreementState: 'deviated' // Explicitly set even if scores match
      })).toBe('deviated');
    });

    test('migratePredictions migrates legacy unmigrated records without data loss or corruption', () => {
      const legacyRecords: Record<string, any> = {
        game1: {
          gameId: 'game1',
          homeScore: '24',
          awayScore: '17',
          predictedWinner: 'Kansas City Chiefs',
          userHomeScore: '24',
          userAwayScore: '17',
          userPredictedWinner: 'Kansas City Chiefs'
        },
        game2: {
          gameId: 'game2',
          homeScore: '20',
          awayScore: '23',
          predictedWinner: 'Buffalo Bills',
          userHomeScore: '27',
          userAwayScore: '20',
          userPredictedWinner: 'Miami Dolphins'
        },
        game3: {
          gameId: 'game3',
          homeScore: '31',
          awayScore: '14',
          predictedWinner: 'Baltimore Ravens'
        }
      };

      const { migrated, hasChanges } = migratePredictions(legacyRecords);

      expect(hasChanges).toBe(true);

      // game1 was identical scores -> agreed
      expect(migrated.game1.agreementState).toBe('agreed');
      expect(migrated.game1.homeScore).toBe('24');
      expect(migrated.game1.userHomeScore).toBe('24');

      // game2 was different scores -> deviated
      expect(migrated.game2.agreementState).toBe('deviated');
      expect(migrated.game2.userPredictedWinner).toBe('Miami Dolphins');

      // game3 had missing user fields -> unset
      expect(migrated.game3.agreementState).toBe('unset');

      // Re-migrating already migrated records produces hasChanges: false
      const secondPass = migratePredictions(migrated);
      expect(secondPass.hasChanges).toBe(false);
      expect(secondPass.migrated).toEqual(migrated);
    });
  });

  describe('R3: Head-to-Head record and Scoreboard', () => {
    test('renders "You\'ve taken every engine pick" when there are no deviations', () => {
      const predictions: Record<string, UserPrediction> = {
        g1: {
          gameId: 'g1',
          homeScore: '24',
          awayScore: '20',
          predictedWinner: 'Chiefs',
          userHomeScore: '24',
          userAwayScore: '20',
          userPredictedWinner: 'Chiefs',
          agreementState: 'agreed'
        }
      };

      const results: Record<string, GameResult> = {
        g1: {
          homeScore: 24,
          awayScore: 20,
          spread: 'KC -3.5',
          homeAbbr: 'KC',
          awayAbbr: 'LV',
          homeName: 'Chiefs',
          awayName: 'Raiders'
        }
      };

      const standings = calculateStandings(predictions, results);
      expect(standings.hasDeviations).toBe(false);
      expect(standings.userOverall.w).toBe(1);
      expect(standings.appOverall.w).toBe(1);
      expect(standings.userH2H.w).toBe(0);
      expect(standings.userH2H.l).toBe(0);

      render(<StandingsModal onClose={() => {}} predictions={predictions} results={results} />);
      expect(screen.getByText("You've taken every engine pick")).toBeInTheDocument();
    });

    test('computes Overall records and Head-to-Head record for deviated games (You 3-1, AI 1-3)', () => {
      const predictions: Record<string, UserPrediction> = {};
      const results: Record<string, GameResult> = {};

      // 4 Deviated games:
      // Game d1: User correct (Home), AI wrong (Away) -> Actual Winner Home
      // Game d2: User correct (Home), AI wrong (Away) -> Actual Winner Home
      // Game d3: User correct (Home), AI wrong (Away) -> Actual Winner Home
      // Game d4: User wrong (Home), AI correct (Away) -> Actual Winner Away
      // H2H: You 3-1, AI 1-3
      for (let i = 1; i <= 3; i++) {
        const id = `dev_${i}`;
        predictions[id] = {
          gameId: id,
          homeScore: '14',
          awayScore: '24',
          predictedWinner: 'Team Away',
          userHomeScore: '27',
          userAwayScore: '20',
          userPredictedWinner: 'Team Home',
          agreementState: 'deviated',
          week: 1
        };
        results[id] = {
          homeScore: 27,
          awayScore: 20,
          spread: 'TH -3.0',
          homeAbbr: 'TH',
          awayAbbr: 'TA',
          homeName: 'Team Home',
          awayName: 'Team Away',
          week: 1
        };
      }

      predictions['dev_4'] = {
        gameId: 'dev_4',
        homeScore: '17',
        awayScore: '24',
        predictedWinner: 'Team Away',
        userHomeScore: '24',
        userAwayScore: '17',
        userPredictedWinner: 'Team Home',
        agreementState: 'deviated',
        week: 1
      };
      results['dev_4'] = {
        homeScore: 17,
        awayScore: 24,
        spread: 'TA -3.0',
        homeAbbr: 'TH',
        awayAbbr: 'TA',
        homeName: 'Team Home',
        awayName: 'Team Away',
        week: 1
      };

      // 9 Agreed games:
      // 6 Agreed Wins (both correct) -> User +6, AI +6
      // 3 Agreed Losses (both wrong) -> User +3 losses, AI +3 losses
      for (let i = 1; i <= 6; i++) {
        const id = `agr_win_${i}`;
        predictions[id] = {
          gameId: id,
          homeScore: '24',
          awayScore: '17',
          predictedWinner: 'Team Home',
          userHomeScore: '24',
          userAwayScore: '17',
          userPredictedWinner: 'Team Home',
          agreementState: 'agreed',
          week: 2
        };
        results[id] = {
          homeScore: 24,
          awayScore: 17,
          spread: 'TH -6.0',
          homeAbbr: 'TH',
          awayAbbr: 'TA',
          homeName: 'Team Home',
          awayName: 'Team Away',
          week: 2
        };
      }

      for (let i = 1; i <= 3; i++) {
        const id = `agr_loss_${i}`;
        predictions[id] = {
          gameId: id,
          homeScore: '24',
          awayScore: '17',
          predictedWinner: 'Team Home',
          userHomeScore: '24',
          userAwayScore: '17',
          userPredictedWinner: 'Team Home',
          agreementState: 'agreed',
          week: 2
        };
        results[id] = {
          homeScore: 17,
          awayScore: 24,
          spread: 'TH -6.0',
          homeAbbr: 'TH',
          awayAbbr: 'TA',
          homeName: 'Team Home',
          awayName: 'Team Away',
          week: 2
        };
      }

      const standings = calculateStandings(predictions, results);

      // Verify Overall: User 9-4, AI 7-6 (User: 3 dev + 6 agr = 9W, 1 dev + 3 agr = 4L; AI: 1 dev + 6 agr = 7W, 3 dev + 3 agr = 6L)
      expect(standings.userOverall.w).toBe(9);
      expect(standings.userOverall.l).toBe(4);

      expect(standings.appOverall.w).toBe(7);
      expect(standings.appOverall.l).toBe(6);

      // Verify exact When You Disagreed: You 3-1, AI 1-3
      expect(standings.hasDeviations).toBe(true);
      expect(standings.userH2H.w).toBe(3);
      expect(standings.userH2H.l).toBe(1);
      expect(standings.appH2H.w).toBe(1);
      expect(standings.appH2H.l).toBe(3);
    });
  });

  describe('R4: Per-game verdict determination', () => {
    test('determineGameVerdict correctly outputs user, ai, both, and missed verdicts', () => {
      const predDev: UserPrediction = {
        gameId: 'g1',
        homeScore: '24',
        awayScore: '20',
        predictedWinner: 'Chiefs',
        userHomeScore: '17',
        userAwayScore: '28',
        userPredictedWinner: 'Bills',
        agreementState: 'deviated'
      };

      // Bills won (Away) -> User won, AI lost
      expect(determineGameVerdict(predDev, 20, 28, 'Chiefs', 'Bills')).toBe('User Won');

      // Chiefs won (Home) -> AI won, User lost
      expect(determineGameVerdict(predDev, 24, 17, 'Chiefs', 'Bills')).toBe('AI Won');

      // Incomplete game -> Pending
      expect(determineGameVerdict(predDev, undefined, undefined, 'Chiefs', 'Bills')).toBe('Pending');

      // Agreed pick
      const predAgreed: UserPrediction = {
        gameId: 'g2',
        homeScore: '24',
        awayScore: '20',
        predictedWinner: 'Chiefs',
        userHomeScore: '24',
        userAwayScore: '20',
        userPredictedWinner: 'Chiefs',
        agreementState: 'agreed'
      };
      expect(determineGameVerdict(predAgreed, 24, 20, 'Chiefs', 'Bills')).toBe('Agreed (Won)');
      expect(determineGameVerdict(predAgreed, 17, 24, 'Chiefs', 'Bills')).toBe('Agreed (Missed)');
    });
  });

  describe('R5: Reliable backfill of unresolved picks', () => {
    test('backfillUnresolvedResults fetches only weeks with unresolved picks and updates cache', async () => {
      const existingResults: Record<string, any> = {
        g1: { homeScore: 24, awayScore: 17, homeName: 'Chiefs', awayName: 'Raiders', week: 1 }
      };

      const predictions: Record<string, UserPrediction> = {
        g1: { gameId: 'g1', homeScore: '24', awayScore: '17', predictedWinner: 'Chiefs', week: 1 },
        g2: { gameId: 'g2', homeScore: '30', awayScore: '20', predictedWinner: 'Lions', week: 2 }
      };

      const mockFetchedWeeks: number[] = [];
      const mockFetchSchedule = async (week?: number) => {
        if (week) mockFetchedWeeks.push(week);
        return {
          data: [
            {
              id: 'g2',
              week: 2,
              status: 'post',
              homeTeam: { name: 'Lions', abbreviation: 'DET', score: 31 },
              awayTeam: { name: 'Packers', abbreviation: 'GB', score: 26 },
              bettingData: { spread: 'DET -4.5' }
            }
          ] as unknown as Game[]
        };
      };

      const updated = await backfillUnresolvedResults(predictions, existingResults, mockFetchSchedule as any);

      // Only week 2 was unresolved, week 1 already had results
      expect(mockFetchedWeeks).toEqual([2]);
      expect(updated.g2).toBeDefined();
      expect(updated.g2.homeScore).toBe(31);
      expect(updated.g2.awayScore).toBe(26);
    });
  });

  describe('R6 & R7: Weekly breakdown and MAE score accuracy', () => {
    test('calculateStandings computes correct Mean Absolute Error on margin and weekly breakdown', () => {
      const predictions: Record<string, UserPrediction> = {
        // Week 1:
        // Actual margin: 24 - 14 = +10 home
        // User predicted: 24 - 17 = +7 home (error = |7 - 10| = 3)
        // AI predicted: 30 - 10 = +20 home (error = |20 - 10| = 10)
        w1: {
          gameId: 'w1',
          homeScore: '30',
          awayScore: '10',
          predictedWinner: 'Home1',
          userHomeScore: '24',
          userAwayScore: '17',
          userPredictedWinner: 'Home1',
          agreementState: 'deviated',
          week: 1
        },
        // Week 2:
        // Actual margin: 20 - 27 = -7 (away by 7)
        // User predicted: 21 - 24 = -3 (error = |-3 - (-7)| = 4)
        // AI predicted: 20 - 24 = -4 (error = |-4 - (-7)| = 3)
        w2: {
          gameId: 'w2',
          homeScore: '20',
          awayScore: '24',
          predictedWinner: 'Away2',
          userHomeScore: '21',
          userAwayScore: '24',
          userPredictedWinner: 'Away2',
          agreementState: 'agreed',
          week: 2
        }
      };

      const results: Record<string, GameResult> = {
        w1: { homeScore: 24, awayScore: 14, spread: 'H1 -6.5', homeAbbr: 'H1', awayAbbr: 'A1', homeName: 'Home1', awayName: 'Away1', week: 1 },
        w2: { homeScore: 20, awayScore: 27, spread: 'A2 -2.5', homeAbbr: 'H2', awayAbbr: 'A2', homeName: 'Home2', awayName: 'Away2', week: 2 }
      };

      const standings = calculateStandings(predictions, results);

      // User MAE = (3 + 4) / 2 = 3.5 pts
      expect(standings.userMAE).toBe('3.5');

      // AI MAE = (10 + 3) / 2 = 6.5 pts
      expect(standings.appMAE).toBe('6.5');

      // Weekly records has 2 weeks
      expect(standings.weeklyRecords).toHaveLength(2);
      expect(standings.weeklyRecords[0].week).toBe(1);
      expect(standings.weeklyRecords[0].user.w).toBe(1);
      expect(standings.weeklyRecords[0].app.w).toBe(1);
      expect(standings.weeklyRecords[0].deviatedCount).toBe(1);

      expect(standings.weeklyRecords[1].week).toBe(2);
      expect(standings.weeklyRecords[1].deviatedCount).toBe(0);
    });
  });

  describe('R8: CSV Export with agreementState and verdict', () => {
    test('generateCSVContent includes Agreement State, Verdict, and scores', () => {
      const schedule: Game[] = [
        {
          id: 'g10',
          week: 3,
          date: '2025-09-21T17:00:00Z',
          venue: 'Stadium',
          homeTeam: { id: '1', name: 'Packers', abbreviation: 'GB', logoUrl: '', color: '' },
          awayTeam: { id: '2', name: 'Lions', abbreviation: 'DET', logoUrl: '', color: '' },
          status: 'post'
        }
      ];

      const predictions: Record<string, UserPrediction> = {
        g10: {
          gameId: 'g10',
          homeScore: '24',
          awayScore: '27',
          predictedWinner: 'Lions',
          userHomeScore: '31',
          userAwayScore: '20',
          userPredictedWinner: 'Packers',
          agreementState: 'deviated',
          week: 3
        }
      };

      const results: Record<string, any> = {
        g10: {
          homeScore: 31,
          awayScore: 20,
          homeName: 'Packers',
          awayName: 'Lions'
        }
      };

      const csv = generateCSVContent(schedule, predictions, results);

      // Check header
      expect(csv).toContain('Agreement State');
      expect(csv).toContain('Verdict');

      // Check row values
      expect(csv).toContain('deviated');
      expect(csv).toContain('User Won');
      expect(csv).toContain('"Lions"'); // AI Pick
      expect(csv).toContain('"Packers"'); // User Pick
    });
  });

  describe('Non-negotiable: Preserved ATS Logic', () => {
    test('verifies ATS push, home favorite, and underdog line calculations', () => {
      // Home favored by 3.5, wins by 4 (cover)
      const resCover: GameResult = {
        homeScore: 24,
        awayScore: 20,
        spread: 'BUF -3.5',
        homeAbbr: 'BUF',
        awayAbbr: 'MIA',
        homeName: 'Bills',
        awayName: 'Dolphins'
      };

      const predCover: UserPrediction = {
        gameId: 'c1',
        homeScore: '28',
        awayScore: '20',
        predictedWinner: 'Bills',
        userHomeScore: '28',
        userAwayScore: '20',
        userPredictedWinner: 'Bills',
        agreementState: 'agreed'
      };

      const s1 = calculateStandings({ c1: predCover }, { c1: resCover });
      expect(s1.userOverall.atsW).toBe(1);
      expect(s1.userOverall.atsL).toBe(0);
      expect(s1.userOverall.atsP).toBe(0);

      // Push case: Home favored by 3, wins by exactly 3
      const resPush: GameResult = {
        homeScore: 24,
        awayScore: 21,
        spread: 'BUF -3.0',
        homeAbbr: 'BUF',
        awayAbbr: 'MIA',
        homeName: 'Bills',
        awayName: 'Dolphins'
      };

      const s2 = calculateStandings({ c1: predCover }, { c1: resPush });
      expect(s2.userOverall.atsP).toBe(1);
      expect(s2.userOverall.atsW).toBe(0);
      expect(s2.userOverall.atsL).toBe(0);
    });
  });
});
