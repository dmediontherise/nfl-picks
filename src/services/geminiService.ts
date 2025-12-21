import { Game, AnalysisResult, Team } from '../types';
import { TEAMS } from '../data/nfl_data';
import { generateTeamNews } from './newsFactory';
import { espnApi, NewsArticle } from './espnAdapter';

const getTeamData = (team: Team) => {
  return TEAMS[team.abbreviation] || { ...team, tier: 3, offRating: 75, defRating: 75, record: "0-0", standing: "N/A", status: "Bubble", keyInjuries: [] };
};

export const analyzeMatchup = async (game: Game, forceRefresh: boolean = false): Promise<AnalysisResult> => {
  console.log(`Analyzing matchup: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  await new Promise(resolve => setTimeout(resolve, 800));

  let home = { ...getTeamData(game.homeTeam) };
  let away = { ...getTeamData(game.awayTeam) };

  // --- 1. PARSE VEGAS DATA (The Anchor) ---
  let vegaSpread = 0;
  let vegasTotal = 44; // Default NFL total if missing

  if (game.bettingData) {
    vegasTotal = game.bettingData.total;
    // Parse spread string like "BUF -13.5" or "SEA -1.5"
    // We need to determine WHO the spread applies to relative to Home/Away
    const spreadParts = game.bettingData.spread.split(' ');
    if (spreadParts.length === 2) {
      const favAbbr = spreadParts[0];
      const points = parseFloat(spreadParts[1]); // e.g. -13.5
      
      // If Home is Favorite (e.g. BUF -13.5 and BUF is home) -> Home favored by 13.5
      // If Away is Favorite (e.g. KC -3.5 and KC is away) -> Home is underdog (+3.5) -> Spread relative to home is -3.5 * -1 = +3.5?
      // Simpler: Just get the absolute line and apply to the favorite.
      
      if (favAbbr === home.abbreviation) {
        vegaSpread = Math.abs(points); // Home is favored by X
      } else {
        vegaSpread = -Math.abs(points); // Home is underdog by X
      }
    }
  }

  // Calculate Implied Vegas Score
  // Home = (Total + Spread) / 2
  // Away = (Total - Spread) / 2
  // Example: Total 45, Home -3.5 (Fav). Home = (45 + 3.5)/2 = 24.25. Away = (45 - 3.5)/2 = 20.75.
  // Example: Total 45, Home -3.5 (Dog? No, spread is negative for fav).
  // Let's stick to: Spread is positive if Home is favored, negative if Away is favored.
  // Wait, standard notation: "BUF -13.5" means BUF is favored.
  // So if Home is Fav, spread > 0. 
  
  let impliedHome = (vegasTotal + vegaSpread) / 2;
  let impliedAway = (vegasTotal - vegaSpread) / 2;

  // --- 2. APPLY MEDI JINX RATINGS (The Adjustment) ---
  
  // Injury Penalty
  const applyInjuryPenalty = (team: typeof home) => {
    let penalty = 0;
    team.keyInjuries?.forEach(injury => {
      if (injury.includes("Mahomes") || injury.includes("Rodgers") || injury.includes("Burrow")) penalty += 7; 
      else if (injury.includes("QB")) penalty += 4;
      else penalty += 2;
    });
    return penalty;
  };

  const homeInjuryPen = applyInjuryPenalty(home);
  const awayInjuryPen = applyInjuryPenalty(away);

  // Matchup Advantage
  const homeMatchupAdvantage = (home.offRating - away.defRating) / 4;
  const awayMatchupAdvantage = (away.offRating - home.defRating) / 4;

  // --- 2.5 REAL NEWS INTEGRATION ---
  let newsModHome = 0;
  let newsModAway = 0;
  let realNewsSnippets: string[] = [];

  try {
    const allNews = await espnApi.getRealNews();
    
    const getRelevantNews = (team: typeof home) => {
        return allNews.filter(n => {
            const text = (n.headline + " " + n.description).toLowerCase();
            // Check for Team Name or Abbreviation or Category Match
            const nameMatch = text.includes(team.name.toLowerCase()) || text.includes(team.abbreviation.toLowerCase());
            const catMatch = n.categories?.some(c => c.type === 'team' && (c.description === team.name || c.teamId === parseInt(team.id)));
            return nameMatch || catMatch;
        });
    };

    const homeReal = getRelevantNews(home);
    const awayReal = getRelevantNews(away);

    const calculateNewsImpact = (articles: NewsArticle[]) => {
        let impact = 0;
        articles.forEach(a => {
            const text = (a.headline + " " + a.description).toLowerCase();
            // Negative Keywords
            if (text.includes("out ") || text.includes("injury") || text.includes("concussion") || text.includes("ir ")) impact -= 3;
            if (text.includes("doubtful") || text.includes("questionable") || text.includes("benched")) impact -= 2;
            // Positive Keywords
            if (text.includes("return") || text.includes("cleared") || text.includes("active")) impact += 2;
        });
        return Math.max(-10, Math.min(10, impact)); // Cap impact
    };

    newsModHome = calculateNewsImpact(homeReal);
    newsModAway = calculateNewsImpact(awayReal);

    if (homeReal.length) realNewsSnippets.push(`NEWS (${home.abbreviation}): ${homeReal[0].description}`);
    if (awayReal.length) realNewsSnippets.push(`NEWS (${away.abbreviation}): ${awayReal[0].description}`);

  } catch (e) {
    console.warn("News integration skipped:", e);
  }

  // Apply to Implied Scores (Including Real News Impact)
  let finalHomeScore = impliedHome + homeMatchupAdvantage - homeInjuryPen + newsModHome;
  let finalAwayScore = impliedAway + awayMatchupAdvantage - awayInjuryPen + newsModAway;

  // --- 3. APPLY VARIANCE (DETERMINISTIC) ---
  // Use a seeded random generator so every user sees the same score for the same game
  const getSeededRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; 
    }
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
  };

  const rng = getSeededRandom(game.id + "_variance_v1");
  const variance = (rng * 6) - 3; // +/- 3 points, but consistent per game
  
  // Refresh variance is removed to ensure consistency across users/devices
  const refreshVariance = 0; 

  finalHomeScore += variance + refreshVariance;
  finalAwayScore -= (variance + refreshVariance); // Often correlations are inverse in tight games

  // --- 4. SAFETY CLAMP (No 1-point scores) ---
  const clampScore = (score: number) => {
    let s = Math.round(score);
    if (s <= 1) return 0; // Shutout likely if projected <= 1
    if (s === 1) return 0; // Impossible
    if (s === 4) return 3; // Very rare, round to FG
    // Bias towards common numbers slightly? No, randomness is fine, just fix the impossible ones.
    return Math.max(0, s);
  };

  finalHomeScore = clampScore(finalHomeScore);
  finalAwayScore = clampScore(finalAwayScore);

  // Resolve Tie if Variance dictates (optional, draws happen but let's avoid for prediction clarity)
  if (finalHomeScore === finalAwayScore) {
    if (home.offRating > away.offRating) finalHomeScore += 3;
    else finalAwayScore += 3;
  }

  const winner = finalHomeScore > finalAwayScore ? home.name : away.name;
  
  // Restore required variables for narrative and grading
  const homeNews = generateTeamNews(home, game.id);
  const awayNews = generateTeamNews(away, game.id);
  const spreadCovered = (winner === home.name && (finalHomeScore - finalAwayScore) > vegaSpread) ||
                        (winner === away.name && (finalAwayScore - finalHomeScore) > -vegaSpread);

  // --- NARRATIVE GENERATOR (ENHANCED) ---
  const margin = Math.abs(finalHomeScore - finalAwayScore);
  const totalScore = finalHomeScore + finalAwayScore;
  const isUpset = (vegaSpread > 0 && winner === away.name) || (vegaSpread < 0 && winner === home.name); // Rough upset check

  // Helper for deterministic random selection from arrays
  const pick = (options: string[]) => options[Math.floor((rng * 100) % options.length)];

  // 1. Dynamic Intro
  const standardIntros = [
      `The atmosphere at ${game.venue} is electric for this Week ${game.week} showdown.`,
      `It's a grudge match in the making as the ${away.name} roll into town to face the ${home.name}.`,
      `History suggests a battle, but the analytics are telling a specific story for this matchup.`
  ];
  const closeIntros = [
      `Get your popcorn ready. The Medi models are deadlocked, predicting a wire-to-wire thriller.`,
      `This one is going to come down to the final possession. A true coin-flip game at ${game.venue}.`,
      `Razor-thin margins separate these two squads. One mistake will decide it.`
  ];
  const blowoutIntros = [
      `The metrics are screaming "Mismatch." This could get ugly early if the ${winner} execute.`,
      `Total dominance is on the cards. The ${winner} simply outclass their opponent in every key metric.`,
      `Don't blink, or you might miss the ${winner} running away with this one.`
  ];

  let selectedIntro = pick(standardIntros);
  if (margin <= 4) selectedIntro = pick(closeIntros);
  if (margin > 14) selectedIntro = pick(blowoutIntros);

  // 2. Real News Integration (The "Intel")
  let intelSection = "";
  if (realNewsSnippets.length > 0) {
      const mainStory = realNewsSnippets[0].replace("NEWS", "INTEL");
      intelSection = `\n\n**The X-Factor:** ${mainStory} This development has forced a significant adjustment in our projection engine.`;
      if (realNewsSnippets.length > 1) {
          intelSection += ` Additionally, ${realNewsSnippets[1].replace("NEWS (", "").replace("):", " is dealing with")} which complicates the gameplan.`;
      }
  } else {
      // Fallback to simulated chatter if no real news
      intelSection = `\n\n**Locker Room Intel:** ${homeNews[0]} Meanwhile, the ${away.abbreviation} camp is buzzing about: "${awayNews[0]}"`;
  }

  // 3. The Verdict with Personality
  let bettingContext = "";
  if (game.bettingData) {
    const coverText = (winner === home.name && (finalHomeScore - finalAwayScore) > vegaSpread) ? "covering the spread" : "beating the number";
    bettingContext = `Vegas likes the line at ${game.bettingData.spread}, but the Medi Jinx data sees the ${winner} ${coverText}.`;
  }

  const verdict = `\n\n**The Bottom Line:** ${bettingContext} ${isUpset ? "Smell that? It smells like an UPSET." : "Trust the talent gap."} We're locking in the ${winner} to take it ${finalHomeScore}-${finalAwayScore}.`;

  const narrative = `${selectedIntro}${intelSection}${verdict}`;

  const injuryNews = forceRefresh 
    ? "LATEST: " + (home.keyInjuries?.[0] || "No major changes") + " - situations fluid."
    : (home.keyInjuries?.length || away.keyInjuries?.length) ? "Significant injury impact." : "Clean bill of health.";

  return {
    winnerPrediction: winner,
    homeScorePrediction: finalHomeScore,
    awayScorePrediction: finalAwayScore,
    confidenceScore: Math.min(99, Math.round(50 + Math.abs(finalHomeScore - finalAwayScore) * 2)),
    summary: `${winner} wins ${finalHomeScore}-${finalAwayScore}`,
    narrative: narrative,
    keyFactors: [`ATS Trend: ${spreadCovered ? "Likely Cover" : "Trap Line"}`, `Turnover Margin`, `Red Zone Efficiency`],
    injuryImpact: injuryNews,
    coachingMatchup: "Standard variance.",
    playersToWatch: [
      { name: "Key Starter", position: "QB/WR", projection: "Over projected stats", reasoning: "Usage spike." },
      { name: "Defender", position: "LB", projection: "Key stop", reasoning: "Matchup advantage." }
    ],
    statComparison: {
      home: [home.offRating, home.defRating, 75, 50, 80],
      away: [away.offRating, away.defRating, 70, 60, 75]
    },
    sources: [{ title: "Action Network Intel", uri: "#" }],
    jinxAnalysis: "Monitoring public money percentages.",
    jinxScore: Math.abs(finalHomeScore - finalAwayScore) < 7 ? 8 : 3,
    upsetProbability: 30,
    weather: { temp: 42, condition: "Clear", windSpeed: 5, impactOnPassing: "Low" },
    executionRating: 85,
    explosiveRating: 78,
    quickTake: Math.abs(finalHomeScore - finalAwayScore) > 10 ? "Mismatch" : "Close Game",
    latestNews: [...realNewsSnippets, ...homeNews.map(n => `[${home.abbreviation}] ${n}`), ...awayNews.map(n => `[${away.abbreviation}] ${n}`)],
    
    // Dynamic Leverage Calculation
    leverage: {
        offense: Math.round((home.offRating / (home.offRating + away.offRating)) * 100),
        defense: Math.round((home.defRating / (home.defRating + away.defRating)) * 100),
        qb: Math.min(95, Math.max(5, 50 + ((away.tier - home.tier) * 10))) // Based on Tier diff
    }
  };
};