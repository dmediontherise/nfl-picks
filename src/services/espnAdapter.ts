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

            return {
                id: event.id,
                week: event.week.number,
                date: event.date, // ISO string
                venue: comp.venue?.fullName || "Unknown",
                status: event.status.type.state, // 'pre', 'in', 'post'
                clock: event.status.type.detail, // e.g. "Final", "10:00 - 1st"
                homeTeam: {
                    id: home.team.abbreviation, // Use abbr as ID for consistency with local data
                    name: home.team.displayName,
                    abbreviation: home.team.abbreviation,
                    logoUrl: home.team.logo,
                    color: `#${home.team.color}`,
                    record: home.records?.[0]?.summary || "0-0",
                    score: parseInt(home.score),
                },
                awayTeam: {
                    id: away.team.abbreviation,
                    name: away.team.displayName,
                    abbreviation: away.team.abbreviation,
                    logoUrl: away.team.logo,
                    color: `#${away.team.color}`,
                    record: away.records?.[0]?.summary || "0-0",
                    score: parseInt(away.score),
                },
                bettingData: odds ? {
                    spread: odds.details, // e.g. "BUF -10.5"
                    total: odds.overUnder,
                    publicBettingPct: 50 // Not provided by this API
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
        // Fallback or re-throw? Let's fallback to empty for now to avoid breaking the app if offline
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
    
    // DYNAMIC 2025 NEWS FEED
    
    // Roster Specifics
    if (team.abbreviation === "PIT") headlines.push("Rodgers: 'This defense gives me a real shot at one more ring.'");
    if (team.abbreviation === "IND") headlines.push("Rivers on return: 'The arm feels 25 again.'");
    if (team.abbreviation === "KC") headlines.push("Reid on Mahomes injury: 'We have to find a way to move forward.'");
    
    // Status Specifics
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

    // Injuries
    if (team.keyInjuries && team.keyInjuries.length > 0) {
      headlines.push(`Injury Alert: ${team.keyInjuries[0]} status critical for Sunday.`);
    }

    // Record Context
    if (team.record === "12-2") headlines.push("Power Rankings: Consensus #1 Team in the NFL.");
    if (team.record === "2-12") headlines.push("Draft Order: Currently holding the #1 overall pick.");

    return headlines;
  }
};