export interface Driver {
  key: string;
  label: string;
  magnitude: number; // Factor contribution to margin in points
  direction: 'home' | 'away' | 'neutral';
  detail: string;
}

export interface SpreadPick {
  team: string;
  line: number;
  edge: number;
}

export interface TotalPick {
  side: 'over' | 'under';
  line: number;
  projected: number;
  edge: number;
}

export interface Prediction {
  winner: string;
  homeScore: number;
  awayScore: number;
  margin: number;
  projectedMargin: number;
  homeWinProbability: number;
  confidence: number; // Calibrated 0-100
  spreadPick: SpreadPick;
  totalPick: TotalPick;
  marketSpread: number | null;
  drivers: Driver[];
  modelVersion: string;
}

export interface HistoricalGame {
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  isNeutralSite?: boolean;
  date?: string;
  seasonType?: number;
  week?: number;
}

export interface PredictionInput {
  game: {
    id?: string;
    homeAbbr: string;
    awayAbbr: string;
    isNeutralSite?: boolean;
    seasonType?: number;
    week?: number;
    market?: {
      spread: number | null;
      total: number | null;
    } | null;
  };
  history: HistoricalGame[];
  homeInjuries?: string[];
  awayInjuries?: string[];
}

export interface NarrativeContext {
  homeTeamName: string;
  awayTeamName: string;
  homeAbbr?: string;
  awayAbbr?: string;
  homeTeamNick?: string;
  awayTeamNick?: string;
  isNeutralSite?: boolean;
  week?: number;
}

export interface Citation {
  sentenceIndex: number;
  driverKey: string;
  value: number;
}

export interface Narrative {
  beats?: string[];
  sentences: string[];
  text: string;
  citations: Citation[];
}
