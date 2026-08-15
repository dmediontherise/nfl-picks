import { ModelDefinition } from './types';
import { predictEloQB } from './elo';
import { predictDVOA } from './dvoa';
import { predictMassey } from './massey';
import { predictPythagorean } from './pythagorean';
import { predictMarketBlend } from './market_blend';

export * from './types';
export * from './elo';
export * from './dvoa';
export * from './massey';
export * from './pythagorean';
export * from './market_blend';

export const MODELS: Record<string, ModelDefinition> = {
  elo_qb: {
    id: 'elo_qb',
    name: 'FiveThirtyEight / nfelo Margin-of-Victory Elo',
    description: 'Elo rating system with margin of victory multiplier',
    predict: predictEloQB
  },
  dvoa_efficiency: {
    id: 'dvoa_efficiency',
    name: 'DVOA-Style Opponent-Adjusted Efficiency',
    description: 'Opponent-adjusted offensive and defensive scoring efficiency ratings',
    predict: predictDVOA
  },
  massey_rating: {
    id: 'massey_rating',
    name: 'Massey Least-Squares Power Ratings',
    description: 'Least-squares team ratings solved from historical point differentials',
    predict: predictMassey
  },
  pythagorean_reg: {
    id: 'pythagorean_reg',
    name: 'Pythagorean Expectation & Point Diff Regression',
    description: 'Bill James / Morey Pythagorean win expectation and shrunk point differential',
    predict: predictPythagorean
  },
  market_blend: {
    id: 'market_blend',
    name: 'Market-Blend Consensus Model',
    description: 'Weighted combination of fundamental power rating margin and sportsbook consensus spread',
    predict: predictMarketBlend
  }
};
