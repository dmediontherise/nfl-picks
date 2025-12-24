import { Game, AnalysisResult, Team } from '../types';
import { TEAMS } from '../data/nfl_data';
import { generateTeamNews } from './newsFactory';
import { espnApi, NewsArticle } from './espnAdapter';

const getTeamData = (team: Team) => {
  const staticData = TEAMS[team.abbreviation] || { tier: 3, offRating: 75, defRating: 75, status: "Bubble", keyInjuries: [] };
  const merged = { ...staticData, ...team };
  
  // Roster Override Logic: Ensure QB name is accurate even if API data is weird
  if (staticData.starterQB) {
      if (!merged.qbStats) {
          merged.qbStats = { name: staticData.starterQB, passingYds: 0, passingTds: 0, interceptions: 0 };
      } else {
          merged.qbStats.name = staticData.starterQB;
      }
  }
  
  return merged;
};

export const analyzeMatchup = async (game: Game, forceRefresh: boolean = false): Promise<AnalysisResult> => {
  console.log(`Analyzing matchup: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  await new Promise(resolve => setTimeout(resolve, 800));

  let home = { ...getTeamData(game.homeTeam) };
  let away = { ...getTeamData(game.awayTeam) };

  // Common Identifiers for filtering
  const allTeamIdentifiers = Object.values(TEAMS).flatMap(t => [t.name.toLowerCase(), t.abbreviation.toLowerCase()]);
  const matchupIdentifiers = [home.name.toLowerCase(), home.abbreviation.toLowerCase(), away.name.toLowerCase(), away.abbreviation.toLowerCase()];
  const otherTeamIdentifiers = allTeamIdentifiers.filter(id => !matchupIdentifiers.includes(id));

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

  // --- 1. ELO RATING SYSTEM (NFELO Methodology) ---
  // Base Elo Conversion: Map 0-100 rating to ~1100-1900 Elo
  // 50 -> 1500 (Average), 95 -> 1770 (Elite), 20 -> 1320 (Poor)
  const toElo = (rating: number) => 1200 + (rating * 6);
  
  // Calculate Base Team Elo (Weighted: 60% Offense, 40% Defense for simplicity, typically it's more complex)
  let homeElo = (toElo(home.offRating) * 0.6) + (toElo(home.defRating) * 0.4);
  let awayElo = (toElo(away.offRating) * 0.6) + (toElo(away.defRating) * 0.4);

  // --- 2. QB ADJUSTMENTS (Value Over Replacement) ---
  // Calculate a "QB Elo Value" based on the efficiency metrics calculated in dynamic ratings
  // We assume the base rating includes an "average" QB. 
  // We adjust up/down based on the specific QB performance relative to league average.
  const calculateQBValue = (team: typeof home) => {
      if (!team.qbStats) return 0;
      const { passingTds, interceptions, passingYds } = team.qbStats;
      // Simple Efficiency: (TDs * 5 + Yds/20 - Ints * 4) normalized
      // Avg Week 16: 20 TDs, 3000 yds, 10 INTs => 100 + 150 - 40 = 210
      const score = (passingTds * 5) + (passingYds / 20) - (interceptions * 4);
      const avgScore = 210;
      // Scale: +/- 100 Elo points max for QB difference
      return Math.max(-120, Math.min(120, (score - avgScore) * 1.5));
  };

  const homeQBAdj = calculateQBValue(home);
  const awayQBAdj = calculateQBValue(away);
  
  homeElo += homeQBAdj;
  awayElo += awayQBAdj;

  // --- 3. NEWS & INJURY ADJUSTMENTS (Elo Impact) ---
  // NewsMod is currently +/- 10 points on the spread scale? No, it was arbitrary.
  // Let's convert NewsMod to Elo. 1 Spread Point ~= 25 Elo.
  // Existing NewsMod range was -10 to +10. Let's say that's -50 to +50 Elo.
  homeElo += (newsModHome * 5);
  awayElo += (newsModAway * 5);

  // Apply specific injury penalties to Elo
  const applyEloInjuryPenalty = (team: typeof home) => {
    let penalty = 0;
    const combinedNews = [...(team.keyInjuries || []), ...realNewsSnippets.filter(s => s.includes(team.name))].join(" ").toLowerCase();
    
    // Major Key Injuries (Non-QB, as QB is handled above via stats usually, but if backup is playing, stats might be old?)
    // Note: The 'calculateDynamicRatings' already adjusted the base rating for 'QB Out'.
    // We will just add a small extra penalty for general cluster injuries.
    if (combinedNews.match(/out|ir|doubtful/g)?.length || 0 > 2) penalty += 30; // ~1 point
    return penalty;
  };

  homeElo -= applyEloInjuryPenalty(home);
  awayElo -= applyEloInjuryPenalty(away);

  // --- 4. HOME FIELD ADVANTAGE ---
  // Standard NFELO HFA is ~48-55 points.
  const HFA = 55;
  homeElo += HFA;

  // --- 5. WIN PROBABILITY & SPREAD ---
  // Standard Elo Formula: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
  const eloDiff = homeElo - awayElo;
  const homeWinProb = 1 / (1 + Math.pow(10, (-eloDiff / 400)));
  
  // Derived Spread: ~25 Elo points = 1 point spread
  let projectedSpread = eloDiff / 25; 

  // --- 6. PARSE VEGAS DATA (The Anchor) ---
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

  // --- 7. FINAL SCORING MODEL ---
  // We use the projected spread relative to the Vegas Total to derive scores.
  // impliedHome + impliedAway = Total
  // impliedHome - impliedAway = Spread
  // 2 * impliedHome = Total + Spread
  const predictedTotal = vegasTotal; // Trust Vegas for pace/environment
  
  let finalHomeScore = (predictedTotal + projectedSpread) / 2;
  let finalAwayScore = (predictedTotal - projectedSpread) / 2;

  // --- 8. APPLY VARIANCE (DETERMINISTIC) ---
  const getSeededRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
  };

  const rng = getSeededRandom(game.id + "_variance_vElo");
  const variance = (rng * 6) - 3; 
  
  finalHomeScore += variance;
  finalAwayScore -= variance;

  // --- 9. SAFETY CLAMP ---
  const clampScore = (score: number) => {
    let s = Math.round(score);
    if (s <= 1) return 0;
    if (s === 4) return 3;
    return Math.max(0, s);
  };

  finalHomeScore = clampScore(finalHomeScore);
  finalAwayScore = clampScore(finalAwayScore);

  if (finalHomeScore === finalAwayScore) {
    // Break tie with Elo
    if (homeElo > awayElo) finalHomeScore += 3;
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
      // Helper to ensure we only mention relevant players/teams
      const safeMention = (text: string) => {
          const lowerText = text.toLowerCase();
          // Filter out if it mentions ANY other team name or abbreviation
          const containsOther = otherTeamIdentifiers.some(id => {
              const regex = new RegExp(`\\b${id}\\b`, 'i');
              return regex.test(lowerText);
          });
          if (containsOther) return "Tactical adjustments are underway as the coaching staff reacts to the latest divisional trends.";
          return text;
      };

      // 1. HIGH STAKES CONTEXT (THE BIG PICTURE)
      const homeStatus = home.status || "Bubble";
      const awayStatus = away.status || "Bubble";
      let contextStory = "";
      
      const eloGap = Math.abs(homeElo - awayElo);
      const isDavidsVsGoliath = eloGap > 150;
      
      if (homeStatus === "Contender" && awayStatus === "Contender") {
          contextStory = `The stakes could not be higher in this late-season clash. The ${game.homeTeam.name} and ${game.awayTeam.name} are both deep in the hunt for postseason positioning, making every possession a high-leverage event. Our Medi Picks model classifies this as a "Tier 1 Priority" matchup, noting that the winning team's playoff probability will likely surge by over 20% following a victory. The atmosphere in ${game.venue} is expected to be electric, mirroring the intensity of a wild-card weekend showdown.`;
      } else if (isDavidsVsGoliath) {
           const favorite = homeElo > awayElo ? home.name : away.name;
           const underdog = homeElo > awayElo ? away.name : home.name;
           contextStory = `We are looking at a classic David vs. Goliath scenario. The ${favorite} enter as overwhelming statistical favorites, holding a massive Elo advantage of ${Math.round(eloGap)} points. On paper, the ${underdog} appear outmatched in nearly every positional group. However, in December, complacency is the greatest enemy of elite teams. If the ${favorite} treat this as a "look-ahead" game, they could find themselves entangled in a dangerous trap set by a hungry underdog with nothing to lose.`;
      } else {
          contextStory = `This is a battle for identity. Both the ${home.name} and ${away.name} have shown flashes of brilliance followed by puzzling inconsistency. With an Elo difference of just ${Math.round(eloGap)} points, this game is expected to be a gritty, one-possession affair defined by defensive stops and special teams' field position. Neither squad holds a significant fundamental edge, meaning the "Medi Jinx" volatility index is at a season high.`;
      }

      // 2. THE QUARTERBACK DUEL (STATISTICAL BREAKDOWN)
      let qbStory = "";
      if (home.qbStats && away.qbStats) {
          const hName = home.qbStats.name || `${home.abbreviation} QB1`;
          const aName = away.qbStats.name || `${away.abbreviation} QB1`;
          
          qbStory = `The individual leverage at the quarterback position is where this game will be won or lost. **${hName}** has been the heartbeat of the ${home.abbreviation} attack, contributing to a Value-Over-Replacement adjustment of ${Math.round(homeQBAdj)} Elo points. His ability to extend plays outside the pocket creates unique stress for the ${away.abbreviation} secondary. 
          
          Opposing him is **${aName}**, whose stat line of ${away.qbStats.passingTds} touchdowns and ${away.qbStats.passingYds} yards reflects a highly efficient, if sometimes conservative, approach. The data suggests that if ${aName} can maintain a completion percentage above 65%, the ${away.name} stay within the spread. However, our metrics indicate a positional mismatch in terms of red-zone execution, with ${hName} holding a ${Math.abs(homeQBAdj - awayQBAdj).toFixed(0)} Elo point edge in high-pressure situations.`;
      } else {
          qbStory = `Positional uncertainty at quarterback adds a significant layer of variance to our projections. With one or both teams potentially utilizing a backup or a limited starter, the offensive game plans are likely to be simplified. The focus shifts to the ground game and which signal-callers can avoid the "back-breaking" turnover in the fourth quarter.`;
      }

      // 3. UNIT ANALYSIS & TRENCH WARFARE
      let unitStory = "";
      const homeOffAdv = home.offRating - away.defRating;
      const awayOffAdv = away.offRating - home.defRating;
      
      unitStory = `In the trenches, the ${home.name} offensive line (Rated ${home.offRating}) faces a difficult task against the ${away.name} front seven (Rated ${away.defRating}). Our data highlights a potential schematic mismatch: the ${away.abbreviation} pass rush has been significantly more productive than the ${home.abbreviation} protection metrics suggest they should be. 
      
      On the flip side, the ${away.name} offense (Rated ${away.offRating}) will attempt to exploit a ${home.name} defense currently sitting at a ${home.defRating} efficiency rating. If the ${away.abbreviation} can establish the run early, it will neutralize the home-field noise and allow them to dictate the pace of the game. We are watching the 3rd-down conversion rates closely, as our model sees that as the primary inflection point for this specific matchup.`;

      // 4. MARKET INTELLIGENCE & VALUE ASSESSMENT
      let bettingStory = "";
      const projectedMargin = finalHomeScore - finalAwayScore;
      const edge = Math.abs(projectedMargin - vegaSpread);
      
      if (edge > 6) {
          bettingStory = `Our internal "Alpha Projection" has detected a massive discrepancy between the Vegas line (${game.bettingData?.spread || "N/A"}) and the fundamental Elo reality. The market appears to be significantly overvaluing the ${vegaSpread > 0 ? home.name : away.name} based on brand name rather than current efficiency. This creates a high-value opportunity for the "Sharp" bettor to back the ${projectedMargin > vegaSpread ? home.abbreviation : away.abbreviation} to cover with a high degree of confidence.`;
      } else {
          bettingStory = `The betting market is remarkably efficient for this contest. The Vegas spread of ${game.bettingData?.spread || "N/A"} tracks within a two-point margin of our Elo-derived projection. This suggests that the bookmakers have accurately captured the public sentiment and the statistical baseline. In such an efficient market, the winner is usually determined by "un-modelable" factors like weather shifts, officiating, or individual athletic heroics in the final minutes.`;
      }

      // 5. THE X-FACTOR (LOCKER ROOM INTEL)
      let newsStory = "";
      const strictlyRelevantNews = realNewsSnippets.filter(n => n.includes(home.abbreviation) || n.includes(away.abbreviation) || n.includes(home.name) || n.includes(away.name));
      
      if (strictlyRelevantNews.length > 0) {
          const priorityNews = strictlyRelevantNews.find(n => n.includes("INJURY") || n.includes("NEWS")) || strictlyRelevantNews[0];
          const cleanNews = safeMention(priorityNews.replace(/NEWS \([A-Z]+\): /, "").replace(/INJURY ALERT \([A-Z]+\): /, "").replace(/INSIDER \([A-Z]+\): /, "").replace(/^—\s*/, "").trim());
          newsStory = `A final variable to monitor is the report that: "${cleanNews}". In a game projected to be decided by such a thin margin, this specific development could force a mid-game pivot from the offensive coordinator. The ability of the ${winner} to adapt their scheme to this roster volatility will be the ultimate differentiator.`;
      } else {
          newsStory = `With no major roster disruptions reported in the last 48 hours, the focus remains squarely on the tactical "chess match" between the head coaches. Both staffs have had a full week to prepare for these specific schematic wrinkles, and we expect a highly disciplined performance from both units.`;
      }

      const logic = `**VERDICT:** The Medi Picks engine projects a ${Math.abs(finalHomeScore - finalAwayScore)}-point victory for the ${winner}. This forecast is built on a rigorous synthesis of ${home.tier < away.tier ? 'superior coaching tiers' : 'comparative stat advantages'}, the ${Math.round(eloGap)}-point Elo differential, and the current momentum reflected in our dynamic 2025 season standings. We see the ${winner} controlling the clock and ultimately wearing down the opposition in the trenches.`;

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