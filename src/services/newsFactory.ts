import { Team } from '../types';

// Narrative templates based on Team Status and Attributes
const HEADLINES = {
  Clinched: [
    "Rest vs. Rust: Debate heats up on playing starters Week 16.",
    "Eyes on the Prize: Coordinator focused on 'generic' gameplan to hide schemes.",
    "Home Field Advantage: The path to the Super Bowl runs through here.",
    "Chasing History: Team looking to set franchise record for wins."
  ],
  Contender: [
    "Statement Game: A win here sends a message to the rest of the conference.",
    "Seeding Shuffle: Every snap matters for playoff positioning.",
    "Peaking at the Right Time? Offense looks unstoppable in December.",
    "Defense tightening up: Allowing only 14 PPG over last 3 weeks."
  ],
  Bubble: [
    "Win or Go Home: Playoff intensity arrives early.",
    "Math is simple: Just keep winning. No help needed yet.",
    "Locker Room Confidential: 'We treat this like a Game 7.'",
    "Pressure mounting on coaching staff to deliver a postseason berth."
  ],
  Eliminated: [
    "Draft Board Season: Scouts spotted watching top QB prospects.",
    "Spoiler Alert: Team relishing chance to ruin rival's playoff hopes.",
    "Evaluation Mode: Young rookies expected to see increased snap counts.",
    "Culture Change? tough questions facing the front office this offseason."
  ]
};

const INJURY_HEADLINES = [
  "Next Man Up: Depth chart tested as injury bug bites.",
  "Game Time Decision: Medical staff closely monitoring warmups.",
  "Significant Loss: Adjusting the scheme without key playmaker.",
  "Roster Move: Practice squad elevation hints at depth concerns."
];

export const generateTeamNews = (team: Team, seed?: string): string[] => {
  const news: string[] = [];

  // Helper for consistent random index if seed provided
  const getIndex = (max: number) => {
    if (!seed) return Math.floor(Math.random() * max);
    
    let hash = 0;
    const input = seed + team.id; // Unique per team per game
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const val = Math.abs((Math.sin(hash) * 10000) % 1);
    return Math.floor(val * max);
  };

  // 1. Status-based Headline
  const statusPool = HEADLINES[team.status || 'Eliminated'];
  const randomStatusIndex = getIndex(statusPool.length);
  news.push(statusPool[randomStatusIndex]);

  // 2. Injury-based Headline (if injuries exist)
  if (team.keyInjuries && team.keyInjuries.length > 0) {
    const injury = team.keyInjuries[0]; // Primary injury
    if (injury.includes("IR")) {
      news.push(`Devastating Blow: ${injury.split('(')[0]} officially shut down. Offense looking for answers.`);
    } else if (injury.includes("Q")) {
      news.push(`Optimism growing for ${injury.split('(')[0]} but likely on a 'pitch count'.`);
    } else if (injury.includes("Rodgers")) {
      news.push("Rodgers Watch: The veteran looks spry in practice, silencing critics.");
    } else if (injury.includes("Rivers")) {
      news.push("Old School: Rivers getting up to speed with playbook in record time.");
    } else {
      news.push(`${injury} situation looming large over game prep.`);
    }
  }

  // 3. Record-based Context
  const wins = parseInt(team.record?.split('-')[0] || "0");
  if (wins >= 10) news.push("Power Rankings: Consensus Top-5 team continues dominant stretch.");
  if (wins <= 4) news.push("Mock Draft: Currently projected to pick in the Top 5.");

  return news;
};
