export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  logoUrl: string;
  color: string;
  record?: string;
  standing?: string;
  status?: 'Clinched' | 'Contender' | 'Bubble' | 'Eliminated';
  keyInjuries?: string[];
  score?: number; // Live score
  qbStats?: {
    passingYds: number;
    passingTds: number;
    interceptions: number;
    name?: string;
  };
}

export interface Game {
  id: string;
  week: number;
  date: string;
  venue: string;
  homeTeam: Team;
  awayTeam: Team;
  status?: 'pre' | 'in' | 'post'; // Game status
  clock?: string; // e.g. "10:35 4th"
  bettingData?: {
    spread: string; // e.g. "-3.5"
    total: number;
    publicBettingPct: number; // e.g. 65 (percent on favorite/home)
  };
}

export interface PlayerValue { // Renamed from PlayerProjection
  name: string;
  position: string;
  projection: string;
  reasoning: string;
}

export interface Source {
  title: string;
  uri: string;
}

export interface AnalysisResult {
  winnerPrediction: string;
  homeScorePrediction: number;
  awayScorePrediction: number;
  confidenceScore: number;
  summary: string;
  keyFactors: string[];
  
  // New Medi Jinx Specifics
  jinxScore: number;          // 1-10 scale
  jinxAnalysis: string;       // Contextual reason for the "Trap"
  upsetProbability: number;   // Percentage
  
  // Narrative & Layman Ratings
  narrative: string;
  executionRating: number; // 0-100
  explosiveRating: number; // 0-100
  quickTake?: string;      // e.g., "Shootout Alert"
  latestNews?: string[];   // Simulated live wire news

  // Environmental & Contextual Data
  weather: {
    temp: number;
    condition: string;
    windSpeed: number;
    impactOnPassing: 'Low' | 'Moderate' | 'High';
  };
  
  // New Leverage Data
  leverage: {
    offense: number; // Home % (0-100)
    defense: number; // Home % (0-100)
    qb: number;      // Home % (0-100)
  };

  // Post-Game Retrospective
  retrospective?: {
    result: string;
    keyToVictory: string;
    standoutPerformers: string[];
  };

  // Original fields
  statComparison: any;
  injuryImpact: string;
  coachingMatchup: string;
  playersToWatch: PlayerValue[]; // Updated type here
  sources: Source[];
}

export interface UserPrediction {
  gameId: string;
  homeScore: string;
  awayScore: string;
  predictedWinner: string;
  // User's manual prediction
  userHomeScore?: string;
  userAwayScore?: string;
  userPredictedWinner?: string;
}
