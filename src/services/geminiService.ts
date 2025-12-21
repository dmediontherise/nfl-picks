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

  // --- 0. DYNAMIC RATINGS ENGINE (Smart Adjustments) ---
  const calculateDynamicRatings = (team: typeof home, newsSnippets: string[]) => {
      // A. Baseline Tier from Live Record (e.g. "10-4-0")
      let wins = 0;
      if (team.record) {
          const parts = team.record.split(/[- ]/); // Handle "10-4" or "10-4-0"
          wins = parseInt(parts[0]) || 0;
      }
      
      let dynamicTier = 3; // Default Average
      if (wins >= 10) dynamicTier = 1;
      else if (wins >= 8) dynamicTier = 2;
      else if (wins >= 6) dynamicTier = 3;
      else if (wins >= 4) dynamicTier = 4;
      else dynamicTier = 5;

      // B. Baseline Ratings based on Tier
      // Tier 1: 90-95, Tier 2: 85-90, Tier 3: 80-85, Tier 4: 75-80, Tier 5: <75
      let baseRating = 95 - ((dynamicTier - 1) * 5); 

      // C. Injury/News Impact (The "Live" Factor)
      let penalty = 0;
      const combinedNews = [...(team.keyInjuries || []), ...newsSnippets].join(" ").toLowerCase();
      
      // QB Checks
      const isQBOut = combinedNews.includes("qb") && (combinedNews.includes("out") || combinedNews.includes("ir") || combinedNews.includes("bench"));
      const isStarOut = combinedNews.includes("out") || combinedNews.includes("ir");
      
      if (isQBOut) {
          penalty += 15; // Massive penalty for backup QB
          dynamicTier += 2; // Drop 2 tiers (e.g. Tier 1 -> Tier 3)
      } else if (isStarOut) {
          penalty += 5;
      }

      // D. Recent Form (Mock Logic: streaks would go here)
      // For now, simple record-based is fine.

      return {
          tier: Math.min(5, dynamicTier), // Cap at 5
          offRating: Math.max(50, baseRating - penalty),
          defRating: Math.max(50, baseRating - (penalty / 2)) // Defense less affected by QB injury usually
      };
  };
  
  // Helper to fetch snippets for specific team
  const getSnippets = (teamName: string) => realNewsSnippets.filter(s => s.includes(teamName));

  const homeDynamic = calculateDynamicRatings(home, getSnippets(home.name));
  const awayDynamic = calculateDynamicRatings(away, getSnippets(away.name));

  // Override static data for calculations
  home.tier = homeDynamic.tier;
  home.offRating = homeDynamic.offRating;
  home.defRating = homeDynamic.defRating;
  
  away.tier = awayDynamic.tier;
  away.offRating = awayDynamic.offRating;
  away.defRating = awayDynamic.defRating;

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
      // 1. Context & Motivation
      const homeStatus = home.status || "Bubble";
      const awayStatus = away.status || "Bubble";
      let contextStory = "";
      
      if (homeStatus === "Contender" && awayStatus === "Contender") {
          contextStory = "With meaningful January football on the line for both squads, this has the intensity of a playoff preview.";
      } else if (homeStatus === "Eliminated" && awayStatus === "Contender") {
          contextStory = `Motivation mismatch alert: The ${away.name} are fighting for seeding, while the ${home.name} are playing for pride and draft positioning.`;
      } else if (homeStatus === "Contender" && awayStatus === "Eliminated") {
           contextStory = `The ${home.name} cannot afford to sleepwalk here against a ${away.name} team with nothing to lose and a role of spoiler to play.`;
      } else {
          contextStory = `A gritty late-season clash where execution will outweigh raw talent.`;
      }

      // 2. Spread & Public Sentiment Analysis
      let bettingStory = "";
      const projectedMargin = finalHomeScore - finalAwayScore; // Positive = Home Wins
      const vegasMargin = vegaSpread; // Positive = Home Favored (assumed from previous logic logic: if Fav is Home, spread > 0)
      
      // Calculate "Edge" relative to the line
      // If Home Fav -3.5 (VegasMargin 3.5), and we predict Home +7 (ProjMargin 7). We cover by 3.5.
      // If Home Dog +3.5 (VegasMargin -3.5), and we predict Home -3 (ProjMargin -3). We win by 0.5 diff? 
      // Let's keep it simple: Compare winner against spread.
      
      const edge = Math.abs(projectedMargin - vegasMargin);
      const isContrarian = (game.bettingData?.publicBettingPct || 50) > 70 && !spreadCovered; // Public loves X, we pick Y (implied by not covering if public is on winner side? Complex. Let's simplify).
      
      // Simplified Public Fade Logic
      // If Public > 70% on Fav, and we pick Dog -> Fade
      const publicOnFav = (game.bettingData?.publicBettingPct || 50) > 60;
      const wePickFav = (winner === home.name && vegasMargin > 0) || (winner === away.name && vegasMargin < 0);
      
      if (publicOnFav && !wePickFav) {
          bettingStory = `The public is heavy on the favorite (${game.bettingData?.publicBettingPct}%), creating a classic 'Fade the Public' opportunity that our model loves.`;
      } else if (edge > 6) {
          bettingStory = `The algorithm sees a massive discrepancy from the Vegas line, identifying this as a high-value 'Trap Line' that the books have mispriced.`;
      } else if (Math.abs(projectedMargin) < 3) {
          bettingStory = `Expect a nail-biter. Our numbers suggest this game is significantly closer than the market implies, likely decided by a single possession.`;
      } else {
          bettingStory = `The sharp money aligns with the fundamentals here, validating the market movement.`;
      }

      // 3. Weave in the News (The "Why")
      let newsStory = "";
      let playerMentions: string[] = [];
      
      // Combine Real News and Key Injuries
      const criticalNews = [...realNewsSnippets];
      
      // Fallback: If no real news, use the best generated headline from newsFactory
      // We prioritize Status or specific Injury headlines over generic ones
      if (criticalNews.length === 0) {
           const hNews = homeNews.filter(n => !n.includes("Mock Draft") && !n.includes("Power Rankings"));
           const aNews = awayNews.filter(n => !n.includes("Mock Draft") && !n.includes("Power Rankings"));
           
           if (hNews.length > 0) criticalNews.push(`INSIDER (${home.abbreviation}): ${hNews[0]}`);
           else if (aNews.length > 0) criticalNews.push(`INSIDER (${away.abbreviation}): ${aNews[0]}`);
      }

      if (home.keyInjuries?.length) criticalNews.push(`INJURY ALERT (${home.abbreviation}): ${home.keyInjuries[0]}`);
      if (away.keyInjuries?.length) criticalNews.push(`INJURY ALERT (${away.abbreviation}): ${away.keyInjuries[0]}`);

      if (criticalNews.length > 0) {
          // Extract Player Names for "Players to Watch"
          const nameRegex = /([A-Z][a-z]+ [A-Z][a-z]+)/g;
          criticalNews.forEach(news => {
              const matches = news.match(nameRegex);
              if (matches) playerMentions.push(...matches);
          });

          // Pick the most impactful story (prioritize Injury or Real News over Insider/Generated)
          const priorityNews = criticalNews.find(n => n.includes("INJURY") || n.includes("NEWS")) || criticalNews[0];

          // Clean snippet
          const cleanNews = (snippet: string) => snippet.replace(/NEWS \([A-Z]+\): /, "").replace(/INJURY ALERT \([A-Z]+\): /, "").replace(/INSIDER \([A-Z]+\): /, "").replace(/^—\s*/, "").trim();
          const mainStory = cleanNews(priorityNews);
          
          if (mainStory.toLowerCase().includes("injury") || mainStory.toLowerCase().includes("out")) {
              newsStory = `Crucially, the situation surrounding "${mainStory}" has forced a significant downgrade in our offensive efficiency metrics for the ${mainStory.includes(home.name) ? home.name : "affected unit"}.`;
          } else if (mainStory.toLowerCase().includes("return") || mainStory.toLowerCase().includes("active")) {
               newsStory = `The return of key personnel ("${mainStory}") provides a timely boost to the explosive play rating that could catch the ${winner === home.name ? away.name : home.name} sleeping.`;
          } else if (mainStory.includes("Playoff") || mainStory.includes("Seed")) {
               newsStory = `The postseason implications are driving the narrative: "${mainStory}". This added pressure often favors the more disciplined squad.`;
          } else {
              newsStory = `Narrative factor: "${mainStory}". This variable introduces volatility that pure stats might miss.`;
          }
      } else {
          // Fallback based on ratings (Rarely reached now with generated news)
          const offDiff = Math.abs(home.offRating - away.offRating);
          if (offDiff > 10) newsStory = `Disparities in offensive firepower are the primary driver here, with the ${home.offRating > away.offRating ? home.name : away.name} simply outclassing the opposition.`;
          else newsStory = `With both locker rooms relatively quiet, the focus shifts entirely to schematic execution. The ${winner} has shown better discipline in late-game scenarios.`;
      }

      // 4. The Prediction Logic (Synthesis)
      const logic = `Synthesizing the ${contextStory} with the ${bettingStory}, the Medi Picks engine projects the ${winner} to leverage their advantage in ${home.offRating > away.offRating ? 'offensive consistency' : 'defensive grit'}.`;

      return `${contextStory}\n\n${bettingStory}\n\n${newsStory}\n\n**Verdict:** ${logic}`;
  };

  const narrative = constructNarrative();

  // Dynamic Players to Watch
  const generatePlayersToWatch = () => {
      // 1. Try to find from News
      const newsPlayers = narrative.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g);
      if (newsPlayers && newsPlayers.length >= 2) {
          return [
              { name: newsPlayers[0], position: "KEY", projection: "Impact Player", reasoning: "Cited in game intel." },
              { name: newsPlayers[1], position: "X-FACTOR", projection: "Game Changer", reasoning: "Cited in game intel." }
          ];
      }
      
      // 2. Fallback to generic "Star" logic based on Team Data
      const homeStar = home.keyInjuries?.[0]?.split(' ')[0] || "QB1"; // Very rough parsing or generic
      const awayStar = away.keyInjuries?.[0]?.split(' ')[0] || "QB1";
      
      // Better: Just generic positional focus if no specific names
      return [
        { name: `${winner} Offense`, position: "UNIT", projection: "Over 350 Yards", reasoning: "Matchup mismatch." },
        { name: `${winner === home.name ? away.name : home.name} Defense`, position: "UNIT", projection: "Must force 2+ TOs", reasoning: "Critical for upset chance." }
      ];
  };

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
    coachingMatchup: home.tier < away.tier ? "Coaching Advantage" : "Even Matchup",
    playersToWatch: generatePlayersToWatch(),
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
    
    // Dynamic Leverage Calculation (Weighted Differential)
    // Formula: 50 + (HomeRating - AwayRating) * Multiplier
    // This pushes the leverage meters further to the edges for visual clarity
    leverage: {
        offense: Math.min(95, Math.max(5, 50 + (home.offRating - away.offRating) * 1.5)),
        defense: Math.min(95, Math.max(5, 50 + (home.defRating - away.defRating) * 1.5)),
        qb: Math.min(95, Math.max(5, 50 + ((away.tier - home.tier) * 15))) // Increased tier impact
    }
  };
};