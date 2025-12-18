import { Game, AnalysisResult, Team } from '../types';
import { TEAMS } from '../data/nfl_data';
import { generateTeamNews } from './newsFactory';

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
      if (injury.includes("Mahomes") || injury.includes("Rodgers") || injury.includes("Burrow")) penalty += 7; // Points, not rating
      else if (injury.includes("QB")) penalty += 4;
      else penalty += 2;
    });
    return penalty;
  };

  const homeInjuryPen = applyInjuryPenalty(home);
  const awayInjuryPen = applyInjuryPenalty(away);

  // Rating Delta Impact
  // Compare Offense vs Opponent Defense
  // If Home Offense (90) vs Away Defense (70) -> Advantage Home
  // Scale: 10 rating diff = ~3 points
  const homeMatchupAdvantage = (home.offRating - away.defRating) / 4;
  const awayMatchupAdvantage = (away.offRating - home.defRating) / 4;

  // Apply to Implied Scores
  let finalHomeScore = impliedHome + homeMatchupAdvantage - homeInjuryPen;
  let finalAwayScore = impliedAway + awayMatchupAdvantage - awayInjuryPen;

  // --- 3. APPLY VARIANCE & REFRESH ---
  const variance = (Math.random() * 6) - 3; // +/- 3 points "Any Given Sunday" noise
  const refreshVariance = forceRefresh ? (Math.random() * 4) - 2 : 0;

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
  
  // --- NARRATIVE GENERATOR ---
  // (Re-using the robust logic from before, tailored to the new score)
  
  const spreadCovered = (winner === home.name && (finalHomeScore - finalAwayScore) > vegaSpread) ||
                        (winner === away.name && (finalAwayScore - finalHomeScore) > -vegaSpread); // Rough logic

  let intro = `In a Week 16 clash at ${game.venue.split(' ')[0]}, the ${winner} look to assert dominance.`;
  if (Math.abs(finalHomeScore - finalAwayScore) <= 3) intro = `Expect a nail-biter at ${game.venue}. This one comes down to the final possession.`;
  if (Math.abs(finalHomeScore - finalAwayScore) > 14) intro = `The models are predicting a lopsided affair. The ${winner} have too much firepower.`;

  const homeNews = generateTeamNews(home);
  const awayNews = generateTeamNews(away);
  
  let bettingContext = "";
  if (game.bettingData) {
    bettingContext = `Vegas set the line at ${game.bettingData.spread}, and the Medi Jinx model projects a ${Math.abs(finalHomeScore - finalAwayScore)} point margin.`;
  }

  const narrative = `${intro}\n\n**The Matchup:** ${homeNews[0]} Meanwhile, ${away.abbreviation} is dealing with: \"${awayNews[0]}\"\n\n**The Verdict:** ${bettingContext} ${home.keyInjuries?.length ? `Despite injuries to ${home.keyInjuries[0]}, ` : ""}the ${winner} prevail ${finalHomeScore}-${finalAwayScore}.`;

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
    latestNews: [...homeNews.map(n => `[${home.abbreviation}] ${n}`), ...awayNews.map(n => `[${away.abbreviation}] ${n}`)]
  };
};