import { Game, AnalysisResult, Team } from '../types';
import { TEAMS } from '../data/nfl_data';
import { generateTeamNews } from './newsFactory';
import { espnApi, NewsArticle } from './espnAdapter';

const getTeamData = (team: Team) => {
  const staticData = TEAMS[team.abbreviation] || { tier: 3, offRating: 75, defRating: 75, status: "Bubble", keyInjuries: [] };
  // Merge: Static data (Ratings/Tiers) <-- Live Data (Record/Score/Stats)
  return { 
      ...staticData, 
      ...team,
      // Ensure specific fields that might be missing in live data but present in static are preserved if needed,
      // but generally 'team' (live) should win for mutable props.
      // However, we want to keep static ratings if live doesn't have them (which it doesn't).
  };
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
    const allTeamIdentifiers = Object.values(TEAMS).flatMap(t => [t.name.toLowerCase(), t.abbreviation.toLowerCase()]);
    const matchupIdentifiers = [home.name.toLowerCase(), home.abbreviation.toLowerCase(), away.name.toLowerCase(), away.abbreviation.toLowerCase()];
    const otherTeamIdentifiers = allTeamIdentifiers.filter(id => !matchupIdentifiers.includes(id));
    
    const getRelevantNews = (team: typeof home) => {
        return allNews.filter(n => {
            const headline = (n.headline || "").toLowerCase();
            const description = (n.description || "").toLowerCase();
            const text = (headline + " " + description);
            
            // 1. ELIMINATE GENERIC/ROUNDUP CONTENT
            const isRoundup = text.includes("takeaways") || 
                              text.includes("power rankings") || 
                              text.includes("scores") ||
                              text.includes("highlights") ||
                              text.includes("what to know") ||
                              text.includes("preview") ||
                              text.includes("recap") ||
                              text.includes("questions") ||
                              text.includes("waiver") ||
                              text.includes("fantasy");
            
            if (isRoundup) return false;

            // 2. MUST MENTION TARGET TEAM
            const mentionsTeam = text.includes(team.name.toLowerCase()) || text.includes(team.abbreviation.toLowerCase());
            if (!mentionsTeam) return false;

            // 3. STRICT EXCLUSION: Must NOT mention teams from OTHER games
            // We use word boundaries to avoid matching substrings (e.g., 'Giant' in 'Giants')
            const mentionsOther = otherTeamIdentifiers.some(id => {
                const regex = new RegExp(`\\b${id}\\b`, 'i');
                return regex.test(text);
            });
            if (mentionsOther) return false;

            return true;
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
      // A. Baseline Tier from Live Record
      let wins = 0;
      if (team.record) {
          const parts = team.record.split(/[- ]/);
          wins = parseInt(parts[0]) || 0;
      }
      
      let dynamicTier = 3;
      if (wins >= 10) dynamicTier = 1;
      else if (wins >= 8) dynamicTier = 2;
      else if (wins >= 6) dynamicTier = 3;
      else if (wins >= 4) dynamicTier = 4;
      else dynamicTier = 5;

      // B. QB Individual Performance Adjustment (REAL-TIME STATS)
      let qbBoost = 0;
      if (team.qbStats) {
          const { passingTds, interceptions, passingYds } = team.qbStats;
          // Calculate an efficiency score (Season-to-date context)
          // Average QB at Week 16 might have ~20 TDs, ~10 INTs, ~3000 YDS
          const tdIntRatio = passingTds / (interceptions || 1);
          const ydsPerGame = passingYds / 15; // Rough week estimate

          if (tdIntRatio > 2.5 && ydsPerGame > 250) qbBoost = 10;
          else if (tdIntRatio > 1.5 && ydsPerGame > 200) qbBoost = 5;
          else if (tdIntRatio < 1.0) qbBoost = -10;

          // Force elite tier for truly elite stat lines (like Dak/Herbert)
          if (tdIntRatio > 2.0 && passingTds > 25) {
              dynamicTier = Math.max(1, dynamicTier - 1); // Move up a tier
          }
      }

      let baseRating = 95 - ((dynamicTier - 1) * 5); 

      // C. Injury/News Impact
      let penalty = 0;
      const combinedNews = [...(team.keyInjuries || []), ...snippets].join(" ").toLowerCase();
      
      const isQBOut = combinedNews.includes("qb") && (combinedNews.includes("out") || combinedNews.includes("ir") || combinedNews.includes("bench"));
      const isStarOut = combinedNews.includes("out") || combinedNews.includes("ir");
      
      if (isQBOut) {
          penalty += 15;
          dynamicTier += 2;
      } else if (isStarOut) {
          penalty += 5;
      }

      return {
          tier: Math.min(5, Math.max(1, dynamicTier)),
          offRating: Math.max(50, baseRating + qbBoost - penalty),
          defRating: Math.max(50, baseRating - (penalty / 2))
      };
  };
  
  const homeDynamic = calculateDynamicRatings(home, realNewsSnippets.filter(s => s.includes(home.name)));
  const awayDynamic = calculateDynamicRatings(away, realNewsSnippets.filter(s => s.includes(away.name)));

  home.tier = homeDynamic.tier;
  home.offRating = homeDynamic.offRating;
  home.defRating = homeDynamic.defRating;
  
  away.tier = awayDynamic.tier;
  away.offRating = awayDynamic.offRating;
  away.defRating = awayDynamic.defRating;

  // --- 1. PARSE VEGAS DATA (The Anchor) ---
  let vegaSpread = 0;
  let vegasTotal = 44;

  if (game.bettingData) {
    vegasTotal = game.bettingData.total;
    const spreadParts = game.bettingData.spread.split(' ');
    if (spreadParts.length >= 2) {
      const favAbbr = spreadParts[0];
      const points = parseFloat(spreadParts[spreadParts.length - 1]);
      if (favAbbr === home.abbreviation) vegaSpread = Math.abs(points);
      else vegaSpread = -Math.abs(points);
    }
  }

  let impliedHome = (vegasTotal + vegaSpread) / 2;
  let impliedAway = (vegasTotal - vegaSpread) / 2;

  // --- 2. APPLY RATINGS ADJUSTMENTS ---
  const applyInjuryPenalty = (team: typeof home) => {
    let penalty = 0;
    team.keyInjuries?.forEach(injury => {
      if (injury.includes("QB")) penalty += 4;
      else penalty += 2;
    });
    return penalty;
  };

  const homeInjuryPen = applyInjuryPenalty(home);
  const awayInjuryPen = applyInjuryPenalty(away);

  const homeMatchupAdvantage = (home.offRating - away.defRating) / 4;
  const awayMatchupAdvantage = (away.offRating - home.defRating) / 4;

  let finalHomeScore = impliedHome + homeMatchupAdvantage - homeInjuryPen + newsModHome;
  let finalAwayScore = impliedAway + awayMatchupAdvantage - awayInjuryPen + newsModAway;

  // --- 3. APPLY VARIANCE (DETERMINISTIC) ---
  const getSeededRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
  };

  const rng = getSeededRandom(game.id + "_variance_v1");
  const variance = (rng * 6) - 3; 
  
  finalHomeScore += variance;
  finalAwayScore -= variance;

  // --- 4. SAFETY CLAMP ---
  const clampScore = (score: number) => {
    let s = Math.round(score);
    if (s <= 1) return 0;
    if (s === 4) return 3;
    return Math.max(0, s);
  };

  finalHomeScore = clampScore(finalHomeScore);
  finalAwayScore = clampScore(finalAwayScore);

  if (finalHomeScore === finalAwayScore) {
    if (home.offRating > away.offRating) finalHomeScore += 3;
    else finalAwayScore += 3;
  }

  const winner = finalHomeScore > finalAwayScore ? home.name : away.name;
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

  // --- NARRATIVE GENERATOR (DEEP INTEL) ---
  const constructNarrative = () => {
      // 1. Context & Motivation
      const homeStatus = home.status || "Bubble";
      const awayStatus = away.status || "Bubble";
      let contextStory = "";
      
      if (homeStatus === "Contender" && awayStatus === "Contender") {
          contextStory = `This ${game.homeTeam.abbreviation} vs ${game.awayTeam.abbreviation} clash has the intensity of a playoff preview. With meaningful January football on the line for both squads, expect maximum effort and limited rotation of starters.`;
      } else if (homeStatus === "Eliminated" && awayStatus === "Contender") {
          contextStory = `Motivation mismatch: The ${away.name} are fighting for seeding, while the ${home.name} are in evaluation mode for 2026. The home squad is playing for pride and draft positioning, often a dangerous spot for an unsuspecting favorite.`;
      } else if (homeStatus === "Contender" && awayStatus === "Eliminated") {
           contextStory = `The ${home.name} cannot afford to sleepwalk here. They face an ${away.name} team with nothing to lose and a role of spoiler to play in the ${game.homeTeam.abbreviation} stadium.`;
      } else {
          contextStory = `A gritty late-season clash where execution will outweigh raw talent. Both teams are looking to establish momentum heading into the offseason.`;
      }

      // 2. QB Power Duel (Statistical Breakdown)
      let qbStory = "### QB Matchup\n";
      if (home.qbStats && away.qbStats) {
          const getQBScore = (stats: any) => (stats.passingTds * 5) + (stats.passingYds / 50) - (stats.interceptions * 3);
          const hScore = getQBScore(home.qbStats).toFixed(1);
          const aScore = getQBScore(away.qbStats).toFixed(1);
          
          qbStory += `The individual leverage at QB is a major factor here. **${home.qbStats.name || home.abbreviation + " QB"}** (Power Score: ${hScore}) faces off against **${away.qbStats.name || away.abbreviation + " QB"}** (Power Score: ${aScore}). `;
          
          if (Math.abs(parseFloat(hScore) - parseFloat(aScore)) > 15) {
              qbStory += `Our metrics show a significant statistical mismatch at the position, with the ${parseFloat(hScore) > parseFloat(aScore) ? home.abbreviation : away.abbreviation} holding a clear advantage in efficiency and red-zone production.`;
          } else {
              qbStory += `Statistically, this is a wash. Both signal-callers are performing at a similar efficiency level, meaning the outcome will likely hinge on which defense can force the first mistake.`;
          }
      } else {
          qbStory += `With incomplete statistical data for one or both signal-callers, our model is relying on baseline Tier ${home.tier} vs Tier ${away.tier} benchmarks.`;
      }

      // 3. Unit Breakdown (Offense vs Defense)
      const unitStory = `### Unit Analysis\n**Offense:** The ${home.name} (Rated ${home.offRating}) vs the ${away.name} (Rated ${away.offRating}).\n**Defense:** The ${home.name} (Rated ${home.defRating}) vs the ${away.name} (Rated ${away.defRating}).\n\nIn the trenches, the ${home.offRating > away.defRating ? home.abbreviation + ' offense' : away.abbreviation + ' defense'} holds the schematic leverage. The ${game.homeTeam.abbreviation} squad has shown a ${home.offRating > 90 ? 'truly elite' : 'consistent'} ability to move the chains, while the ${game.awayTeam.abbreviation} defense is currently rated at ${away.defRating} in our dynamic efficiency model.`;

      // 4. Market & Risk Analysis
      let bettingStory = "### Market Intelligence\n";
      const projectedMargin = finalHomeScore - finalAwayScore;
      const vegasMargin = vegaSpread;
      const edge = Math.abs(projectedMargin - vegasMargin);
      
      if (edge > 6) {
          bettingStory += `Our algorithm sees a massive ${edge.toFixed(1)} point discrepancy from the Vegas line (${game.bettingData?.spread || "N/A"}). This identifies the game as a high-value 'Trap Line' where the market may be overvaluing the ${vegasMargin > 0 ? 'favorite' : 'underdog'}.`;
      } else {
          bettingStory += `The sharp money aligns with our fundamentals. The market spread of ${game.bettingData?.spread || "N/A"} accurately reflects the thin margin for error between these two units.`;
      }

      // 5. Synthesized News Factor
      let newsStory = "### Recent Game Intel\n";
      const criticalNews = [...realNewsSnippets];
      if (criticalNews.length === 0) {
           const hNews = homeNews.filter(n => !n.includes("Mock Draft") && !n.includes("Power Rankings"));
           const aNews = awayNews.filter(n => !n.includes("Mock Draft") && !n.includes("Power Rankings"));
           if (hNews.length > 0) criticalNews.push(`INSIDER (${home.abbreviation}): ${hNews[0]}`);
           else if (aNews.length > 0) criticalNews.push(`INSIDER (${away.abbreviation}): ${aNews[0]}`);
      }

      if (criticalNews.length > 0) {
          const priorityNews = criticalNews.find(n => n.includes("INJURY") || n.includes("NEWS")) || criticalNews[0];
          const cleanNews = (snippet: string) => snippet.replace(/NEWS \([A-Z]+\): /, "").replace(/INJURY ALERT \([A-Z]+\): /, "").replace(/INSIDER \([A-Z]+\): /, "").replace(/^—\s*/, "").trim();
          const mainStory = cleanNews(priorityNews);
          newsStory += `Specifically, "${mainStory}" is the primary driver for our volatility score. This variable introduces a layer of game-specific variance that raw ratings might overlook.`;
      } else {
          newsStory += `With no major roster shakeups reported, the focus shifts entirely to schematic execution and turnover margin.`;
      }

      const logic = `### Verdict\nThe Medi Picks engine projects the **${winner}** to win by ${Math.abs(finalHomeScore - finalAwayScore)} points. This is driven by a synthesis of ${home.tier < away.tier ? 'superior coaching tiers' : 'comparative stat advantages'} and the current momentum reflected in the live standings.`;

      return `${contextStory}\n\n${qbStory}\n\n${unitStory}\n\n${bettingStory}\n\n${newsStory}\n\n${logic}`;
  };

  const narrative = constructNarrative();
  const predictionConfidence = Math.min(99, Math.round(50 + Math.abs(finalHomeScore - finalAwayScore) * 2));

  // Dynamic Players to Watch
  const generatePlayersToWatch = () => {
      const newsPlayers = narrative.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g);
      if (newsPlayers && newsPlayers.length >= 2) {
          return [
              { name: newsPlayers[0], position: "KEY", projection: "Impact Player", reasoning: "Cited in game intel." },
              { name: newsPlayers[1], position: "X-FACTOR", projection: "Game Changer", reasoning: "Cited in game intel." }
          ];
      }
      return [
        { name: `${winner} Offense`, position: "UNIT", projection: "Over 350 Yards", reasoning: "Matchup mismatch." },
        { name: `${winner === home.name ? away.name : home.name} Defense`, position: "UNIT", projection: "Must force 2+ TOs", reasoning: "Critical for upset chance." }
      ];
  };

  const injuryNews = (home.keyInjuries?.length || away.keyInjuries?.length) ? "Significant injury impact." : "Clean bill of health.";

    // --- 5. DYNAMIC METRICS ---
    const avgOffense = (home.offRating + away.offRating) / 2;
    let explosiveCalc = avgOffense;
    if (game.bettingData) {
        if (game.bettingData.total > 50) explosiveCalc += 10;
        else if (game.bettingData.total > 46) explosiveCalc += 5;
        else if (game.bettingData.total < 40) explosiveCalc -= 10;
    }
    if ((home.offRating - away.defRating) > 10 || (away.offRating - home.defRating) > 10) explosiveCalc += 8;
    const finalExplosiveRating = Math.min(99, Math.round(explosiveCalc));

    const avgTier = (home.tier + away.tier) / 2;
    const qualityFactor = (6 - avgTier) * 5; 
    const finalExecutionRating = Math.min(99, Math.round((predictionConfidence * 0.6) + qualityFactor + 20));

    // Dynamic Leverage Calculation (REAL-TIME STATS SYNTHESIS)
    const calculateQBLeverage = () => {
        if (!home.qbStats || !away.qbStats) return Math.min(95, Math.max(5, 50 + ((away.tier - home.tier) * 15)));
        
        // Calculate a 'Power Score' for each QB based on real-time season stats
        const getQBScore = (stats: any) => (stats.passingTds * 5) + (stats.passingYds / 50) - (stats.interceptions * 3);
        const hScore = getQBScore(home.qbStats);
        const aScore = getQBScore(away.qbStats);
        
        // Return Home % (50 is even)
        return Math.min(95, Math.max(5, 50 + (hScore - aScore) * 0.8));
    };

    const qbLeverage = calculateQBLeverage();

    // --- 6. RETROSPECTIVE GENERATOR (POST-GAME) ---
    let retrospective = undefined;
    if (game.status === 'post' && game.homeTeam.score !== undefined && game.awayTeam.score !== undefined) {
        const homeScore = game.homeTeam.score;
        const awayScore = game.awayTeam.score;
        const actualWinner = homeScore > awayScore ? game.homeTeam.name : game.awayTeam.name;
        const margin = Math.abs(homeScore - awayScore);
        
        // Find relevant post-game news
        const postGameNews = realNewsSnippets.filter(s => 
            s.toLowerCase().includes("win") || 
            s.toLowerCase().includes("loss") || 
            s.toLowerCase().includes("defeat") ||
            s.toLowerCase().includes("victory") ||
            s.toLowerCase().includes("score")
        );
        
        // Synthesize "Key to Victory" from news or stats
        let keyToVictory = `The ${actualWinner} executed better in the critical moments.`;
        if (postGameNews.length > 0) {
             // Try to find a sentence that explains the result
             const recap = postGameNews.find(s => s.length > 50) || postGameNews[0];
             keyToVictory = recap.replace(/^NEWS \([A-Z]+\): /, "").replace(/^INSIDER \([A-Z]+\): /, "");
        } else if (margin < 7) {
            keyToVictory = `Clutch performance in a one-score game. The ${actualWinner} made the decisive plays late to secure a narrow victory.`;
        } else if (margin > 14) {
            keyToVictory = `Complete dominance. The ${actualWinner} controlled the line of scrimmage and capitalized on turnovers to pull away early.`;
        }

        // Identify Standout Performers from News or Stats
        const standouts = [];
        const newsText = postGameNews.join(" ");
        const playerMatches = newsText.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g);
        
        if (playerMatches && playerMatches.length > 0) {
            // Remove duplicates and limit to 3
            Array.from(new Set(playerMatches)).slice(0, 3).forEach(p => standouts.push(p));
        }
        
        if (standouts.length === 0) {
            // Fallback to QB if available
            if (actualWinner === game.homeTeam.name && game.homeTeam.qbStats?.name) standouts.push(`${game.homeTeam.qbStats.name} (QB)`);
            else if (actualWinner === game.awayTeam.name && game.awayTeam.qbStats?.name) standouts.push(`${game.awayTeam.qbStats.name} (QB)`);
            else standouts.push(`${actualWinner} Defense`);
        }

        retrospective = {
            result: `${actualWinner} won ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}`,
            keyToVictory: keyToVictory,
            standoutPerformers: standouts
        };
    }

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
        home: [home.offRating, home.defRating, home.qbStats?.passingTds || 0, home.qbStats?.passingYds || 0, home.qbStats?.interceptions || 0],
        away: [away.offRating, away.defRating, away.qbStats?.passingTds || 0, away.qbStats?.passingYds || 0, away.qbStats?.interceptions || 0]
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
      
      leverage: {
          offense: Math.min(95, Math.max(5, 50 + (home.offRating - away.offRating) * 1.5)),
          defense: Math.min(95, Math.max(5, 50 + (home.defRating - away.defRating) * 1.5)),
          qb: Math.round(qbLeverage)
      },

      retrospective: retrospective
    };
};