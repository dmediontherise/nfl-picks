import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AnalysisModal from '../components/AnalysisModal';
import { analyzeMatchup } from '../services/geminiService';
import { AnalysisResult, Game } from '../types';

jest.mock('../services/geminiService', () => ({
  analyzeMatchup: jest.fn(),
}));

const mockAnalysis: AnalysisResult = {
  winnerPrediction: 'KC Chiefs',
  homeScorePrediction: 24,
  awayScorePrediction: 17,
  confidenceScore: 68,
  summary: 'KC Chiefs wins 24-17',
  narrative: 'test narrative',
  keyFactors: ['spread pick'],
  jinxScore: 3,
  jinxAnalysis: 'standard',
  upsetProbability: 30,
  executionRating: 70,
  explosiveRating: 60,
  weather: { temp: 42, condition: 'Clear', windSpeed: 5, impactOnPassing: 'Low' as const },
  leverage: { offense: 55, defense: 50, qb: 60 },
  statComparison: {},
  injuryImpact: 'Clean bill of health.',
  coachingMatchup: 'Even Matchup',
  playersToWatch: [],
  sources: []
};

const makeGame = (id: string): Game => ({
  id,
  week: 1,
  date: '2025-09-07T17:00:00Z',
  venue: 'Stadium',
  homeTeam: { id: '1', name: 'KC Chiefs', abbreviation: 'KC', logoUrl: '', color: '#E31837' },
  awayTeam: { id: '2', name: 'LA Chargers', abbreviation: 'LAC', logoUrl: '', color: '#002A5C' },
  status: 'pre'
});

describe('AnalysisModal custom-pick empty state (Task 024)', () => {
  test('D1 regression: no-userPrediction renders empty values and em-dash placeholders, never the engine predicted score', async () => {
    (analyzeMatchup as jest.Mock).mockResolvedValue(mockAnalysis);

    render(
      <AnalysisModal game={makeGame('g-empty-state')} onClose={() => {}} onSavePrediction={jest.fn()} />
    );

    await screen.findByRole('button', { name: /Take the Engine's Pick/ });

    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(2);
    const [awayInput, homeInput] = inputs;

    expect((awayInput as HTMLInputElement).value).toBe('');
    expect((homeInput as HTMLInputElement).value).toBe('');

    expect(awayInput.getAttribute('placeholder')).toBe('—');
    expect(homeInput.getAttribute('placeholder')).toBe('—');
    expect(awayInput.getAttribute('placeholder')).not.toBe(String(mockAnalysis.awayScorePrediction));
    expect(homeInput.getAttribute('placeholder')).not.toBe(String(mockAnalysis.homeScorePrediction));

    const saveButton = screen.getByRole('button', { name: /Save Custom Pick/ });
    expect(saveButton).toBeDisabled();
  });

  test('placeholder hint names the deviation alternative only while the save button is disabled', async () => {
    (analyzeMatchup as jest.Mock).mockResolvedValue(mockAnalysis);

    render(
      <AnalysisModal game={makeGame('g-hint-toggle')} onClose={() => {}} onSavePrediction={jest.fn()} />
    );

    await screen.findByRole('button', { name: /Take the Engine's Pick/ });

    expect(screen.getByText(/Enter both scores to deviate, or use Take the Engine's Pick above\./)).toBeInTheDocument();

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '31' } });
    fireEvent.change(inputs[1], { target: { value: '9' } });

    expect(screen.queryByText(/Enter both scores to deviate/)).not.toBeInTheDocument();
  });
});