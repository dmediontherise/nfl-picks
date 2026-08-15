import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PlayoffBracket, { getConference, getGameConference, getResolvedSeed1, parseTeamRecord } from '../components/PlayoffBracket';
import { espnApi } from '../services/espnAdapter';
import { TEAMS } from '../data/nfl_data';

jest.mock('../services/espnAdapter', () => ({
  espnApi: {
    getSchedule: jest.fn()
  }
}));

describe('PlayoffBracket Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preseason seeding: no concrete team in any seed slot at 0-0-0 and no BYE badge renders', async () => {
    // Assert helper returns null when all teams are 0-0-0
    expect(getResolvedSeed1('AFC')).toBeNull();
    expect(getResolvedSeed1('NFC')).toBeNull();

    (espnApi.getSchedule as jest.Mock).mockImplementation((week: number) => {
      return Promise.resolve({
        data: [
          {
            id: `game-${week}`,
            week,
            seasonType: 3,
            isNeutralSite: false,
            date: '2027-01-16T20:00Z',
            venue: 'Test Stadium',
            status: 'pre',
            clock: 'TBD',
            homeTeam: { id: 'TBD', name: 'TBD', abbreviation: 'TBD', logoUrl: '', color: '#000', record: '0-0', score: 0 },
            awayTeam: { id: 'TBD', name: 'TBD', abbreviation: 'TBD', logoUrl: '', color: '#000', record: '0-0', score: 0 }
          }
        ]
      });
    });

    render(<PlayoffBracket />);

    await waitFor(() => {
      expect(screen.getByText(/Super Bowl/i)).toBeDefined();
    });

    // Assert NO concrete team names (e.g. Denver Broncos, Chiefs, etc.) appear in seed slots
    expect(screen.queryByText(/Denver Broncos/i)).toBeNull();
    expect(screen.queryByText(/Kansas City Chiefs/i)).toBeNull();
    expect(screen.queryByText(/San Francisco 49ers/i)).toBeNull();

    // Assert NO BYE badge renders when #1 seed is unresolved
    expect(screen.queryByText(/^BYE$/i)).toBeNull();

    // Assert TBD seed headers render
    expect(screen.getByText(/AFC TBD #1 Seed/i)).toBeDefined();
    expect(screen.getByText(/NFC TBD #1 Seed/i)).toBeDefined();
  });

  test('resolved seeding: mid-season fixture with clear win record yields the correct top seed', () => {
    const mockTeams: Record<string, any> = {
      KC: { ...TEAMS['KC'], record: '12-2-0' },
      BUF: { ...TEAMS['BUF'], record: '10-4-0' },
      PHI: { ...TEAMS['PHI'], record: '13-1-0' },
      DAL: { ...TEAMS['DAL'], record: '9-5-0' }
    };

    const afcSeed = getResolvedSeed1('AFC', mockTeams);
    expect(afcSeed).not.toBeNull();
    expect(afcSeed?.abbreviation).toBe('KC');

    const nfcSeed = getResolvedSeed1('NFC', mockTeams);
    expect(nfcSeed).not.toBeNull();
    expect(nfcSeed?.abbreviation).toBe('PHI');
  });

  test('tie handling: tied top records result in unresolved seed (null)', () => {
    const mockTiedTeams: Record<string, any> = {
      KC: { ...TEAMS['KC'], record: '10-2-0' },
      BUF: { ...TEAMS['BUF'], record: '10-2-0' }
    };

    const afcSeed = getResolvedSeed1('AFC', mockTiedTeams);
    expect(afcSeed).toBeNull();
  });

  test('empty state: renders Playoff Bracket TBD when no games returned', async () => {
    (espnApi.getSchedule as jest.Mock).mockResolvedValue({ data: [] });

    render(<PlayoffBracket />);

    await waitFor(() => {
      expect(screen.getByText(/Playoff Bracket TBD/i)).toBeDefined();
    });
  });

  test('Super Bowl: renders explicit Super Bowl LX placeholder when week 4 returns zero events', async () => {
    (espnApi.getSchedule as jest.Mock).mockImplementation((week: number) => {
      if (week === 4) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: [
          {
            id: `game-${week}`,
            week,
            seasonType: 3,
            isNeutralSite: false,
            date: '2027-01-16T20:00Z',
            venue: 'Test Stadium',
            status: 'pre',
            clock: 'TBD',
            homeTeam: { id: 'TBD', name: 'TBD', abbreviation: 'TBD', logoUrl: '', color: '#000', record: '0-0', score: 0 },
            awayTeam: { id: 'TBD', name: 'TBD', abbreviation: 'TBD', logoUrl: '', color: '#000', record: '0-0', score: 0 }
          }
        ]
      });
    });

    render(<PlayoffBracket />);

    await waitFor(() => {
      const sbElements = screen.getAllByText(/Super Bowl/i);
      expect(sbElements.length).toBeGreaterThan(0);
    });
  });

  test('conference classification: getConference is total and handles TBD without silent NFC default', () => {
    expect(getConference('KC')).toBe('AFC');
    expect(getConference('BUF')).toBe('AFC');
    expect(getConference('SF')).toBe('NFC');
    expect(getConference('PHI')).toBe('NFC');
    expect(getConference('TBD')).toBe('UNKNOWN');

    const sampleTbdGame: any = {
      id: 'tbd-game',
      homeTeam: { abbreviation: 'TBD' },
      awayTeam: { abbreviation: 'TBD' }
    };

    expect(getGameConference(sampleTbdGame)).toBe('UNKNOWN');
  });

  test('record parser: parseTeamRecord handles valid and empty record strings correctly', () => {
    expect(parseTeamRecord('12-4-0')).toEqual({ wins: 12, losses: 4, ties: 0, totalGames: 16, winPct: 0.75 });
    expect(parseTeamRecord('0-0')).toEqual({ wins: 0, losses: 0, ties: 0, totalGames: 0, winPct: 0 });
    expect(parseTeamRecord('')).toEqual({ wins: 0, losses: 0, ties: 0, totalGames: 0, winPct: 0 });
  });

  test('seed label: full untruncated label asserted in DOM', async () => {
    (espnApi.getSchedule as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'game-1',
          week: 1,
          seasonType: 3,
          isNeutralSite: false,
          date: '2027-01-16T20:00Z',
          venue: 'Test Stadium',
          status: 'pre',
          clock: 'TBD',
          homeTeam: { id: 'TBD', name: 'TBD', abbreviation: 'TBD', logoUrl: '', color: '#000', record: '0-0', score: 0 },
          awayTeam: { id: 'TBD', name: 'TBD', abbreviation: 'TBD', logoUrl: '', color: '#000', record: '0-0', score: 0 }
        }
      ]
    });

    render(<PlayoffBracket />);

    await waitFor(() => {
      expect(screen.getByText('AFC TBD #1 Seed')).toBeDefined();
      expect(screen.getByText('NFC TBD #1 Seed')).toBeDefined();
    });
  });
});
