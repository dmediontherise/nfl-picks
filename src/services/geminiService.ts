import { Game, AnalysisResult, Team } from '../types';
import { TEAMS } from '../data/nfl_data';
import { generateTeamNews } from './newsFactory';
import { espnApi, NewsArticle } from './espnAdapter';
import { predictGame, buildNarrative, PredictionInput, HistoricalGame, Narrative } from '../engine';
import seasonData from '../engine/data/historical-season.json';
import { calculateExplosiveRating, calculateExecutionRating, calculateQBLeverage, calculateUnitLeverage } from './displayMetrics';

const getTeamData = (team: Team) => {
  const staticData = TEAMS[team.abbreviation] || { tier: 3, offRating: 75, defRating: 75, status: "Bubble", keyInjuries: [] };
  const merged = { ...staticData, ...team };
  
  if (staticData.starterQB) {
    if (!merged.qbStats) {
      merged.qbStats = { name: staticData.starterQB, passingYds: 0, passingTds: 0, interceptions: 0 };
    } else {
      merged.qbStats.name = staticData.starterQB;
    }
  }
  
  return merged;
};

// Pure history builder function filtering games kicking off strictly before kickoffISO
export function buildPredictionHistory(seasonGames: any[], kickoffISO?: string): HistoricalGame[] {
  const kickoffTime = kickoffISO ? new Date(kickoffISO).getTime() : Infinity;
  return (seasonGames || [])
    .filter((g: any) => g.date && new Date(g.date).getTime() < kickoffTime)
    .map((g: any) => ({
      homeAbbr: g.homeAbbr,
      awayAbbr: g.awayAbbr,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      isNeutralSite: g.neutralSite,
      date: g.date,
      seasonType: g.seasonType,
      week: g.week
    }));
}

// Cache for analysis results to respect the 15-minute rule
const analysisCache: Record<string, { result: AnalysisResult, timestamp: number }> = {};

