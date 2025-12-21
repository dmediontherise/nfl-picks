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

  // --- PRE-FETCH REAL NEWS (Used for Dynamic Ratings) ---
  let newsModHome = 0;
  let newsModAway = 0;
  let realNewsSnippets: string[] = [];

  try {
    const allNews = await espnApi.getRealNews();
    
    const getRelevantNews = (team: typeof home) => {
        return allNews.filter(n => {
            const headline = (n.headline || "").toLowerCase();
            const description = (n.description || "").toLowerCase();
            const text = (headline + " " + description);
            
            // ELIMINATE GENERIC/ROUNDUP CONTENT
            const isRoundup = text.includes("takeaways") || 
                              text.includes("power rankings") || 
                              text.includes("scores") ||
                              text.includes("highlights") ||
                              text.includes("what to know") ||
                              text.includes("preview") ||
                              text.includes("recap") ||
                              text.includes("questions");
            
            if (isRoundup) return false;

            // ENSURE SPECIFICITY: Team must be the primary focus
            const nameMatch = text.includes(team.name.toLowerCase()) || text.includes(team.abbreviation.toLowerCase());
            return nameMatch;
        });
    };

    const homeReal = getRelevantNews(home);
    const awayReal = getRelevantNews(away);

    const calculateNewsImpact = (articles: NewsArticle[]) => {
        let impact = 0;
        articles.forEach(a => {
            const text = ((a.headline || "") + " " + (a.description || "")).toLowerCase();
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

    if (homeReal.length) realNewsSnippets.push(`NEWS (${home.abbreviation}): ${homeReal[0].description || homeReal[0].headline}`);
    if (awayReal.length) realNewsSnippets.push(`NEWS (${away.abbreviation}): ${awayReal[0].description || awayReal[0].headline}`);

  } catch (e) {
    console.warn("News integration skipped:", e);
  }

  // --- 0. DYNAMIC RATINGS ENGINE (Smart Adjustments) ---
  const calculateDynamicRatings = (team: typeof home, snippets: string[]) => {
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
      const combinedNews = [...(team.keyInjuries || []), ...snippets].join(" ").toLowerCase();
      
      // QB Checks
      const isQBOut = combinedNews.includes("qb") && (combinedNews.includes("out") || combinedNews.includes("ir") || combinedNews.includes("bench"));
      const isStarOut = combinedNews.includes("out") || combinedNews.includes("ir");
      
      if (isQBOut) {
          penalty += 15; // Massive penalty for backup QB
          dynamicTier += 2; // Drop 2 tiers (e.g. Tier 1 -> Tier 3)
      } else if (isStarOut) {
          penalty += 5;
      }

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

  // --- 4. DYNAMIC RISK (JINX) ANALYSIS ---
  const calculateJinxLogic = () => {
      const publicPct = game.bettingData?.publicBettingPct || 50;
      const margin = Math.abs(finalHomeScore - finalAwayScore);
      const isTrap = margin < 3 && publicPct > 70;
      const isPublicFade = spreadCovered && publicPct < 40;
      
      if (isTrap) return `High-risk TRAP detected. The public is blindly backing a narrow favorite, but our metrics suggest a high probability of an outright upset in this ${game.homeTeam.abbreviation} matchup.`;
      if (isPublicFade) return `Contrarian play confirmed. The 'Sharp Money' is moving against the consensus, aligning with our ${winner} projection.`;
      if (home.tier > 3 || away.tier > 3) return `Volatility warning: Low-tier efficiency on the field makes the ${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} game prone to unexpected swings.`;
      if (newsModHome < 0 || newsModAway < 0) return `Roster instability alert. Recent developments have injected significant variance into the expected execution for ${newsModHome < 0 ? (home.abbreviation || "Home") : (away.abbreviation || "Away")}.`;
      return `Standard market alignment. The risk profile is balanced, with the outcome likely dictated by pure red-zone execution.`;
  };

  const jinxAnalysisText = calculateJinxLogic();

  // --- NARRATIVE GENERATOR (SMART) ---
  const constructNarrative = () => {
      // 1. Context & Motivation
      const homeStatus = home.status || "Bubble";
      const awayStatus = away.status || "Bubble";
      let contextStory = "";
      
      if (homeStatus === "Contender" && awayStatus === "Contender") {
          contextStory = `This ${game.homeTeam.abbreviation} vs ${game.awayTeam.abbreviation} clash has the intensity of a playoff preview, with both squads desperate for January positioning.`;
      } else if (homeStatus === "Eliminated" && awayStatus === "Contender") {
          contextStory = `The ${away.name} are fighting for their playoff lives, while the ${home.name} are playing the role of spoiler with zero pressure.`;
      } else if (homeStatus === "Contender" && awayStatus === "Eliminated") {
           contextStory = `Heavy stakes for the ${home.name} here; they must avoid a let-down against an ${away.name} team that has already shifted focus to next season.`;
      } else {
          contextStory = `A gritty late-season battle between ${game.awayTeam.abbreviation} and ${game.homeTeam.abbreviation} where pride and execution outweigh the standings.`;
      }

      // 2. Spread & Public Sentiment Analysis
      let bettingStory = "";
      const projectedMargin = finalHomeScore - finalAwayScore;
      const vegasMargin = vegaSpread;
      
      if (Math.abs(projectedMargin - vegasMargin) > 7) {
          bettingStory = `The Medi Picks algorithm has identified a massive 7+ point discrepancy between our data and the Vegas ${game.bettingData?.spread || "line"}, suggesting a significant market mispricing for this specific matchup.`;
      } else if (Math.abs(projectedMargin) < 2) {
          bettingStory = `This is a coin-flip matchup. Our numbers see this ${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} game being decided by a final-minute field goal.`;
      } else {
          bettingStory = `The fundamental data (Home Offense: ${home.offRating} vs Away Defense: ${away.defRating}) aligns closely with the market sentiment for this ${game.homeTeam.abbreviation} home game.`;
      }

      // 3. Weave in the News (The "Why")
      let newsStory = "";
      let playerMentions: string[] = [];
      
      // Combine Real News and Key Injuries
      const criticalNews = [...realNewsSnippets];
      
      // Fallback: If no real news, use the best generated headline from newsFactory
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

          // Pick the most impactful story (prioritize Injury or Real News)
          const priorityNews = criticalNews.find(n => n.includes("INJURY") || n.includes("NEWS")) || criticalNews[0];

          // Clean snippet
          const cleanNews = (snippet: string) => snippet.replace(/NEWS \([A-Z]+\): /, "").replace(/INJURY ALERT \([A-Z]+\): /, "").replace(/INSIDER \([A-Z]+\): /, "").replace(/^—\s*/, "").trim();
          const mainStory = cleanNews(priorityNews);
          
          if (mainStory.toLowerCase().includes("injury") || mainStory.toLowerCase().includes("out")) {
              newsStory = `Crucially, the situation regarding "${mainStory}" is a primary driver for our ${winner} projection in this specific game.`;
          } else {
              newsStory = `Matchup Intel: "${mainStory}". This introduces a layer of game-specific volatility that pure ratings might miss.`;
          }
      } else {
          newsStory = `With no major roster shakeups reported for the ${game.awayTeam.abbreviation} or ${game.homeTeam.abbreviation}, the focus shifts entirely to schematic execution.`;
      }

      // 4. The Prediction Logic (Synthesis)
      const logic = `Verdict: The Medi Picks engine projects the ${winner} to win by ${Math.abs(finalHomeScore - finalAwayScore)} points, leveraging their ${home.offRating > away.offRating ? 'offensive' : 'defensive'} advantage in the ${game.homeTeam.abbreviation} stadium.`;

      return `${contextStory}\n\n${bettingStory}\n\n${newsStory}\n\n**Analysis:** ${logic}`;
  };

  const narrative = constructNarrative();
  const predictionConfidence = Math.min(99, Math.round(50 + Math.abs(finalHomeScore - finalAwayScore) * 2));

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
      const homeStar = home.keyInjuries?.[0]?.split(' ')[0] || "QB1";
      const awayStar = away.keyInjuries?.[0]?.split(' ')[0] || "QB1";
      
      return [
        { name: `${winner} Offense`, position: "UNIT", projection: "Over 350 Yards", reasoning: "Matchup mismatch." },
        { name: `${winner === home.name ? away.name : home.name} Defense`, position: "UNIT", projection: "Must force 2+ TOs", reasoning: "Critical for upset chance." }
      ];
  };

  const injuryNews = forceRefresh 
    ? "LATEST: " + (home.keyInjuries?.[0] || "No major changes") + " - situations fluid."
    : (home.keyInjuries?.length || away.keyInjuries?.length) ? "Significant injury impact." : "Clean bill of health.";

    // --- 5. DYNAMIC METRICS (Execution & Explosiveness) ---
    
    // Explosive Rating: Correlates with Offensive Talent vs Defensive Weakness + High Totals
    // Base: Average of Home/Away Dynamic OffRatings
    // Boost: If Vegas Total > 47 (+5), > 50 (+10)
    // Boost: Mismatches (OffRating - Opp DefRating > 10)
    const avgOffense = (home.offRating + away.offRating) / 2;
    let explosiveCalc = avgOffense;
    
    if (game.bettingData) {
        if (game.bettingData.total > 50) explosiveCalc += 10;
        else if (game.bettingData.total > 46) explosiveCalc += 5;
        else if (game.bettingData.total < 40) explosiveCalc -= 10;
    }
    
    // Mismatch Bonus
    if ((home.offRating - away.defRating) > 10 || (away.offRating - home.defRating) > 10) {
        explosiveCalc += 8;
    }
    const finalExplosiveRating = Math.min(99, Math.round(explosiveCalc));

    // Execution Rating: Correlates with Confidence & Team Quality (Tier)
    // High Confidence = High Probability of Clean Execution
    // Tier 1 Teams execute better than Tier 4
    const avgTier = (home.tier + away.tier) / 2;
    
    // Lower tier number is better (1 is best). So (6 - avgTier) gives 5 for Tier 1, 1 for Tier 5.
    const qualityFactor = (6 - avgTier) * 5; // Max 25 points
    
    const finalExecutionRating = Math.min(99, Math.round((predictionConfidence * 0.6) + qualityFactor + 20));

  return {
    winnerPrediction: winner,
    homeScorePrediction: finalHomeScore,
    awayScorePrediction: finalAwayScore,
    confidenceScore: predictionConfidence,
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
    jinxAnalysis: jinxAnalysisText,
    jinxScore: Math.abs(finalHomeScore - finalAwayScore) < 7 ? 8 : 3,
    upsetProbability: 30,
    weather: { temp: 42, condition: "Clear", windSpeed: 5, impactOnPassing: "Low" },
    executionRating: finalExecutionRating,
    explosiveRating: finalExplosiveRating,
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