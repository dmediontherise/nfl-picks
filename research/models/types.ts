export interface GameMarket {
  spread: number | null; // signed, negative = home favored
  total: number | null;
  moneylineHome: number | null;
}

export interface Game {
  id: string;
  week: number;
  seasonType: number; // 2 = regular season, 3 = postseason
  date: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  market: GameMarket;
}

export type SpreadPick = 'home' | 'away' | 'push';

export interface PredictionResult {
  homeScore: number;
  awayScore: number;
  homeWinProb: number;
  spreadPick: SpreadPick;
}

export type ModelFn = (game: Game, history: Game[]) => PredictionResult;

export interface ModelDefinition {
  id: string;
  name: string;
  description: string;
  predict: ModelFn;
}
