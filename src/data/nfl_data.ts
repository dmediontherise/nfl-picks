import { Game, Team } from '../types';

export const CURRENT_SEASON = 2026;

export interface SeasonStage {
  id: string;
  label: string;
  seasonType: number; // 2 = Regular, 3 = Postseason
  week: number;
}

export const SEASON_STAGES: SeasonStage[] = [
  { id: 'w1', label: 'Week 1', seasonType: 2, week: 1 },
  { id: 'w2', label: 'Week 2', seasonType: 2, week: 2 },
  { id: 'w3', label: 'Week 3', seasonType: 2, week: 3 },
  { id: 'w4', label: 'Week 4', seasonType: 2, week: 4 },
  { id: 'w5', label: 'Week 5', seasonType: 2, week: 5 },
  { id: 'w6', label: 'Week 6', seasonType: 2, week: 6 },
  { id: 'w7', label: 'Week 7', seasonType: 2, week: 7 },
  { id: 'w8', label: 'Week 8', seasonType: 2, week: 8 },
  { id: 'w9', label: 'Week 9', seasonType: 2, week: 9 },
  { id: 'w10', label: 'Week 10', seasonType: 2, week: 10 },
  { id: 'w11', label: 'Week 11', seasonType: 2, week: 11 },
  { id: 'w12', label: 'Week 12', seasonType: 2, week: 12 },
  { id: 'w13', label: 'Week 13', seasonType: 2, week: 13 },
  { id: 'w14', label: 'Week 14', seasonType: 2, week: 14 },
  { id: 'w15', label: 'Week 15', seasonType: 2, week: 15 },
  { id: 'w16', label: 'Week ' + 16, seasonType: 2, week: 10 + 6 },
  { id: 'w17', label: 'Week 17', seasonType: 2, week: 17 },
  { id: 'w18', label: 'Week 18', seasonType: 2, week: 18 },
  { id: 'wc', label: 'Wild Card', seasonType: 3, week: 1 },
  { id: 'div', label: 'Divisional', seasonType: 3, week: 2 },
  { id: 'conf', label: 'Conference Championships', seasonType: 3, week: 3 },
  { id: 'sb', label: 'Super Bowl', seasonType: 3, week: 4 }
];