export const analyzeMatchup = async (game: Game, forceRefresh: boolean = false): Promise<AnalysisResult> => {
  const cacheKey = game.id;
  const now = Date.now();
  const CACHE_DURATION = 15 * 60 * 1000; // 15 Minutes

  if (!forceRefresh && analysisCache[cacheKey] && (now - analysisCache[cacheKey].timestamp < CACHE_DURATION)) {
    console.log(`Returning cached analysis for ${game.id}`);
    return analysisCache[cacheKey].result;
  }

  console.log(`Analyzing matchup: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  await new Promise(resolve => setTimeout(resolve, 100));

  let home = { ...getTeamData(game.homeTeam) };
  let away = { ...getTeamData(game.awayTeam) };

  // Fetch real-time game news
  let homeNewsSnippet = "";
  let awayNewsSnippet = "";
  try {
    const gameNews = await espnApi.getRealNews();
    const homeArticle = gameNews.find((n: NewsArticle) => n.headline?.toLowerCase().includes(home.name.toLowerCase()) || n.description?.toLowerCase().includes(home.name.toLowerCase()));
    const awayArticle = gameNews.find((n: NewsArticle) => n.headline?.toLowerCase().includes(away.name.toLowerCase()) || n.description?.toLowerCase().includes(away.name.toLowerCase()));
    
    if (homeArticle) homeNewsSnippet = `NEWS (${home.abbreviation}): ${homeArticle.headline} — ${homeArticle.description}`;
    if (awayArticle) awayNewsSnippet = `NEWS (${away.abbreviation}): ${awayArticle.headline} — ${awayArticle.description}`;
  } catch (err) {
    console.warn("Real-time news fetch failed, proceeding with synthetic intel.", err);
  }

  // Parse market spread and total
  let spreadVal: number | null = null;
  let totalVal: number | null = null;

  if (game.bettingData) {
    if (game.bettingData.total) {
      totalVal = typeof game.bettingData.total === 'number' ? game.bettingData.total : parseFloat(game.bettingData.total);
    }
    if (game.bettingData.spread) {
      const spreadParts = game.bettingData.spread.split(' ');
      if (spreadParts.length >= 2) {
        const favAbbr = spreadParts[0];
        const points = parseFloat(spreadParts[spreadParts.length - 1]);
        if (!isNaN(points)) {
          if (favAbbr === home.abbreviation) spreadVal = -Math.abs(points);
          else spreadVal = Math.abs(points);
        }
      } else {
        const p = parseFloat(game.bettingData.spread);
        if (!isNaN(p)) spreadVal = p;
      }
    }
  }

  // Build history strictly prior to the game kickoff
  const gameKickoff = game.date || (game as any).dateISO;
  const history = buildPredictionHistory(seasonData.games, gameKickoff);

  const input: PredictionInput = {
    game: {
      id: game.id,
      homeAbbr: home.abbreviation,
      awayAbbr: away.abbreviation,
      isNeutralSite: Boolean(game.isNeutralSite),
      seasonType: game.seasonType,
      week: game.week,
      market: {
        spread: spreadVal,
        total: totalVal
      }
    },
    history,
    homeInjuries: home.keyInjuries || [],
    awayInjuries: away.keyInjuries || []
  };

  // Call the pure engine predictor module
  const enginePrediction = predictGame(input);

  const finalHomeScore = enginePrediction.homeScore;
  const finalAwayScore = enginePrediction.awayScore;
  const winner = enginePrediction.winner === home.abbreviation ? home.name : (enginePrediction.winner === away.abbreviation ? away.name : enginePrediction.winner);
  const predictionConfidence = Math.round(enginePrediction.confidence);

  const homeNews = generateTeamNews(home, game.id);
  const awayNews = generateTeamNews(away, game.id);

  const calculateJinxLogic = () => {
    const publicPct = game.bettingData?.publicBettingPct || 50;
    const margin = Math.abs(finalHomeScore - finalAwayScore);
    const isTrap = margin < 3 && publicPct > 70;
    const isPublicFade = publicPct < 40;
    
    if (isTrap) return `High-risk TRAP detected. The public is blindly backing a narrow favorite, but our metrics suggest a high probability of an outright upset in this ${game.homeTeam.abbreviation} matchup.`;
    if (isPublicFade) return `Contrarian play confirmed. The 'Sharp Money' is moving against the consensus, aligning with our ${winner} projection.`;
    if (home.tier > 3 || away.tier > 3) return `Volatility warning: Low-tier efficiency on the field makes the ${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} game prone to unexpected swings.`;
    return `Standard market alignment. The risk profile is balanced, with the outcome likely dictated by pure red-zone execution.`;
  };

  const jinxAnalysisText = calculateJinxLogic();

  const narrativeObj: Narrative = buildNarrative(enginePrediction, {
    homeTeamName: home.name,
    awayTeamName: away.name,
    homeAbbr: home.abbreviation,
    awayAbbr: away.abbreviation,
    isNeutralSite: Boolean(game.isNeutralSite),
    week: game.week
  });
  const narrative = narrativeObj.text;

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

  const avgOffense = (home.offRating + away.offRating) / 2;
  const finalExplosiveRating = calculateExplosiveRating(avgOffense, game.bettingData?.total);

  const avgTier = (home.tier + away.tier) / 2;
  const finalExecutionRating = calculateExecutionRating(predictionConfidence, avgTier);

  const qbLeverage = calculateQBLeverage(home.tier, away.tier, home.qbStats, away.qbStats);

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

    const hiScore = homeScore > awayScore ? homeScore : awayScore;
    const loScore = homeScore > awayScore ? awayScore : homeScore;

    retrospective = {
      result: `${actualWinner} won ${hiScore}-${loScore}`,
      keyToVictory: keyToVictory,
      standoutPerformers: standouts
    };
  }

  const spreadPickLine = enginePrediction.spreadPick.line;
  const spreadLineStr = spreadPickLine >= 0 ? `+${spreadPickLine}` : `${spreadPickLine}`;
  const spreadPickSummary = `ATS Pick: ${enginePrediction.spreadPick.team} ${spreadLineStr}`;

  const unitLev = calculateUnitLeverage(home.offRating, away.offRating, home.defRating, away.defRating, qbLeverage);

  const result: AnalysisResult = {
    winnerPrediction: winner,
    homeScorePrediction: finalHomeScore,
    awayScorePrediction: finalAwayScore,
    confidenceScore: predictionConfidence,
    summary: `${winner} wins ${finalHomeScore}-${finalAwayScore}`,
    narrative: narrative,
    keyFactors: [spreadPickSummary, `Turnover Margin`, `Red Zone Efficiency`],
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
    weather: { temp: 42, condition: "Clear", windSpeed: 5, impactOnPassing: "Low" as "Low" | "Moderate" | "High" },
    executionRating: finalExecutionRating,
    explosiveRating: finalExplosiveRating,
    quickTake: Math.abs(finalHomeScore - finalAwayScore) > 10 ? "Mismatch" : "Close Game",
    latestNews: [homeNewsSnippet, awayNewsSnippet, ...homeNews.map(n => `[${home.abbreviation}] ${n}`), ...awayNews.map(n => `[${away.abbreviation}] ${n}`)].filter(n => !!n),
    
    leverage: unitLev,

    prediction: enginePrediction,
    narrativeDetails: narrativeObj,

    retrospective: retrospective
  };

  analysisCache[game.id] = { result, timestamp: Date.now() };
  return result;
};
