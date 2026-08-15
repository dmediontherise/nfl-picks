import { TEAMS, CURRENT_SEASON } from '../data/nfl_data';
import { Game, Team } from '../types';

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

  getSchedule: async (week?: number, seasonType: number = 2): Promise<EspnResponse<Game[]>> => {
    const targetWeek = week || 1;
    try {
      let url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
      const params = new URLSearchParams();
      params.append("dates", CURRENT_SEASON.toString()); // dates= CURRENT_SEASON parameter
      if (week) params.append("week", week.toString());
      if (seasonType) params.append("seasontype", seasonType.toString());
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      const games: Game[] = (data.events || []).map((event: any) => {
        const comp = event.competitions[0];
        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors.find((c: any) => c.homeAway === 'away');
        const odds = comp.odds ? comp.odds[0] : null;

        const extractQBStats = (competitor: any) => {
          const passingLeader = competitor.leaders?.find((l: any) => l.name === 'passingLeader')?.leaders?.[0];
          if (!passingLeader) return undefined;

          const dv = passingLeader.displayValue || "";
          const tds = parseInt(dv.match(/(\d+)\s*TD/)?.[1] || "0", 10);
          const ints = parseInt(dv.match(/(\d+)\s*INT/)?.[1] || "0", 10);
          
          return {
            name: passingLeader.athlete?.fullName,
            passingYds: passingLeader.value || 0,
            passingTds: tds,
            interceptions: ints
          };
        };

        const generatePublicMoney = (gameId: string, spreadStr: string) => {
          let base = 50;
          if (spreadStr) {
            const parts = spreadStr.split(' ');
            const val = parseFloat(parts[parts.length - 1]);
            if (!isNaN(val)) base = 50 + Math.abs(val);
          }
          let hash = 0;
          const seed = `${gameId}-public-pct`;
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
          seasonType: event.season?.type,
          isNeutralSite: event.competitions[0]?.neutralSite || false,
          date: event.date,
          venue: comp.venue?.fullName || "Unknown",
          status: event.status.type.state,
          clock: event.status.type.detail,
          homeTeam: {
            id: home.team.abbreviation, 
            name: home.team.displayName,
            abbreviation: home.team.abbreviation,
            logoUrl: home.team.logo,
            color: `#${home.team.color}`,
            record: home.records?.[0]?.summary || "0-0",
            score: parseInt(home.score, 10),
            qbStats: extractQBStats(home)
          },
          awayTeam: {
            id: away.team.abbreviation,
            name: away.team.displayName,
            abbreviation: away.team.abbreviation,
            logoUrl: away.team.logo,
            color: `#${away.team.color}`,
            record: away.records?.[0]?.summary || "0-0",
            score: parseInt(away.score, 10),
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
          season: data.season?.year || CURRENT_SEASON,
          week: data.week?.number || targetWeek,
          status: "LIVE_API",
          timestamp: new Date().toISOString(),
          source: "ESPN_PUBLIC_API"
        },
        data: games
      };
    } catch (error) {
      console.error("Failed to fetch live schedule", error);
      return {
        meta: { season: CURRENT_SEASON, week: targetWeek, status: "ERROR", timestamp: new Date().toISOString(), source: "ERROR" },
        data: []
      };
    }
  },

  getTeam: async (teamId: string): Promise<Team | null> => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const team = Object.values(TEAMS).find(t => t.id === teamId || t.abbreviation === teamId);
    return team || null;
  },

  getHeadlines: async (teamId: string): Promise<string[]> => {
    const team = Object.values(TEAMS).find(t => t.id === teamId || t.abbreviation === teamId);
    if (!team) return ["No recent news available."];

    const headlines = [];
    if (team.status === 'Eliminated') {
      headlines.push(`Report: ${team.name} scouting department focused on draft preparation.`);
      headlines.push(`Coaching Staff: ${team.name} evaluation underway.`);
    } else if (team.status === 'Clinched') {
      headlines.push(`Playoff Picture: ${team.name} secure postseason positioning.`);
    } else if (team.status === 'Bubble') {
      headlines.push(`High Leverage: ${team.name} locker room focused on upcoming matchup.`);
    } else {
      headlines.push(`Game Preview: ${team.name} preparing for game day execution.`);
    }
    if (team.keyInjuries && team.keyInjuries.length > 0) {
      headlines.push(`Injury Alert: ${team.keyInjuries[0]} status monitored.`);
    }
    return headlines;
  }
};
