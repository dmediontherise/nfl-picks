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

export const espnApi = {
  getSchedule: async (): Promise<EspnResponse<Game[]>> => {
    // Simulating network request to ESPN 2025 servers...
    await new Promise(resolve => setTimeout(resolve, 600));
    
    return {
      meta: {
        season: 2025,
        week: 16,
        status: "LIVE_SCENARIOS",
        timestamp: new Date().toISOString(),
        source: "ESPN_SIM_V2"
      },
      data: WEEK_16_SCHEDULE
    };
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