import { Game, Team } from '../types';

// Calibrated Ratings & Records for Week 16, 2025 Season (LIVE Playoff Scenarios)
export const TEAMS: Record<string, Team & { tier: number, offRating: number, defRating: number }> = {
  // --- AFC ---
  // AFC WEST
  DEN: { id: "DEN", name: "Denver Broncos", abbreviation: "DEN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png", color: "#FB4F14", tier: 1, offRating: 96, defRating: 94, record: "12-2-0", standing: "1st AFC West", status: "Clinched", keyInjuries: [] },
  LAC: { id: "LAC", name: "Los Angeles Chargers", abbreviation: "LAC", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png", color: "#0080C6", tier: 1, offRating: 92, defRating: 88, record: "10-4-0", standing: "3rd AFC West", status: "Contender", keyInjuries: [] },
  KC:  { id: "KC",  name: "Kansas City Chiefs", abbreviation: "KC", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png", color: "#E31837", tier: 4, offRating: 70, defRating: 80, record: "6-8-0", standing: "4th AFC West", status: "Eliminated", keyInjuries: ["P. Mahomes (ACL - IR)", "T. Kelce (Rest)"] },
  LV:  { id: "LV",  name: "Las Vegas Raiders", abbreviation: "LV", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png", color: "#000000", tier: 5, offRating: 60, defRating: 65, record: "2-12-0", standing: "4th AFC West", status: "Eliminated", keyInjuries: [] },

  // AFC EAST
  NE:  { id: "NE",  name: "New England Patriots", abbreviation: "NE", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png", color: "#002244", tier: 1, offRating: 92, defRating: 94, record: "11-3-0", standing: "1st AFC East", status: "Contender", keyInjuries: [] },
  BUF: { id: "BUF", name: "Buffalo Bills", abbreviation: "BUF", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png", color: "#00338D", tier: 2, offRating: 88, defRating: 82, record: "10-4-0", standing: "2nd AFC East", status: "Contender", keyInjuries: [] },
  MIA: { id: "MIA", name: "Miami Dolphins", abbreviation: "MIA", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png", color: "#008E97", tier: 4, offRating: 70, defRating: 68, record: "6-8-0", standing: "3rd AFC East", status: "Eliminated", keyInjuries: [] },
  NYJ: { id: "NYJ", name: "New York Jets", abbreviation: "NYJ", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png", color: "#125740", tier: 5, offRating: 65, defRating: 70, record: "3-11-0", standing: "4th AFC East", status: "Eliminated", keyInjuries: [] },

  // AFC SOUTH
  JAX: { id: "JAX", name: "Jacksonville Jaguars", abbreviation: "JAX", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png", color: "#006778", tier: 2, offRating: 88, defRating: 80, record: "10-4-0", standing: "1st AFC South", status: "Contender", keyInjuries: [] },
  HOU: { id: "HOU", name: "Houston Texans", abbreviation: "HOU", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png", color: "#03202F", tier: 2, offRating: 85, defRating: 78, record: "9-5-0", standing: "2nd AFC South", status: "Contender", keyInjuries: [] },
  IND: { id: "IND", name: "Indianapolis Colts", abbreviation: "IND", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png", color: "#002C5F", tier: 3, offRating: 80, defRating: 75, record: "8-6-0", standing: "3rd AFC South", status: "Bubble", keyInjuries: ["NEWS: P. Rivers Signed"] },
  TEN: { id: "TEN", name: "Tennessee Titans", abbreviation: "TEN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png", color: "#4B92DB", tier: 5, offRating: 60, defRating: 65, record: "2-12-0", standing: "4th AFC South", status: "Eliminated", keyInjuries: [] },

  // AFC NORTH
  PIT: { id: "PIT", name: "Pittsburgh Steelers", abbreviation: "PIT", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png", color: "#FFB612", tier: 2, offRating: 88, defRating: 88, record: "8-6-0", standing: "1st AFC North", status: "Contender", keyInjuries: ["QB1: A. Rodgers"] },
  BAL: { id: "BAL", name: "Baltimore Ravens", abbreviation: "BAL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png", color: "#241773", tier: 3, offRating: 78, defRating: 80, record: "7-7-0", standing: "2nd AFC North", status: "Bubble", keyInjuries: [] },
  CIN: { id: "CIN", name: "Cincinnati Bengals", abbreviation: "CIN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png", color: "#FB4F14", tier: 4, offRating: 70, defRating: 68, record: "4-10-0", standing: "3rd AFC North", status: "Eliminated", keyInjuries: ["J. Burrow (IR)"] },
  CLE: { id: "CLE", name: "Cleveland Browns", abbreviation: "CLE", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png", color: "#311D00", tier: 5, offRating: 60, defRating: 75, record: "3-11-0", standing: "4th AFC North", status: "Eliminated", keyInjuries: [] },

  // --- NFC ---
  // NFC WEST
  LAR: { id: "LAR", name: "Los Angeles Rams", abbreviation: "LAR", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png", color: "#003594", tier: 1, offRating: 92, defRating: 88, record: "11-3-0", standing: "1st NFC West", status: "Clinched", keyInjuries: [] },
  SEA: { id: "SEA", name: "Seattle Seahawks", abbreviation: "SEA", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png", color: "#002244", tier: 1, offRating: 88, defRating: 90, record: "11-3-0", standing: "2nd NFC West", status: "Contender", keyInjuries: [] },
  SF:  { id: "SF",  name: "San Francisco 49ers", abbreviation: "SF", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png", color: "#AA0000", tier: 1, offRating: 90, defRating: 90, record: "10-4-0", standing: "3rd NFC West", status: "Contender", keyInjuries: [] },
  ARI: { id: "ARI", name: "Arizona Cardinals", abbreviation: "ARI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png", color: "#97233F", tier: 5, offRating: 65, defRating: 60, record: "3-11-0", standing: "4th NFC West", status: "Eliminated", keyInjuries: [] },

  // NFC NORTH
  CHI: { id: "CHI", name: "Chicago Bears", abbreviation: "CHI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png", color: "#0B162A", tier: 1, offRating: 90, defRating: 88, record: "10-4-0", standing: "1st NFC North", status: "Contender", keyInjuries: [] },
  GB:  { id: "GB",  name: "Green Bay Packers", abbreviation: "GB", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png", color: "#203731", tier: 2, offRating: 88, defRating: 80, record: "9-4-1", standing: "2nd NFC North", status: "Contender", keyInjuries: [] },
  DET: { id: "DET", name: "Detroit Lions", abbreviation: "DET", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png", color: "#0076B6", tier: 3, offRating: 85, defRating: 78, record: "8-6-0", standing: "3rd NFC North", status: "Bubble", keyInjuries: [] },
  MIN: { id: "MIN", name: "Minnesota Vikings", abbreviation: "MIN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/min.png", color: "#4F2683", tier: 4, offRating: 78, defRating: 75, record: "6-8-0", standing: "4th NFC North", status: "Bubble", keyInjuries: [] },

  // NFC SOUTH
  TB:  { id: "TB",  name: "Tampa Bay Buccaneers", abbreviation: "TB", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png", color: "#D50A0A", tier: 3, offRating: 80, defRating: 75, record: "7-7-0", standing: "1st NFC South", status: "Contender", keyInjuries: [] },
  CAR: { id: "CAR", name: "Carolina Panthers", abbreviation: "CAR", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/car.png", color: "#0085CA", tier: 3, offRating: 78, defRating: 72, record: "7-7-0", standing: "2nd NFC South", status: "Bubble", keyInjuries: [] },
  DAL: { id: "DAL", name: "Dallas Cowboys", abbreviation: "DAL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png", color: "#003594", tier: 4, offRating: 75, defRating: 70, record: "6-7-1", standing: "3rd NFC East", status: "Bubble", keyInjuries: [] },
  ATL: { id: "ATL", name: "Atlanta Falcons", abbreviation: "ATL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/atl.png", color: "#A71930", tier: 4, offRating: 70, defRating: 68, record: "5-9-0", standing: "3rd NFC South", status: "Eliminated", keyInjuries: [] },
  NO:  { id: "NO",  name: "New Orleans Saints", abbreviation: "NO", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/no.png", color: "#D3BC8D", tier: 5, offRating: 65, defRating: 65, record: "4-10-0", standing: "4th NFC South", status: "Eliminated", keyInjuries: [] },

  // NFC EAST (Remaining)
  WAS: { id: "WAS", name: "Washington Commanders", abbreviation: "WAS", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png", color: "#5A1414", tier: 4, offRating: 70, defRating: 68, record: "4-10-0", standing: "3rd NFC East", status: "Eliminated", keyInjuries: [] },
  NYG: { id: "NYG", name: "New York Giants", abbreviation: "NYG", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png", color: "#0B2265", tier: 5, offRating: 60, defRating: 60, record: "2-12-0", standing: "4th NFC East", status: "Eliminated", keyInjuries: [] },
  PHI: { id: "PHI", name: "Philadelphia Eagles", abbreviation: "PHI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png", color: "#004C54", tier: 2, offRating: 90, defRating: 86, record: "9-5", standing: "1st NFC East", status: "Contender", keyInjuries: [] },
};

export const WEEK_16_SCHEDULE: Game[] = [
  { 
    id: "w16-1", week: 16, date: "Thu, Dec 18 • 8:15 PM ET", venue: "Lumen Field", awayTeam: TEAMS.LAR, homeTeam: TEAMS.SEA,
    bettingData: { spread: "SEA -1.5", total: 47.5, publicBettingPct: 55 }
  },
  { 
    id: "w16-2", week: 16, date: "Sat, Dec 20 • 5:00 PM ET", venue: "FedExField", awayTeam: TEAMS.PHI, homeTeam: TEAMS.WAS,
    bettingData: { spread: "PHI -9.5", total: 44.0, publicBettingPct: 82 }
  },
  { 
    id: "w16-3", week: 16, date: "Sat, Dec 20 • 8:20 PM ET", venue: "Soldier Field", awayTeam: TEAMS.GB, homeTeam: TEAMS.CHI,
    bettingData: { spread: "CHI -2.5", total: 41.5, publicBettingPct: 60 }
  },
  { 
    id: "w16-4", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "M&T Bank Stadium", awayTeam: TEAMS.NE, homeTeam: TEAMS.BAL,
    bettingData: { spread: "NE -3.0", total: 43.0, publicBettingPct: 58 }
  },
  { 
    id: "w16-5", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "Bank of America Stadium", awayTeam: TEAMS.TB, homeTeam: TEAMS.CAR,
    bettingData: { spread: "CAR -1.0", total: 39.5, publicBettingPct: 45 }
  },
  { 
    id: "w16-6", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "Cleveland Browns Stadium", awayTeam: TEAMS.BUF, homeTeam: TEAMS.CLE,
    bettingData: { spread: "BUF -13.5", total: 45.0, publicBettingPct: 90 }
  },
  { 
    id: "w16-7", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "AT&T Stadium", awayTeam: TEAMS.LAC, homeTeam: TEAMS.DAL,
    bettingData: { spread: "LAC -6.5", total: 48.5, publicBettingPct: 75 }
  },
  { 
    id: "w16-8", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "Caesars Superdome", awayTeam: TEAMS.NYJ, homeTeam: TEAMS.NO,
    bettingData: { spread: "NO -2.5", total: 36.0, publicBettingPct: 40 }
  },
  { 
    id: "w16-9", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "MetLife Stadium", awayTeam: TEAMS.MIN, homeTeam: TEAMS.NYG,
    bettingData: { spread: "MIN -7.0", total: 40.5, publicBettingPct: 85 }
  },
  { 
    id: "w16-10", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "Nissan Stadium", awayTeam: TEAMS.KC, homeTeam: TEAMS.TEN,
    bettingData: { spread: "KC -3.5", total: 38.0, publicBettingPct: 65 }
  },
  { 
    id: "w16-11", week: 16, date: "Sun, Dec 21 • 1:00 PM ET", venue: "Hard Rock Stadium", awayTeam: TEAMS.CIN, homeTeam: TEAMS.MIA,
    bettingData: { spread: "MIA -4.0", total: 42.5, publicBettingPct: 70 }
  },
  { 
    id: "w16-12", week: 16, date: "Sun, Dec 21 • 4:05 PM ET", venue: "State Farm Stadium", awayTeam: TEAMS.ATL, homeTeam: TEAMS.ARI,
    bettingData: { spread: "ATL -3.0", total: 44.0, publicBettingPct: 60 }
  },
  { 
    id: "w16-13", week: 16, date: "Sun, Dec 21 • 4:05 PM ET", venue: "Empower Field at Mile High", awayTeam: TEAMS.JAX, homeTeam: TEAMS.DEN,
    bettingData: { spread: "DEN -5.5", total: 46.5, publicBettingPct: 72 }
  },
  { 
    id: "w16-14", week: 16, date: "Sun, Dec 21 • 4:25 PM ET", venue: "Ford Field", awayTeam: TEAMS.PIT, homeTeam: TEAMS.DET,
    bettingData: { spread: "DET -4.5", total: 49.0, publicBettingPct: 68 }
  },
  { 
    id: "w16-15", week: 16, date: "Sun, Dec 21 • 4:25 PM ET", venue: "NRG Stadium", awayTeam: TEAMS.LV, homeTeam: TEAMS.HOU,
    bettingData: { spread: "HOU -10.5", total: 43.5, publicBettingPct: 88 }
  },
  { 
    id: "w16-16", week: 16, date: "Mon, Dec 22 • 8:15 PM ET", venue: "Lucas Oil Stadium", awayTeam: TEAMS.SF, homeTeam: TEAMS.IND,
    bettingData: { spread: "SF -6.0", total: 45.5, publicBettingPct: 78 }
  },
];