// Preseason Baseline Ratings & Records (0-0-0 for all teams)
export const TEAMS: Record<string, Team & { tier: number, offRating: number, defRating: number }> = {
  // --- AFC ---
  // AFC WEST
  DEN: { id: "DEN", name: "Denver Broncos", abbreviation: "DEN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png", color: "#FB4F14", tier: 2, offRating: 88, defRating: 94, record: "0-0-0", standing: "AFC West", starterQB: "Bo Nix", keyInjuries: [] },
  LAC: { id: "LAC", name: "Los Angeles Chargers", abbreviation: "LAC", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png", color: "#0080C6", tier: 1, offRating: 92, defRating: 85, record: "0-0-0", standing: "AFC West", starterQB: "Justin Herbert", keyInjuries: [] },
  KC:  { id: "KC",  name: "Kansas City Chiefs", abbreviation: "KC", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png", color: "#E31837", tier: 1, offRating: 94, defRating: 88, record: "0-0-0", standing: "AFC West", starterQB: "Patrick Mahomes", keyInjuries: [] },
  LV:  { id: "LV",  name: "Las Vegas Raiders", abbreviation: "LV", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png", color: "#000000", tier: 4, offRating: 72, defRating: 70, record: "0-0-0", standing: "AFC West", starterQB: "Geno Smith", keyInjuries: [] },

  // AFC EAST
  NE:  { id: "NE",  name: "New England Patriots", abbreviation: "NE", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png", color: "#002244", tier: 3, offRating: 78, defRating: 92, record: "0-0-0", standing: "AFC East", starterQB: "Drake Maye", keyInjuries: [] },
  BUF: { id: "BUF", name: "Buffalo Bills", abbreviation: "BUF", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png", color: "#00338D", tier: 1, offRating: 96, defRating: 84, record: "0-0-0", standing: "AFC East", starterQB: "Josh Allen", keyInjuries: [] },
  MIA: { id: "MIA", name: "Miami Dolphins", abbreviation: "MIA", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png", color: "#008E97", tier: 2, offRating: 89, defRating: 75, record: "0-0-0", standing: "AFC East", starterQB: "Tua Tagovailoa", keyInjuries: [] },
  NYJ: { id: "NYJ", name: "New York Jets", abbreviation: "NYJ", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png", color: "#125740", tier: 3, offRating: 76, defRating: 88, record: "0-0-0", standing: "AFC East", starterQB: "Tyrod Taylor", keyInjuries: [] },

  // AFC SOUTH
  JAX: { id: "JAX", name: "Jacksonville Jaguars", abbreviation: "JAX", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png", color: "#006778", tier: 2, offRating: 86, defRating: 80, record: "0-0-0", standing: "AFC South", starterQB: "Trevor Lawrence", keyInjuries: [] },
  HOU: { id: "HOU", name: "Houston Texans", abbreviation: "HOU", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png", color: "#03202F", tier: 1, offRating: 91, defRating: 82, record: "0-0-0", standing: "AFC South", starterQB: "C.J. Stroud", keyInjuries: [] },
  IND: { id: "IND", name: "Indianapolis Colts", abbreviation: "IND", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png", color: "#002C5F", tier: 3, offRating: 80, defRating: 78, record: "0-0-0", standing: "AFC South", starterQB: "Anthony Richardson", keyInjuries: [] },
  TEN: { id: "TEN", name: "Tennessee Titans", abbreviation: "TEN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png", color: "#4B92DB", tier: 4, offRating: 74, defRating: 76, record: "0-0-0", standing: "AFC South", starterQB: "Will Levis", keyInjuries: [] },

  // AFC NORTH
  PIT: { id: "PIT", name: "Pittsburgh Steelers", abbreviation: "PIT", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png", color: "#FFB612", tier: 2, offRating: 82, defRating: 94, record: "0-0-0", standing: "AFC North", starterQB: "Russell Wilson", keyInjuries: [] },
  BAL: { id: "BAL", name: "Baltimore Ravens", abbreviation: "BAL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png", color: "#241773", tier: 1, offRating: 93, defRating: 88, record: "0-0-0", standing: "AFC North", starterQB: "Lamar Jackson", keyInjuries: [] },
  CIN: { id: "CIN", name: "Cincinnati Bengals", abbreviation: "CIN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png", color: "#FB4F14", tier: 1, offRating: 90, defRating: 72, record: "0-0-0", standing: "AFC North", starterQB: "Joe Burrow", keyInjuries: [] },
  CLE: { id: "CLE", name: "Cleveland Browns", abbreviation: "CLE", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png", color: "#311D00", tier: 4, offRating: 70, defRating: 90, record: "0-0-0", standing: "AFC North", starterQB: "Deshaun Watson", keyInjuries: [] },

  // --- NFC ---
  // NFC WEST
  LAR: { id: "LAR", name: "Los Angeles Rams", abbreviation: "LAR", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png", color: "#003594", tier: 2, offRating: 90, defRating: 85, record: "0-0-0", standing: "NFC West", starterQB: "Matthew Stafford", keyInjuries: [] },
  SEA: { id: "SEA", name: "Seattle Seahawks", abbreviation: "SEA", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png", color: "#002244", tier: 2, offRating: 88, defRating: 88, record: "0-0-0", standing: "NFC West", starterQB: "Sam Darnold", keyInjuries: [] },
  SF:  { id: "SF",  name: "San Francisco 49ers", abbreviation: "SF", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png", color: "#AA0000", tier: 1, offRating: 94, defRating: 96, record: "0-0-0", standing: "NFC West", starterQB: "Brock Purdy", keyInjuries: [] },
  ARI: { id: "ARI", name: "Arizona Cardinals", abbreviation: "ARI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png", color: "#97233F", tier: 3, offRating: 82, defRating: 65, record: "0-0-0", standing: "NFC West", starterQB: "Kyler Murray", keyInjuries: [] },

  // NFC NORTH
  CHI: { id: "CHI", name: "Chicago Bears", abbreviation: "CHI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png", color: "#0B162A", tier: 2, offRating: 86, defRating: 90, record: "0-0-0", standing: "NFC North", starterQB: "Caleb Williams", keyInjuries: [] },
  GB:  { id: "GB",  name: "Green Bay Packers", abbreviation: "GB", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png", color: "#203731", tier: 2, offRating: 89, defRating: 82, record: "0-0-0", standing: "NFC North", starterQB: "Jordan Love", keyInjuries: [] },
  DET: { id: "DET", name: "Detroit Lions", abbreviation: "DET", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png", color: "#0076B6", tier: 1, offRating: 93, defRating: 84, record: "0-0-0", standing: "NFC North", starterQB: "Jared Goff", keyInjuries: [] },
  MIN: { id: "MIN", name: "Minnesota Vikings", abbreviation: "MIN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/min.png", color: "#4F2683", tier: 3, offRating: 85, defRating: 78, record: "0-0-0", standing: "NFC North", starterQB: "J.J. McCarthy", keyInjuries: [] },

  // NFC SOUTH
  TB:  { id: "TB",  name: "Tampa Bay Buccaneers", abbreviation: "TB", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png", color: "#D50A0A", tier: 3, offRating: 82, defRating: 78, record: "0-0-0", standing: "NFC South", starterQB: "Baker Mayfield", keyInjuries: [] },
  CAR: { id: "CAR", name: "Carolina Panthers", abbreviation: "CAR", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/car.png", color: "#0085CA", tier: 4, offRating: 70, defRating: 75, record: "0-0-0", standing: "NFC South", starterQB: "Bryce Young", keyInjuries: [] },
  DAL: { id: "DAL", name: "Dallas Cowboys", abbreviation: "DAL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png", color: "#003594", tier: 1, offRating: 91, defRating: 84, record: "0-0-0", standing: "NFC East", starterQB: "Dak Prescott", keyInjuries: [] },
  ATL: { id: "ATL", name: "Atlanta Falcons", abbreviation: "ATL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/atl.png", color: "#A71930", tier: 3, offRating: 84, defRating: 70, record: "0-0-0", standing: "NFC South", starterQB: "Kirk Cousins", keyInjuries: [] },
  NO:  { id: "NO",  name: "New Orleans Saints", abbreviation: "NO", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/no.png", color: "#D3BC8D", tier: 4, offRating: 76, defRating: 78, record: "0-0-0", standing: "NFC South", starterQB: "Derek Carr", keyInjuries: [] },

  // NFC EAST
  WAS: { id: "WAS", name: "Washington Commanders", abbreviation: "WAS", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png", color: "#5A1414", tier: 3, offRating: 82, defRating: 74, record: "0-0-0", standing: "NFC East", starterQB: "Jayden Daniels", keyInjuries: [] },
  NYG: { id: "NYG", name: "New York Giants", abbreviation: "NYG", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png", color: "#0B2265", tier: 4, offRating: 68, defRating: 72, record: "0-0-0", standing: "NFC East", starterQB: "Daniel Jones", keyInjuries: [] },
  PHI: { id: "PHI", name: "Philadelphia Eagles", abbreviation: "PHI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png", color: "#004C54", tier: 1, offRating: 93, defRating: 88, record: "0-0-0", standing: "NFC East", starterQB: "Jalen Hurts", keyInjuries: [] }
};

export const WEEK_1_SCHEDULE: Game[] = [
  {
    id: "w1-1", week: 1, date: "Thu, Sep 10 • 8:20 PM ET", venue: "Lumen Field", awayTeam: TEAMS.NE, homeTeam: TEAMS.SEA,
    bettingData: { spread: "SEA -3.5", total: 44.5, publicBettingPct: 55 }
  },
  {
    id: "w1-2", week: 1, date: "Sun, Sep 13 • 1:00 PM ET", venue: "Lincoln Financial Field", awayTeam: TEAMS.DAL, homeTeam: TEAMS.PHI,
    bettingData: { spread: "PHI -6.5", total: 47.5, publicBettingPct: 70 }
  },
  {
    id: "w1-3", week: 1, date: "Sun, Sep 13 • 1:00 PM ET", venue: "Soldier Field", awayTeam: TEAMS.GB, homeTeam: TEAMS.CHI,
    bettingData: { spread: "CHI -2.5", total: 42.5, publicBettingPct: 52 }
  },
  {
    id: "w1-4", week: 1, date: "Sun, Sep 13 • 4:25 PM ET", venue: "GEHA Field at Arrowhead", awayTeam: TEAMS.BAL, homeTeam: TEAMS.KC,
    bettingData: { spread: "KC -3.0", total: 49.5, publicBettingPct: 62 }
  }
];
