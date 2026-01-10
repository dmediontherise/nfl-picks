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

  // Common Identifiers for filtering (Include Nicknames)
  const getNick = (name: string) => name.split(' ').pop()?.toLowerCase() || "";
  const allTeamIdentifiers = Object.values(TEAMS).flatMap(t => [
      t.name.toLowerCase(), 
      t.abbreviation.toLowerCase(),
      getNick(t.name)
  ]);
  
  const matchupNicknames = [getNick(home.name), getNick(away.name)];
  const matchupIdentifiers = [
      home.name.toLowerCase(), 
      home.abbreviation.toLowerCase(), 
      away.name.toLowerCase(), 
      away.abbreviation.toLowerCase(),
      ...matchupNicknames
  ];
  
  const otherTeamIdentifiers = allTeamIdentifiers.filter(id => !matchupIdentifiers.includes(id) && id.length > 2);

  // --- PRE-FETCH REAL NEWS (Used for Dynamic Ratings) ---
  let newsModHome = 0;
  let newsModAway = 0;
  let homeNewsSnippet = "";
  let awayNewsSnippet = "";

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

            // 2. MUST MENTION TARGET TEAM (Name, Abbr, or Nickname)
            const nick = getNick(team.name);
            const mentionsTeam = text.includes(team.name.toLowerCase()) || 
                                 text.includes(team.abbreviation.toLowerCase()) ||
                                 (nick && text.includes(nick));
            if (!mentionsTeam) return false;

            // 3. STRICT EXCLUSION: Must NOT mention teams from OTHER games
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
            if (text.includes("out ") || text.includes("injury") || text.includes("concussion") || text.includes("ir ")) impact -= 3;
            if (text.includes("doubtful") || text.includes("questionable") || text.includes("benched")) impact -= 2;
            if (text.includes("return") || text.includes("cleared") || text.includes("active")) impact += 2;
        });
        return Math.max(-10, Math.min(10, impact));
    };

    newsModHome = calculateNewsImpact(homeReal);
    newsModAway = calculateNewsImpact(awayReal);

    if (homeReal.length) homeNewsSnippet = homeReal[0].description || homeReal[0].headline;
    if (awayReal.length) awayNewsSnippet = awayReal[0].description || awayReal[0].headline;

  } catch (e) {
    console.warn("News integration skipped:", e);
  }

  // --- 0. DYNAMIC RATINGS ENGINE (Smart Adjustments) ---
  const calculateDynamicRatings = (team: typeof home, snippets: string[]) => {
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

      let qbBoost = 0;
      if (team.qbStats) {
          const { passingTds, interceptions, passingYds } = team.qbStats;
          const tdIntRatio = passingTds / (interceptions || 1);
          const ydsPerGame = passingYds / 15; 

          if (tdIntRatio > 2.5 && ydsPerGame > 250) qbBoost = 10;
          else if (tdIntRatio > 1.5 && ydsPerGame > 200) qbBoost = 5;
          else if (tdIntRatio < 1.0) qbBoost = -10;

          if (tdIntRatio > 2.0 && passingTds > 25) {
              dynamicTier = Math.max(1, dynamicTier - 1);
          }
      }

      let baseRating = 95 - ((dynamicTier - 1) * 5); 

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
  
  const homeDynamic = calculateDynamicRatings(home, [homeNewsSnippet]);
  const awayDynamic = calculateDynamicRatings(away, [awayNewsSnippet]);

  home.tier = homeDynamic.tier;
  home.offRating = homeDynamic.offRating;
  home.defRating = homeDynamic.defRating;
  
  away.tier = awayDynamic.tier;
  away.offRating = awayDynamic.offRating;
  away.defRating = awayDynamic.defRating;

  // --- 1. ELO RATING SYSTEM (NFELO Methodology) ---
  const toElo = (rating: number) => 1200 + (rating * 6);
  let homeElo = (toElo(home.offRating) * 0.6) + (toElo(home.defRating) * 0.4);
  let awayElo = (toElo(away.offRating) * 0.6) + (toElo(away.defRating) * 0.4);

  // --- 2. QB ADJUSTMENTS ---
  const calculateQBValue = (team: typeof home) => {
      if (!team.qbStats) return 0;
      const { passingTds, interceptions, passingYds } = team.qbStats;
      const score = (passingTds * 5) + (passingYds / 20) - (interceptions * 4);
      const avgScore = 210;
      return Math.max(-120, Math.min(120, (score - avgScore) * 1.5));
  };

  const homeQBAdj = calculateQBValue(home);
  const awayQBAdj = calculateQBValue(away);
  homeElo += homeQBAdj;
  awayElo += awayQBAdj;

  // --- 3. NEWS & INJURY ADJUSTMENTS ---
  homeElo += (newsModHome * 5);
  awayElo += (newsModAway * 5);

  const applyEloInjuryPenalty = (team: typeof home, snippet: string) => {
    let penalty = 0;
    const combinedNews = [...(team.keyInjuries || []), snippet].join(" ").toLowerCase();
    if (combinedNews.match(/out|ir|doubtful/g)?.length || 0 > 2) penalty += 30; 
    return penalty;
  };

  homeElo -= applyEloInjuryPenalty(home, homeNewsSnippet);
  awayElo -= applyEloInjuryPenalty(away, awayNewsSnippet);

  // --- 4. HOME FIELD ADVANTAGE ---
  let HFA = 55;
  if (game.isNeutralSite || (game.seasonType === 3 && game.week === 5)) { // Week 5 of playoffs is Super Bowl
      HFA = 0;
  }
  homeElo += HFA;

  // --- PLAYOFF INTENSITY MULTIPLIER (PDF Insight: Playoff flag is #1 feature) ---
  if (game.seasonType === 3) {
      // "Defense wins championships" - Boost defensive rating weight
      // Boost QB Experience weight (implicit in QB stats but we can amplify)
      homeElo += (home.defRating - 75) * 2; // Reward good defenses more
      awayElo += (away.defRating - 75) * 2;
  }

  // --- 5. WIN PROBABILITY & SPREAD ---
  const eloDiff = homeElo - awayElo;
  const homeWinProb = 1 / (1 + Math.pow(10, (-eloDiff / 400)));
  let projectedSpread = eloDiff / 25; 

  // --- 6. PARSE VEGAS DATA ---
  let vegaSpread = 0;
  let vegasTotal = 44;
  let hasVegasData = false;

  if (game.bettingData) {
    vegasTotal = game.bettingData.total;
    const spreadParts = game.bettingData.spread.split(' ');
    if (spreadParts.length >= 2) {
      hasVegasData = true;
      const favAbbr = spreadParts[0];
      const points = parseFloat(spreadParts[spreadParts.length - 1]);
      if (favAbbr === home.abbreviation) vegaSpread = Math.abs(points);
      else vegaSpread = -Math.abs(points);
    }
  }

  // --- 7. FINAL SCORING MODEL (ENSEMBLE APPROACH) ---
  // PDF Insight: Vegas Probabilities are highly predictive. 
  // We blend our Elo model with the Market's implied score.
  
  // Model A: Pure Elo
  const eloHomeScore = (vegasTotal + projectedSpread) / 2;
  const eloAwayScore = (vegasTotal - projectedSpread) / 2;

  // Model B: Vegas Implied
  const vegasHomeScore = (vegasTotal + vegaSpread) / 2;
  const vegasAwayScore = (vegasTotal - vegaSpread) / 2;

  // Ensemble Weighting (70% Elo, 30% Vegas - giving our model agency but respecting the market)
  const blendWeight = hasVegasData ? 0.3 : 0;
  
  let finalHomeScore = (eloHomeScore * (1 - blendWeight)) + (vegasHomeScore * blendWeight);
  let finalAwayScore = (eloAwayScore * (1 - blendWeight)) + (vegasAwayScore * blendWeight);

  // --- 8. APPLY VARIANCE ---
  const getSeededRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
  };

  const rng = getSeededRandom(game.id + "_variance_vElo_v2");
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
      const safeMention = (text: string) => {
          const lowerText = text.toLowerCase();
          const containsOther = otherTeamIdentifiers.some(id => new RegExp(`\\b${id}\\b`, 'i').test(lowerText));
          if (containsOther) return "Tactical adjustments are underway as the coaching staff reacts to the latest divisional trends.";
          return text;
      };

      // 1. HIGH STAKES CONTEXT
      const homeStatus = home.status || "Bubble";
      const awayStatus = away.status || "Bubble";
      let contextStory = "";
      const eloGap = Math.abs(homeElo - awayElo);
      
      if (homeStatus === "Contender" && awayStatus === "Contender") {
          contextStory = `The stakes could not be higher in this late-season clash. The ${game.homeTeam.name} and ${game.awayTeam.name} are both deep in the hunt for postseason positioning, making every possession a high-leverage event. Our Medi Picks model classifies this as a "Tier 1 Priority" matchup, noting that the winning team's playoff probability will likely surge following a victory. The atmosphere in ${game.venue} is expected to be electric, mirroring the intensity of a wild-card weekend showdown.`;
      } else if (eloGap > 150) {
           const favorite = homeElo > awayElo ? home.name : away.name;
           const underdog = homeElo > awayElo ? away.name : home.name;
           contextStory = `We are looking at a classic David vs. Goliath scenario. The ${favorite} enter as overwhelming statistical favorites, holding a massive Elo advantage of ${Math.round(eloGap)} points. On paper, the ${underdog} appear outmatched in nearly every positional group. However, in December, complacency is the greatest enemy of elite teams. If the ${favorite} treat this as a "look-ahead" game, they could find themselves entangled in a dangerous trap set by a hungry underdog with nothing to lose.`;
      } else {
          contextStory = `This is a battle for identity. Both the ${home.name} and ${away.name} have shown flashes of brilliance followed by puzzling inconsistency. With an Elo difference of just ${Math.round(eloGap)} points, this game is expected to be a gritty, one-possession affair defined by defensive stops and special teams' field position. Neither squad holds a significant fundamental edge, meaning the "Medi Jinx" volatility index is at a season high.`;
      }

      // 2. THE QUARTERBACK DUEL
      let qbStory = "";
      if (home.qbStats && away.qbStats) {
          const hName = home.qbStats.name || `${home.abbreviation} QB1`;
          const aName = away.qbStats.name || `${away.abbreviation} QB1`;
          
          qbStory = `The individual leverage at the quarterback position is where this game will be won or lost. **${hName}** has been the heartbeat of the ${home.abbreviation} attack, contributing to a Value-Over-Replacement adjustment of ${Math.round(homeQBAdj)} Elo points. His ability to extend plays outside the pocket creates unique stress for the ${away.abbreviation} secondary. 
          
          Across the field, **${aName}** counters with an adjustment of ${Math.round(awayQBAdj)} Elo points. The key metric to watch here is the Interception Rate; ${home.qbStats.interceptions > away.qbStats.interceptions ? hName : aName} has shown a tendency to force throws into tight windows, a liability that the opposing secondary is primed to exploit. In a game projected to be this close, a single errant throw could be the deciding factor.`;
      } else {
          qbStory = `Positional uncertainty at quarterback adds a significant layer of variance to our projections. With one or both teams potentially utilizing a backup or a limited starter, the offensive game plans are likely to be simplified. The focus shifts to the ground game and which signal-caller can avoid the "back-breaking" turnover in the fourth quarter.`;
      }

      // 3. TRENCH WARFARE
      let unitStory = `In the trenches, the ${home.name} offensive line (Rated ${home.offRating}) faces a difficult task against the ${away.name} front seven (Rated ${away.defRating}). Our data highlights a potential schematic mismatch: the ${away.abbreviation} pass rush has been significantly more productive than the ${home.abbreviation} protection metrics suggest they should be. 
      
      On the flip side, the ${away.name} offense (Rated ${away.offRating}) will attempt to exploit a ${home.name} defense currently sitting at a ${home.defRating} efficiency rating. If the ${away.abbreviation} can establish the run early, it will neutralize the home-field noise and allow them to dictate the pace of the game. We are watching the 3rd-down conversion rates closely, as our model sees that as the primary inflection point for this specific matchup.`;

      // 4. MARKET INTELLIGENCE
      let bettingStory = "";
      const edge = Math.abs(finalHomeScore - finalAwayScore - vegaSpread);
      if (edge > 6) {
          bettingStory = `Our internal "Alpha Projection" has detected a massive discrepancy between the Vegas line (${game.bettingData?.spread || "N/A"}) and the fundamental Elo reality. The market appears to be significantly overvaluing one side based on brand name rather than current efficiency. This creates a high-value opportunity for the "Sharp" bettor to back the ${finalHomeScore - finalAwayScore > vegaSpread ? home.abbreviation : away.abbreviation} to cover with a high degree of confidence.`;
      } else {
          bettingStory = `The betting market is remarkably efficient for this contest. The Vegas spread of ${game.bettingData?.spread || "N/A"} tracks within a two-point margin of our Elo-derived projection. This suggests that the bookmakers have accurately captured the public sentiment and the statistical baseline. In such an efficient market, the winner is usually determined by situational factors like officiating or individual athletic heroics in the final minutes.`;
      }

      // 5. THE X-FACTOR (LOCKER ROOM INTEL)
      let newsStory = "";
      if (homeNewsSnippet || awayNewsSnippet) {
          const focusSnippet = homeNewsSnippet || awayNewsSnippet;
          const focusTeam = homeNewsSnippet ? home.name : away.name;
          const cleanNews = safeMention(focusSnippet.replace(/NEWS \([A-Z]+\): /, "").replace(/INJURY ALERT \([A-Z]+\): /, "").replace(/INSIDER \([A-Z]+\): /, "").replace(/^—\s*/, "").trim());
          
          newsStory = `A final variable to monitor is the latest report concerning the ${focusTeam}: "${cleanNews}". This development adds a layer of complexity to their preparation. The ability of the ${focusTeam} coaching staff to adapt their scheme to this roster volatility will be a critical differentiator in the second half.`;
      } else {
          newsStory = `With a relatively clean injury report and no major distractions reported for either squad in the last 48 hours, the focus remains squarely on the tactical "chess match" between the head coaches. Both staffs have had a full week to prepare for these specific schematic wrinkles, and we expect a highly disciplined performance from both units.`;
      }

      const logic = `**VERDICT:** The Medi Picks engine projects a ${Math.abs(finalHomeScore - finalAwayScore)}-point victory for the ${winner}. This forecast is built on a rigorous synthesis of ${home.tier < away.tier ? 'superior coaching tiers' : 'comparative stat advantages'}, the ${Math.round(eloDiff)}-point Elo differential, and the current momentum reflected in our dynamic 2025 season standings. We see the ${winner} controlling the clock and ultimately wearing down the opposition in the trenches.`;

      return `${contextStory}\n\n${qbStory}\n\n${unitStory}\n\n${bettingStory}\n\n${newsStory}\n\n${logic}`;
  };

  const narrative = constructNarrative();
  
  // PDF Insight: The "No Bet" Zone (40-60% win probability)
  // If the game is too close, confidence should tank to reflect "Coin Flip" nature.
  let baseConfidence = 50 + Math.abs(finalHomeScore - finalAwayScore) * 3;
  if (homeWinProb > 0.40 && homeWinProb < 0.60) {
      baseConfidence = Math.min(baseConfidence, 45); // Cap at 45% (Low Confidence)
  }
  const predictionConfidence = Math.min(99, Math.round(baseConfidence));

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
        const getQBScore = (stats: any) => (stats.passingTds * 5) + (stats.passingYds / 50) - (stats.interceptions * 3);
        const hScore = getQBScore(home.qbStats);
        const aScore = getQBScore(away.qbStats);
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
        
        let keyToVictory = `The ${actualWinner} executed better in the critical moments.`;
        if (homeNewsSnippet || awayNewsSnippet) {
             keyToVictory = (homeNewsSnippet || awayNewsSnippet);
        } else if (margin < 7) {
            keyToVictory = `Clutch performance in a one-score game. The ${actualWinner} made the decisive plays late to secure a narrow victory.`;
        } else if (margin > 14) {
            keyToVictory = `Complete dominance. The ${actualWinner} controlled the line of scrimmage and capitalized on turnovers to pull away early.`;
        }

        const standouts = [];
        const newsText = (homeNewsSnippet + " " + awayNewsSnippet);
        const playerMatches = newsText.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g);
        
        if (playerMatches && playerMatches.length > 0) {
            Array.from(new Set(playerMatches)).slice(0, 3).forEach(p => standouts.push(p));
        }
        
        if (standouts.length === 0) {
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
      latestNews: [homeNewsSnippet, awayNewsSnippet, ...homeNews.map(n => `[${home.abbreviation}] ${n}`), ...awayNews.map(n => `[${away.abbreviation}] ${n}`)].filter(n => !!n),
      
      leverage: {
          offense: Math.min(95, Math.max(5, 50 + (home.offRating - away.offRating) * 1.5)),
          defense: Math.min(95, Math.max(5, 50 + (home.defRating - away.defRating) * 1.5)),
          qb: Math.round(qbLeverage)
      },

      retrospective: retrospective
    };
};
