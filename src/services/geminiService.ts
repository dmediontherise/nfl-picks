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
            
            // Filter out generic/roundup articles
            const isGeneric = text.includes("questions") || 
                              text.includes("takeaways") || 
                              text.includes("what you need to know") ||
                              text.includes("power rankings") ||
                              text.includes("best plays");
            
            if (isGeneric) return false;

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

  // --- NARRATIVE GENERATOR (SMART) ---
  const constructNarrative = () => {
      // 1. Analyze the Matchup (Stats)
      const homeOffAdv = home.offRating - away.defRating; // >0 means Home Offense > Away Defense
      const awayOffAdv = away.offRating - home.defRating; // >0 means Away Offense > Home Defense
      
      let matchupStory = "";
      if (homeOffAdv > 15) matchupStory = `The ${home.name} offense (Rated ${home.offRating}) is poised to shred a ${away.name} defense (Rated ${away.defRating}) that simply can't keep pace.`;
      else if (awayOffAdv > 15) matchupStory = `Expect fireworks from the ${away.name}, whose ${away.offRating}-rated attack creates a massive mismatch against ${home.name}.`;
      else if (Math.abs(homeOffAdv - awayOffAdv) < 5) matchupStory = `On paper, this is a dead heat. Both squads match up evenly in the trenches, with neither holding a distinct schematic advantage.`;
      else matchupStory = `The analytics point to a tactical battle, with the ${winner} holding a slight leverage advantage in the red zone.`;

      // 2. Weave in the News (The "Why")
      let newsStory = "";
      if (realNewsSnippets.length > 0) {
          // Clean snippet
          const cleanNews = (snippet: string) => snippet.replace(/NEWS \([A-Z]+\): /, "").replace(/^—\s*/, "").trim();
          const mainStory = cleanNews(realNewsSnippets[0]);
          
          if (newsModHome < 0 || newsModAway < 0) {
              newsStory = `However, the projection engine has flashed a warning sign regarding: "${mainStory}". This negative development has significantly dampened the forecast.`;
          } else if (newsModHome > 0 || newsModAway > 0) {
              newsStory = `Momentum is shifting. With reports confirming "${mainStory}", our models have upgraded the ${winner}'s ceiling.`;
          } else {
              newsStory = `Context matters: "${mainStory}". This narrative layer adds texture to the raw data, suggesting more volatility than the spread implies.`;
          }
      } else {
          // Fallback based on injuries
          if (home.keyInjuries?.length) newsStory = `The injury report is the X-factor here, specifically the status of ${home.keyInjuries[0]}, which looms large over game prep.`;
          else newsStory = `With both locker rooms relatively quiet, this game will come down to pure execution and coaching adjustments.`;
      }

      // 3. The Prediction Logic
      const margin = Math.abs(finalHomeScore - finalAwayScore);
      const spreadContext = game.bettingData ? `against the ${game.bettingData.spread} line` : "outright";
      const logic = `Combining the ${home.offRating} vs ${away.defRating} matchup disparity with the latest intel, the algorithm sees the ${winner} ${spreadContext} by a ${margin} point margin.`;

      return `${matchupStory}\n\n${newsStory}\n\n**Analysis:** ${logic}`;
  };

  const narrative = constructNarrative();

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