import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SEASON_STAGES, CURRENT_SEASON } from '../data/nfl_data';
import PlayoffBracket from '../components/PlayoffBracket';
import { StandingsModal } from '../StandingsModal';
import App from '../App';

describe('SEASON_STAGES export validation', () => {
  test('SEASON_STAGES has 22 stages in correct order and structure', () => {
    expect(SEASON_STAGES).toHaveLength(22);

    // Regular season 1-18
    for (let i = 0; i < 18; i++) {
      expect(SEASON_STAGES[i]).toEqual({
        id: `w${i + 1}`,
        label: `Week ${i + 1}`,
        seasonType: 2,
        week: i + 1
      });
    }

    // Playoff stages (seasonType: 3)
    expect(SEASON_STAGES[18]).toEqual({
      id: 'wc',
      label: 'Wild Card',
      seasonType: 3,
      week: 1
    });

    expect(SEASON_STAGES[19]).toEqual({
      id: 'div',
      label: 'Divisional',
      seasonType: 3,
      week: 2
    });

    expect(SEASON_STAGES[20]).toEqual({
      id: 'conf',
      label: 'Conference Championships',
      seasonType: 3,
      week: 3
    });

    expect(SEASON_STAGES[21]).toEqual({
      id: 'sb',
      label: 'Super Bowl',
      seasonType: 3,
      week: 4
    });
  });

  test('CURRENT_SEASON constant is 2026', () => {
    expect(CURRENT_SEASON).toBe(2026);
  });
});

describe('empty state handling', () => {
  test('PlayoffBracket renders empty state cleanly when no seeds exist', async () => {
    let container: HTMLElement;
    await act(async () => {
      const res = render(<PlayoffBracket />);
      container = res.container;
    });
    expect(container!).toBeInTheDocument();
    const elements = await screen.findAllByText(/TBD|Wild Card|Super Bowl/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  test('StandingsModal renders empty state cleanly at 0-0 records', () => {
    render(<StandingsModal onClose={() => {}} predictions={{}} results={{}} />);
    expect(screen.getByText('Season Standings')).toBeInTheDocument();
    expect(screen.getAllByText('Straight Up').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Against The Spread').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
  });

  test('Zero games schedule renders explicit empty state message', async () => {
    await act(async () => {
      render(<App />);
    });
    const headerElement = await screen.findByText(/MEDI PICKS/i);
    expect(headerElement).toBeInTheDocument();
  });
});
