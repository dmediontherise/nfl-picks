import fs from 'fs';
import path from 'path';

export interface GameMarket {
  spread: number | null;
  total: number | null;
  moneylineHome: number | null;
}

export interface Game {
  id: string;
  week: number;
  seasonType: number;
  date: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  neutralSite: boolean;
  market: GameMarket;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ',' && !inQuotes) {
      result.push(line.substring(start, i).replace(/^"|"$/g, '').trim());
      start = i + 1;
    }
  }
  result.push(line.substring(start).replace(/^"|"$/g, '').trim());
  return result;
}

// Standardize team abbreviations if needed (e.g. WSH/WAS, LA/LAR, OAK/LV)
function cleanAbbr(abbr: string): string {
  const map: Record<string, string> = {
    'WAS': 'WSH',
    'LA': 'LAR',
    'OAK': 'LV',
    'SD': 'LAC',
    'STL': 'LAR'
  };
  return map[abbr] || abbr;
}

export async function fetch2025Season(): Promise<{ games: Game[] }> {
  const url = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
  console.log(`Fetching 2025 NFL season dataset from ${url}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch nflverse games CSV: ${res.statusText}`);
  }

  const csvText = await res.text();
  const lines = csvText.trim().split('\n');
  const header = parseCSVLine(lines[0]);

  const idx = (name: string) => header.indexOf(name);

  const seasonIdx = idx('season');
  const typeIdx = idx('game_type');
  const weekIdx = idx('week');
  const gamedayIdx = idx('gameday');
  const gametimeIdx = idx('gametime');
  const homeIdx = idx('home_team');
  const awayIdx = idx('away_team');
  const homeScoreIdx = idx('home_score');
  const awayScoreIdx = idx('away_score');
  const spreadIdx = idx('spread_line');
  const totalIdx = idx('total_line');
  const mlHomeIdx = idx('home_moneyline');
  const locationIdx = idx('location');
  const espnIdx = idx('espn');

  const games: Game[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const row = parseCSVLine(line);

    if (row[seasonIdx] === '2025') {
      const isReg = row[typeIdx] === 'REG';
      const seasonType = isReg ? 2 : 3;

      let week = parseInt(row[weekIdx], 10);
      // Map postseason week numbers to 1..5 if needed
      if (!isReg) {
        if (row[typeIdx] === 'WC') week = 1;
        else if (row[typeIdx] === 'DIV') week = 2;
        else if (row[typeIdx] === 'CON') week = 3;
        else if (row[typeIdx] === 'SB') week = 5;
        else week = Math.max(1, week - 18);
      }

      const homeScore = parseInt(row[homeScoreIdx], 10);
      const awayScore = parseInt(row[awayScoreIdx], 10);

      // In nflverse, spread_line is Home Result - Away Result line (e.g. 8.5 means Home favored by 8.5).
      // Task contract requires: spread (signed, negative = home favored)
      // Therefore signed_spread = -spread_line.
      const rawSpread = row[spreadIdx] ? parseFloat(row[spreadIdx]) : null;
      const spread = rawSpread !== null && !isNaN(rawSpread) ? -rawSpread : null;

      const rawTotal = row[totalIdx] ? parseFloat(row[totalIdx]) : null;
      const total = rawTotal !== null && !isNaN(rawTotal) ? rawTotal : null;

      const rawMl = row[mlHomeIdx] ? parseFloat(row[mlHomeIdx]) : null;
      const moneylineHome = rawMl !== null && !isNaN(rawMl) ? rawMl : null;

      const timeStr = row[gametimeIdx] ? row[gametimeIdx] : '17:00';
      const dateStr = `${row[gamedayIdx]}T${timeStr}:00Z`;

      const idStr = row[espnIdx] && row[espnIdx] !== '' ? row[espnIdx] : row[0];

      games.push({
        id: String(idStr),
        week,
        seasonType,
        date: dateStr,
        homeAbbr: cleanAbbr(row[homeIdx]),
        awayAbbr: cleanAbbr(row[awayIdx]),
        homeScore,
        awayScore,
        neutralSite: row[locationIdx] === 'Neutral',
        market: { spread, total, moneylineHome }
      });
    }
  }

  // Sort deterministically
  games.sort((a, b) => {
    if (a.seasonType !== b.seasonType) return a.seasonType - b.seasonType;
    if (a.week !== b.week) return a.week - b.week;
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });

  return { games };
}

async function main() {
  console.log('Fetching 2025 NFL season dataset...');
  const dataset = await fetch2025Season();
  console.log(`Fetched ${dataset.games.length} games.`);
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const outPath = path.join(dataDir, '2025-season.json');
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2), 'utf-8');
  console.log(`Saved dataset to ${outPath}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error fetching season:', err);
    process.exit(1);
  });
}
