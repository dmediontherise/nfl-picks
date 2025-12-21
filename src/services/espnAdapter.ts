import { TEAMS, WEEK_16_SCHEDULE } from '../data/nfl_data';
import { Game, Team } from '../types';

// MOCK ESPN API ADAPTER
// SOURCE: Simulated 2025 Season Data Lake
// ENDPOINT: /v1/sports/football/nfl/week/16/scoreboard

interface EspnResponse<T> {
  meta: {
    season: number;
    week: number;
    status: string;
    timestamp: string;
    source: string;
  };
  data: T;
}

export interface NewsArticle {
    headline: string;
    description: string;
    images: { url: string }[];
    published: string;
    categories: {
        type: string;
        description?: string;
        teamId?: number;
    }[];
    links: {
        web: { href: string }
    };
}

export const espnApi = {
  getRealNews: async (): Promise<NewsArticle[]> => {
    try {
        const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=25");
        const data = await response.json();
        return data.articles || [];
    } catch (error) {
        console.warn("Failed to fetch real news, falling back to simulation.", error);
        return [];
    }
  },

  getSchedule: async (): Promise<EspnResponse<Game[]>> => {
    try {
        const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
        const data = await response.json();
        
        const games: Game[] = data.events.map((event: any) => {
            const comp = event.competitions[0];
            const home = comp.competitors.find((c: any) => c.homeAway === 'home');
            const away = comp.competitors.find((c: any) => c.homeAway === 'away');
            const odds = comp.odds ? comp.odds[0] : null;

            const extractQBStats = (competitor: any) => {
                const passingLeader = competitor.leaders?.find((l: any) => l.name === 'passingLeader')?.leaders?.[0];
                if (!passingLeader) return undefined;

                const dv = passingLeader.displayValue || "";
                // Format: "357/522, 3931 YDS, 26 TD, 10 INT"
                const tds = parseInt(dv.match(/(\d+)\s*TD/)?.[1] || "0");
                const ints = parseInt(dv.match(/(\d+)\s*INT/)?.[1] || "0");
                
                return {
                    name: passingLeader.athlete?.fullName,
                    passingYds: passingLeader.value || 0,
                    passingTds: tds,
                    interceptions: ints
                };
            };

            // DYNAMIC MARKET SIMULATOR (Updates every 60s)
            const generatePublicMoney = (gameId: string, spreadStr: string) => {
                let base = 50;
                if (spreadStr) {
                    const parts = spreadStr.split(' ');
                    const val = parseFloat(parts[parts.length - 1]);
                    if (!isNaN(val)) base = 50 + Math.abs(val);
                }
                const minute = Math.floor(Date.now() / 60000);
                const seed = `${gameId}-${minute}`;
                let hash = 0;
                for (let i = 0; i < seed.length; i++) {
                    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                    hash |= 0;
                }
                const fluctuation = (Math.abs(Math.sin(hash)) * 10) - 5;
                return Math.max(10, Math.min(90, Math.round(base + fluctuation)));
            };

            const publicPct = odds ? generatePublicMoney(event.id, odds.details) : 50;

            return {
                id: event.id,
                week: event.week.number,
                date: event.date, // ISO string
                venue: comp.venue?.fullName || "Unknown",
                status: event.status.type.state, // 'pre', 'in', 'post'
                clock: event.status.type.detail, // e.g. "Final", "10:00 - 1st"
                homeTeam: {
                    id: home.team.abbreviation, 
                    name: home.team.displayName,
                    abbreviation: home.team.abbreviation,
                    logoUrl: home.team.logo,
                    color: `#${home.team.color}`,
                    record: home.records?.[0]?.summary || "0-0",
                    score: parseInt(home.score),
                    qbStats: extractQBStats(home)
                },
                awayTeam: {
                    id: away.team.abbreviation,
                    name: away.team.displayName,
                    abbreviation: away.team.abbreviation,
                    logoUrl: away.team.logo,
                    color: `#${away.team.color}`,
                    record: away.records?.[0]?.summary || "0-0",
                    score: parseInt(away.score),
                    qbStats: extractQBStats(away)
                },
                bettingData: odds ? {
                    spread: odds.details,
                    total: odds.overUnder,
                    publicBettingPct: publicPct
                } : undefined
            };
        });

        return {
          meta: {
            season: data.season.year,
            week: data.week.number,
            status: "LIVE_API",
            timestamp: new Date().toISOString(),
            source: "ESPN_PUBLIC_API"
          },
          data: games
        };
    } catch (error) {
        console.error("Failed to fetch live schedule", error);
        return { meta: { season: 2025, week: 16, status: "ERROR", timestamp: "", source: "ERROR" }, data: [] };
    }
  },

  getTeam: async (teamId: string): Promise<Team | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    const team = Object.values(TEAMS).find(t => t.id === teamId || t.abbreviation === teamId);
    return team || null;
  },

  getHeadlines: async (teamId: string): Promise<string[]> => {
    const team = Object.values(TEAMS).find(t => t.id === teamId || t.abbreviation === teamId);
    if (!team) return ["No recent news available."];

    const headlines = [];
    if (team.abbreviation === "PIT") headlines.push("Rodgers: 'This defense gives me a real shot at one more ring.'");
    if (team.abbreviation === "IND") headlines.push("Rivers on return: 'The arm feels 25 again.'");
    if (team.abbreviation === "KC") headlines.push("Reid on Mahomes injury: 'We have to find a way to move forward.'");
    if (team.status === 'Eliminated') {
      headlines.push(`Report: ${team.name} scouting department focused heavily on 2026 QB Class.`);
      headlines.push(`Coaching Hot Seat: ${team.name} staff evaluation begins.`);
    } else if (team.status === 'Clinched') {
      headlines.push(`Playoff Picture: ${team.name} secure berth, eyes on the #1 seed.`);
    } else if (team.status === 'Bubble') {
      headlines.push(`'Must Win': ${team.name} locker room treating Week 16 like a playoff game.`);
    } else {
      headlines.push(`Week 16 Preview: ${team.name} looking to solidify positioning.`);
    }
    if (team.keyInjuries && team.keyInjuries.length > 0) {
      headlines.push(`Injury Alert: ${team.keyInjuries[0]} status critical for Sunday.`);
    }
    if (team.record === "12-2") headlines.push("Power Rankings: Consensus #1 Team in the NFL.");
    if (team.record === "2-12") headlines.push("Draft Order: Currently holding the #1 overall pick.");
    return headlines;
  }
};
